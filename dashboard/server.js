require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const nodemailer = require('nodemailer');
const { generateOutreachDraft } = require('../generators/email-generator');
const { writeEmails } = require('../utils/output-writer');

function parseCsv(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function leadKeyFromCsvRow(row) {
  return `${(row['Business Name'] || '').toLowerCase().trim()}|${(row['Address'] || '')
    .toLowerCase()
    .trim()}`;
}

function leadKeyFromDraft(draft) {
  return `${(draft.businessName || '').toLowerCase().trim()}|${(draft.address || '').toLowerCase().trim()}`;
}

function normalizeGeneratedDraft(rawDraft, lead, requestedKind) {
  const businessName = (rawDraft?.businessName || lead?.['Business Name'] || '').trim();
  const address = (rawDraft?.address || lead?.['Address'] || '').trim();
  const safeKind = requestedKind === 'dm' ? 'dm' : 'email';
  const safeBody = String(rawDraft?.body || '').trim();
  const fallbackSubject =
    safeKind === 'dm' ? 'Instagram DM' : `Website idea for ${businessName || 'local business'}`;

  return {
    businessName,
    address,
    draftKind: safeKind,
    subject: safeKind === 'dm' ? 'Instagram DM' : String(rawDraft?.subject || fallbackSubject).trim(),
    body: safeBody,
  };
}

function readTrashedLeadKeys(trashedLeadsPath) {
  if (!fs.existsSync(trashedLeadsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(trashedLeadsPath, 'utf8'));
    return Array.isArray(data) ? data.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function writeTrashedLeadKeys(trashedLeadsPath, keys) {
  fs.writeFileSync(trashedLeadsPath, JSON.stringify(Array.from(new Set(keys)).sort(), null, 2), 'utf8');
}

function readEmailDrafts(draftsPath) {
  if (!fs.existsSync(draftsPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createApp(outputDir, options = {}) {
  const app = express();
  const projectRoot = options.projectRoot || path.join(__dirname, '..');
  const runPipeline =
    options.runPipeline ||
    ((mode = 'full') => {
      const args = ['index.js'];
      if (mode === 'scrape') args.push('--stage=scrape');
      if (mode === 'discover') args.push('--stage=discover');
      if (mode === 'process') args.push('--stage=process');
      return spawn('node', args, {
        cwd: projectRoot,
        env: process.env,
      });
    });
  const generateDraftForLead =
    options.generateDraftForLead ||
    ((businessName, address, websiteQuality, kind) =>
      generateOutreachDraft(businessName, address, websiteQuality, kind));
  const writeEmailsFile = options.writeEmailsFile || writeEmails;
  const sendMail =
    options.sendMail ||
    (async ({ to, subject, body }) => {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.EMAIL_FROM || user;
      if (!host || !user || !pass || !from) {
        throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM.');
      }
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      return transporter.sendMail({
        from,
        to,
        subject,
        text: body,
      });
    });
  const trashedLeadsPath = path.join(outputDir, 'trashed-leads.json');
  let runState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    logs: [],
    mode: 'full',
  };

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/leads', (req, res) => {
    const csvPath = path.join(outputDir, 'leads.csv');
    if (!fs.existsSync(csvPath)) return res.json([]);
    const trashedKeys = new Set(readTrashedLeadKeys(trashedLeadsPath));
    const leads = parseCsv(fs.readFileSync(csvPath, 'utf8')).filter(
      (row) => !trashedKeys.has(leadKeyFromCsvRow(row))
    );
    res.json(leads);
  });

  app.get('/api/emails', (req, res) => {
    const mdPath = path.join(outputDir, 'emails.md');
    if (!fs.existsSync(mdPath)) return res.json({ content: '' });
    res.json({ content: fs.readFileSync(mdPath, 'utf8') });
  });

  app.get('/api/email-drafts', (req, res) => {
    const draftsPath = path.join(outputDir, 'email-drafts.json');
    if (!fs.existsSync(draftsPath)) return res.json([]);
    const trashedKeys = new Set(readTrashedLeadKeys(trashedLeadsPath));
    const drafts = readEmailDrafts(draftsPath).filter((draft) => !trashedKeys.has(leadKeyFromDraft(draft)));
    return res.json(drafts);
  });

  app.post('/api/email-drafts/delete', (req, res) => {
    const businessName = (req.body?.businessName || '').trim();
    const address = (req.body?.address || '').trim();
    if (!businessName) return res.status(400).json({ error: 'businessName is required' });

    const targetKey = `${businessName.toLowerCase()}|${address.toLowerCase()}`;
    const draftsPath = path.join(outputDir, 'email-drafts.json');
    const existingDrafts = readEmailDrafts(draftsPath);
    const filteredDrafts = existingDrafts.filter((draft) => leadKeyFromDraft(draft) !== targetKey);

    fs.writeFileSync(draftsPath, JSON.stringify(filteredDrafts, null, 2), 'utf8');
    writeEmailsFile(path.join(outputDir, 'emails.md'), filteredDrafts);
    return res.status(200).json({ deleted: true, remaining: filteredDrafts.length });
  });

  app.post('/api/leads/trash', (req, res) => {
    const businessName = (req.body?.businessName || '').trim();
    const address = (req.body?.address || '').trim();
    if (!businessName) return res.status(400).json({ error: 'businessName is required' });
    const key = `${businessName.toLowerCase()}|${address.toLowerCase()}`;
    const trashed = readTrashedLeadKeys(trashedLeadsPath);
    if (!trashed.includes(key)) {
      trashed.push(key);
      writeTrashedLeadKeys(trashedLeadsPath, trashed);
    }
    return res.status(201).json({ trashed: true, key });
  });

  app.post('/api/generate-email', async (req, res) => {
    const businessName = (req.body?.businessName || '').trim();
    const address = (req.body?.address || '').trim();
    if (!businessName) return res.status(400).json({ error: 'businessName is required' });

    const csvPath = path.join(outputDir, 'leads.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'leads.csv not found. Run scrape/rating first.' });
    }
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const trashedKeys = new Set(readTrashedLeadKeys(trashedLeadsPath));
    const requestedKey = `${businessName.toLowerCase()}|${address.toLowerCase()}`;
    if (trashedKeys.has(requestedKey)) {
      return res.status(409).json({ error: 'Lead is in trash.' });
    }
    const lead =
      rows.find((row) => leadKeyFromCsvRow(row) === requestedKey) ||
      rows.find((row) => (row['Business Name'] || '').toLowerCase().trim() === businessName.toLowerCase());
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found in leads.csv' });
    }

    const kind = req.body?.kind === 'dm' ? 'dm' : 'email';
    const generatedDraft = await generateDraftForLead(
      lead['Business Name'] || '',
      lead['Address'] || '',
      lead['Website Quality'] || '',
      kind
    );
    const draft = normalizeGeneratedDraft(generatedDraft, lead, kind);
    const draftsPath = path.join(outputDir, 'email-drafts.json');
    const existingDrafts = readEmailDrafts(draftsPath);
    const draftKey = `${draft.businessName.toLowerCase().trim()}|${(draft.address || '')
      .toLowerCase()
      .trim()}`;
    const filtered = existingDrafts.filter(
      (item) =>
        `${(item.businessName || '').toLowerCase().trim()}|${(item.address || '').toLowerCase().trim()}` !==
        draftKey
    );
    const mergedDrafts = [...filtered, draft];
    fs.writeFileSync(draftsPath, JSON.stringify(mergedDrafts, null, 2), 'utf8');
    writeEmailsFile(path.join(outputDir, 'emails.md'), mergedDrafts);
    return res.status(201).json(draft);
  });

  app.get('/api/run-status', (req, res) => {
    res.json(runState);
  });

  app.post('/api/send-email', async (req, res) => {
    const to = (req.body?.to || '').trim();
    const subject = (req.body?.subject || '').trim();
    const body = (req.body?.body || '').trim();
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required.' });
    }
    try {
      await sendMail({ to, subject, body });
      return res.status(202).json({ sent: true });
    } catch (err) {
      return res.status(500).json({ error: `Failed to send email: ${err.message}` });
    }
  });

  app.post('/api/run', (req, res) => {
    if (runState.running) {
      return res.status(409).json({ error: 'Pipeline is already running.' });
    }

    const mode = req.body?.mode || 'full';
    if (!['full', 'scrape', 'discover', 'process'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use full, scrape, discover, or process.' });
    }
    const child = runPipeline(mode);
    runState = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      logs: [],
      mode,
    };

    function appendLog(chunk) {
      const lines = String(chunk)
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      runState.logs.push(...lines);
      if (runState.logs.length > 1000) {
        runState.logs = runState.logs.slice(-1000);
      }
    }

    if (child.stdout) child.stdout.on('data', appendLog);
    if (child.stderr) child.stderr.on('data', appendLog);
    child.on('error', (err) => {
      appendLog(`Failed to start pipeline: ${err.message}`);
    });
    child.on('close', (code) => {
      runState.running = false;
      runState.finishedAt = new Date().toISOString();
      runState.exitCode = code;
    });

    return res.status(202).json({ started: true, mode });
  });

  return app;
}

if (require.main === module) {
  const outputDir = path.join(__dirname, '../output');
  const app = createApp(outputDir);
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
  });
}

module.exports = { createApp, parseCsv };

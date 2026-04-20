require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { searchTerms, outputDir, focusFilters } = require('./config');
const { scrapeLeads, discoverMissingWebsites } = require('./scrapers/google-maps');
const { writeCsv } = require('./utils/output-writer');
const { filterLeadsForFocus } = require('./utils/lead-filters');

const stageArg = process.argv.find((arg) => arg.startsWith('--stage='));
const STAGE = stageArg ? stageArg.replace('--stage=', '') : 'full';

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadOptionalJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

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
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
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

function leadKey(lead) {
  return `${(lead.name || '').toLowerCase().trim()}|${(lead.address || '').toLowerCase().trim()}`;
}

function loadExistingLeads(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  return rows.map((row) => ({
    name: row['Business Name'] || '',
    address: row['Address'] || '',
    phone: row['Phone'] || '',
    website: row['Website URL'] || '',
    websiteQuality: row['Website Quality'] || '',
    mapsUrl: row['Google Maps Link'] || '',
  }));
}

function mergeLeadsByKey(baseLeads, updatedLeads) {
  const merged = [...baseLeads];
  const indexByKey = new Map(merged.map((lead, idx) => [leadKey(lead), idx]));
  for (const lead of updatedLeads) {
    const key = leadKey(lead);
    if (indexByKey.has(key)) {
      merged[indexByKey.get(key)] = lead;
    } else {
      indexByKey.set(key, merged.length);
      merged.push(lead);
    }
  }
  return merged;
}

async function run() {
  console.log('=== WebsiteBot Starting ===\n');
  const start = Date.now();
  const rawLeadsPath = path.join(outputDir, 'raw-leads.json');
  const scoredLeadsPath = path.join(outputDir, 'scored-leads.json');
  const trashedLeadsPath = path.join(outputDir, 'trashed-leads.json');
  const csvPath = path.join(outputDir, 'leads.csv');
  const trashedLeadKeys = new Set(loadOptionalJsonArray(trashedLeadsPath));
  const existingLeads = loadExistingLeads(csvPath).filter((lead) => !trashedLeadKeys.has(leadKey(lead)));
  const existingFilterResult = filterLeadsForFocus(existingLeads, focusFilters);
  const filteredExistingLeads = existingFilterResult.kept;
  console.log(`Loaded ${existingLeads.length} leads from existing CSV`);
  if (existingFilterResult.excluded.length > 0) {
    console.log(
      `Focused lead filter removed ${existingFilterResult.excluded.length} existing leads:`,
      existingFilterResult.excludedReasonCounts
    );
  }

  let rawLeads = [];
  if (STAGE === 'full' || STAGE === 'scrape') {
    console.log('Stage 1: Scraping Google Maps...');
    rawLeads = (await scrapeLeads(searchTerms)).filter((lead) => !trashedLeadKeys.has(leadKey(lead)));
    saveJson(rawLeadsPath, rawLeads);
    console.log(`\nFound ${rawLeads.length} unique leads`);
    console.log(`Saved raw leads: ${rawLeadsPath}\n`);
  } else {
    rawLeads = loadJson(rawLeadsPath).filter((lead) => !trashedLeadKeys.has(leadKey(lead)));
    console.log(`Loaded ${rawLeads.length} cached leads from ${rawLeadsPath}\n`);
  }

  console.log('Stage 2: Discovering missing websites...');
  const missingWebsiteBefore = rawLeads.filter((lead) => !(lead.website || '').trim()).length;
  rawLeads = await discoverMissingWebsites(rawLeads);
  const missingWebsiteAfter = rawLeads.filter((lead) => !(lead.website || '').trim()).length;
  saveJson(rawLeadsPath, rawLeads);
  console.log(
    `Missing websites: ${missingWebsiteBefore} -> ${missingWebsiteAfter} (saved to ${rawLeadsPath})\n`
  );
  const rawFilterResult = filterLeadsForFocus(rawLeads, focusFilters);
  const focusedRawLeads = rawFilterResult.kept;
  if (rawFilterResult.excluded.length > 0) {
    console.log(
      `Focused lead filter removed ${rawFilterResult.excluded.length} cached leads:`,
      rawFilterResult.excludedReasonCounts
    );
  }
  console.log(`Focused working set: ${focusedRawLeads.length} leads\n`);

  if (STAGE === 'scrape') {
    const merged = mergeLeadsByKey(
      filteredExistingLeads,
      focusedRawLeads.map((lead) => ({ ...lead, websiteQuality: '' }))
    );
    writeCsv(csvPath, merged);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('Stage 3: Skipped (scrape/discover-only mode)');
    console.log('Stage 4: Skipped (email generation is now manual per lead)');
    console.log('\nStage 4: Writing output files...');
    console.log(`\n=== Done in ${elapsed}s ===`);
    console.log(`Leads CSV:     ${csvPath} (${merged.length} leads total)`);
    console.log('Email drafts:  unchanged');
    return;
  }

  if (STAGE === 'discover') {
    const merged = mergeLeadsByKey(
      filteredExistingLeads,
      focusedRawLeads.map((lead) => ({
        ...lead,
        websiteQuality: lead.websiteQuality || '',
      }))
    );
    writeCsv(csvPath, merged);
    saveJson(scoredLeadsPath, merged);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('Stage 3: Skipped (discover-only mode)');
    console.log('Stage 4: Skipped (email generation is manual per lead)');
    console.log('\nStage 5: Writing output files...');
    console.log(`\n=== Done in ${elapsed}s ===`);
    console.log(`Raw leads JSON: ${rawLeadsPath}`);
    console.log(`Scored JSON:    ${scoredLeadsPath}`);
    console.log(`Leads CSV:      ${csvPath} (${merged.length} leads total)`);
    return;
  }

  const merged = mergeLeadsByKey(
    filteredExistingLeads,
    focusedRawLeads.map((lead) => ({
      ...lead,
      websiteQuality: '',
    }))
  );
  saveJson(scoredLeadsPath, merged);
  console.log('Stage 3: Skipped (AI scoring disabled, manual trash workflow)');
  console.log('Stage 4: Email generation is manual from dashboard per lead.');

  // Stage 5: Write output
  console.log('\nStage 5: Writing output files...');
  writeCsv(csvPath, merged);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);
  console.log(`Raw leads JSON: ${rawLeadsPath}`);
  console.log(`Scored JSON:    ${scoredLeadsPath}`);
  console.log(`Leads CSV:      ${csvPath} (${merged.length} leads total)`);
  console.log('Scoring:        disabled');
  console.log('Email drafts:   generated manually in dashboard');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

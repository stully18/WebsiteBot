const express = require('express');
const fs = require('fs');
const path = require('path');

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

function createApp(outputDir) {
  const app = express();

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/leads', (req, res) => {
    const csvPath = path.join(outputDir, 'leads.csv');
    if (!fs.existsSync(csvPath)) return res.json([]);
    res.json(parseCsv(fs.readFileSync(csvPath, 'utf8')));
  });

  app.get('/api/emails', (req, res) => {
    const mdPath = path.join(outputDir, 'emails.md');
    if (!fs.existsSync(mdPath)) return res.json({ content: '' });
    res.json({ content: fs.readFileSync(mdPath, 'utf8') });
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

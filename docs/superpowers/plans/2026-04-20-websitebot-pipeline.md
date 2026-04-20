# WebsiteBot Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-runnable Node.js agent that scrapes Google Maps, scores website quality via Gemini, drafts cold emails, and serves results in an Express dashboard at localhost:3000.

**Architecture:** Sequential pipeline — scraper returns raw leads, analyzer scores each lead's website via Gemini, generator drafts emails for poor/no-website leads, output writer saves `leads.csv` and `emails.md`. A separate Express server reads those output files and serves a single-page dashboard at localhost:3000. Modules are stateless: each takes data in and returns data out; `index.js` owns all pipeline state.

**Tech Stack:** Node.js 18+, Puppeteer 23, @google/generative-ai, Express 4, Jest 29, dotenv, supertest (dev)

---

## Data Interfaces

These types flow through the pipeline — all later tasks must match these exactly.

**Lead** (from scraper):
```javascript
{
  name: string,      // "Joe's Pizza"
  address: string,   // "123 Main St, Princeton NJ"
  phone: string,     // "6095551234" or ""
  website: string,   // "https://joespizza.com" or ""
  mapsUrl: string    // "https://maps.google.com/..."
}
```

**ScoredLead** (after analyzer, spread of Lead):
```javascript
{
  ...Lead,
  websiteQuality: 'poor' | 'mediocre' | 'good' | 'no website'
}
```

**EmailDraft** (from generator):
```javascript
{
  businessName: string,
  address: string,
  subject: string,
  body: string
}
```

---

## File Map

```
WebsiteBot/
├── package.json
├── .env.example
├── .gitignore
├── config.js
├── index.js
├── scrapers/
│   └── google-maps.js          # Puppeteer scraper — no unit tests (browser integration)
├── analyzers/
│   └── website-quality.js
├── generators/
│   └── email-generator.js
├── utils/
│   └── output-writer.js
├── dashboard/
│   ├── server.js
│   └── public/
│       ├── index.html
│       ├── style.css
│       └── app.js
├── output/
│   └── .gitkeep
└── tests/
    ├── analyzers/
    │   └── website-quality.test.js
    ├── generators/
    │   └── email-generator.test.js
    ├── utils/
    │   └── output-writer.test.js
    └── dashboard/
        └── server.test.js
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `config.js`
- Create: `output/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "websitebot",
  "version": "1.0.0",
  "description": "Lead generation and email drafting agent for local businesses",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dashboard": "node dashboard/server.js",
    "test": "jest"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "puppeteer": "^23.10.4"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, Puppeteer downloads Chromium (~150MB). No errors.

- [ ] **Step 3: Create .env.example**

```
GEMINI_API_KEY=your_gemini_api_key_here
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.env
output/leads.csv
output/emails.md
```

- [ ] **Step 5: Create config.js**

```javascript
module.exports = {
  searchTerms: [
    'dentist near Princeton NJ',
    'real estate agent near Ewing NJ',
    'coffee shop near Trenton NJ',
    'personal trainer near Princeton NJ',
    'salon near Ewing NJ',
    'plumber near Trenton NJ',
    'restaurant near Princeton NJ',
    'accountant near Ewing NJ',
    'gym near Trenton NJ',
    'contractor near Princeton NJ',
  ],
  // Chains/franchises to filter out (case-insensitive substring match on business name)
  chainKeywords: [
    'mcdonald', 'starbucks', 'subway', 'dunkin', 'cvs', 'walgreens',
    'target', 'walmart', 'home depot', 'lowes', 'burger king', 'wendy',
    'chick-fil', 'domino', 'pizza hut', 'h&r block', 'great clips',
  ],
  maxResultsPerTerm: 20,
  outputDir: './output',
};
```

- [ ] **Step 6: Create output/.gitkeep**

Create an empty file at `output/.gitkeep` so git tracks the directory.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json package-lock.json .env.example .gitignore config.js output/.gitkeep
git commit -m "chore: project setup with dependencies and config"
```

---

## Task 2: Google Maps Scraper

**Files:**
- Create: `scrapers/google-maps.js`

No unit tests — Puppeteer requires a live browser and network. Manual smoke test instructions provided instead.

- [ ] **Step 1: Create scrapers/google-maps.js**

```javascript
const puppeteer = require('puppeteer');
const { chainKeywords, maxResultsPerTerm } = require('../config');

// Google Maps CSS selectors — these may drift as Google updates their UI.
// If scraper stops working, inspect Maps in DevTools and update these.
const SEL = {
  feed: '[role="feed"]',
  resultCard: '[role="feed"] > div',
  nameInCard: '.fontHeadlineSmall',
  detailName: 'h1',
  detailAddress: 'button[data-item-id="address"] .fontBodyMedium',
  detailPhone: 'button[data-item-id*="phone:tel:"] .fontBodyMedium',
  detailWebsite: 'a[data-item-id="authority"]',
};

function isChain(name) {
  const lower = name.toLowerCase();
  return chainKeywords.some((kw) => lower.includes(kw));
}

async function scrapeSearchTerm(page, searchTerm) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const feedExists = await page.waitForSelector(SEL.feed, { timeout: 15000 }).catch(() => null);
  if (!feedExists) {
    console.warn(`  No results feed for: ${searchTerm}`);
    return [];
  }

  const leads = [];
  let cardIndex = 0;

  while (leads.length < maxResultsPerTerm) {
    const cards = await page.$$(SEL.resultCard);
    if (cardIndex >= cards.length) break;

    const card = cards[cardIndex];
    cardIndex++;

    // Skip spacer divs Google inserts
    const hasContent = await card.$(SEL.nameInCard).catch(() => null);
    if (!hasContent) continue;

    try {
      await card.click();
      await page.waitForSelector(SEL.detailName, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 500));

      const name = await page.$eval(SEL.detailName, (el) => el.textContent.trim()).catch(() => '');
      if (!name || isChain(name)) continue;

      const address = await page
        .$eval(SEL.detailAddress, (el) => el.textContent.trim())
        .catch(() => '');
      const phone = await page
        .$eval(SEL.detailPhone, (el) => el.textContent.trim())
        .catch(() => '');
      const website = await page
        .$eval(SEL.detailWebsite, (el) => el.href)
        .catch(() => '');
      const mapsUrl = page.url();

      leads.push({ name, address, phone, website, mapsUrl });
      console.log(`  Found: ${name}`);
    } catch (err) {
      console.warn(`  Skipped card ${cardIndex}: ${err.message}`);
    }

    // Scroll feed to trigger lazy-loading of more results
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTop += 400;
    });
  }

  return leads;
}

async function scrapeLeads(searchTerms) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allLeads = [];
  const seenNames = new Set();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const term of searchTerms) {
      console.log(`\nScraping: ${term}`);
      try {
        const leads = await scrapeSearchTerm(page, term);
        for (const lead of leads) {
          const key = lead.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allLeads.push(lead);
          }
        }
        console.log(`  +${leads.length} leads (${allLeads.length} total unique)`);
      } catch (err) {
        console.error(`  Error scraping "${term}": ${err.message}`);
      }
      // Polite delay between searches
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
  }

  return allLeads;
}

module.exports = { scrapeLeads };
```

- [ ] **Step 2: Smoke test the scraper**

Create `test-scraper.js` temporarily:
```javascript
require('dotenv').config();
const { scrapeLeads } = require('./scrapers/google-maps');

(async () => {
  const leads = await scrapeLeads(['coffee shop near Princeton NJ']);
  console.log('\nSample results:', JSON.stringify(leads.slice(0, 3), null, 2));
  console.log(`\nTotal: ${leads.length} leads`);
})();
```

Run:
```bash
node test-scraper.js
```

Expected: 3–15 leads printed. `name` and `address` populated on most. `website` may be empty for some. No crash.

Delete `test-scraper.js`.

- [ ] **Step 3: Commit**

```bash
git add scrapers/google-maps.js
git commit -m "feat: add Google Maps Puppeteer scraper"
```

---

## Task 3: Website Quality Analyzer

**Files:**
- Create: `analyzers/website-quality.js`
- Create: `tests/analyzers/website-quality.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/analyzers/website-quality.test.js`:

```javascript
const { scoreWebsite, buildAnalysisPrompt } = require('../../analyzers/website-quality');

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('buildAnalysisPrompt', () => {
  it('includes the HTML in the prompt', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const prompt = buildAnalysisPrompt(html);
    expect(prompt).toContain('<html>');
    expect(prompt).toContain("Return ONLY one word: 'poor', 'mediocre', or 'good'");
  });

  it('truncates HTML longer than 8000 chars', () => {
    const html = 'x'.repeat(10000);
    const prompt = buildAnalysisPrompt(html);
    expect(prompt.length).toBeLessThan(9000);
  });
});

describe('scoreWebsite', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('returns "no website" when url is empty', async () => {
    expect(await scoreWebsite('')).toBe('no website');
  });

  it('returns "poor" when Gemini responds with "poor"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>old site</body></html>',
    });
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'poor' } });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" when Gemini response has extra whitespace', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html></html>',
    });
    mockGenerateContent.mockResolvedValue({ response: { text: () => '  mediocre  \n' } });
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });

  it('returns "poor" on fetch failure (unreachable = poor)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await scoreWebsite('http://broken.example.com')).toBe('poor');
  });

  it('returns "poor" on non-200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" (fail open) when Gemini throws', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html></html>',
    });
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/analyzers/website-quality.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../analyzers/website-quality'`

- [ ] **Step 3: Create analyzers/website-quality.js**

```javascript
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

function buildAnalysisPrompt(html) {
  const truncated = html.slice(0, 8000);
  return `You are evaluating whether a small business website is modern or outdated.

Classify the website quality using this HTML:
- "poor": broken layout, pre-2015 aesthetics, missing pages, or load failure
- "mediocre": functional but dated, no mobile responsiveness, stale content
- "good": modern, clean, mobile-friendly

Return ONLY one word: 'poor', 'mediocre', or 'good'

HTML:
${truncated}`;
}

async function scoreWebsite(url) {
  if (!url) return 'no website';

  let html;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return 'poor';
    html = await response.text();
  } catch {
    return 'poor';
  }

  try {
    const prompt = buildAnalysisPrompt(html);
    const result = await model.generateContent(prompt);
    const score = result.response.text().trim().toLowerCase();
    if (['poor', 'mediocre', 'good'].includes(score)) return score;
    return 'poor';
  } catch (err) {
    console.warn(`  Gemini analysis failed for ${url}: ${err.message}`);
    return 'mediocre'; // fail open — don't discard leads on API error
  }
}

module.exports = { scoreWebsite, buildAnalysisPrompt };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/analyzers/website-quality.test.js --no-coverage
```

Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add analyzers/website-quality.js tests/analyzers/website-quality.test.js
git commit -m "feat: add website quality analyzer with Gemini scoring"
```

---

## Task 4: Email Generator

**Files:**
- Create: `generators/email-generator.js`
- Create: `tests/generators/email-generator.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/generators/email-generator.test.js`:

```javascript
const { generateEmail, buildEmailPrompt } = require('../../generators/email-generator');

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('buildEmailPrompt', () => {
  it('includes business name in prompt', () => {
    const prompt = buildEmailPrompt("Joe's Pizza", '123 Main St, Princeton NJ', 'no website');
    expect(prompt).toContain("Joe's Pizza");
    expect(prompt).toContain('Princeton NJ');
  });

  it('describes "no website" situation', () => {
    const prompt = buildEmailPrompt('Hair Salon', 'Trenton NJ', 'no website');
    expect(prompt).toContain('no website');
  });

  it('describes poor website situation', () => {
    const prompt = buildEmailPrompt('Dental Office', 'Ewing NJ', 'poor');
    expect(prompt).toContain('poor');
  });
});

describe('generateEmail', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('returns parsed email draft with subject and body', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "Subject: Website idea for Joe's Pizza\nBody: Hi there,\n\nI came across Joe's Pizza and love what you're doing. I build modern websites for local businesses. Happy to chat!\n\nBest, Shane",
      },
    });

    const draft = await generateEmail("Joe's Pizza", '123 Main St, Princeton NJ', 'no website');
    expect(draft.businessName).toBe("Joe's Pizza");
    expect(draft.address).toBe('123 Main St, Princeton NJ');
    expect(draft.subject).toBe("Website idea for Joe's Pizza");
    expect(draft.body).toContain("Joe's Pizza");
  });

  it('returns fallback draft on Gemini error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

    const draft = await generateEmail('Broken Biz', 'Trenton NJ', 'poor');
    expect(draft.businessName).toBe('Broken Biz');
    expect(draft.subject).toContain('Broken Biz');
    expect(draft.body).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/generators/email-generator.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../generators/email-generator'`

- [ ] **Step 3: Create generators/email-generator.js**

```javascript
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

function buildEmailPrompt(businessName, address, websiteQuality) {
  const situation =
    websiteQuality === 'no website'
      ? `${businessName} has no website at all`
      : `${businessName} has a ${websiteQuality} website that could use a refresh`;

  return `Draft a short cold email to a local small business owner.

Details:
- Business: ${businessName}
- Location: ${address}
- Situation: ${situation}

Requirements:
- Tone: warm, friendly, NOT pushy or salesy
- Mention the specific situation (no website or outdated site)
- Value prop: "I build modern websites for local businesses"
- CTA: soft — offer to chat or share ideas
- Length: under 150 words
- Do NOT use generic openers like "I hope this finds you well"

Format your response EXACTLY like this (no extra text before or after):
Subject: [your subject line]
Body: [your email body]`;
}

function parseDraftResponse(raw, businessName, address) {
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/m);
  const bodyMatch = raw.match(/^Body:\s*([\s\S]+)$/m);
  return {
    businessName,
    address,
    subject: subjectMatch ? subjectMatch[1].trim() : `Website idea for ${businessName}`,
    body: bodyMatch ? bodyMatch[1].trim() : raw.trim(),
  };
}

async function generateEmail(businessName, address, websiteQuality) {
  try {
    const prompt = buildEmailPrompt(businessName, address, websiteQuality);
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    return parseDraftResponse(raw, businessName, address);
  } catch (err) {
    console.warn(`  Email generation failed for ${businessName}: ${err.message}`);
    const city = address.split(',').pop().trim();
    return {
      businessName,
      address,
      subject: `Website idea for ${businessName}`,
      body: `Hi there,\n\nI came across ${businessName} in ${city} and wanted to reach out. I build modern websites for local businesses and think there's a real opportunity here.\n\nHappy to share some ideas — no pressure!\n\nBest,\nShane`,
    };
  }
}

module.exports = { generateEmail, buildEmailPrompt };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/generators/email-generator.test.js --no-coverage
```

Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add generators/email-generator.js tests/generators/email-generator.test.js
git commit -m "feat: add email generator with Gemini drafting and fallback"
```

---

## Task 5: Output Writer

**Files:**
- Create: `utils/output-writer.js`
- Create: `tests/utils/output-writer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils/output-writer.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const { writeCsv, writeEmails, csvEscape } = require('../../utils/output-writer');

describe('csvEscape', () => {
  it('wraps field in quotes if it contains a comma', () => {
    expect(csvEscape('hello, world')).toBe('"hello, world"');
  });

  it('wraps field in quotes if it contains a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it('returns plain string if no special chars', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('returns empty string for null or undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('writeCsv', () => {
  const testPath = path.join(__dirname, 'test-leads.csv');
  afterEach(() => { if (fs.existsSync(testPath)) fs.unlinkSync(testPath); });

  it('writes header row and data rows', () => {
    const leads = [{
      name: "Joe's Pizza",
      address: '123 Main St, Princeton NJ',
      phone: '6095551234',
      website: 'http://joespizza.com',
      websiteQuality: 'poor',
      mapsUrl: 'https://maps.google.com/1',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link');
    expect(content).toContain("Joe's Pizza");
    expect(content).toContain('Princeton NJ');
  });

  it('properly quotes fields containing commas', () => {
    const leads = [{
      name: 'Smith, Jones & Co',
      address: 'Trenton NJ',
      phone: '',
      website: '',
      websiteQuality: 'no website',
      mapsUrl: '',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('"Smith, Jones & Co"');
  });
});

describe('writeEmails', () => {
  const testPath = path.join(__dirname, 'test-emails.md');
  afterEach(() => { if (fs.existsSync(testPath)) fs.unlinkSync(testPath); });

  it('writes a markdown section for each email draft', () => {
    const drafts = [{
      businessName: "Joe's Pizza",
      address: '123 Main St, Princeton NJ',
      subject: "Website idea for Joe's Pizza",
      body: 'Hi there, great place!',
    }];
    writeEmails(testPath, drafts);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain("## Joe's Pizza — 123 Main St, Princeton NJ");
    expect(content).toContain("**Subject:** Website idea for Joe's Pizza");
    expect(content).toContain('Hi there, great place!');
  });

  it('writes a "no results" message when drafts array is empty', () => {
    writeEmails(testPath, []);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('# Email Drafts');
    expect(content).toContain('No qualifying leads');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/utils/output-writer.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../utils/output-writer'`

- [ ] **Step 3: Create utils/output-writer.js**

```javascript
const fs = require('fs');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCsv(filePath, leads) {
  const header = 'Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link';
  const rows = leads.map((lead) =>
    [
      csvEscape(lead.name),
      csvEscape(lead.address),
      csvEscape(lead.phone),
      csvEscape(lead.website),
      csvEscape(lead.websiteQuality),
      csvEscape(lead.mapsUrl),
    ].join(',')
  );
  fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf8');
}

function writeEmails(filePath, drafts) {
  if (drafts.length === 0) {
    fs.writeFileSync(filePath, '# Email Drafts\n\nNo qualifying leads found this run.\n', 'utf8');
    return;
  }
  const sections = drafts.map(
    (draft) =>
      `## ${draft.businessName} — ${draft.address}\n\n**Subject:** ${draft.subject}\n\n**Email:**\n\n${draft.body}\n`
  );
  const content = `# Email Drafts\n\nGenerated: ${new Date().toLocaleDateString()}\n\n---\n\n${sections.join('\n---\n\n')}`;
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = { writeCsv, writeEmails, csvEscape };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/utils/output-writer.test.js --no-coverage
```

Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add utils/output-writer.js tests/utils/output-writer.test.js
git commit -m "feat: add CSV and markdown output writers"
```

---

## Task 6: Orchestrator

**Files:**
- Create: `index.js`

- [ ] **Step 1: Create index.js**

```javascript
require('dotenv').config();
const path = require('path');
const { searchTerms, outputDir } = require('./config');
const { scrapeLeads } = require('./scrapers/google-maps');
const { scoreWebsite } = require('./analyzers/website-quality');
const { generateEmail } = require('./generators/email-generator');
const { writeCsv, writeEmails } = require('./utils/output-writer');

async function run() {
  console.log('=== WebsiteBot Starting ===\n');
  const start = Date.now();

  // Stage 1: Scrape
  console.log('Stage 1: Scraping Google Maps...');
  const rawLeads = await scrapeLeads(searchTerms);
  console.log(`\nFound ${rawLeads.length} unique leads\n`);

  // Stage 2: Score websites
  console.log('Stage 2: Analyzing website quality...');
  const scoredLeads = [];
  for (const lead of rawLeads) {
    process.stdout.write(`  Scoring ${lead.name}... `);
    const websiteQuality = await scoreWebsite(lead.website);
    scoredLeads.push({ ...lead, websiteQuality });
    console.log(websiteQuality);
  }
  const qualifying = scoredLeads.filter(
    (l) => l.websiteQuality === 'poor' || l.websiteQuality === 'no website'
  );
  console.log(`\n${qualifying.length} qualifying leads (poor or no website)\n`);

  // Stage 3: Generate emails
  console.log('Stage 3: Generating email drafts...');
  const emailDrafts = [];
  for (const lead of qualifying) {
    process.stdout.write(`  Drafting for ${lead.name}... `);
    const draft = await generateEmail(lead.name, lead.address, lead.websiteQuality);
    emailDrafts.push(draft);
    console.log('done');
  }

  // Stage 4: Write output
  console.log('\nStage 4: Writing output files...');
  const csvPath = path.join(outputDir, 'leads.csv');
  const emailsPath = path.join(outputDir, 'emails.md');
  writeCsv(csvPath, scoredLeads);
  writeEmails(emailsPath, emailDrafts);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);
  console.log(`Leads CSV:     ${csvPath} (${scoredLeads.length} leads)`);
  console.log(`Email drafts:  ${emailsPath} (${emailDrafts.length} drafts)`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test the full pipeline with one search term**

Temporarily edit `config.js` to set `searchTerms` to just `['coffee shop near Princeton NJ']`, then run:

```bash
node index.js
```

Expected output (abbreviated):
```
=== WebsiteBot Starting ===

Stage 1: Scraping Google Maps...

Scraping: coffee shop near Princeton NJ
  Found: Small World Coffee
  Found: ...

Found 8 unique leads

Stage 2: Analyzing website quality...
  Scoring Small World Coffee... poor
  ...

Stage 3: Generating email drafts...
  Drafting for Small World Coffee... done
  ...

Stage 4: Writing output files...

=== Done in 45.2s ===
Leads CSV:     ./output/leads.csv (8 leads)
Email drafts:  ./output/emails.md (5 drafts)
```

Verify: `output/leads.csv` exists with data rows, `output/emails.md` exists with formatted email sections. Restore `config.js` to the full search terms list.

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add pipeline orchestrator (index.js)"
```

---

## Task 7: Dashboard Server

**Files:**
- Create: `dashboard/server.js`
- Create: `tests/dashboard/server.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/dashboard/server.test.js`:

```javascript
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createApp, parseCsv } = require('../../dashboard/server');

const TEST_DIR = path.join(__dirname, 'test-output');

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'leads.csv'),
    "Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link\nJoe's Pizza,Princeton NJ,6095551234,http://joespizza.com,poor,https://maps.google.com/1\n"
  );
  fs.writeFileSync(
    path.join(TEST_DIR, 'emails.md'),
    "# Email Drafts\n\n## Joe's Pizza — Princeton NJ\n\n**Subject:** Website idea\n\n**Email:**\n\nHi there!\n"
  );
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true });
});

describe('parseCsv', () => {
  it('parses header and one row into an object', () => {
    const csv = 'Name,City\nJoe,Princeton\n';
    const result = parseCsv(csv);
    expect(result).toEqual([{ Name: 'Joe', City: 'Princeton' }]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,City\n"Smith, Co",Trenton\n';
    const result = parseCsv(csv);
    expect(result[0].Name).toBe('Smith, Co');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsv('Name,City\n')).toEqual([]);
  });
});

describe('GET /api/leads', () => {
  it('returns parsed leads as JSON array', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]['Business Name']).toBe("Joe's Pizza");
  });

  it('returns empty array when leads.csv does not exist', async () => {
    const app = createApp(path.join(__dirname, 'nonexistent'));
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/emails', () => {
  it('returns emails.md content as string', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/emails');
    expect(res.status).toBe(200);
    expect(res.body.content).toContain("Joe's Pizza");
  });

  it('returns empty content when emails.md does not exist', async () => {
    const app = createApp(path.join(__dirname, 'nonexistent'));
    const res = await request(app).get('/api/emails');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/dashboard/server.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../dashboard/server'`

- [ ] **Step 3: Create dashboard/server.js**

```javascript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/dashboard/server.test.js --no-coverage
```

Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add dashboard/server.js tests/dashboard/server.test.js
git commit -m "feat: add Express dashboard server with /api/leads and /api/emails"
```

---

## Task 8: Dashboard Frontend

**Files:**
- Create: `dashboard/public/index.html`
- Create: `dashboard/public/style.css`
- Create: `dashboard/public/app.js`

- [ ] **Step 1: Create dashboard/public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WebsiteBot Dashboard</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header>
    <h1>WebsiteBot Dashboard</h1>
    <div id="stats"></div>
  </header>

  <nav>
    <button class="tab-btn active" data-tab="leads">Leads</button>
    <button class="tab-btn" data-tab="emails">Email Drafts</button>
  </nav>

  <main>
    <section id="leads-tab" class="tab-content active">
      <div class="toolbar">
        <input type="text" id="search" placeholder="Filter by name or address..." />
        <select id="quality-filter">
          <option value="">All qualities</option>
          <option value="no website">No website</option>
          <option value="poor">Poor</option>
          <option value="mediocre">Mediocre</option>
          <option value="good">Good</option>
        </select>
      </div>
      <table id="leads-table">
        <thead>
          <tr>
            <th>Business Name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Website</th>
            <th>Quality</th>
            <th>Maps</th>
          </tr>
        </thead>
        <tbody id="leads-body">
          <tr><td colspan="6">Loading...</td></tr>
        </tbody>
      </table>
    </section>

    <section id="emails-tab" class="tab-content hidden">
      <div id="emails-content">Loading...</div>
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create dashboard/public/style.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f5f5;
  color: #222;
}

header {
  background: #1a1a2e;
  color: white;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
}

header h1 { font-size: 1.4rem; }
#stats { font-size: 0.85rem; color: #aaa; }

nav {
  background: white;
  border-bottom: 2px solid #e0e0e0;
  padding: 0 24px;
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 12px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.95rem;
  color: #666;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}

.tab-btn.active { color: #1a1a2e; border-bottom-color: #1a1a2e; font-weight: 600; }

main { padding: 24px; }

.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }

.toolbar input, .toolbar select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
}

.toolbar input { flex: 1; }

table {
  width: 100%;
  background: white;
  border-radius: 8px;
  border-collapse: collapse;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  overflow: hidden;
}

th {
  background: #1a1a2e;
  color: white;
  padding: 10px 14px;
  text-align: left;
  font-size: 0.85rem;
  font-weight: 600;
}

td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; font-size: 0.88rem; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafafa; }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-poor { background: #fee2e2; color: #991b1b; }
.badge-mediocre { background: #fef3c7; color: #92400e; }
.badge-good { background: #d1fae5; color: #065f46; }
.badge-no-website { background: #ede9fe; color: #5b21b6; }

a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }

.hidden { display: none; }

#emails-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  white-space: pre-wrap;
  font-family: 'Georgia', serif;
  line-height: 1.7;
  max-width: 800px;
}
```

- [ ] **Step 3: Create dashboard/public/app.js**

```javascript
let allLeads = [];

async function loadLeads() {
  const res = await fetch('/api/leads');
  allLeads = await res.json();
  renderStats();
  renderLeads(allLeads);
}

async function loadEmails() {
  const res = await fetch('/api/emails');
  const { content } = await res.json();
  document.getElementById('emails-content').textContent =
    content || 'No email drafts found. Run node index.js first.';
}

function renderStats() {
  const noWebsite = allLeads.filter((l) => l['Website Quality'] === 'no website').length;
  const poor = allLeads.filter((l) => l['Website Quality'] === 'poor').length;
  document.getElementById('stats').textContent =
    `${allLeads.length} leads · ${noWebsite} no website · ${poor} poor`;
}

function badgeHtml(quality) {
  const cls = quality === 'no website' ? 'badge-no-website' : `badge-${quality}`;
  return `<span class="badge ${cls}">${quality}</span>`;
}

function renderLeads(leads) {
  const tbody = document.getElementById('leads-body');
  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="6">No leads found. Run node index.js first.</td></tr>';
    return;
  }
  tbody.innerHTML = leads
    .map(
      (lead) => `
    <tr>
      <td>${lead['Business Name'] || ''}</td>
      <td>${lead['Address'] || ''}</td>
      <td>${lead['Phone'] || ''}</td>
      <td>${lead['Website URL'] ? `<a href="${lead['Website URL']}" target="_blank">Visit</a>` : '—'}</td>
      <td>${badgeHtml(lead['Website Quality'] || '')}</td>
      <td>${lead['Google Maps Link'] ? `<a href="${lead['Google Maps Link']}" target="_blank">Maps</a>` : '—'}</td>
    </tr>`
    )
    .join('');
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const quality = document.getElementById('quality-filter').value;
  const filtered = allLeads.filter((lead) => {
    const matchesSearch =
      !search ||
      (lead['Business Name'] || '').toLowerCase().includes(search) ||
      (lead['Address'] || '').toLowerCase().includes(search);
    const matchesQuality = !quality || lead['Website Quality'] === quality;
    return matchesSearch && matchesQuality;
  });
  renderLeads(filtered);
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.remove('hidden');
    if (btn.dataset.tab === 'emails') loadEmails();
  });
});

document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('quality-filter').addEventListener('change', applyFilters);

loadLeads();
```

- [ ] **Step 4: Smoke test the dashboard**

```bash
node dashboard/server.js
```

Open `http://localhost:3000` in browser.

Expected:
- Header shows "WebsiteBot Dashboard"
- "Leads" and "Email Drafts" tabs visible
- If `output/leads.csv` exists (from Task 6 smoke test): leads table populates with badges
- Clicking "Email Drafts" tab shows email content
- Search input and quality filter work to narrow the table

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass (analyzers ×6, generators ×5, utils ×7, dashboard ×7 = 25 total)

- [ ] **Step 6: Commit**

```bash
git add dashboard/public/
git commit -m "feat: add dashboard frontend with leads table and email viewer"
```

---

## End-to-End Verification

```bash
# 1. Set up environment
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY

# 2. Run the full pipeline
node index.js

# 3. Check outputs
ls -lh output/
# Expected: leads.csv > 1KB, emails.md > 1KB

# 4. Spot-check leads.csv
head -5 output/leads.csv
# Expected: header row + 4 data rows with business names

# 5. Spot-check emails.md
head -20 output/emails.md
# Expected: # Email Drafts header, then ## sections with Subject and Email fields

# 6. Start dashboard
node dashboard/server.js
# Open http://localhost:3000
# Verify: leads table shows, quality badges render, filter works, email drafts tab loads
```

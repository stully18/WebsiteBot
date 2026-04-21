# Outreach Automation & Triage Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contact email/social scraping, a batch triage UI (checklist → Send All), and Gmail OAuth auto-send with signature so Shane can send outreach emails in one click instead of copy-pasting.

**Architecture:** New `scrapers/contact-scraper.js` enriches leads with email + social handles after the existing Maps scrape. `utils/gmail-auth.js` + `utils/gmail-sender.js` handle Gmail OAuth and MIME building. `dashboard/server.js` gets two new endpoints (`/api/leads/send-batch`, `/api/leads/sent`) plus Gmail OAuth routes. The dashboard gains a new Triage tab with Email Queue + Social Queue + batch send.

**Tech Stack:** Node.js, Puppeteer, googleapis (Gmail API), Express, Jest + supertest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `scrapers/google-maps.js` | Add `getWebsiteConfidence()`, tighten mismatch detection |
| Create | `scrapers/contact-scraper.js` | Extract email + social from business websites |
| Modify | `utils/output-writer.js` | Add Email, Instagram, Facebook CSV columns |
| Modify | `index.js` | Add `--stage=contacts` pipeline stage |
| Create | `utils/gmail-auth.js` | Gmail OAuth2 token management |
| Create | `utils/gmail-sender.js` | Build MIME messages, send via Gmail API, cache signature |
| Modify | `dashboard/server.js` | Add send-batch, sent, Gmail auth routes; inject sendGmailMessage/getGmailSignature |
| Modify | `dashboard/public/index.html` | Add Triage tab nav + section |
| Modify | `dashboard/public/app.js` | Triage UI logic: Email Queue, Social Queue, batch send, DM copy |
| Modify | `dashboard/public/style.css` | Triage tab styles |
| Modify | `.env.example` | Document Gmail OAuth env vars |
| Modify | `.gitignore` | Ignore `.credentials/` and `output/sent-leads.json` |
| Create | `tests/scrapers/contact-scraper.test.js` | Tests for pure contact extraction helpers |
| Create | `tests/utils/gmail-sender.test.js` | Tests for `buildMimeMessage` |
| Modify | `tests/scrapers/google-maps.test.js` | Tests for `getWebsiteConfidence` |
| Modify | `tests/utils/output-writer.test.js` | Tests for new CSV columns |
| Modify | `tests/dashboard/server.test.js` | Tests for new API endpoints |

---

## Task 1: Website Confidence Scoring

**Files:**
- Modify: `scrapers/google-maps.js`
- Modify: `tests/scrapers/google-maps.test.js`

- [ ] **Step 1: Write failing tests for `getWebsiteConfidence`**

Append to `tests/scrapers/google-maps.test.js`:

```js
const {
  decodeGoogleOutboundUrl,
  extractTrackingDestination,
  normalizeWebsiteUrl,
  pickWebsiteCandidate,
  isLikelyBusinessWebsiteForLead,
  getWebsiteConfidence,
} = require('../../scrapers/google-maps');

describe('getWebsiteConfidence', () => {
  it('returns high when domain has a strong 7+ char token match', () => {
    expect(
      getWebsiteConfidence('https://www.primeomegafitness.com', {
        name: 'Prime Omega Fitness',
        address: 'Princeton NJ',
      })
    ).toBe('high');
  });

  it('returns high when domain has 2 shorter token matches', () => {
    expect(
      getWebsiteConfidence('https://www.acmeplumbing.com', {
        name: 'Acme Plumbing',
        address: 'Princeton NJ',
      })
    ).toBe('high');
  });

  it('returns low when only 1 short token matches', () => {
    expect(
      getWebsiteConfidence('https://www.acmeservices.com', {
        name: 'Acme Roofing',
        address: 'Ewing NJ',
      })
    ).toBe('low');
  });

  it('returns low when no tokens match', () => {
    expect(
      getWebsiteConfidence('https://www.jerseyplumbingpros.com', {
        name: 'Sai CPA Services',
        address: 'Ewing NJ',
      })
    ).toBe('low');
  });

  it('returns unknown for empty url', () => {
    expect(getWebsiteConfidence('', { name: 'Any', address: 'NJ' })).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/scrapers/google-maps.test.js --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `getWebsiteConfidence is not a function`

- [ ] **Step 3: Implement `getWebsiteConfidence` in `scrapers/google-maps.js`**

Add after the existing `isLikelyBusinessWebsiteForLead` function (around line 160):

```js
function getWebsiteConfidence(url, lead) {
  if (!url) return 'unknown';
  try {
    const parsed = new URL(url);
    const domainParts = getRegisteredDomainParts(parsed.hostname);
    if (!domainParts.length) return 'low';
    const mergedDomain = domainParts.join('');

    const leadTokens = [
      ...tokenizeBusinessIdentity(lead.name),
      ...tokenizeBusinessIdentity(lead.address),
    ];
    if (!leadTokens.length) return 'unknown';

    let matchCount = 0;
    for (const token of leadTokens) {
      const matched =
        domainParts.includes(token) || (token.length >= 5 && mergedDomain.includes(token));
      if (matched) {
        matchCount++;
        if (token.length >= 7) return 'high';
      }
    }
    return matchCount >= 2 ? 'high' : 'low';
  } catch {
    return 'unknown';
  }
}
```

Replace the existing `isLikelyBusinessWebsiteForLead` body to use `getWebsiteConfidence`:

```js
function isLikelyBusinessWebsiteForLead(url, lead) {
  return getWebsiteConfidence(url, lead) === 'high';
}
```

Add `getWebsiteConfidence` to the `module.exports` at the bottom of the file:

```js
module.exports = {
  scrapeLeads,
  discoverMissingWebsites,
  decodeGoogleOutboundUrl,
  extractTrackingDestination,
  normalizeWebsiteUrl,
  pickWebsiteCandidate,
  isLikelyBusinessWebsiteForLead,
  getWebsiteConfidence,
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/scrapers/google-maps.test.js --no-coverage 2>&1 | tail -20
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add scrapers/google-maps.js tests/scrapers/google-maps.test.js && git commit -m "feat: add getWebsiteConfidence for lead/website mismatch detection"
```

---

## Task 2: Contact Scraper — Pure Helper Functions

**Files:**
- Create: `scrapers/contact-scraper.js`
- Create: `tests/scrapers/contact-scraper.test.js`

- [ ] **Step 1: Write failing tests for pure helpers**

Create `tests/scrapers/contact-scraper.test.js`:

```js
const {
  extractEmailsFromText,
  extractSocialFromLinks,
  findContactPageLink,
} = require('../../scrapers/contact-scraper');

describe('extractEmailsFromText', () => {
  it('finds emails in plain text', () => {
    const text = 'Contact us at hello@acmeroofing.com for a quote.';
    expect(extractEmailsFromText(text)).toEqual(['hello@acmeroofing.com']);
  });

  it('returns empty array when no emails found', () => {
    expect(extractEmailsFromText('No contact info here.')).toEqual([]);
  });

  it('filters out noreply addresses', () => {
    const text = 'noreply@example.com and real@business.com';
    expect(extractEmailsFromText(text)).toEqual(['real@business.com']);
  });

  it('filters out no-reply addresses', () => {
    const text = 'no-reply@service.io here';
    expect(extractEmailsFromText(text)).toEqual([]);
  });

  it('returns multiple emails', () => {
    const text = 'email a@b.com or c@d.com';
    expect(extractEmailsFromText(text)).toHaveLength(2);
  });
});

describe('extractSocialFromLinks', () => {
  it('extracts instagram profile link', () => {
    const links = ['https://www.instagram.com/acmeroofing/', 'https://facebook.com/'];
    const result = extractSocialFromLinks(links);
    expect(result.instagram).toBe('https://www.instagram.com/acmeroofing/');
  });

  it('extracts facebook profile link', () => {
    const links = ['https://www.facebook.com/acmeroofing.nj/'];
    const result = extractSocialFromLinks(links);
    expect(result.facebook).toBe('https://www.facebook.com/acmeroofing.nj/');
  });

  it('ignores bare instagram.com root', () => {
    const links = ['https://instagram.com/', 'https://twitter.com/'];
    const result = extractSocialFromLinks(links);
    expect(result.instagram).toBe('');
  });

  it('ignores facebook sharer links', () => {
    const links = ['https://facebook.com/sharer/sharer.php?u=http://example.com'];
    const result = extractSocialFromLinks(links);
    expect(result.facebook).toBe('');
  });

  it('returns empty strings when no social links found', () => {
    const result = extractSocialFromLinks(['https://example.com']);
    expect(result).toEqual({ instagram: '', facebook: '' });
  });
});

describe('findContactPageLink', () => {
  it('returns link containing "contact" keyword', () => {
    const links = ['https://acme.com/', 'https://acme.com/contact', 'https://acme.com/services'];
    expect(findContactPageLink(links)).toBe('https://acme.com/contact');
  });

  it('returns link containing "about" keyword', () => {
    const links = ['https://acme.com/', 'https://acme.com/about-us'];
    expect(findContactPageLink(links)).toBe('https://acme.com/about-us');
  });

  it('returns empty string when no contact-like link found', () => {
    const links = ['https://acme.com/', 'https://acme.com/services'];
    expect(findContactPageLink(links)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/scrapers/contact-scraper.test.js --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../scrapers/contact-scraper'`

- [ ] **Step 3: Create `scrapers/contact-scraper.js` with pure helpers**

```js
const puppeteer = require('puppeteer');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const CONTACT_KEYWORDS = ['contact', 'about', 'reach us', 'get in touch'];

function extractEmailsFromText(text) {
  const matches = String(text || '').match(EMAIL_REGEX) || [];
  return matches.filter(
    (email) =>
      !email.includes('noreply') &&
      !email.includes('no-reply') &&
      !email.endsWith('@example.com') &&
      !email.endsWith('@sentry.io')
  );
}

function extractSocialFromLinks(links) {
  const instagram =
    (links || []).find(
      (href) =>
        href.includes('instagram.com/') &&
        !href.match(/instagram\.com\/?$/) &&
        !href.includes('/p/') &&
        !href.includes('/reel/')
    ) || '';

  const facebook =
    (links || []).find(
      (href) =>
        href.includes('facebook.com/') &&
        !href.match(/facebook\.com\/?$/) &&
        !href.includes('/sharer') &&
        !href.includes('/dialog/')
    ) || '';

  return { instagram, facebook };
}

function findContactPageLink(links) {
  return (
    (links || []).find((href) => {
      const lower = (href || '').toLowerCase();
      return CONTACT_KEYWORDS.some((kw) => lower.includes(kw));
    }) || ''
  );
}

module.exports = { extractEmailsFromText, extractSocialFromLinks, findContactPageLink };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/scrapers/contact-scraper.test.js --no-coverage 2>&1 | tail -10
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add scrapers/contact-scraper.js tests/scrapers/contact-scraper.test.js && git commit -m "feat: add contact scraper pure helpers (email + social extraction)"
```

---

## Task 3: Contact Scraper — Browser Integration

**Files:**
- Modify: `scrapers/contact-scraper.js`

- [ ] **Step 1: Add `extractContactInfo` and `scrapeContactInfoBatch` to the module**

Append to `scrapers/contact-scraper.js` (after the `findContactPageLink` function, before `module.exports`):

```js
async function extractContactInfo(websiteUrl, page) {
  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const homeLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)
    );
    const homeText = await page.evaluate(() => document.body.innerText || '');

    const { instagram, facebook } = extractSocialFromLinks(homeLinks);

    const mailtoEmails = homeLinks
      .filter((href) => href.startsWith('mailto:'))
      .map((href) => href.replace('mailto:', '').split('?')[0].trim());
    const textEmails = extractEmailsFromText(homeText);
    const homeEmails = [...new Set([...mailtoEmails, ...textEmails])].filter(Boolean);

    if (homeEmails.length > 0) {
      return { email: homeEmails[0], instagram, facebook };
    }

    const contactLink = findContactPageLink(homeLinks);
    if (contactLink) {
      try {
        await page.goto(contactLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const contactText = await page.evaluate(() => document.body.innerText || '');
        const contactMailto = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) =>
            a.href.replace('mailto:', '').split('?')[0].trim()
          )
        );
        const contactEmails = [...new Set([...contactMailto, ...extractEmailsFromText(contactText)])].filter(
          Boolean
        );
        if (contactEmails.length > 0) {
          return { email: contactEmails[0], instagram, facebook };
        }
      } catch {
        // contact page failed — return social only
      }
    }

    return { email: '', instagram, facebook };
  } catch {
    return { email: '', instagram: '', facebook: '' };
  }
}

async function scrapeContactInfoBatch(leads) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    const updated = [];
    for (const lead of leads) {
      const website = (lead.website || '').trim();
      if (!website) {
        updated.push({ ...lead, email: lead.email || '', instagram: lead.instagram || '', facebook: lead.facebook || '' });
        continue;
      }
      if (lead.email && lead.instagram !== undefined && lead.facebook !== undefined) {
        updated.push(lead);
        continue;
      }
      try {
        const contact = await extractContactInfo(website, page);
        updated.push({ ...lead, ...contact });
        if (contact.email) console.log(`  Email found for ${lead.name}: ${contact.email}`);
      } catch (err) {
        console.warn(`  Contact scrape failed for ${lead.name}: ${err.message}`);
        updated.push({ ...lead, email: '', instagram: '', facebook: '' });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return updated;
  } finally {
    await browser.close();
  }
}
```

Replace the `module.exports` line at the bottom:

```js
module.exports = {
  extractEmailsFromText,
  extractSocialFromLinks,
  findContactPageLink,
  extractContactInfo,
  scrapeContactInfoBatch,
};
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/scrapers/contact-scraper.test.js --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add scrapers/contact-scraper.js && git commit -m "feat: add extractContactInfo and scrapeContactInfoBatch with puppeteer"
```

---

## Task 4: CSV Output — New Columns

**Files:**
- Modify: `utils/output-writer.js`
- Modify: `tests/utils/output-writer.test.js`

- [ ] **Step 1: Write failing test for new columns**

Append to the `writeCsv` describe block in `tests/utils/output-writer.test.js`:

```js
  it('includes Email, Instagram, Facebook columns', () => {
    const leads = [{
      name: 'Acme Roofing',
      address: 'Princeton NJ',
      phone: '6095550000',
      website: 'https://acmeroofing.com',
      websiteQuality: '',
      mapsUrl: '',
      email: 'hello@acmeroofing.com',
      instagram: 'https://instagram.com/acmeroofing',
      facebook: '',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link,Email,Instagram,Facebook');
    expect(content).toContain('hello@acmeroofing.com');
    expect(content).toContain('https://instagram.com/acmeroofing');
  });
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/utils/output-writer.test.js --no-coverage 2>&1 | tail -15
```

Expected: FAIL — header string doesn't match, email not in output

- [ ] **Step 3: Update `writeCsv` in `utils/output-writer.js`**

Replace the `writeCsv` function:

```js
function writeCsv(filePath, leads) {
  const header = 'Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link,Email,Instagram,Facebook';
  const rows = leads.map((lead) =>
    [
      csvEscape(lead.name),
      csvEscape(lead.address),
      csvEscape(lead.phone),
      csvEscape(lead.website),
      csvEscape(lead.websiteQuality),
      csvEscape(lead.mapsUrl),
      csvEscape(lead.email || ''),
      csvEscape(lead.instagram || ''),
      csvEscape(lead.facebook || ''),
    ].join(',')
  );
  fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf8');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/utils/output-writer.test.js --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add utils/output-writer.js tests/utils/output-writer.test.js && git commit -m "feat: add Email, Instagram, Facebook columns to CSV output"
```

---

## Task 5: Pipeline — Contacts Stage

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Add `email`, `instagram`, `facebook` fields to `loadExistingLeads`**

In `index.js`, replace the `loadExistingLeads` function body's return map:

```js
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
    email: row['Email'] || '',
    instagram: row['Instagram'] || '',
    facebook: row['Facebook'] || '',
  }));
}
```

- [ ] **Step 2: Add `contacts` to the STAGE handling and call `scrapeContactInfoBatch`**

In `index.js`, after the existing imports at the top, add:

```js
const { scrapeContactInfoBatch } = require('./scrapers/contact-scraper');
```

After the `discoverMissingWebsites` block (around line 139, after `console.log(\`Focused working set...\``)), add this block:

```js
  let contactLeads = focusedRawLeads;
  if (STAGE === 'full' || STAGE === 'contacts') {
    console.log('Stage 3: Scraping contact info from websites...');
    contactLeads = await scrapeContactInfoBatch(focusedRawLeads);
    saveJson(rawLeadsPath, contactLeads);
    const withEmail = contactLeads.filter((l) => l.email).length;
    console.log(`Contact scraping complete. ${withEmail}/${contactLeads.length} leads have email.\n`);
  } else {
    contactLeads = focusedRawLeads;
  }
```

Then replace all remaining references to `focusedRawLeads` in the merge calls below with `contactLeads`.

- [ ] **Step 3: Add `contacts` as a valid stage in the `--stage` flag block**

Update the STAGE validation comment and any `if (STAGE === 'scrape')` blocks to also handle `'contacts'`. In the `run()` function's `if (STAGE === 'scrape')` early-return block, add to the console output:

```js
    console.log(`Valid stages: full | scrape | discover | contacts | process`);
```

- [ ] **Step 4: Manual smoke test (no automated test — pipeline uses Puppeteer)**

```bash
cd /home/shane/projects/WebsiteBot && node index.js --stage=contacts 2>&1 | tail -20
```

Expected: Output shows "Stage 3: Scraping contact info..." and "Contact scraping complete. X/Y leads have email."

- [ ] **Step 5: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add index.js && git commit -m "feat: add contacts pipeline stage with email/social scraping"
```

---

## Task 6: Gmail Auth Utility

**Files:**
- Create: `utils/gmail-auth.js`

- [ ] **Step 1: Install `googleapis` package**

```bash
cd /home/shane/projects/WebsiteBot && npm install googleapis
```

Expected: `added N packages` — no errors

- [ ] **Step 2: Create `utils/gmail-auth.js`**

```js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(process.cwd(), '.credentials', 'gmail-token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/gmail/callback'
  );
}

function getAuthUrl() {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens), 'utf8');
  return client;
}

async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('Gmail not authenticated. Visit /auth/gmail to connect your account.');
  }
  const tokens = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(merged), 'utf8');
  });
  return client;
}

function isAuthenticated() {
  return fs.existsSync(CREDENTIALS_PATH);
}

module.exports = { getAuthUrl, exchangeCode, getAuthClient, isAuthenticated };
```

- [ ] **Step 3: Run full test suite to confirm no breakage**

```bash
cd /home/shane/projects/WebsiteBot && npx jest --no-coverage 2>&1 | tail -15
```

Expected: PASS — existing tests unaffected

- [ ] **Step 4: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add utils/gmail-auth.js package.json package-lock.json && git commit -m "feat: add Gmail OAuth2 auth utility"
```

---

## Task 7: Gmail Sender Utility

**Files:**
- Create: `utils/gmail-sender.js`
- Create: `tests/utils/gmail-sender.test.js`

- [ ] **Step 1: Write failing tests for `buildMimeMessage`**

Create `tests/utils/gmail-sender.test.js`:

```js
const { buildMimeMessage } = require('../../utils/gmail-sender');

describe('buildMimeMessage', () => {
  it('base64url encodes a valid MIME message with required headers', () => {
    const raw = buildMimeMessage({
      to: 'owner@acmeroofing.com',
      subject: 'Quick website idea',
      textBody: 'Hi there! I have an idea for your site.',
      htmlSignature: '<b>Shane Tully</b>',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: owner@acmeroofing.com');
    expect(decoded).toContain('Subject: Quick website idea');
    expect(decoded).toContain('Content-Type: text/html');
    expect(decoded).toContain('Hi there! I have an idea for your site.');
    expect(decoded).toContain('<b>Shane Tully</b>');
  });

  it('includes a horizontal rule before the signature', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Body',
      htmlSignature: '<p>Sig</p>',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('<hr>');
  });

  it('omits the horizontal rule when no signature provided', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Body',
      htmlSignature: '',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).not.toContain('<hr>');
  });

  it('escapes < and > in text body to prevent XSS in HTML context', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Use <strong> tags',
      htmlSignature: '',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('&lt;strong&gt;');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/utils/gmail-sender.test.js --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../utils/gmail-sender'`

- [ ] **Step 3: Create `utils/gmail-sender.js`**

```js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { google } = require('googleapis');
const { getAuthClient } = require('./gmail-auth');

let _cachedSignature = null;

function buildMimeMessage({ to, subject, textBody, htmlSignature }) {
  const safeBody = String(textBody || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const htmlBody = `<div style="white-space:pre-wrap;font-family:sans-serif">${safeBody}</div>`;
  const fullHtml = htmlSignature ? `${htmlBody}<br><hr>${htmlSignature}` : htmlBody;

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    fullHtml,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

async function fetchGmailSignature(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const userInfo = await gmail.users.getProfile({ userId: 'me' });
    const sendAsEmail = userInfo.data.emailAddress;
    const res = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail });
    return res.data.signature || '';
  } catch {
    return '';
  }
}

async function getSignature() {
  if (_cachedSignature !== null) return _cachedSignature;
  const auth = await getAuthClient();
  _cachedSignature = await fetchGmailSignature(auth);
  return _cachedSignature;
}

async function sendEmail({ to, subject, textBody, htmlSignature }) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildMimeMessage({ to, subject, textBody, htmlSignature });
  return gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

module.exports = { buildMimeMessage, fetchGmailSignature, getSignature, sendEmail };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/utils/gmail-sender.test.js --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add utils/gmail-sender.js tests/utils/gmail-sender.test.js && git commit -m "feat: add Gmail sender utility with MIME builder and signature caching"
```

---

## Task 8: Dashboard API — Sent Leads + Batch Send

**Files:**
- Modify: `dashboard/server.js`
- Modify: `tests/dashboard/server.test.js`

- [ ] **Step 1: Write failing tests for new endpoints**

Append to `tests/dashboard/server.test.js` (inside the file, before the final closing):

```js
describe('GET /api/leads/sent', () => {
  it('returns empty array when sent-leads.json does not exist', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/leads/sent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns array of sent lead records', async () => {
    const sentPath = path.join(TEST_DIR, 'sent-leads.json');
    fs.writeFileSync(
      sentPath,
      JSON.stringify([{ key: "joe's pizza|princeton nj", sentAt: '2026-04-20T10:00:00Z', to: 'joe@pizza.com', subject: 'Hi' }])
    );
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/leads/sent');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].key).toBe("joe's pizza|princeton nj");
    fs.unlinkSync(sentPath);
  });
});

describe('POST /api/leads/send-batch', () => {
  beforeEach(() => {
    const csvPath = path.join(TEST_DIR, 'leads.csv');
    fs.writeFileSync(
      csvPath,
      "Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link,Email,Instagram,Facebook\nJoe's Pizza,Princeton NJ,6095551234,http://joespizza.com,poor,https://maps.google.com/1,owner@joespizza.com,,\n"
    );
  });

  afterEach(() => {
    const sentPath = path.join(TEST_DIR, 'sent-leads.json');
    if (fs.existsSync(sentPath)) fs.unlinkSync(sentPath);
  });

  it('sends emails for given lead keys and returns results', async () => {
    const mockGenerateDraft = jest.fn().mockResolvedValue({
      businessName: "Joe's Pizza",
      address: 'Princeton NJ',
      draftKind: 'email',
      subject: 'Website idea',
      body: 'Hi there!',
    });
    const mockSendGmailMessage = jest.fn().mockResolvedValue({});
    const mockGetGmailSignature = jest.fn().mockResolvedValue('<b>Shane</b>');
    const app = createApp(TEST_DIR, {
      generateDraftForLead: mockGenerateDraft,
      sendGmailMessage: mockSendGmailMessage,
      getGmailSignature: mockGetGmailSignature,
    });

    const res = await request(app)
      .post('/api/leads/send-batch')
      .send({ leadKeys: ["joe's pizza|princeton nj"] });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].success).toBe(true);
    expect(mockSendGmailMessage).toHaveBeenCalledWith({
      to: 'owner@joespizza.com',
      subject: 'Website idea',
      textBody: 'Hi there!',
      htmlSignature: '<b>Shane</b>',
    });
  });

  it('returns 400 when leadKeys is missing or empty', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).post('/api/leads/send-batch').send({});
    expect(res.status).toBe(400);
  });

  it('marks failed sends in results without crashing the batch', async () => {
    const mockGenerateDraft = jest.fn().mockResolvedValue({
      businessName: "Joe's Pizza",
      address: 'Princeton NJ',
      draftKind: 'email',
      subject: 'Website idea',
      body: 'Hi',
    });
    const mockSendGmailMessage = jest.fn().mockRejectedValue(new Error('SMTP failure'));
    const mockGetGmailSignature = jest.fn().mockResolvedValue('');
    const app = createApp(TEST_DIR, {
      generateDraftForLead: mockGenerateDraft,
      sendGmailMessage: mockSendGmailMessage,
      getGmailSignature: mockGetGmailSignature,
    });

    const res = await request(app)
      .post('/api/leads/send-batch')
      .send({ leadKeys: ["joe's pizza|princeton nj"] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toContain('SMTP failure');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/dashboard/server.test.js --no-coverage 2>&1 | tail -20
```

Expected: FAIL — routes not yet implemented

- [ ] **Step 3: Add helper functions to `dashboard/server.js`**

After the `writeTrashedLeadKeys` function (around line 74), add:

```js
function readSentLeads(sentPath) {
  if (!fs.existsSync(sentPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(sentPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeSentLeads(sentPath, leads) {
  fs.writeFileSync(sentPath, JSON.stringify(leads, null, 2), 'utf8');
}
```

- [ ] **Step 4: Add injectable options and new endpoints to `createApp` in `dashboard/server.js`**

In the `createApp` function options block (after the `writeEmailsFile` assignment, around line 105), add:

```js
  const sendGmailMessage =
    options.sendGmailMessage ||
    (async ({ to, subject, textBody, htmlSignature }) => {
      const { sendEmail } = require('../utils/gmail-sender');
      return sendEmail({ to, subject, textBody, htmlSignature });
    });
  const getGmailSignature =
    options.getGmailSignature ||
    (async () => {
      const { getSignature } = require('../utils/gmail-sender');
      return getSignature();
    });
  const sentLeadsPath = path.join(outputDir, 'sent-leads.json');
```

After the `app.get('/api/run-status', ...)` handler, add:

```js
  app.get('/api/leads/sent', (req, res) => {
    return res.json(readSentLeads(sentLeadsPath));
  });

  app.post('/api/leads/send-batch', async (req, res) => {
    const { leadKeys } = req.body || {};
    if (!Array.isArray(leadKeys) || leadKeys.length === 0) {
      return res.status(400).json({ error: 'leadKeys must be a non-empty array.' });
    }

    const csvPath = path.join(outputDir, 'leads.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'leads.csv not found. Run pipeline first.' });
    }

    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const rowsByKey = new Map(rows.map((r) => [leadKeyFromCsvRow(r), r]));
    const sentLeads = readSentLeads(sentLeadsPath);
    const sentKeys = new Set(sentLeads.map((s) => s.key));
    const trashedKeys = new Set(readTrashedLeadKeys(trashedLeadsPath));
    const results = [];
    let signature = null;

    for (let i = 0; i < leadKeys.length; i++) {
      const key = leadKeys[i];
      if (sentKeys.has(key)) {
        results.push({ key, success: false, error: 'Already sent.' });
        continue;
      }
      if (trashedKeys.has(key)) {
        results.push({ key, success: false, error: 'Lead is trashed.' });
        continue;
      }
      const lead = rowsByKey.get(key);
      if (!lead) {
        results.push({ key, success: false, error: 'Lead not found.' });
        continue;
      }
      const to = (lead['Email'] || '').trim();
      if (!to) {
        results.push({ key, success: false, error: 'No email address for this lead.' });
        continue;
      }

      try {
        const draft = await generateDraftForLead(
          lead['Business Name'] || '',
          lead['Address'] || '',
          lead['Website Quality'] || '',
          'email'
        );
        if (signature === null) {
          signature = await getGmailSignature();
        }
        await sendGmailMessage({
          to,
          subject: draft.subject || '',
          textBody: draft.body || '',
          htmlSignature: signature || '',
        });
        const sentRecord = { key, sentAt: new Date().toISOString(), to, subject: draft.subject || '' };
        sentLeads.push(sentRecord);
        writeSentLeads(sentLeadsPath, sentLeads);
        sentKeys.add(key);
        results.push({ key, success: true });
      } catch (err) {
        results.push({ key, success: false, error: err.message });
      }

      if (i < leadKeys.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    return res.json({ results });
  });
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/shane/projects/WebsiteBot && npx jest tests/dashboard/server.test.js --no-coverage 2>&1 | tail -20
```

Expected: PASS — all tests green

- [ ] **Step 6: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add dashboard/server.js tests/dashboard/server.test.js && git commit -m "feat: add send-batch and sent-leads API endpoints"
```

---

## Task 9: Dashboard API — Gmail Auth Routes

**Files:**
- Modify: `dashboard/server.js`

- [ ] **Step 1: Add Gmail auth routes to `createApp`**

After the `app.post('/api/leads/send-batch', ...)` handler, add:

```js
  app.get('/auth/gmail', (req, res) => {
    try {
      const { getAuthUrl } = require('../utils/gmail-auth');
      const url = getAuthUrl();
      res.redirect(url);
    } catch (err) {
      res.status(500).send(`Gmail auth error: ${err.message}`);
    }
  });

  app.get('/auth/gmail/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing auth code.');
    try {
      const { exchangeCode } = require('../utils/gmail-auth');
      await exchangeCode(code);
      res.send('<h2>Gmail connected! You can close this tab and return to the dashboard.</h2>');
    } catch (err) {
      res.status(500).send(`Failed to exchange token: ${err.message}`);
    }
  });

  app.get('/api/auth/gmail/status', (req, res) => {
    const { isAuthenticated } = require('../utils/gmail-auth');
    res.json({ authenticated: isAuthenticated() });
  });
```

- [ ] **Step 2: Run full test suite**

```bash
cd /home/shane/projects/WebsiteBot && npx jest --no-coverage 2>&1 | tail -15
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add dashboard/server.js && git commit -m "feat: add Gmail OAuth routes to dashboard server"
```

---

## Task 10: Dashboard UI — Triage Tab

**Files:**
- Modify: `dashboard/public/index.html`
- Modify: `dashboard/public/app.js`
- Modify: `dashboard/public/style.css`

- [ ] **Step 1: Add Triage tab to `index.html` nav and content area**

In `dashboard/public/index.html`, in the `<nav class="side-nav">` block, add a new button **before** the Live Logs button so Triage is the first nav item:

```html
        <button class="tab-btn active" data-tab="triage">Triage & Send</button>
        <button class="tab-btn" data-tab="logs">Live Logs</button>
        <button class="tab-btn" data-tab="leads">Leads Database</button>
        <button class="tab-btn" data-tab="emails">Email Drafts</button>
```

Also change the `logs` tab's `active` class to be on the `triage` button (already shown above), and remove `active` from the logs section.

In the `<main class="workspace">` section, add a new `<section>` **before** the `logs-tab` section:

```html
      <section id="triage-tab" class="tab-content">
        <div class="section-head triage-head">
          <h3>Triage &amp; Send</h3>
          <div class="triage-auth-status" id="triage-auth-status"></div>
        </div>

        <div class="triage-panel">
          <div class="triage-queue-header">
            <h4>Email Queue</h4>
            <div class="triage-controls">
              <button id="triage-select-all" type="button">Select All</button>
              <button id="triage-deselect-all" type="button">Deselect All</button>
              <button id="triage-send-all" type="button" class="send-all-btn">Send All Selected</button>
            </div>
          </div>
          <p id="triage-send-status" class="triage-status-msg"></p>
          <table class="triage-table" id="email-queue-table">
            <thead>
              <tr>
                <th><input type="checkbox" id="triage-master-check" /></th>
                <th>Business</th>
                <th>Website</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="email-queue-body">
              <tr><td colspan="5">Loading...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="triage-panel triage-social-panel">
          <div class="triage-queue-header">
            <h4>Social Queue <span class="queue-sub">(no email found — DM only)</span></h4>
          </div>
          <table class="triage-table" id="social-queue-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Website</th>
                <th>Platform</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="social-queue-body">
              <tr><td colspan="4">Loading...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="triage-panel triage-sent-panel">
          <div class="triage-queue-header">
            <h4>Sent <span class="queue-sub" id="sent-count">(0)</span></h4>
          </div>
          <table class="triage-table" id="sent-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Email Sent To</th>
                <th>Subject</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody id="sent-body">
              <tr><td colspan="4">No emails sent yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
```

Also update the `logs-tab` section to remove the `active` class (since triage is now active):

```html
      <section id="logs-tab" class="tab-content hidden">
```

- [ ] **Step 2: Update the `tabHeaderMeta` object in `app.js`**

In `dashboard/public/app.js`, replace the `tabHeaderMeta` object:

```js
const tabHeaderMeta = {
  triage: { eyebrow: 'Outreach', title: 'Triage & Send' },
  logs: { eyebrow: 'Pipeline', title: 'Live Logs' },
  leads: { eyebrow: 'Database', title: 'Leads Database' },
  emails: { eyebrow: 'Outreach', title: 'Email Drafts' },
};
```

- [ ] **Step 3: Add triage state variables and data loaders in `app.js`**

After the existing state variables at the top of `app.js`, add:

```js
let triageEmailLeads = [];
let triagedSentLeads = [];
let triageCheckedKeys = new Set();
let triagedSocialLeads = [];
```

Add these functions after the `loadEmailDrafts` function:

```js
async function loadSentLeads() {
  const res = await fetch('/api/leads/sent');
  triagedSentLeads = await res.json();
  return triagedSentLeads;
}

async function loadTriageData() {
  const [leadsRes, sentRes] = await Promise.all([
    fetch('/api/leads'),
    fetch('/api/leads/sent'),
  ]);
  allLeads = await leadsRes.json();
  triagedSentLeads = await sentRes.json();
  const sentKeySet = new Set(triagedSentLeads.map((s) => s.key));

  triageEmailLeads = allLeads.filter(
    (l) => (l['Email'] || '').trim() && !sentKeySet.has(leadKeyFromRow(l))
  );
  triagedSocialLeads = allLeads.filter(
    (l) =>
      !(l['Email'] || '').trim() &&
      ((l['Instagram'] || '').trim() || (l['Facebook'] || '').trim()) &&
      !sentKeySet.has(leadKeyFromRow(l))
  );

  renderTriageEmailQueue();
  renderTriageSocialQueue();
  renderTriageSent();
  renderStats();
}

async function checkGmailAuthStatus() {
  try {
    const res = await fetch('/api/auth/gmail/status');
    const { authenticated } = await res.json();
    const el = document.getElementById('triage-auth-status');
    if (!el) return;
    if (authenticated) {
      el.innerHTML = '<span class="auth-ok">Gmail connected</span>';
    } else {
      el.innerHTML = '<span class="auth-warn">Gmail not connected — <a href="/auth/gmail" target="_blank">Connect Gmail</a></span>';
    }
  } catch {
    // ignore
  }
}

function renderTriageEmailQueue() {
  const tbody = document.getElementById('email-queue-body');
  if (!tbody) return;
  if (!triageEmailLeads.length) {
    tbody.innerHTML = '<tr><td colspan="5">No leads with email addresses. Run the pipeline first.</td></tr>';
    return;
  }
  tbody.innerHTML = triageEmailLeads
    .map((lead) => {
      const key = leadKeyFromRow(lead);
      const checked = triageCheckedKeys.has(key) ? 'checked' : '';
      const confidence = lead['Website Confidence'] || '';
      const websiteHtml = lead['Website URL']
        ? `<a href="${escapeHtml(lead['Website URL'])}" target="_blank">Visit</a>${confidence === 'low' ? ' <span class="mismatch-warn" title="Website may not match business">⚠️</span>' : ''}`
        : '—';
      return `<tr>
        <td><input type="checkbox" class="triage-check" data-key="${escapeHtml(key)}" ${checked} /></td>
        <td>${escapeHtml(lead['Business Name'])}</td>
        <td>${websiteHtml}</td>
        <td>${escapeHtml(lead['Email'])}</td>
        <td><button class="trash-lead-btn triage-trash-btn" data-trash-key="${escapeHtml(key)}">Trash</button></td>
      </tr>`;
    })
    .join('');
  attachTriageCheckHandlers();
  attachTriageTrashHandlers();
}

function renderTriageSocialQueue() {
  const tbody = document.getElementById('social-queue-body');
  if (!tbody) return;
  if (!triagedSocialLeads.length) {
    tbody.innerHTML = '<tr><td colspan="4">No social-only leads found.</td></tr>';
    return;
  }
  tbody.innerHTML = triagedSocialLeads
    .map((lead) => {
      const key = leadKeyFromRow(lead);
      const ig = (lead['Instagram'] || '').trim();
      const fb = (lead['Facebook'] || '').trim();
      const platformHtml = ig
        ? `<a href="${escapeHtml(ig)}" target="_blank">Instagram</a>`
        : `<a href="${escapeHtml(fb)}" target="_blank">Facebook</a>`;
      const dmBody = `Hey ${escapeHtml(lead['Business Name'].split(',')[0])} — I checked out your site and made a quick mockup of how it could look cleaner/more modern. Want me to send it over? No pressure at all!`;
      return `<tr>
        <td>${escapeHtml(lead['Business Name'])}</td>
        <td>${lead['Website URL'] ? `<a href="${escapeHtml(lead['Website URL'])}" target="_blank">Visit</a>` : '—'}</td>
        <td>${platformHtml}</td>
        <td><button class="copy-dm-btn" data-dm="${escapeHtml(dmBody)}">Copy DM</button>
            <button class="trash-lead-btn triage-trash-btn" data-trash-key="${escapeHtml(key)}">Trash</button></td>
      </tr>`;
    })
    .join('');
  attachTriageTrashHandlers();
  document.querySelectorAll('.copy-dm-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.dm || '');
        document.getElementById('triage-send-status').textContent = 'DM copied to clipboard.';
      } catch {
        document.getElementById('triage-send-status').textContent = 'Failed to copy.';
      }
    });
  });
}

function renderTriageSent() {
  const tbody = document.getElementById('sent-body');
  const countEl = document.getElementById('sent-count');
  if (countEl) countEl.textContent = `(${triagedSentLeads.length})`;
  if (!tbody) return;
  if (!triagedSentLeads.length) {
    tbody.innerHTML = '<tr><td colspan="4">No emails sent yet.</td></tr>';
    return;
  }
  tbody.innerHTML = triagedSentLeads
    .map((record) => {
      const lead = allLeads.find((l) => leadKeyFromRow(l) === record.key);
      const name = lead ? lead['Business Name'] : record.key;
      const sentDate = record.sentAt ? new Date(record.sentAt).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(record.to)}</td>
        <td>${escapeHtml(record.subject)}</td>
        <td>${escapeHtml(sentDate)}</td>
      </tr>`;
    })
    .join('');
}

function attachTriageCheckHandlers() {
  document.querySelectorAll('.triage-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) triageCheckedKeys.add(key);
      else triageCheckedKeys.delete(key);
    });
  });
}

function attachTriageTrashHandlers() {
  document.querySelectorAll('.triage-trash-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = decodeURIComponent(btn.dataset.trashKey || '');
      const lead = allLeads.find((l) => leadKeyFromRow(l) === key);
      if (!lead) return;
      const confirmed = window.confirm(`Trash "${lead['Business Name']}"?`);
      if (!confirmed) return;
      try {
        await fetch('/api/leads/trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessName: lead['Business Name'], address: lead['Address'] }),
        });
        triageCheckedKeys.delete(key);
        await loadTriageData();
      } catch (err) {
        document.getElementById('triage-send-status').textContent = err.message;
      }
    });
  });
}
```

- [ ] **Step 4: Add Select All / Send All event handlers in `app.js`**

After the existing `document.querySelectorAll('.tab-btn').forEach(...)` block, add:

```js
const masterCheck = document.getElementById('triage-master-check');
if (masterCheck) {
  masterCheck.addEventListener('change', () => {
    const isChecked = masterCheck.checked;
    document.querySelectorAll('.triage-check').forEach((cb) => {
      cb.checked = isChecked;
      const key = cb.dataset.key;
      if (isChecked) triageCheckedKeys.add(key);
      else triageCheckedKeys.delete(key);
    });
  });
}

document.getElementById('triage-select-all')?.addEventListener('click', () => {
  triageEmailLeads.forEach((l) => triageCheckedKeys.add(leadKeyFromRow(l)));
  renderTriageEmailQueue();
});

document.getElementById('triage-deselect-all')?.addEventListener('click', () => {
  triageCheckedKeys.clear();
  renderTriageEmailQueue();
});

document.getElementById('triage-send-all')?.addEventListener('click', async () => {
  const keys = Array.from(triageCheckedKeys);
  if (!keys.length) {
    document.getElementById('triage-send-status').textContent = 'No leads selected.';
    return;
  }
  const btn = document.getElementById('triage-send-all');
  btn.disabled = true;
  const statusEl = document.getElementById('triage-send-status');
  statusEl.textContent = `Sending ${keys.length} email(s)... (3s between each)`;
  try {
    const res = await fetch('/api/leads/send-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadKeys: keys }),
    });
    const { results } = await res.json();
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);
    triageCheckedKeys.clear();
    await loadTriageData();
    statusEl.textContent = `Done. ${succeeded} sent.${failed.length ? ` ${failed.length} failed: ${failed.map((f) => f.error).join(', ')}` : ''}`;
  } catch (err) {
    statusEl.textContent = `Send failed: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
```

- [ ] **Step 5: Update the initial load call at the bottom of `app.js`**

Replace the final `Promise.all([loadLeads(), loadEmailDrafts()]).then(...)` block and `updateHeaderForTab('logs')` with:

```js
Promise.all([loadTriageData(), loadEmailDrafts()]).then(() => {
  applyFiltersAndSort();
  renderEmailWorkspace();
});
updateHeaderForTab('triage');
loadRunStatus();
checkGmailAuthStatus();
```

- [ ] **Step 6: Add triage styles to `style.css`**

Append to `dashboard/public/style.css`:

```css
/* Triage Tab */
.triage-head { display: flex; align-items: center; justify-content: space-between; }
.triage-auth-status { font-size: 0.8rem; }
.auth-ok { color: #4caf50; font-weight: 600; }
.auth-warn { color: #ff9800; font-weight: 600; }
.auth-warn a { color: inherit; }

.triage-panel { margin-bottom: 2.5rem; }
.triage-queue-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.triage-queue-header h4 { margin: 0; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
.queue-sub { font-size: 0.75rem; font-weight: 400; opacity: 0.6; margin-left: 0.5rem; }

.triage-controls { display: flex; gap: 0.5rem; }
.triage-controls button { padding: 0.3rem 0.7rem; font-size: 0.8rem; cursor: pointer; border: 1px solid currentColor; background: transparent; border-radius: 4px; }
.send-all-btn { background: #4caf50 !important; color: #fff !important; border-color: #4caf50 !important; font-weight: 600; }
.send-all-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.triage-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.triage-table th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 2px solid rgba(255,255,255,0.1); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; }
.triage-table td { padding: 0.5rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
.triage-table tr:hover td { background: rgba(255,255,255,0.03); }

.triage-status-msg { font-size: 0.82rem; margin: 0.5rem 0; min-height: 1.2em; opacity: 0.8; }
.mismatch-warn { cursor: help; font-size: 0.9em; }

.copy-dm-btn { font-size: 0.78rem; padding: 0.25rem 0.5rem; cursor: pointer; border: 1px solid currentColor; background: transparent; border-radius: 3px; margin-right: 0.3rem; }
.triage-trash-btn { font-size: 0.78rem; padding: 0.25rem 0.5rem; cursor: pointer; border: 1px solid #e57373; color: #e57373; background: transparent; border-radius: 3px; }

.triage-social-panel .triage-queue-header h4 { opacity: 0.75; }
.triage-sent-panel .triage-queue-header h4 { opacity: 0.6; }
```

- [ ] **Step 7: Run full test suite**

```bash
cd /home/shane/projects/WebsiteBot && npx jest --no-coverage 2>&1 | tail -15
```

Expected: PASS

- [ ] **Step 8: Start dashboard and manually verify triage tab**

```bash
cd /home/shane/projects/WebsiteBot && node dashboard/server.js
```

Open `http://localhost:3000` — confirm:
- Triage & Send is the active default tab
- Auth status shows "Gmail not connected" with a Connect link
- Email Queue and Social Queue render (may be empty if leads.csv has no emails yet)

- [ ] **Step 9: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add dashboard/public/index.html dashboard/public/app.js dashboard/public/style.css && git commit -m "feat: add Triage tab with Email Queue, Social Queue, batch send, and DM copy"
```

---

## Task 11: Config + Gitignore

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Update `.env.example`**

Replace contents of `.env.example`:

```
# Gemini API (for email draft generation)
GEMINI_API_KEY=your_gemini_api_key_here

# Outreach identity (shown in DM templates)
OUTREACH_NAME=Shane Tully
OUTREACH_ROLE=a software engineering student at Rider University
OUTREACH_PORTFOLIO=www.shanetully.dev

# Gmail OAuth2 (for auto-send)
# 1. Go to console.cloud.google.com
# 2. Create project → Enable Gmail API
# 3. Create OAuth 2.0 credentials (Web application)
# 4. Set redirect URI to: http://localhost:3000/auth/gmail/callback
# 5. Copy Client ID and Secret below
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
```

- [ ] **Step 2: Update `.gitignore`**

Replace contents of `.gitignore`:

```
node_modules/
.env
output/leads.csv
output/emails.md
output/sent-leads.json
.credentials/
```

- [ ] **Step 3: Commit**

```bash
cd /home/shane/projects/WebsiteBot && git add .env.example .gitignore && git commit -m "chore: add Gmail OAuth env vars to .env.example and update .gitignore"
```

---

## Verification (End-to-End)

1. **Contact scraper:** Run `node index.js --stage=contacts` — confirm `leads.csv` gains Email/Instagram/Facebook columns
2. **Mismatch detection:** Inspect `scored-leads.json` — leads with unlikely websites should have `websiteConfidence: 'low'`
3. **Gmail auth:** Visit `http://localhost:3000/auth/gmail` in browser → complete OAuth consent → confirm `.credentials/gmail-token.json` created
4. **Auth status indicator:** Reload dashboard → confirm "Gmail connected" shown in green in Triage header
5. **Triage UI:** Email Queue shows leads with emails; Social Queue shows Instagram/Facebook leads; neither shows sent leads
6. **Batch send:** Check 2-3 leads in Email Queue → click Send All Selected → confirm emails arrive in Gmail Sent folder with your signature appended
7. **Rate limit:** Server logs should show 3-second gaps between sends
8. **Sent tracking:** After send, those leads should disappear from Email Queue and appear in Sent section
9. **DM copy:** Click Copy DM on a social lead → paste into notes app to verify the message text is correct
10. **Trash:** Trash a lead from Triage → confirm it disappears from all queues and stays gone after server restart

```bash
cd /home/shane/projects/WebsiteBot && npx jest --no-coverage
```

All tests should pass.

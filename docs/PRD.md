# Lead Generation & Email Drafting Agent - PRD

## Overview
A locally-runnable Node.js agent that scrapes Google Maps for businesses in Princeton/Ewing/Trenton, identifies those with outdated/poor websites, and generates personalized cold email pitches. Run weekly. Output: CSV of leads + markdown file with drafted emails.

## Goals
1. Source local businesses with poor/outdated web presence
2. Draft soft-pitch cold emails for manual review
3. Enable fast freelance outreach for web dev sales

## Scope (MVP)
- **In scope**: Lead scraping, website quality assessment, email generation, local file output
- **Out of scope**: Website mockup generation, email sending automation, CRM integration, cloud hosting

---

## Requirements

### Functional Requirements

#### 1. Lead Sourcing
- **Input**: List of search terms for Google Maps (e.g., "dentist near Princeton NJ", "coffee shop near Ewing NJ", etc.)
- **Process**:
  - Use Puppeteer to scrape Google Maps results for each search term
  - Extract: Business name, address, phone, website URL (if available), Google Maps URL
  - Filter out: Chains, large corporates (optional but preferred), businesses without contact info
  - Deduplicate across searches
- **Output**: Raw leads list (name, address, phone, website URL, maps link)

#### 2. Website Quality Assessment
- **For each lead with a website**:
  - Fetch the website (Puppeteer or fetch API)
  - Analyze for red flags:
    - Last updated date (if visible in HTML meta tags, copyright, etc.)
    - Design quality (basic heuristic: mobile-responsive, modern layout, load time)
    - Content freshness (presence of outdated dates, "coming soon", etc.)
  - **Score**: "poor" (old design, slow, broken), "mediocre" (functional but dated), "good" (skip)
- **For leads without a website**: Mark as "no website" (high priority)
- **Use Claude/Gemini to assist** in analyzing design/content quality from fetched HTML

#### 3. Email Generation
- **For each qualified lead** (no website OR poor website):
  - Generate personalized cold email using Gemini API
  - **Tone**: Soft pitch (not pushy)
  - **Content**:
    - Friendly opening acknowledging the business
    - Light observation about their web presence (e.g., "noticed your business doesn't have a website online" or "your current site could use a refresh")
    - Brief value prop: "I build modern websites for local businesses"
    - Soft CTA: "Would love to chat about what's possible" or "Happy to share some ideas"
    - Keep under 150 words
  - **Personalization**: Use business name, location, type (inferred from listing)
  - **Template variables**: [Business Name], [Location], [Observation], [CTA]

#### 4. Output & Storage
- **leads.csv**:
  - Columns: Business Name | Address | Phone | Current Website URL | Website Quality | Google Maps Link
  - Include all leads found (not just contacted ones)
- **emails.md**:
  - Format: Markdown with sections per lead
  - Include: Business name, proposed subject line, full email body
  - Organized for easy copy-paste or manual editing
  - Example:
    ```
    ## [Business Name] - [Address]
    **Subject:** Website idea for [Business Name]
    **Email:**
    Hi [Name],
    ...
    ```

---

## Technical Specifications

### Tech Stack
- **Runtime**: Node.js (v18+)
- **Scraping**: Puppeteer (headless Chrome)
- **API**: Gemini API (for email generation + website analysis)
- **Input**: Command-line args or config file
- **Output**: CSV + Markdown files (local)

### Architecture
```
lead-agent/
├── index.js (main orchestrator)
├── scrapers/
│   └── google-maps.js (Puppeteer scraper)
├── analyzers/
│   └── website-quality.js (fetch + Gemini analysis)
├── generators/
│   └── email-generator.js (Gemini email drafting)
├── config.js (search terms, filters)
├── .env (Gemini API key)
└── output/
    ├── leads.csv
    └── emails.md
```

### API Calls
- **Gemini API**:
  - Website analysis prompt: "Analyze this HTML and determine if the website is outdated, poorly designed, or modern. Return: 'poor', 'mediocre', or 'good'"
  - Email generation prompt: "Draft a soft-pitch cold email for [Business Name] at [Address] who [situation]. Keep it under 150 words, friendly, no hard sell."

### Config & Search Terms
Default search terms to scrape (customizable):
```javascript
const searchTerms = [
  "dentist near Princeton NJ",
  "real estate agent near Ewing NJ",
  "coffee shop near Trenton NJ",
  "personal trainer near Princeton NJ",
  "salon near Ewing NJ",
  "plumber near Trenton NJ",
  "restaurant near Princeton NJ",
  "accountant near Ewing NJ",
  "gym near Trenton NJ",
  "contractor near Princeton NJ"
];
```

---

## User Workflow

### Setup (One-time)
1. Clone/download agent code
2. Install dependencies: `npm install`
3. Set `GEMINI_API_KEY` in `.env`
4. (Optional) Customize search terms in `config.js`

### Weekly Run
```bash
node index.js
```

### Output
- `output/leads.csv` — All leads found (100–300+)
- `output/emails.md` — Drafted emails for poor/no-website businesses (50–150)

### Manual Next Steps
1. Review `emails.md`
2. Pick targets
3. Build mockup websites (Claude Code)
4. Send emails

---

## Non-Functional Requirements
- **Performance**: Full run (scraping + analysis + generation) completes in <5 min
- **Reliability**: Graceful error handling for failed scrapes, timeouts, API errors
- **Cost**: Keep Gemini API calls minimal (~$0.50–$2 per run)
- **Local-first**: No cloud dependencies, all output local

---

## Success Criteria
- ✅ Scrapes 50+ leads across 3 cities per run
- ✅ Identifies 30+ with poor/no websites
- ✅ Generates personalized emails in <1 sec per lead
- ✅ Outputs clean CSV + readable markdown
- ✅ Runs locally without errors
- ✅ Can re-run weekly without manual setup

---

## Future Enhancements (Out of Scope)
- Email sending automation
- CRM tracking
- Website mockup auto-generation
- Scheduled runs (cron)
- LinkedIn scraping for owner names
- A/B testing email variants

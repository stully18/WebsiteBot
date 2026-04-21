# WebsiteBot

A locally-runnable Node.js pipeline that scrapes Google Maps for small businesses in Princeton/Ewing/Trenton, scores their web presence, extracts contact info, drafts personalized cold emails, and sends them via Gmail — all from a local dashboard.

Built for Shane Tully's freelance web design outreach workflow.

---

## What It Does

1. **Scrapes Google Maps** for local businesses matching configured search terms
2. **Scores website quality** using Gemini AI (poor / mediocre / good / no website)
3. **Discovers missing websites** by searching the web for businesses with no Maps listing
4. **Extracts contact info** from each business's own website — email addresses, Instagram, and Facebook links
5. **Generates cold email drafts** via Gemini, personalized per lead
6. **Presents a triage dashboard** at `localhost:3000` where you can review, select, and send emails in batch via Gmail

---

## Project Structure

```
WebsiteBot/
├── index.js                    # Pipeline orchestrator — runs all stages
├── config.js                   # Search terms, filters, scoring weights
├── .env                        # API keys and credentials (never committed)
│
├── scrapers/
│   ├── google-maps.js          # Puppeteer: scrape Maps, score website confidence
│   └── contact-scraper.js      # Visit business websites, extract email + social handles
│
├── analyzers/
│   └── website-quality.js      # Fetch HTML, call Gemini to score design quality
│
├── generators/
│   └── email-generator.js      # Call Gemini to draft a cold email per lead
│
├── utils/
│   ├── gmail-auth.js           # OAuth2 token management for Gmail API
│   ├── gmail-sender.js         # Build MIME messages and send via Gmail API
│   ├── output-writer.js        # Write leads.csv and emails.md
│   └── lead-filters.js         # Filter and deduplicate leads
│
├── dashboard/
│   ├── server.js               # Express API server (port 3000)
│   └── public/
│       ├── index.html          # Dashboard UI
│       ├── app.js              # Frontend: triage logic, batch send, DM copy
│       └── style.css           # Dashboard styles
│
├── output/                     # Generated files (gitignored)
│   ├── leads.csv               # All scraped leads
│   ├── emails.md               # Generated email drafts
│   └── sent-leads.json         # Outreach history
│
└── tests/                      # Jest test suite
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Gemini API key from [Google AI Studio](https://aistudio.google.com) |
| `OUTREACH_NAME` | Your name (used in DM templates) |
| `OUTREACH_ROLE` | Your role (e.g. "a software engineering student at Rider University") |
| `OUTREACH_PORTFOLIO` | Your portfolio URL |
| `GMAIL_CLIENT_ID` | OAuth2 Client ID from Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | OAuth2 Client Secret |
| `GMAIL_REDIRECT_URI` | `http://localhost:3000/auth/gmail/callback` |

### 3. Set up Gmail OAuth (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable the Gmail API
3. Create OAuth 2.0 credentials (Web application type)
4. Add redirect URI: `http://localhost:3000/auth/gmail/callback`
5. Copy Client ID and Secret into `.env`

Then start the dashboard and visit `http://localhost:3000/auth/gmail` to complete the OAuth flow. Your token is saved to `.credentials/gmail-token.json`.

---

## Usage

### Run the full pipeline

```bash
node index.js
```

Stages run in order:
- Scrape Google Maps leads
- Discover missing websites
- Score website quality
- Extract contact info (email + social)
- Generate cold email drafts
- Write `output/leads.csv` and `output/emails.md`

### Run a specific stage only

```bash
node index.js --stage=contacts    # Re-run contact extraction only
```

### Start the dashboard

```bash
npm run dashboard
# → http://localhost:3000
```

---

## Dashboard

The dashboard has four tabs:

| Tab | Description |
|---|---|
| **Triage & Send** | Review leads, select emails to send, copy DM templates for social-only leads |
| **Live Logs** | Stream pipeline output in real time |
| **Leads Database** | Browse and filter all scraped leads |
| **Email Drafts** | View all generated email drafts |

### Sending emails

1. Open the **Triage & Send** tab
2. Authenticate Gmail (top-right status indicator)
3. Select leads in the Email Queue
4. Click **Send All Selected** — emails are sent via your Gmail account with your existing signature, 3 seconds apart

### DM fallback

Leads with no email but an Instagram or Facebook handle appear in the **Social Queue**. Click **Copy DM** to copy a pre-filled outreach message to your clipboard.

---

## Tests

```bash
npm test
```

87 tests across pipeline modules, contact scraper, Gmail sender, and dashboard API endpoints.

---

## Tech Stack

- **Runtime:** Node.js v18+
- **Scraping:** Puppeteer (headless Chrome)
- **AI:** Gemini API (website scoring + email generation)
- **Email:** Gmail API via `googleapis`
- **Dashboard:** Express + vanilla JS
- **Tests:** Jest + supertest

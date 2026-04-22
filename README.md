# WebsiteBot

A locally-runnable Node.js pipeline that scrapes Google Maps for small businesses, extracts contact info, and drafts personalized cold outreach — all configured and managed from a local dashboard. No AI API keys required.

---

## What It Does

1. **Scrapes Google Maps** for local businesses matching your configured search terms
2. **Discovers missing websites** by searching the web for businesses with no Maps listing
3. **Extracts contact info** from each business's website — email addresses, Instagram, and Facebook links
4. **Generates cold outreach drafts** using your own customizable templates
5. **Presents a triage dashboard** at `localhost:3000` where you can review, select, and send emails in batch via Gmail

---

## Project Structure

```
WebsiteBot/
├── index.js                    # Pipeline orchestrator — runs all stages
├── config.js                   # loadConfig(), filters, constants
├── user-config.json            # Your settings (auto-created, gitignored)
├── .env                        # Gmail credentials (never committed)
│
├── scrapers/
│   ├── google-maps.js          # Puppeteer: scrape Maps, score website confidence
│   └── contact-scraper.js      # Visit business websites, extract email + social
│
├── generators/
│   └── email-generator.js      # Template-based outreach draft generator
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
│       ├── app.js              # Frontend logic
│       └── style.css           # Precision Blueprint design
│
├── output/                     # Generated files (gitignored)
│   ├── leads.csv
│   ├── emails.md
│   └── sent-leads.json
│
└── tests/                      # Jest test suite
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dashboard

```bash
npm run dashboard
# → http://localhost:3000
```

`user-config.json` is created automatically on first run with sensible defaults.

### 3. Configure in the dashboard

Open `http://localhost:3000` and go to the **Settings** tab:

- **Search Configuration** — Enter your target location (city, state, or zip code), set a radius, and select business categories
- **Outreach Templates** — Customize your email and DM copy using template variables
- **Outreach Profile** — Set your name, role, and portfolio URL (used in templates)

### 4. (Optional) Set up Gmail OAuth for auto-send

If you want to send emails directly from the dashboard:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable the Gmail API
3. Create OAuth 2.0 credentials (Web application type)
4. Add redirect URI: `http://localhost:3000/auth/gmail/callback`
5. Copy the Client ID and Secret into `.env`:

```env
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
```

Then visit `http://localhost:3000/auth/gmail` to complete the OAuth flow.

---

## Usage

### Run the pipeline from the dashboard

In the **Settings** tab, click **Save & Run Pipeline** to start scraping with your current configuration.

### Run from the command line

```bash
node index.js                      # Full pipeline
node index.js --stage=contacts     # Re-run contact extraction only
node index.js --stage=scrape       # Scrape + discover websites only
```

### Start the dashboard only

```bash
npm run dashboard
```

---

## Dashboard Tabs

| Tab | Description |
|---|---|
| **Triage & Send** | Review leads, select emails to send, copy DM templates |
| **Live Logs** | Stream pipeline output in real time |
| **Leads Database** | Browse and filter all scraped leads |
| **Email Drafts** | View all generated drafts |
| **Settings** | Configure location, categories, templates, and profile |

---

## Template Variables

In the Settings → Outreach Templates editor, use these placeholders:

| Variable | Replaced with |
|---|---|
| `{{businessName}}` | Full business name |
| `{{shortName}}` | First word of the business name |
| `{{name}}` | Your name (from Outreach Profile) |
| `{{role}}` | Your role (from Outreach Profile) |
| `{{portfolio}}` | Your portfolio URL (from Outreach Profile) |

---

## Tests

```bash
npm test
```

---

## Tech Stack

- **Runtime:** Node.js v18+
- **Scraping:** Puppeteer (headless Chrome)
- **Email delivery:** Gmail API via `googleapis`
- **Dashboard:** Express + vanilla JS
- **Tests:** Jest + supertest
- **No AI dependencies**

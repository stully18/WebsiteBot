# WebsiteBot — Lead Generation & Email Drafting Agent

A locally-runnable Node.js agent that scrapes Google Maps for businesses in Princeton/Ewing/Trenton, scores website quality, and drafts cold email pitches. Outputs `leads.csv` and `emails.md` to `output/`. Run weekly with `node index.js`.

Full requirements: [docs/PRD.md](docs/PRD.md)

## Architecture

```
lead-agent/
├── index.js                  # Orchestrator: runs all pipeline stages
├── config.js                 # Search terms, filters, constants
├── .env                      # Gmail OAuth credentials (never commit)
├── scrapers/
│   └── google-maps.js        # Puppeteer: scrape Maps, extract business data
├── analyzers/
│   └── website-quality.js    # Fetch site HTML, call Gemini to score quality
├── generators/
│   └── email-generator.js    # Call Gemini to draft cold email per lead
├── dashboard/
│   ├── server.js             # Express server (local only, port 3000)
│   └── public/
│       ├── index.html        # Dashboard UI — leads table + email drafts
│       ├── style.css
│       └── app.js            # Frontend: filter/search leads, view emails
├── output/
│   ├── leads.csv             # All scraped leads (gitignored)
│   └── emails.md             # Drafted emails for poor/no-website leads
└── docs/
    └── PRD.md
```

**Pipeline:** config → scraper → analyzer → generator → output files
**Dashboard:** reads `output/` files, serves them at `localhost:3000`

## Commands

```bash
npm install                   # Install dependencies
node index.js                 # Run the full pipeline
node dashboard/server.js      # Start dashboard at http://localhost:3000
```

## Environment

Create `.env` in the project root (copy from `.env.example`):
```
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
```

User preferences (location, categories, templates, profile) live in `user-config.json` — auto-created by the dashboard on first run.

## Conventions

- **Async/await throughout** — no callback-style code
- **Graceful error handling** — each module catches its own errors, logs them, and continues (never crash the full run on one bad lead)
- **Gemini call discipline** — minimize API calls; target <$2 per full run
- **No state between modules** — each module takes data in, returns data out; `index.js` owns pipeline state
- **Output is overwrite-safe** — re-running replaces `output/` files entirely
- **Puppeteer headless** — always run headless; no visible browser windows

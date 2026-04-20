---
name: WebsiteBot CLAUDE.md Design
description: Approved design for the CLAUDE.md file for the WebsiteBot lead gen agent
type: project
---

# WebsiteBot CLAUDE.md Design

## Decisions

- **Structure:** Concise Architecture Map (Approach A) — ~100 lines
- **PRD location:** docs/PRD.md (referenced from CLAUDE.md, not duplicated)
- **AI API:** Gemini only
- **Dashboard:** Express + HTML at localhost:3000, reads output/ files (added beyond original PRD scope)

## Sections

1. Header + one-paragraph project overview + link to PRD
2. Directory structure with inline annotations + pipeline summary
3. Commands (npm install, node index.js, node dashboard/server.js)
4. Environment (.env with GEMINI_API_KEY)
5. Conventions (async/await, graceful errors, Gemini cost discipline, stateless modules, headless Puppeteer)

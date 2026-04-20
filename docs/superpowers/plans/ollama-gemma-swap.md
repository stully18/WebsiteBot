# Ollama + Gemma 3 4B Swap Plan

## Goal
Replace Gemini API with two AI backends:
- **Website scoring** → Ollama running Gemma 3 4B locally (free, no API key)
- **Email generation** → Gemini 2.0 Flash Lite (cheap, higher quality writing)

## Prerequisites (manual setup before coding)

1. Install Ollama: https://ollama.com/download
2. Pull the model:
   ```bash
   ollama pull gemma3:4b
   ```
3. Verify Ollama is running:
   ```bash
   ollama list
   # Should show gemma3:4b
   ```
4. Confirm `.env` has your Gemini key (already done):
   ```
   GEMINI_API_KEY=AIzaSyAUiaEfuZyZLUCrh_BnHkQq91GEucb7pU0
   ```

---

## Task 1: Update analyzers/website-quality.js

Replace the `@google/generative-ai` Gemini call with a fetch call to Ollama's local REST API.

**File to modify:** `analyzers/website-quality.js`

Replace the entire file with:

```javascript
require('dotenv').config();

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'gemma3:4b';

function buildAnalysisPrompt(html) {
  const truncated = html.slice(0, 8000);
  return `You are evaluating whether a small business website is modern or outdated.

Classify the website quality using this HTML:
- "poor": broken layout, pre-2015 aesthetics, missing pages, or load failure
- "mediocre": functional but dated, no mobile responsiveness, stale content
- "good": modern, clean, mobile-friendly

Return ONLY one word: poor, mediocre, or good. No punctuation, no explanation.

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
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    const score = data.response.trim().toLowerCase();
    if (['poor', 'mediocre', 'good'].includes(score)) return score;
    // Gemma sometimes adds punctuation or extra words — extract first word
    const firstWord = score.split(/\s/)[0].replace(/[^a-z]/g, '');
    if (['poor', 'mediocre', 'good'].includes(firstWord)) return firstWord;
    return 'poor';
  } catch (err) {
    console.warn(`  Ollama analysis failed for ${url}: ${err.message}`);
    return 'mediocre';
  }
}

module.exports = { scoreWebsite, buildAnalysisPrompt };
```

**Update tests** — `tests/analyzers/website-quality.test.js`:

Remove the `jest.mock('@google/generative-ai', ...)` block entirely.
Replace with mocking `global.fetch` for both the website fetch AND the Ollama call.

New test file:

```javascript
const { scoreWebsite, buildAnalysisPrompt } = require('../../analyzers/website-quality');

describe('buildAnalysisPrompt', () => {
  it('includes the HTML in the prompt', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const prompt = buildAnalysisPrompt(html);
    expect(prompt).toContain('<html>');
    expect(prompt).toContain('Return ONLY one word');
  });

  it('truncates HTML longer than 8000 chars', () => {
    const html = 'x'.repeat(10000);
    const prompt = buildAnalysisPrompt(html);
    expect(prompt.length).toBeLessThan(9000);
  });
});

describe('scoreWebsite', () => {
  function mockFetch(siteFetch, ollamaResponse) {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return siteFetch;        // first call: fetch website
      return ollamaResponse;                        // second call: Ollama API
    });
  }

  afterEach(() => { global.fetch = undefined; });

  it('returns "no website" when url is empty', async () => {
    expect(await scoreWebsite('')).toBe('no website');
  });

  it('returns "poor" when Ollama responds with "poor"', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html>old</html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: 'poor' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('handles Ollama response with extra whitespace', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: '  mediocre  \n' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });

  it('extracts first word when Ollama adds punctuation', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: 'poor.' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "poor" on site fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await scoreWebsite('http://broken.example.com')).toBe('poor');
  });

  it('returns "poor" on non-200 site response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" (fail open) when Ollama throws', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.reject(new Error('connection refused'))
    );
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });
});
```

Run tests:
```bash
npx jest tests/analyzers/website-quality.test.js --no-coverage
```
Expected: All tests pass.

Commit:
```bash
git add analyzers/website-quality.js tests/analyzers/website-quality.test.js
git commit -m "feat: swap website analyzer from Gemini to Ollama gemma3:4b"
```

---

## Task 2: Update generators/email-generator.js

Switch from `gemini-1.5-flash` to `gemini-2.0-flash-lite`.

**File to modify:** `generators/email-generator.js`

Change only the model name on line ~6:

```javascript
// Before
return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// After
return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
```

No test changes needed — the tests mock the Gemini client entirely, model name doesn't affect them.

Run tests to confirm nothing broke:
```bash
npx jest tests/generators/email-generator.test.js --no-coverage
```

Commit:
```bash
git add generators/email-generator.js
git commit -m "feat: switch email generator to gemini-2.0-flash-lite"
```

---

## Task 3: Remove @google/generative-ai from analyzer (optional cleanup)

Since `website-quality.js` no longer imports `@google/generative-ai`, the dependency is
still needed by `email-generator.js` so leave it in `package.json`.

Nothing to do here unless you want to audit imports.

---

## Task 4: Smoke test end-to-end

1. Start Ollama (if not already running):
   ```bash
   ollama serve
   ```

2. Temporarily set config.js to one search term:
   ```javascript
   searchTerms: ['coffee shop near Princeton NJ'],
   ```

3. Run the pipeline:
   ```bash
   node index.js
   ```

4. Expected: website scoring calls Ollama locally, email drafting calls Gemini Flash Lite.
   Check console for "Scoring X... poor/mediocre/good" lines.

5. Restore full search terms in config.js.

6. Push:
   ```bash
   git push
   ```

---

## Notes for Cursor

- Ollama must be running (`ollama serve`) before `node index.js`
- If Ollama is slow on first call, it's loading the model into VRAM — subsequent calls are fast
- Gemma 3 4B may occasionally return "poor." or "Poor" instead of "poor" — the first-word
  extraction in the new analyzer handles this
- `gemini-2.0-flash-lite` model ID is correct as of April 2026 — verify at
  https://ai.google.dev/gemini-api/docs/models if it errors

require('dotenv').config();

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b';
const WEBSITE_FETCH_TIMEOUT_MS = Number(process.env.WEBSITE_FETCH_TIMEOUT_MS || 8000);
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
const MAX_HTML_CHARS = Number(process.env.WEBSITE_ANALYSIS_HTML_CHARS || 4000);

function buildAnalysisPrompt(html) {
  const truncated = html.slice(0, MAX_HTML_CHARS);
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
    const response = await fetch(url, { signal: AbortSignal.timeout(WEBSITE_FETCH_TIMEOUT_MS) });
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
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    const score = data.response.trim().toLowerCase();
    if (['poor', 'mediocre', 'good'].includes(score)) return score;
    const firstWord = score.split(/\s/)[0].replace(/[^a-z]/g, '');
    if (['poor', 'mediocre', 'good'].includes(firstWord)) return firstWord;
    return 'poor';
  } catch (err) {
    const isTimeout =
      err?.name === 'TimeoutError' ||
      err?.name === 'AbortError' ||
      String(err?.message || '').toLowerCase().includes('timeout');
    if (isTimeout) {
      console.warn(
        `  Ollama analysis timed out for ${url} after ${OLLAMA_TIMEOUT_MS}ms (model ${OLLAMA_MODEL})`
      );
      return 'mediocre';
    }
    console.warn(`  Ollama analysis failed for ${url}: ${err.message}`);
    return 'mediocre'; // fail open — don't discard leads on API error
  }
}

module.exports = { scoreWebsite, buildAnalysisPrompt };

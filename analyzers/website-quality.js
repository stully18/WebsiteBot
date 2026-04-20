require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

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
    const result = await getModel().generateContent(prompt);
    const score = result.response.text().trim().toLowerCase();
    if (['poor', 'mediocre', 'good'].includes(score)) return score;
    return 'poor';
  } catch (err) {
    console.warn(`  Gemini analysis failed for ${url}: ${err.message}`);
    return 'mediocre'; // fail open — don't discard leads on API error
  }
}

module.exports = { scoreWebsite, buildAnalysisPrompt };

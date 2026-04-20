require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

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
    const result = await getModel().generateContent(prompt);
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

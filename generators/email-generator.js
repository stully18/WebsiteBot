require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const OUTREACH_PROFILE = {
  name: process.env.OUTREACH_NAME || 'Shane Tully',
  role: process.env.OUTREACH_ROLE || 'a software engineering student at Rider University',
  portfolio: process.env.OUTREACH_PORTFOLIO || 'www.shanetully.dev',
};

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
    draftKind: 'email',
    subject: subjectMatch ? subjectMatch[1].trim() : `Website idea for ${businessName}`,
    body: bodyMatch ? bodyMatch[1].trim() : raw.trim(),
  };
}

function buildDmPrompt(businessName, address, websiteQuality) {
  const situation =
    websiteQuality === 'no website'
      ? `${businessName} has no website at all`
      : `${businessName} has a ${websiteQuality} website that could use a refresh`;

  return `Write a SHORT casual Instagram DM to a local small business owner. They only list phone/social on their site — no email — so this goes in DMs.

Details:
- Business: ${businessName}
- Area: ${address}
- Context: ${situation}

Requirements:
- Tone: friendly, human, like texting a neighbor — NOT corporate or salesy
- Length: max ~80 words, often shorter is better; use line breaks where natural for mobile
- Mention you looked at their site and have ideas
- Say you can send a quick mockup PHOTO (they will attach the image themselves after pasting this message)
- Soft CTA only — happy to chat, no hard pitch
- No hashtags, no "Dear Sir/Madam", no "I hope this finds you well"

Format your response EXACTLY like this (no extra text before or after):
DM:
[your message — plain text, ready to paste into Instagram DM]`;
}

function parseDmResponse(raw, businessName, address) {
  const dmMatch = raw.match(/^DM:\s*([\s\S]+)$/m);
  const bodyMatch = raw.match(/^Body:\s*([\s\S]+)$/m);
  const subjectStyle = raw.match(/^Subject:\s*(.+)$/m);
  let message = dmMatch
    ? dmMatch[1].trim()
    : bodyMatch
      ? bodyMatch[1].trim()
      : raw.replace(/^DM:\s*/i, '').trim();

  // If the model drifts into email format, remove obvious email sections.
  if (subjectStyle) {
    message = message
      .replace(/^Subject:\s*.+$/gim, '')
      .replace(/^Body:\s*/gim, '')
      .trim();
  }

  // Keep DM concise and mobile-friendly.
  const words = message.split(/\s+/).filter(Boolean);
  if (words.length > 80) {
    message = `${words.slice(0, 80).join(' ')}...`;
  }

  return {
    businessName,
    address,
    draftKind: 'dm',
    subject: 'Instagram DM',
    body: message || raw.trim(),
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
      draftKind: 'email',
      subject: `Website idea for ${businessName}`,
      body: `Hi there,\n\nI came across ${businessName} in ${city} and wanted to reach out. I build modern websites for local businesses and think there's a real opportunity here.\n\nHappy to share some ideas — no pressure!\n\nBest,\nShane`,
    };
  }
}

async function generateDm(businessName, address, websiteQuality) {
  const shortName = (businessName || 'there').split(',')[0].trim();
  return {
    businessName,
    address,
    draftKind: 'dm',
    subject: 'Instagram DM',
    body: `Hey ${shortName} — I’m ${OUTREACH_PROFILE.name}, ${OUTREACH_PROFILE.role}.\nI checked out your site and made a quick mockup idea for how it could look cleaner/more modern.\nIf you want, I can send over the mockup image.\nPortfolio: ${OUTREACH_PROFILE.portfolio}\nNo pressure at all — just thought it could help.`,
  };
}

/**
 * @param {'email'|'dm'} kind
 */
async function generateOutreachDraft(businessName, address, websiteQuality, kind = 'email') {
  if (kind === 'dm') {
    return generateDm(businessName, address, websiteQuality);
  }
  return generateEmail(businessName, address, websiteQuality);
}

module.exports = {
  generateEmail,
  generateDm,
  generateOutreachDraft,
  buildEmailPrompt,
  buildDmPrompt,
};

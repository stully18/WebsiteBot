require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const OUTREACH_PROFILE = {
  name: process.env.OUTREACH_NAME || 'Shane Tully',
  role: process.env.OUTREACH_ROLE || 'a software engineering student at Rider University',
  portfolio: process.env.OUTREACH_PORTFOLIO || 'www.shanetully.dev',
};

async function generateEmail(businessName, address, websiteQuality) {
  const parts = (address || '').split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 2] : parts[0] || '';
  const location = city ? ` in ${city}` : '';
  const noSite = websiteQuality === 'no website';
  const situationLine = noSite
    ? `I noticed ${businessName} doesn't have a website yet`
    : `I came across ${businessName}${location} and noticed your website could use a refresh`;

  const body =
`Hi ${businessName} team,

${situationLine}. I'm ${OUTREACH_PROFILE.name}, ${OUTREACH_PROFILE.role}, and I'm building out my portfolio.

I'd love to build you a brand-new, modern website completely for free. The only cost is hosting — around $10–20/month — which you likely already pay. No upfront cost, no obligation, and you keep full ownership.

Happy to send over some ideas or hop on a quick call if you're interested.

Best,
${OUTREACH_PROFILE.name}
${OUTREACH_PROFILE.portfolio}`;

  return {
    businessName,
    address,
    draftKind: 'email',
    subject: `Free website for ${businessName}`,
    body,
  };
}

async function generateDm(businessName, address, websiteQuality) {
  const shortName = (businessName || 'there').split(',')[0].trim();
  const body =
`Hey ${shortName} — I'm ${OUTREACH_PROFILE.name}, ${OUTREACH_PROFILE.role}.

I'm building my portfolio and would love to build you a modern website completely for free. The only cost is hosting (~$10–20/month), which you likely already pay.

I put together a quick mockup — want me to send it over?

Portfolio: ${OUTREACH_PROFILE.portfolio}
No pressure at all.`;

  return {
    businessName,
    address,
    draftKind: 'dm',
    subject: 'Instagram DM',
    body,
  };
}

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
};

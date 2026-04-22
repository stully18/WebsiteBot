const { loadConfig } = require('../config');

function applyVars(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function buildVars(businessName, config) {
  return {
    businessName: businessName || '',
    shortName: (businessName || 'there').split(/[,\s]/)[0].trim(),
    name: config.outreach?.name || '',
    role: config.outreach?.role || '',
    portfolio: config.outreach?.portfolio || '',
  };
}

async function generateEmail(businessName, address) {
  const config = loadConfig();
  const vars = buildVars(businessName, config);
  const subject = applyVars(config.templates?.email?.subject || 'Free website for {{businessName}}', vars);
  const body = applyVars(config.templates?.email?.body || '', vars);
  return { businessName, address, draftKind: 'email', subject, body };
}

async function generateDm(businessName, address) {
  const config = loadConfig();
  const vars = buildVars(businessName, config);
  const body = applyVars(config.templates?.dm?.body || '', vars);
  return { businessName, address, draftKind: 'dm', subject: 'Instagram DM', body };
}

async function generateOutreachDraft(businessName, address, websiteQuality, kind = 'email') {
  if (kind === 'dm') return generateDm(businessName, address);
  return generateEmail(businessName, address);
}

module.exports = { generateEmail, generateDm, generateOutreachDraft };

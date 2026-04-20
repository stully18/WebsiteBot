function normalize(value) {
  return String(value || '').toLowerCase();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function filterLeadsForFocus(leads, rules) {
  const safeRules = {
    requireWebsite: Boolean(rules?.requireWebsite),
    excludeNameKeywords: Array.isArray(rules?.excludeNameKeywords) ? rules.excludeNameKeywords : [],
    excludeWebsiteKeywords: Array.isArray(rules?.excludeWebsiteKeywords) ? rules.excludeWebsiteKeywords : [],
  };
  const kept = [];
  const excluded = [];
  const excludedReasonCounts = {};

  for (const lead of leads) {
    const name = normalize(lead.name);
    const website = normalize(lead.website);
    const reasons = [];

    if (safeRules.requireWebsite && !website.trim()) {
      reasons.push('missing_website');
    }

    if (name && containsAny(name, safeRules.excludeNameKeywords)) {
      reasons.push('excluded_name_pattern');
    }

    if (website && containsAny(website, safeRules.excludeWebsiteKeywords)) {
      reasons.push('excluded_website_pattern');
    }

    if (reasons.length > 0) {
      excluded.push({ lead, reasons });
      for (const reason of reasons) {
        excludedReasonCounts[reason] = (excludedReasonCounts[reason] || 0) + 1;
      }
      continue;
    }

    kept.push(lead);
  }

  return { kept, excluded, excludedReasonCounts };
}

module.exports = {
  filterLeadsForFocus,
};

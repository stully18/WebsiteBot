const fs = require('fs');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCsv(filePath, leads) {
  const header = 'Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link,Email,Instagram,Facebook';
  const rows = leads.map((lead) =>
    [
      csvEscape(lead.name),
      csvEscape(lead.address),
      csvEscape(lead.phone),
      csvEscape(lead.website),
      csvEscape(lead.websiteQuality),
      csvEscape(lead.mapsUrl),
      csvEscape(lead.email || ''),
      csvEscape(lead.instagram || ''),
      csvEscape(lead.facebook || ''),
    ].join(',')
  );
  fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf8');
}

function writeEmails(filePath, drafts) {
  if (drafts.length === 0) {
    fs.writeFileSync(filePath, '# Email Drafts\n\nNo qualifying leads found this run.\n', 'utf8');
    return;
  }
  const sections = drafts.map((draft) => {
    const kindLabel = draft.draftKind === 'dm' ? 'DM (Instagram)' : 'Email';
    return `## ${draft.businessName} — ${draft.address}\n\n**Type:** ${kindLabel}\n\n**Subject / label:** ${draft.subject}\n\n**Message:**\n\n${draft.body}\n`;
  });
  const content = `# Email Drafts\n\nGenerated: ${new Date().toLocaleDateString()}\n\n---\n\n${sections.join('\n---\n\n')}`;
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = { writeCsv, writeEmails, csvEscape };

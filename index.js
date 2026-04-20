require('dotenv').config();
const path = require('path');
const { searchTerms, outputDir } = require('./config');
const { scrapeLeads } = require('./scrapers/google-maps');
const { scoreWebsite } = require('./analyzers/website-quality');
const { generateEmail } = require('./generators/email-generator');
const { writeCsv, writeEmails } = require('./utils/output-writer');

async function run() {
  console.log('=== WebsiteBot Starting ===\n');
  const start = Date.now();

  // Stage 1: Scrape
  console.log('Stage 1: Scraping Google Maps...');
  const rawLeads = await scrapeLeads(searchTerms);
  console.log(`\nFound ${rawLeads.length} unique leads\n`);

  // Stage 2: Score websites
  console.log('Stage 2: Analyzing website quality...');
  const scoredLeads = [];
  for (const lead of rawLeads) {
    process.stdout.write(`  Scoring ${lead.name}... `);
    const websiteQuality = await scoreWebsite(lead.website);
    scoredLeads.push({ ...lead, websiteQuality });
    console.log(websiteQuality);
  }
  const qualifying = scoredLeads.filter(
    (l) => l.websiteQuality === 'poor' || l.websiteQuality === 'no website'
  );
  console.log(`\n${qualifying.length} qualifying leads (poor or no website)\n`);

  // Stage 3: Generate emails
  console.log('Stage 3: Generating email drafts...');
  const emailDrafts = [];
  for (const lead of qualifying) {
    process.stdout.write(`  Drafting for ${lead.name}... `);
    const draft = await generateEmail(lead.name, lead.address, lead.websiteQuality);
    emailDrafts.push(draft);
    console.log('done');
  }

  // Stage 4: Write output
  console.log('\nStage 4: Writing output files...');
  const csvPath = path.join(outputDir, 'leads.csv');
  const emailsPath = path.join(outputDir, 'emails.md');
  writeCsv(csvPath, scoredLeads);
  writeEmails(emailsPath, emailDrafts);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);
  console.log(`Leads CSV:     ${csvPath} (${scoredLeads.length} leads)`);
  console.log(`Email drafts:  ${emailsPath} (${emailDrafts.length} drafts)`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

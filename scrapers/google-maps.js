const puppeteer = require('puppeteer');
const { chainKeywords, maxResultsPerTerm } = require('../config');

// Google Maps CSS selectors — these may drift as Google updates their UI.
// If scraper stops working, inspect Maps in DevTools and update these.
const SEL = {
  feed: '[role="feed"]',
  resultCard: '[role="feed"] > div',
  nameInCard: '.fontHeadlineSmall',
  detailName: 'h1',
  detailAddress: 'button[data-item-id="address"] .fontBodyMedium',
  detailPhone: 'button[data-item-id*="phone:tel:"] .fontBodyMedium',
  detailWebsite: 'a[data-item-id="authority"]',
};

function isChain(name) {
  const lower = name.toLowerCase();
  return chainKeywords.some((kw) => lower.includes(kw));
}

async function scrapeSearchTerm(page, searchTerm) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const feedExists = await page.waitForSelector(SEL.feed, { timeout: 15000 }).catch(() => null);
  if (!feedExists) {
    console.warn(`  No results feed for: ${searchTerm}`);
    return [];
  }

  const leads = [];
  let cardIndex = 0;

  while (leads.length < maxResultsPerTerm) {
    const cards = await page.$$(SEL.resultCard);
    if (cardIndex >= cards.length) break;

    const card = cards[cardIndex];
    cardIndex++;

    // Skip spacer divs Google inserts
    const hasContent = await card.$(SEL.nameInCard).catch(() => null);
    if (!hasContent) continue;

    try {
      await card.click();
      await page.waitForSelector(SEL.detailName, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 500));

      const name = await page.$eval(SEL.detailName, (el) => el.textContent.trim()).catch(() => '');
      if (!name || isChain(name)) continue;

      const address = await page
        .$eval(SEL.detailAddress, (el) => el.textContent.trim())
        .catch(() => '');
      const phone = await page
        .$eval(SEL.detailPhone, (el) => el.textContent.trim())
        .catch(() => '');
      const website = await page
        .$eval(SEL.detailWebsite, (el) => el.href)
        .catch(() => '');
      const mapsUrl = page.url();

      leads.push({ name, address, phone, website, mapsUrl });
      console.log(`  Found: ${name}`);
    } catch (err) {
      console.warn(`  Skipped card ${cardIndex}: ${err.message}`);
    }

    // Scroll feed to trigger lazy-loading of more results
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTop += 400;
    });
  }

  return leads;
}

async function scrapeLeads(searchTerms) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allLeads = [];
  const seenNames = new Set();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const term of searchTerms) {
      console.log(`\nScraping: ${term}`);
      try {
        const leads = await scrapeSearchTerm(page, term);
        for (const lead of leads) {
          const key = lead.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allLeads.push(lead);
          }
        }
        console.log(`  +${leads.length} leads (${allLeads.length} total unique)`);
      } catch (err) {
        console.error(`  Error scraping "${term}": ${err.message}`);
      }
      // Polite delay between searches
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
  }

  return allLeads;
}

module.exports = { scrapeLeads };

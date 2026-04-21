const puppeteer = require('puppeteer');
const { chainKeywords, maxResultsPerTerm } = require('../config');

// Google Maps CSS selectors — these may drift as Google updates their UI.
// If scraper stops working, inspect Maps in DevTools and update these.
const SEL = {
  feed: '[role="feed"]',
  resultCard: '[role="feed"] > div',
  nameInCard: '.fontHeadlineSmall',
  detailName: 'h1.DUwDvf, h1',
  detailAddress: 'button[data-item-id="address"] .fontBodyMedium',
  detailPhone: 'button[data-item-id*="phone:tel:"] .fontBodyMedium',
  detailWebsite: 'a[data-item-id="authority"]',
};

const WEBSITE_FALLBACK_SELECTORS = [
  'a[data-item-id="authority"]',
  'a[data-item-id*="authority"]',
  'a[aria-label*="Website"]',
  'a[aria-label^="Website:"]',
  'a[data-tooltip*="website"]',
  'a[data-tooltip*="Website"]',
];

function isChain(name) {
  const lower = name.toLowerCase();
  return chainKeywords.some((kw) => lower.includes(kw));
}

function isInvalidBusinessName(name) {
  if (!name) return true;
  const normalized = name.toLowerCase().trim();
  return [
    'results',
    'search results',
    'google maps',
    'maps',
  ].includes(normalized);
}

function decodeGoogleOutboundUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const isGoogleDomain =
      parsed.hostname.includes('google.com') || parsed.hostname.includes('googleusercontent.com');
    if (isGoogleDomain) {
      const qParam = parsed.searchParams.get('q');
      const urlParam = parsed.searchParams.get('url');
      const candidate = qParam || urlParam;
      if (candidate) return candidate;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function extractTrackingDestination(rawUrl) {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const toParse = trimmed.startsWith('/') ? `https://www.google.com${trimmed}` : trimmed;
  try {
    const parsed = new URL(toParse);
    const path = (parsed.pathname || '').toLowerCase();
    const host = (parsed.hostname || '').toLowerCase();
    const maybeTrackingPath = path.includes('/aclk') || path.includes('/url');
    const maybeTrackingHost =
      host.includes('googleadservices.com') ||
      host.includes('doubleclick.net') ||
      host.includes('googlesyndication.com');
    if (!maybeTrackingPath && !maybeTrackingHost) return '';

    const paramsToTry = ['adurl', 'url', 'q'];
    for (const key of paramsToTry) {
      const candidate = parsed.searchParams.get(key);
      if (candidate) return candidate;
    }
    return '';
  } catch {
    return '';
  }
}

function normalizeWebsiteUrl(rawUrl) {
  const trackingTarget = extractTrackingDestination(rawUrl);
  const decoded = decodeGoogleOutboundUrl(trackingTarget || (rawUrl || '').trim());
  if (!decoded) return '';
  if (decoded.startsWith('/')) return '';
  const withProto = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
  try {
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes('google.com') ||
      host.includes('googleusercontent.com') ||
      host.includes('g.page') ||
      host === 'maps.app.goo.gl' ||
      host.endsWith('.google') ||
      host === 'aclk' ||
      host === 'www.aclk' ||
      !host.includes('.')
    ) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function pickWebsiteCandidate(urls) {
  for (const rawUrl of urls || []) {
    const normalized = normalizeWebsiteUrl(rawUrl);
    if (normalized) return normalized;
  }
  return '';
}

function tokenizeBusinessIdentity(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function getRegisteredDomainParts(hostname) {
  const host = (hostname || '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return [];
  const core = parts.slice(-2, -1)[0] || '';
  return core
    .split(/[^a-z0-9]/g)
    .filter((token) => token.length >= 3);
}

function getWebsiteConfidence(url, lead) {
  if (!url) return 'unknown';
  try {
    const parsed = new URL(url);
    const domainParts = getRegisteredDomainParts(parsed.hostname);
    if (!domainParts.length) return 'low';
    const mergedDomain = domainParts.join('');

    const leadTokens = [
      ...tokenizeBusinessIdentity(lead.name),
      ...tokenizeBusinessIdentity(lead.address),
    ];
    if (!leadTokens.length) return 'unknown';

    let matchCount = 0;
    for (const token of leadTokens) {
      const matched =
        domainParts.includes(token) || (token.length >= 5 && mergedDomain.includes(token));
      if (matched) {
        matchCount++;
        if (token.length >= 7) return 'high';
      }
    }
    return matchCount >= 2 ? 'high' : 'low';
  } catch {
    return 'unknown';
  }
}

function isLikelyBusinessWebsiteForLead(url, lead) {
  return getWebsiteConfidence(url, lead) === 'high';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function discoverWebsiteViaSearch(page, lead) {
  const queryParts = [lead.name || ''];
  if (lead.address) queryParts.push(lead.address);
  const query = queryParts.join(' ').trim();
  if (!query) return '';

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));

  const searchCandidates = await page.evaluate(() => {
    const urls = [];

    // Prefer normal result links (<a><h3>...</h3></a>).
    const organicAnchors = Array.from(document.querySelectorAll('a'));
    for (const anchor of organicAnchors) {
      if (!anchor.querySelector('h3')) continue;
      const href = anchor.getAttribute('href') || '';
      if (href) urls.push(href);
    }

    // Fallback to links in main results container.
    const resultAnchors = Array.from(document.querySelectorAll('#search a[href]'));
    for (const anchor of resultAnchors) {
      const href = anchor.getAttribute('href') || '';
      if (href) urls.push(href);
    }

    return urls;
  });

  return pickWebsiteCandidate(searchCandidates);
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
      const cardName = await card
        .$eval(SEL.nameInCard, (el) => el.textContent.trim())
        .catch(() => '');
      await card.click();
      await page.waitForSelector(SEL.detailName, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 500));

      let name = await page.$eval(SEL.detailName, (el) => el.textContent.trim()).catch(() => '');
      if (isInvalidBusinessName(name) && !isInvalidBusinessName(cardName)) {
        name = cardName;
      }
      if (!name || isInvalidBusinessName(name) || isChain(name)) continue;

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
  const seenLeadKeys = new Set();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const term of searchTerms) {
      console.log(`\nScraping: ${term}`);
      try {
        const leads = await scrapeSearchTerm(page, term);
        for (const lead of leads) {
          const key = `${lead.name.toLowerCase().trim()}|${(lead.address || '').toLowerCase().trim()}`;
          if (!seenLeadKeys.has(key)) {
            seenLeadKeys.add(key);
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

async function discoverMissingWebsites(leads) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    const updated = [];
    const domainAssignments = new Map();
    for (const lead of leads) {
      const normalizedExistingWebsite = normalizeWebsiteUrl((lead.website || '').trim());
      const hasValidExistingWebsite = Boolean(normalizedExistingWebsite);
      const hasMapsUrl = Boolean((lead.mapsUrl || '').trim());

      if (hasValidExistingWebsite || !hasMapsUrl) {
        updated.push({
          ...lead,
          website: normalizedExistingWebsite || '',
        });
        continue;
      }

      let discoveredWebsite = '';
      try {
        await page.goto(lead.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector(SEL.detailName, { timeout: 8000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 500));

        const selectorCandidates = await page.evaluate((selectors) => {
          const all = [];
          for (const selector of selectors) {
            const nodes = Array.from(document.querySelectorAll(selector));
            for (const node of nodes) {
              const href =
                node.getAttribute('href') ||
                node.getAttribute('data-href') ||
                node.dataset?.href ||
                '';
              if (href) all.push(href);
            }
          }
          return all;
        }, WEBSITE_FALLBACK_SELECTORS);

        const broadAnchorCandidates = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map((el) => el.getAttribute('href') || '')
            .filter(Boolean);
        });

        discoveredWebsite = pickWebsiteCandidate([
          ...selectorCandidates,
          ...broadAnchorCandidates,
        ]);

        // Second-pass fallback for stubborn cases: query by business identity.
        if (
          !discoveredWebsite ||
          !isLikelyBusinessWebsiteForLead(discoveredWebsite, lead)
        ) {
          discoveredWebsite = await discoverWebsiteViaSearch(page, lead);
        }

        if (discoveredWebsite && !isLikelyBusinessWebsiteForLead(discoveredWebsite, lead)) {
          discoveredWebsite = '';
        }

        if (discoveredWebsite) {
          const domain = extractDomain(discoveredWebsite);
          const assignedLead = domainAssignments.get(domain);
          if (assignedLead && assignedLead !== (lead.name || '').trim().toLowerCase()) {
            // Avoid assigning the same domain to unrelated businesses in one run.
            discoveredWebsite = '';
          } else if (domain) {
            domainAssignments.set(domain, (lead.name || '').trim().toLowerCase());
          }
        }
      } catch (err) {
        console.warn(`  Website discovery failed for ${lead.name}: ${err.message}`);
      }

      updated.push({
        ...lead,
        website: discoveredWebsite || normalizedExistingWebsite || '',
      });
      if (discoveredWebsite) {
        console.log(`  Website found for ${lead.name}: ${discoveredWebsite}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return updated;
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeLeads,
  discoverMissingWebsites,
  decodeGoogleOutboundUrl,
  extractTrackingDestination,
  normalizeWebsiteUrl,
  pickWebsiteCandidate,
  isLikelyBusinessWebsiteForLead,
  getWebsiteConfidence,
};

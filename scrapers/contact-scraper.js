const puppeteer = require('puppeteer');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const CONTACT_KEYWORDS = ['contact', 'about', 'reach us', 'get in touch'];

function extractEmailsFromText(text) {
  const matches = String(text || '').match(EMAIL_REGEX) || [];
  return matches.filter(
    (email) =>
      !email.includes('noreply') &&
      !email.includes('no-reply') &&
      !email.endsWith('@example.com') &&
      !email.endsWith('@sentry.io')
  );
}

function extractSocialFromLinks(links) {
  const instagram =
    (links || []).find(
      (href) =>
        href.includes('instagram.com/') &&
        !href.match(/instagram\.com\/?$/) &&
        !href.includes('/p/') &&
        !href.includes('/reel/')
    ) || '';

  const facebook =
    (links || []).find(
      (href) =>
        href.includes('facebook.com/') &&
        !href.match(/facebook\.com\/?$/) &&
        !href.includes('/sharer') &&
        !href.includes('/dialog/')
    ) || '';

  return { instagram, facebook };
}

function findContactPageLink(links) {
  return (
    (links || []).find((href) => {
      const lower = (href || '').toLowerCase();
      return CONTACT_KEYWORDS.some((kw) => lower.includes(kw));
    }) || ''
  );
}

async function extractContactInfo(websiteUrl, page) {
  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const homeLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)
    );
    const homeText = await page.evaluate(() => document.body.innerText || '');

    const { instagram, facebook } = extractSocialFromLinks(homeLinks);

    const mailtoEmails = homeLinks
      .filter((href) => href.startsWith('mailto:'))
      .map((href) => href.replace('mailto:', '').split('?')[0].trim());
    const textEmails = extractEmailsFromText(homeText);
    const homeEmails = [...new Set([...mailtoEmails, ...textEmails])].filter(Boolean);

    if (homeEmails.length > 0) {
      return { email: homeEmails[0], instagram, facebook };
    }

    const contactLink = findContactPageLink(homeLinks);
    if (contactLink) {
      try {
        await page.goto(contactLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const contactText = await page.evaluate(() => document.body.innerText || '');
        const contactMailto = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) =>
            a.href.replace('mailto:', '').split('?')[0].trim()
          )
        );
        const contactEmails = [
          ...new Set([...contactMailto, ...extractEmailsFromText(contactText)]),
        ].filter(Boolean);
        if (contactEmails.length > 0) {
          return { email: contactEmails[0], instagram, facebook };
        }
      } catch {
        // contact page failed — return social only
      }
    }

    return { email: '', instagram, facebook };
  } catch {
    return { email: '', instagram: '', facebook: '' };
  }
}

async function scrapeContactInfoBatch(leads) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    const updated = [];
    for (const lead of leads) {
      const website = (lead.website || '').trim();
      if (!website) {
        updated.push({
          ...lead,
          email: lead.email || '',
          instagram: lead.instagram || '',
          facebook: lead.facebook || '',
        });
        continue;
      }
      if (lead.email && lead.instagram !== undefined && lead.facebook !== undefined) {
        updated.push(lead);
        continue;
      }
      try {
        const contact = await extractContactInfo(website, page);
        updated.push({ ...lead, ...contact });
        if (contact.email) console.log(`  Email found for ${lead.name}: ${contact.email}`);
      } catch (err) {
        console.warn(`  Contact scrape failed for ${lead.name}: ${err.message}`);
        updated.push({ ...lead, email: '', instagram: '', facebook: '' });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return updated;
  } finally {
    await browser.close();
  }
}

module.exports = {
  extractEmailsFromText,
  extractSocialFromLinks,
  findContactPageLink,
  extractContactInfo,
  scrapeContactInfoBatch,
};

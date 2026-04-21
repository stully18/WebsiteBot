const {
  extractEmailsFromText,
  extractSocialFromLinks,
  findContactPageLink,
} = require('../../scrapers/contact-scraper');

describe('extractEmailsFromText', () => {
  it('finds emails in plain text', () => {
    const text = 'Contact us at hello@acmeroofing.com for a quote.';
    expect(extractEmailsFromText(text)).toEqual(['hello@acmeroofing.com']);
  });

  it('returns empty array when no emails found', () => {
    expect(extractEmailsFromText('No contact info here.')).toEqual([]);
  });

  it('filters out noreply addresses', () => {
    const text = 'noreply@example.com and real@business.com';
    expect(extractEmailsFromText(text)).toEqual(['real@business.com']);
  });

  it('filters out no-reply addresses', () => {
    const text = 'no-reply@service.io here';
    expect(extractEmailsFromText(text)).toEqual([]);
  });

  it('returns multiple emails', () => {
    const text = 'email a@b.com or c@d.com';
    expect(extractEmailsFromText(text)).toHaveLength(2);
  });
});

describe('extractSocialFromLinks', () => {
  it('extracts instagram profile link', () => {
    const links = ['https://www.instagram.com/acmeroofing/', 'https://facebook.com/'];
    const result = extractSocialFromLinks(links);
    expect(result.instagram).toBe('https://www.instagram.com/acmeroofing/');
  });

  it('extracts facebook profile link', () => {
    const links = ['https://www.facebook.com/acmeroofing.nj/'];
    const result = extractSocialFromLinks(links);
    expect(result.facebook).toBe('https://www.facebook.com/acmeroofing.nj/');
  });

  it('ignores bare instagram.com root', () => {
    const links = ['https://instagram.com/', 'https://twitter.com/'];
    const result = extractSocialFromLinks(links);
    expect(result.instagram).toBe('');
  });

  it('ignores facebook sharer links', () => {
    const links = ['https://facebook.com/sharer/sharer.php?u=http://example.com'];
    const result = extractSocialFromLinks(links);
    expect(result.facebook).toBe('');
  });

  it('returns empty strings when no social links found', () => {
    const result = extractSocialFromLinks(['https://example.com']);
    expect(result).toEqual({ instagram: '', facebook: '' });
  });
});

describe('findContactPageLink', () => {
  it('returns link containing "contact" keyword', () => {
    const links = ['https://acme.com/', 'https://acme.com/contact', 'https://acme.com/services'];
    expect(findContactPageLink(links)).toBe('https://acme.com/contact');
  });

  it('returns link containing "about" keyword', () => {
    const links = ['https://acme.com/', 'https://acme.com/about-us'];
    expect(findContactPageLink(links)).toBe('https://acme.com/about-us');
  });

  it('returns empty string when no contact-like link found', () => {
    const links = ['https://acme.com/', 'https://acme.com/services'];
    expect(findContactPageLink(links)).toBe('');
  });
});

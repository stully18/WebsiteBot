const {
  decodeGoogleOutboundUrl,
  normalizeWebsiteUrl,
  pickWebsiteCandidate,
} = require('../../scrapers/google-maps');

describe('google maps website helpers', () => {
  it('decodes google outbound links with q parameter', () => {
    const raw =
      'https://www.google.com/url?q=https%3A%2F%2Fcommunitydentalofhamilton.com%2F&sa=U&ved=abc';
    expect(decodeGoogleOutboundUrl(raw)).toBe('https://communitydentalofhamilton.com/');
  });

  it('normalizes bare domains to https urls', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects google/maps internal hosts', () => {
    expect(normalizeWebsiteUrl('https://www.google.com/maps/place/foo')).toBe('');
    expect(normalizeWebsiteUrl('https://maps.app.goo.gl/abcd')).toBe('');
  });

  it('picks the first valid candidate from a mixed list', () => {
    const result = pickWebsiteCandidate([
      'https://www.google.com/maps/place/foo',
      'https://www.google.com/url?q=https%3A%2F%2Fvalidsite.com',
      'https://othersite.com',
    ]);
    expect(result).toBe('https://validsite.com/');
  });
});

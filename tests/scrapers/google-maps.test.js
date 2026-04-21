const {
  decodeGoogleOutboundUrl,
  extractTrackingDestination,
  normalizeWebsiteUrl,
  pickWebsiteCandidate,
  isLikelyBusinessWebsiteForLead,
  getWebsiteConfidence,
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

  it('extracts target url from tracking ad links', () => {
    const tracking =
      '/aclk?sa=L&adurl=https%3A%2F%2Fcommunitydentalofhamilton.com%2Flanding&ctype=99';
    expect(extractTrackingDestination(tracking)).toBe('https://communitydentalofhamilton.com/landing');
    expect(normalizeWebsiteUrl(tracking)).toBe('https://communitydentalofhamilton.com/landing');
  });

  it('rejects tracking links that have no destination url', () => {
    const tracking = '/aclk?sa=L&ctype=99';
    expect(normalizeWebsiteUrl(tracking)).toBe('');
  });

  it('rejects direct aclk host links', () => {
    const directAclk = 'https://aclk/?sa=L&ctype=99';
    expect(normalizeWebsiteUrl(directAclk)).toBe('');
  });

  it('picks the first valid candidate from a mixed list', () => {
    const result = pickWebsiteCandidate([
      'https://www.google.com/maps/place/foo',
      '/aclk?sa=L&adurl=https%3A%2F%2Ffromad.example%2F',
      'https://www.google.com/url?q=https%3A%2F%2Fvalidsite.com',
      'https://othersite.com',
    ]);
    expect(result).toBe('https://fromad.example/');
  });

  it('accepts websites with domain matching business name tokens', () => {
    expect(
      isLikelyBusinessWebsiteForLead('https://www.primeomegafitness.com', {
        name: 'Prime Omega Fitness',
        address: 'Princeton NJ',
      })
    ).toBe(true);
  });

  it('rejects websites with unrelated domains', () => {
    expect(
      isLikelyBusinessWebsiteForLead('https://www.jerseyplumbingpros.com', {
        name: 'Sai CPA Services',
        address: 'Ewing NJ',
      })
    ).toBe(false);
  });
});

describe('getWebsiteConfidence', () => {
  it('returns high when domain has a strong 7+ char token match', () => {
    expect(
      getWebsiteConfidence('https://www.primeomegafitness.com', {
        name: 'Prime Omega Fitness',
        address: 'Princeton NJ',
      })
    ).toBe('high');
  });

  it('returns high when domain has 2 shorter token matches', () => {
    expect(
      getWebsiteConfidence('https://www.acmeplumbing.com', {
        name: 'Acme Plumbing',
        address: 'Princeton NJ',
      })
    ).toBe('high');
  });

  it('returns low when only 1 short token matches', () => {
    expect(
      getWebsiteConfidence('https://www.acmeservices.com', {
        name: 'Acme Roofing',
        address: 'Ewing NJ',
      })
    ).toBe('low');
  });

  it('returns low when no tokens match', () => {
    expect(
      getWebsiteConfidence('https://www.jerseyplumbingpros.com', {
        name: 'Sai CPA Services',
        address: 'Ewing NJ',
      })
    ).toBe('low');
  });

  it('returns unknown for empty url', () => {
    expect(getWebsiteConfidence('', { name: 'Any', address: 'NJ' })).toBe('unknown');
  });
});

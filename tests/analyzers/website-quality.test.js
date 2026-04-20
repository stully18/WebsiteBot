const { scoreWebsite, buildAnalysisPrompt } = require('../../analyzers/website-quality');

describe('buildAnalysisPrompt', () => {
  it('includes the HTML in the prompt', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const prompt = buildAnalysisPrompt(html);
    expect(prompt).toContain('<html>');
    expect(prompt).toContain('Return ONLY one word');
  });

  it('truncates HTML longer than 8000 chars', () => {
    const html = 'x'.repeat(10000);
    const prompt = buildAnalysisPrompt(html);
    expect(prompt.length).toBeLessThan(9000);
  });
});

describe('scoreWebsite', () => {
  function mockFetch(siteFetch, ollamaResponse) {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return siteFetch;
      return ollamaResponse;
    });
  }

  afterEach(() => {
    global.fetch = undefined;
  });

  it('returns "no website" when url is empty', async () => {
    expect(await scoreWebsite('')).toBe('no website');
  });

  it('returns "poor" when Ollama responds with "poor"', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html>old</html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: 'poor' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('handles Ollama response with extra whitespace', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: '  mediocre  \n' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });

  it('extracts first word when Ollama adds punctuation', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.resolve({ ok: true, json: async () => ({ response: 'poor.' }) })
    );
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "poor" on site fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await scoreWebsite('http://broken.example.com')).toBe('poor');
  });

  it('returns "poor" on non-200 site response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" (fail open) when Ollama throws', async () => {
    mockFetch(
      Promise.resolve({ ok: true, text: async () => '<html></html>' }),
      Promise.reject(new Error('connection refused'))
    );
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });
});

const { scoreWebsite, buildAnalysisPrompt } = require('../../analyzers/website-quality');

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('buildAnalysisPrompt', () => {
  it('includes the HTML in the prompt', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const prompt = buildAnalysisPrompt(html);
    expect(prompt).toContain('<html>');
    expect(prompt).toContain("Return ONLY one word: 'poor', 'mediocre', or 'good'");
  });

  it('truncates HTML longer than 8000 chars', () => {
    const html = 'x'.repeat(10000);
    const prompt = buildAnalysisPrompt(html);
    expect(prompt.length).toBeLessThan(9000);
  });
});

describe('scoreWebsite', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('returns "no website" when url is empty', async () => {
    expect(await scoreWebsite('')).toBe('no website');
  });

  it('returns "poor" when Gemini responds with "poor"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>old site</body></html>',
    });
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'poor' } });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" when Gemini response has extra whitespace', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html></html>',
    });
    mockGenerateContent.mockResolvedValue({ response: { text: () => '  mediocre  \n' } });
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });

  it('returns "poor" on fetch failure (unreachable = poor)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await scoreWebsite('http://broken.example.com')).toBe('poor');
  });

  it('returns "poor" on non-200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await scoreWebsite('http://example.com')).toBe('poor');
  });

  it('returns "mediocre" (fail open) when Gemini throws', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html></html>',
    });
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
    expect(await scoreWebsite('http://example.com')).toBe('mediocre');
  });
});

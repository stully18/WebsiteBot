const { generateEmail, buildEmailPrompt } = require('../../generators/email-generator');

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('buildEmailPrompt', () => {
  it('includes business name in prompt', () => {
    const prompt = buildEmailPrompt("Joe's Pizza", '123 Main St, Princeton NJ', 'no website');
    expect(prompt).toContain("Joe's Pizza");
    expect(prompt).toContain('Princeton NJ');
  });

  it('describes "no website" situation', () => {
    const prompt = buildEmailPrompt('Hair Salon', 'Trenton NJ', 'no website');
    expect(prompt).toContain('no website');
  });

  it('describes poor website situation', () => {
    const prompt = buildEmailPrompt('Dental Office', 'Ewing NJ', 'poor');
    expect(prompt).toContain('poor');
  });
});

describe('generateEmail', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('returns parsed email draft with subject and body', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "Subject: Website idea for Joe's Pizza\nBody: Hi there,\n\nI came across Joe's Pizza and love what you're doing. I build modern websites for local businesses. Happy to chat!\n\nBest, Shane",
      },
    });

    const draft = await generateEmail("Joe's Pizza", '123 Main St, Princeton NJ', 'no website');
    expect(draft.businessName).toBe("Joe's Pizza");
    expect(draft.address).toBe('123 Main St, Princeton NJ');
    expect(draft.subject).toBe("Website idea for Joe's Pizza");
    expect(draft.body).toContain("Joe's Pizza");
  });

  it('returns fallback draft on Gemini error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

    const draft = await generateEmail('Broken Biz', 'Trenton NJ', 'poor');
    expect(draft.businessName).toBe('Broken Biz');
    expect(draft.subject).toContain('Broken Biz');
    expect(draft.body).toBeTruthy();
  });
});

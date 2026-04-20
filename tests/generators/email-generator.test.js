const { generateEmail, generateDm, generateOutreachDraft, buildEmailPrompt, buildDmPrompt } = require('../../generators/email-generator');

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
    expect(draft.draftKind).toBe('email');
    expect(draft.subject).toContain('Broken Biz');
    expect(draft.body).toBeTruthy();
  });
});

describe('buildDmPrompt', () => {
  it('asks for casual short DM and mockup photo mention', () => {
    const prompt = buildDmPrompt('Cafe X', 'Princeton NJ', 'mediocre');
    expect(prompt).toContain('Instagram DM');
    expect(prompt).toContain('mockup');
    expect(prompt).toContain('Cafe X');
  });
});

describe('generateDm', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('returns local DM template without API call', async () => {
    const draft = await generateDm('Shop Y', 'Ewing NJ', 'poor');
    expect(draft.draftKind).toBe('dm');
    expect(draft.body).toContain('I’m Shane Tully');
    expect(draft.body).toContain('mockup');
    expect(draft.body).toContain('www.shanetully.dev');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('keeps the approved no-tool wording', async () => {
    const draft = await generateDm('Shop Y', 'Ewing NJ', 'poor');
    expect(draft.body.toLowerCase()).not.toContain('google stitch');
    expect(draft.body).toContain('mockup');
  });
});

describe('generateOutreachDraft', () => {
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  it('routes to DM when kind is dm', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'DM:\nShort casual note.' },
    });
    const draft = await generateOutreachDraft('Biz', 'Trenton', 'good', 'dm');
    expect(draft.draftKind).toBe('dm');
  });
});

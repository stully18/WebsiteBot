const { generateEmail, generateDm, generateOutreachDraft } = require('../../generators/email-generator');

jest.mock('../../config', () => ({
  loadConfig: jest.fn(() => ({
    outreach: { name: 'Test User', role: 'a web developer', portfolio: 'test.dev' },
    templates: {
      email: {
        subject: 'Free website for {{businessName}}',
        body: 'Hi {{businessName}} team,\n\nI\'m {{name}}, {{role}}.\n\nPortfolio: {{portfolio}}',
      },
      dm: {
        body: 'Hey {{shortName}} — I\'m {{name}}, {{role}}.\n\nPortfolio: {{portfolio}}',
      },
    },
  })),
}));

describe('generateEmail', () => {
  it('returns email draft with correct structure', async () => {
    const draft = await generateEmail("Joe's Pizza", '123 Main St, Princeton NJ');
    expect(draft.businessName).toBe("Joe's Pizza");
    expect(draft.address).toBe('123 Main St, Princeton NJ');
    expect(draft.draftKind).toBe('email');
    expect(draft.subject).toContain("Joe's Pizza");
    expect(draft.body).toContain("Joe's Pizza");
  });

  it('substitutes {{name}} from outreach config', async () => {
    const draft = await generateEmail('Salon X', 'Trenton NJ');
    expect(draft.body).toContain('Test User');
    expect(draft.body).toContain('a web developer');
    expect(draft.body).toContain('test.dev');
  });

  it('substitutes {{businessName}} in subject', async () => {
    const draft = await generateEmail('Roofing Co', 'Ewing NJ');
    expect(draft.subject).toBe('Free website for Roofing Co');
  });
});

describe('generateDm', () => {
  it('returns dm draft with correct structure', async () => {
    const draft = await generateDm('Shop Y', 'Ewing NJ');
    expect(draft.draftKind).toBe('dm');
    expect(draft.subject).toBe('Instagram DM');
    expect(draft.body).toBeTruthy();
  });

  it('uses {{shortName}} as first word of business name', async () => {
    const draft = await generateDm('Sunrise Landscaping', 'Princeton NJ');
    expect(draft.body).toContain('Sunrise');
  });

  it('substitutes outreach variables', async () => {
    const draft = await generateDm('Shop Y', 'Ewing NJ');
    expect(draft.body).toContain('Test User');
    expect(draft.body).toContain('test.dev');
  });
});

describe('generateOutreachDraft', () => {
  it('routes to email by default', async () => {
    const draft = await generateOutreachDraft('Biz', 'Trenton', 'good');
    expect(draft.draftKind).toBe('email');
  });

  it('routes to dm when kind is dm', async () => {
    const draft = await generateOutreachDraft('Biz', 'Trenton', 'good', 'dm');
    expect(draft.draftKind).toBe('dm');
  });
});

const fs = require('fs');
const path = require('path');
const { writeCsv, writeEmails, csvEscape } = require('../../utils/output-writer');

describe('csvEscape', () => {
  it('wraps field in quotes if it contains a comma', () => {
    expect(csvEscape('hello, world')).toBe('"hello, world"');
  });

  it('wraps field in quotes if it contains a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it('returns plain string if no special chars', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('returns empty string for null or undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('writeCsv', () => {
  const testPath = path.join(__dirname, 'test-leads.csv');
  afterEach(() => { if (fs.existsSync(testPath)) fs.unlinkSync(testPath); });

  it('writes header row and data rows', () => {
    const leads = [{
      name: "Joe's Pizza",
      address: '123 Main St, Princeton NJ',
      phone: '6095551234',
      website: 'http://joespizza.com',
      websiteQuality: 'poor',
      mapsUrl: 'https://maps.google.com/1',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link');
    expect(content).toContain("Joe's Pizza");
    expect(content).toContain('Princeton NJ');
  });

  it('properly quotes fields containing commas', () => {
    const leads = [{
      name: 'Smith, Jones & Co',
      address: 'Trenton NJ',
      phone: '',
      website: '',
      websiteQuality: 'no website',
      mapsUrl: '',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('"Smith, Jones & Co"');
  });

  it('includes Email, Instagram, Facebook columns', () => {
    const leads = [{
      name: 'Acme Roofing',
      address: 'Princeton NJ',
      phone: '6095550000',
      website: 'https://acmeroofing.com',
      websiteQuality: '',
      mapsUrl: '',
      email: 'hello@acmeroofing.com',
      instagram: 'https://instagram.com/acmeroofing',
      facebook: '',
    }];
    writeCsv(testPath, leads);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link,Email,Instagram,Facebook');
    expect(content).toContain('hello@acmeroofing.com');
    expect(content).toContain('https://instagram.com/acmeroofing');
  });
});

describe('writeEmails', () => {
  const testPath = path.join(__dirname, 'test-emails.md');
  afterEach(() => { if (fs.existsSync(testPath)) fs.unlinkSync(testPath); });

  it('writes a markdown section for each email draft', () => {
    const drafts = [{
      businessName: "Joe's Pizza",
      address: '123 Main St, Princeton NJ',
      subject: "Website idea for Joe's Pizza",
      body: 'Hi there, great place!',
    }];
    writeEmails(testPath, drafts);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain("## Joe's Pizza — 123 Main St, Princeton NJ");
    expect(content).toContain('**Type:** Email');
    expect(content).toContain("**Subject / label:** Website idea for Joe's Pizza");
    expect(content).toContain('Hi there, great place!');
  });

  it('labels DM drafts in markdown', () => {
    const drafts = [
      {
        businessName: 'Local Gym',
        address: 'Trenton NJ',
        draftKind: 'dm',
        subject: 'Instagram DM',
        body: 'Hey! Love your site — sending a mockup pic.',
      },
    ];
    writeEmails(testPath, drafts);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('**Type:** DM (Instagram)');
  });

  it('writes a "no results" message when drafts array is empty', () => {
    writeEmails(testPath, []);
    const content = fs.readFileSync(testPath, 'utf8');
    expect(content).toContain('# Email Drafts');
    expect(content).toContain('No qualifying leads');
  });
});

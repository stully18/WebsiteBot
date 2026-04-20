const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createApp, parseCsv } = require('../../dashboard/server');

const TEST_DIR = path.join(__dirname, 'test-output');

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'leads.csv'),
    "Business Name,Address,Phone,Website URL,Website Quality,Google Maps Link\nJoe's Pizza,Princeton NJ,6095551234,http://joespizza.com,poor,https://maps.google.com/1\n"
  );
  fs.writeFileSync(
    path.join(TEST_DIR, 'emails.md'),
    "# Email Drafts\n\n## Joe's Pizza — Princeton NJ\n\n**Subject:** Website idea\n\n**Email:**\n\nHi there!\n"
  );
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true });
});

describe('parseCsv', () => {
  it('parses header and one row into an object', () => {
    const csv = 'Name,City\nJoe,Princeton\n';
    const result = parseCsv(csv);
    expect(result).toEqual([{ Name: 'Joe', City: 'Princeton' }]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,City\n"Smith, Co",Trenton\n';
    const result = parseCsv(csv);
    expect(result[0].Name).toBe('Smith, Co');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsv('Name,City\n')).toEqual([]);
  });
});

describe('GET /api/leads', () => {
  it('returns parsed leads as JSON array', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]['Business Name']).toBe("Joe's Pizza");
  });

  it('returns empty array when leads.csv does not exist', async () => {
    const app = createApp(path.join(__dirname, 'nonexistent'));
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/emails', () => {
  it('returns emails.md content as string', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/emails');
    expect(res.status).toBe(200);
    expect(res.body.content).toContain("Joe's Pizza");
  });

  it('returns empty content when emails.md does not exist', async () => {
    const app = createApp(path.join(__dirname, 'nonexistent'));
    const res = await request(app).get('/api/emails');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('');
  });
});

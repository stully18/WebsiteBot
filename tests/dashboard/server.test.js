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

afterEach(() => {
  const draftsPath = path.join(TEST_DIR, 'email-drafts.json');
  const trashedPath = path.join(TEST_DIR, 'trashed-leads.json');
  if (fs.existsSync(draftsPath)) fs.unlinkSync(draftsPath);
  if (fs.existsSync(trashedPath)) fs.unlinkSync(trashedPath);
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

  it('hides trashed leads from API results', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'trashed-leads.json'), JSON.stringify(["joe's pizza|princeton nj"]));
    const app = createApp(TEST_DIR);
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

describe('email draft endpoints', () => {
  it('returns empty drafts when file does not exist', async () => {
    const app = createApp(TEST_DIR);
    const res = await request(app).get('/api/email-drafts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('generates and stores a draft for a specific lead', async () => {
    const mockGenerateEmail = jest.fn().mockResolvedValue({
      businessName: "Joe's Pizza",
      address: 'Princeton NJ',
      subject: 'Website idea',
      body: 'Hi there!',
    });
    const app = createApp(TEST_DIR, { generateEmailForLead: mockGenerateEmail });

    const res = await request(app).post('/api/generate-email').send({
      businessName: "Joe's Pizza",
      address: 'Princeton NJ',
    });
    expect(res.status).toBe(201);
    expect(mockGenerateEmail).toHaveBeenCalled();

    const draftsRes = await request(app).get('/api/email-drafts');
    expect(draftsRes.status).toBe(200);
    expect(draftsRes.body.length).toBe(1);
    expect(draftsRes.body[0].businessName).toBe("Joe's Pizza");
  });

  it('can move a lead to trash', async () => {
    const app = createApp(TEST_DIR);
    const trashRes = await request(app).post('/api/leads/trash').send({
      businessName: "Joe's Pizza",
      address: 'Princeton NJ',
    });
    expect(trashRes.status).toBe(201);

    const leadsRes = await request(app).get('/api/leads');
    expect(leadsRes.body).toEqual([]);
  });
});

describe('send email endpoint', () => {
  it('sends email via configured transport wrapper', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc123' });
    const app = createApp(TEST_DIR, { sendMail });
    const res = await request(app).post('/api/send-email').send({
      to: 'test@example.com',
      subject: 'Hello',
      body: 'Body text',
    });
    expect(res.status).toBe(202);
    expect(sendMail).toHaveBeenCalledWith({
      to: 'test@example.com',
      subject: 'Hello',
      body: 'Body text',
    });
  });
});

describe('pipeline run endpoints', () => {
  it('starts a pipeline run and reports status/logs', async () => {
    const fakeChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    const runPipeline = jest.fn().mockReturnValue(fakeChild);
    const app = createApp(TEST_DIR, { runPipeline });

    const startRes = await request(app).post('/api/run').send({ mode: 'process' });
    expect(startRes.status).toBe(202);
    expect(runPipeline).toHaveBeenCalledWith('process');

    const stdoutHandler = fakeChild.stdout.on.mock.calls.find(([evt]) => evt === 'data')[1];
    const closeHandler = fakeChild.on.mock.calls.find(([evt]) => evt === 'close')[1];

    stdoutHandler('Stage 1 starting\n');
    closeHandler(0);

    const statusRes = await request(app).get('/api/run-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.running).toBe(false);
    expect(statusRes.body.exitCode).toBe(0);
    expect(statusRes.body.logs).toContain('Stage 1 starting');
    expect(statusRes.body.mode).toBe('process');
  });

  it('accepts discover mode', async () => {
    const fakeChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    const runPipeline = jest.fn().mockReturnValue(fakeChild);
    const app = createApp(TEST_DIR, { runPipeline });

    const startRes = await request(app).post('/api/run').send({ mode: 'discover' });
    expect(startRes.status).toBe(202);
    expect(runPipeline).toHaveBeenCalledWith('discover');
  });

  it('rejects starting a second run while one is active', async () => {
    const fakeChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    const app = createApp(TEST_DIR, { runPipeline: () => fakeChild });

    const first = await request(app).post('/api/run');
    const second = await request(app).post('/api/run');

    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('already running');
  });

  it('rejects invalid run mode', async () => {
    const app = createApp(TEST_DIR, { runPipeline: jest.fn() });
    const res = await request(app).post('/api/run').send({ mode: 'unknown' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid mode');
  });
});

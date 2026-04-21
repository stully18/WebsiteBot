const { buildMimeMessage } = require('../../utils/gmail-sender');

describe('buildMimeMessage', () => {
  it('base64url encodes a valid MIME message with required headers', () => {
    const raw = buildMimeMessage({
      to: 'owner@acmeroofing.com',
      subject: 'Quick website idea',
      textBody: 'Hi there! I have an idea for your site.',
      htmlSignature: '<b>Shane Tully</b>',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: owner@acmeroofing.com');
    expect(decoded).toContain('Subject: Quick website idea');
    expect(decoded).toContain('Content-Type: text/html');
    expect(decoded).toContain('Hi there! I have an idea for your site.');
    expect(decoded).toContain('<b>Shane Tully</b>');
  });

  it('includes a horizontal rule before the signature', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Body',
      htmlSignature: '<p>Sig</p>',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('<hr>');
  });

  it('omits the horizontal rule when no signature provided', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Body',
      htmlSignature: '',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).not.toContain('<hr>');
  });

  it('escapes < and > in text body to prevent XSS in HTML context', () => {
    const raw = buildMimeMessage({
      to: 'a@b.com',
      subject: 'Hi',
      textBody: 'Use <strong> tags',
      htmlSignature: '',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('&lt;strong&gt;');
  });
});

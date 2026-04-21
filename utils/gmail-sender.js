require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { google } = require('googleapis');
const { getAuthClient } = require('./gmail-auth');

let _cachedSignature = null;

function buildMimeMessage({ to, subject, textBody, htmlSignature }) {
  const safeBody = String(textBody || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const htmlBody = `<div style="white-space:pre-wrap;font-family:sans-serif">${safeBody}</div>`;
  const fullHtml = htmlSignature ? `${htmlBody}<br><hr>${htmlSignature}` : htmlBody;

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    fullHtml,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

async function fetchGmailSignature(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const userInfo = await gmail.users.getProfile({ userId: 'me' });
    const sendAsEmail = userInfo.data.emailAddress;
    const res = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail });
    return res.data.signature || '';
  } catch {
    return '';
  }
}

async function getSignature() {
  if (_cachedSignature !== null) return _cachedSignature;
  const auth = await getAuthClient();
  _cachedSignature = await fetchGmailSignature(auth);
  return _cachedSignature;
}

async function sendEmail({ to, subject, textBody, htmlSignature }) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildMimeMessage({ to, subject, textBody, htmlSignature });
  return gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

module.exports = { buildMimeMessage, fetchGmailSignature, getSignature, sendEmail };

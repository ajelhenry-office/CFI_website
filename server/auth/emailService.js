import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Re-use the existing automation credentials
const CREDENTIALS_PATH = path.join(__dirname, '../ratings/gmail_credentials.json');
const TOKEN_PATH = path.join(__dirname, '../ratings/gmail_token.json');

let oauth2Client = null;

async function getAuthClient() {
  if (oauth2Client) return oauth2Client;
  
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
    throw new Error('Gmail API credentials or token missing. Email functionality disabled.');
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  
  return oauth2Client;
}

export async function sendEmail(to, subject, message) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // RFC 2822 format
    const str = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      `To: ${to}\n`,
      `Subject: ${subject}\n\n`,
      message
    ].join('');

    const encodedMail = Buffer.from(str).toString('base64url');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMail
      }
    });

    console.log(`[EMAIL] Successfully sent email to ${to}, Message ID: ${res.data.id}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Failed to send email to ${to}:`, error.message);
    return false;
  }
}

let cachedFromAddress = null;
async function getFromAddress(auth) {
  if (cachedFromAddress) return cachedFromAddress;
  const gmail = google.gmail({ version: 'v1', auth });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  cachedFromAddress = profile.data.emailAddress;
  return cachedFromAddress;
}

// Raw UTF-8 bytes in a header (the emoji, the em-dash) get misread by mail clients
// as some other single-byte encoding — headers need RFC 2047 encoded-word syntax
// for anything non-ASCII, unlike the body, which just needs a charset declaration.
function encodeHeader(text) {
  return `=?UTF-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`;
}

// Distinct from sendEmail on purpose: HTML body (color-coded by severity) and a
// different "From" display name, so alert emails are unmistakable in an inbox list
// at a glance, and easy to build a Gmail filter around ("from contains 'KitchenPulse
// Alerts'" or "subject contains '[KitchenPulse ALERT]'").
export async function sendAlertEmail(to, subject, htmlBody) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const fromAddress = await getFromAddress(auth);

    const str = [
      'Content-Type: text/html; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      `From: ${encodeHeader("KitchenPulse Alerts")} <${fromAddress}>\n`,
      `To: ${to}\n`,
      `Subject: ${encodeHeader(subject)}\n\n`,
      htmlBody
    ].join('');

    const encodedMail = Buffer.from(str).toString('base64url');
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMail } });

    console.log(`[ALERT EMAIL] Sent to ${to}, Message ID: ${res.data.id}`);
    return true;
  } catch (error) {
    console.error(`[ALERT EMAIL] Failed to send to ${to}:`, error.message);
    return false;
  }
}

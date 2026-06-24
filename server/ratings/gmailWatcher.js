import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.join(__dirname, 'gmail_credentials.json');
const TOKEN_PATH = path.join(__dirname, 'gmail_token.json');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Ensure the downloads folder exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

async function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

function getEmailBody(payload) {
  let body = '';
  if (payload.body && payload.body.data) {
    body += Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        if (part.body && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      } else if (part.parts) {
        body += getEmailBody(part);
      }
    }
  }
  return body;
}

function getAttachmentParts(part) {
  let attachments = [];
  const hasAttachmentId = part.body && part.body.attachmentId;
  
  if (hasAttachmentId && part.filename) {
    const fname = part.filename.toLowerCase();
    
    // Aggressively capture ALL attachments. Force an extension if one is missing or non-standard.
    if (!fname.endsWith('.xlsx') && !fname.endsWith('.xls') && !fname.endsWith('.csv')) {
      part.filename += '.xlsx'; 
    }
    attachments.push(part);
  }
  if (part.parts) {
    for (const subPart of part.parts) {
      attachments = attachments.concat(getAttachmentParts(subPart));
    }
  }
  return attachments;
}

async function checkForNewReports(targetDateStr) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const downloadedFiles = [];

  let query = `from:ranjith.r@swiggy.in subject:"Daily-MTD Funnel,IGCC,RDC,Serviceability & RHI - Report"`;
  if (!targetDateStr) {
    query += ` -label:swiggy-processed`;
  }

  console.log(`Checking Gmail for Swiggy reports...`);
  
  const res = await gmail.users.messages.list({ userId: 'me', q: query });
  const messages = res.data.messages || [];

  if (messages.length === 0) {
    console.log('No new reports found.');
    return downloadedFiles;
  }

  let targetDateObj = null;
  if (targetDateStr) {
    targetDateObj = new Date(targetDateStr.replace(/-/g, '/'));
    console.log(`Filtering inbox strictly for emails received on: ${targetDateStr}`);
  }

  for (const message of messages) {
    const msgData = await gmail.users.messages.get({ userId: 'me', id: message.id });

    // Strict JavaScript date filtering (ignores Gmail's confusing search engine logic)
    if (targetDateObj) {
      const headers = msgData.data.payload.headers;
      const dateHeader = headers.find(h => h.name === 'Date')?.value;
      if (dateHeader) {
        const emailDate = new Date(dateHeader);
        if (emailDate.getFullYear() !== targetDateObj.getFullYear() ||
            emailDate.getMonth() !== targetDateObj.getMonth() ||
            emailDate.getDate() !== targetDateObj.getDate()) {
          continue; // Instantly skip emails that don't match the exact day
        }
      }
    }

    // 1. Process standard file attachments
    const attachmentParts = getAttachmentParts(msgData.data.payload);
    for (const part of attachmentParts) {
      console.log(`Downloading attachment: ${part.filename}`);
      const attachmentId = part.body.attachmentId;
      
      const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: message.id,
        id: attachmentId
      });

      const buffer = Buffer.from(attachment.data.data, 'base64url');
      const filePath = path.join(DOWNLOAD_DIR, `${Date.now()}_${part.filename}`);
      fs.writeFileSync(filePath, buffer);
      downloadedFiles.push(filePath);
    }

    // 2. Extract and download from links in the email body
    const bodyText = getEmailBody(msgData.data.payload);
    const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
    const urls = bodyText.match(urlRegex) || [];

    for (let url of urls) {
      url = url.replace(/&amp;/g, '&'); // Fix HTML escaped ampersands
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.includes('.xlsx') || lowerUrl.includes('.xls') || lowerUrl.includes('.csv')) {
        console.log(`Found report link in email: ${url}`);
        try {
          const response = await fetch(url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const fileName = url.split('/').pop().split('?')[0] || 'download_link.xlsx';
            const filePath = path.join(DOWNLOAD_DIR, `${Date.now()}_${fileName}`);
            fs.writeFileSync(filePath, buffer);
            downloadedFiles.push(filePath);
          }
        } catch (err) {
          console.error(`Failed to download from link:`, err.message);
        }
      }
    }

    if (!targetDateStr) {
      await markEmailAsProcessed(gmail, message.id);
    } else {
      console.log(`Testing mode (Target Date Provided): Skipping label application so email can be fetched again.`);
    }
  }

  return downloadedFiles;
}

async function markEmailAsProcessed(gmail, messageId) {
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  let label = labelsRes.data.labels.find(l => l.name === 'swiggy-processed');

  if (!label) {
    const createdLabel = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: 'swiggy-processed',
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    label = createdLabel.data;
  }

  await gmail.users.messages.modify({
    userId: 'me', id: messageId, requestBody: { addLabelIds: [label.id] }
  });
}

export { checkForNewReports };
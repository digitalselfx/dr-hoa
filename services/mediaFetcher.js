const axios = require('axios');

async function fetchTwilioMedia(mediaUrl, mimeType) {
  const response = await axios.get(mediaUrl, {
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN,
    },
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return {
    base64:   Buffer.from(response.data).toString('base64'),
    mimeType: mimeType || response.headers['content-type'] || 'application/octet-stream',
  };
}

function isSupported(mimeType) {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf' || m.startsWith('text/');
}

function fileLabel(mimeType) {
  if (!mimeType) return '📎 file';
  const m = mimeType.toLowerCase();
  if (m.startsWith('image/'))       return '🖼️ image';
  if (m === 'application/pdf')      return '📄 PDF';
  if (m.includes('word'))           return '📝 Word document';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return '📊 spreadsheet';
  return '📎 file';
}

module.exports = { fetchTwilioMedia, isSupported, fileLabel };

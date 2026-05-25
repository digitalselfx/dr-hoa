const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM   = process.env.TWILIO_WHATSAPP_NUMBER;
const MAX    = 1500; // WhatsApp safe limit per message

async function send(to, text) {
  if (!text?.trim()) return;
  for (const chunk of split(text.trim(), MAX)) {
    await client.messages.create({ from: FROM, to, body: chunk });
    if (chunk !== text) await new Promise(r => setTimeout(r, 350));
  }
}

async function sendMany(to, messages) {
  for (const msg of messages) {
    if (msg?.trim()) await send(to, msg);
  }
}

function split(text, max) {
  if (text.length <= max) return [text];
  const chunks = [];
  const paras  = text.split(/\n{2,}/);
  let cur = '';
  for (const p of paras) {
    const joined = cur ? cur + '\n\n' + p : p;
    if (joined.length > max) {
      if (cur) chunks.push(cur.trim());
      if (p.length > max) {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
        cur = '';
      } else cur = p;
    } else cur = joined;
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

module.exports = { send, sendMany };

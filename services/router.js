/**
 * Router — entry point for all incoming WhatsApp messages.
 */
const { handle } = require('./assessmentFlow');
async function route(phone, text, mediaInfo) {
  return handle(phone, text, mediaInfo);
}
module.exports = { route };

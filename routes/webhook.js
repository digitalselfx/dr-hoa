const express  = require('express');
const router   = express.Router();
const twilio   = require('twilio');
const { route } = require('../services/router');
const { send, sendMany } = require('../services/twilio');
const { generateSectionReport, generateFullReport } = require('../services/claude');
const ss   = require('../services/sessionStore');
const msgs = require('../services/messages');
const brand = require('../data/brand');
const { ASSESSMENT } = require('../data/assessment');

// ── POST /webhook/whatsapp ────────────────────────────────────────
router.post('/whatsapp', async (req, res) => {
  // Validate Twilio signature in production
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
    const valid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      req.headers['x-twilio-signature'],
      `${process.env.BASE_URL}/webhook/whatsapp`,
      req.body
    );
    if (!valid) return res.status(403).send('Forbidden');
  }

  res.status(200).send(''); // Acknowledge immediately

  const { From: from, Body: body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
  if (!from) return;

  const text      = (body || '').trim();
  const tl        = text.toLowerCase();
  const hasMedia  = parseInt(NumMedia || '0') > 0;
  const mediaInfo = hasMedia ? { mediaUrl: MediaUrl0, mimeType: MediaContentType0 } : null;

  console.log(`📩 [${from}] "${text || '[media]'}"${hasMedia ? ' +file' : ''}`);

  try {
    // ── Async: full report ─────────────────────────────────────
    if (tl === 'report' || tl === 'informe' || tl === '/report') {
      const session = ss.get(from);
      if (!session || ss.answeredCount(session) === 0) {
        return send(from, session?.lang === 'es'
          ? 'Aun no hay elementos respondidos. Comience una seccion primero.'
          : 'No items answered yet. Start a section first.');
      }
      await send(from, session.lang === 'es'
        ? '⏳ Generando su Informe de Diagnostico Dr. HOA...'
        : '⏳ Generating your Dr. HOA Diagnosis Report...');
      const report = await generateFullReport(session);
      await sendMany(from, splitLong(report));
      await send(from, msgs.consultationOffer(session));
      if (!session.email) {
        session.state = 'AWAITING_EMAIL';
        ss.save(session);
        await send(from, msgs.askEmail(session));
      }
      console.log(`🎯 REPORT: ${session.name} | ${session.communityName} | ${ss.overallScore(session, ASSESSMENT)}`);
      return;
    }

    // ── Async: section analysis ────────────────────────────────
    if (tl === 'analyze' || tl === 'analizar' || tl === '/analyze') {
      const session = ss.get(from);
      if (!session?.activeSectionId) {
        return send(from, session?.lang === 'es'
          ? 'Seleccione una seccion primero (A-E).'
          : 'Please select a section first (A-E).');
      }
      await send(from, session.lang === 'es' ? '⏳ Analizando seccion...' : '⏳ Analyzing section...');
      const report = await generateSectionReport(session, session.activeSectionId);
      await sendMany(from, splitLong(report));
      return;
    }

    // ── Normal routing ─────────────────────────────────────────
    const replies = await route(from, text, mediaInfo);
    await sendMany(from, replies);

  } catch (err) {
    console.error(`❌ [${from}]`, err.message);
    try {
      const s = ss.get(from);
      await send(from, s?.lang === 'es'
        ? '⚠️ Algo salio mal. Por favor intente de nuevo.'
        : '⚠️ Something went wrong. Please try again.');
    } catch (_) {}
  }
});

// ── POST /webhook/status ──────────────────────────────────────────
router.post('/status', (req, res) => {
  console.log(`📬 ${req.body.MessageStatus} → ${req.body.To}`);
  res.sendStatus(200);
});

// ── GET /webhook/leads ────────────────────────────────────────────
// Admin endpoint — view all captured leads
router.get('/leads', (req, res) => {
  const sessions = ss.getAll();
  res.json({
    total: sessions.length,
    leads: sessions
      .filter(s => s.name || s.email)
      .map(s => ({
        name:        s.name,
        community:   s.communityName,
        email:       s.email || null,
        phone:       s.phone.replace(/\d(?=\d{4})/g, '*'),
        role:        s.role,
        lang:        s.lang,
        score:       ss.overallScore(s, ASSESSMENT),
        answered:    ss.answeredCount(s),
        docs:        ss.docCount(s),
        startedAt:   s.startedAt,
        lastActive:  s.lastActive,
      }))
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
  });
});

function splitLong(text, max = 1400) {
  if (text.length <= max) return [text];
  const chunks = [];
  const parts = text.split(/\n(?=\*[^*\n]{2,40}\*)/);
  let cur = '';
  for (const p of parts) {
    if ((cur + '\n' + p).length > max) { if (cur) chunks.push(cur.trim()); cur = p; }
    else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

module.exports = router;

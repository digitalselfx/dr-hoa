const express  = require('express');
const router   = express.Router();
const twilio   = require('twilio');
const { handle } = require('../services/assessmentFlow');
const { send, sendMany } = require('../services/twilio');
const { generateFullReport, generateSectionReport } = require('../services/claude');
const ss    = require('../services/sessionStore');
const msgs  = require('../services/messages');
const brand = require('../data/brand');
const { ASSESSMENT } = require('../data/assessment');

// POST /webhook/whatsapp
router.post('/whatsapp', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
    const valid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      req.headers['x-twilio-signature'],
      `${process.env.BASE_URL}/webhook/whatsapp`,
      req.body
    );
    if (!valid) return res.status(403).send('Forbidden');
  }

  res.status(200).send('');

  const from      = req.body.From || req.body.from;
  const body      = req.body.Body || req.body.body || '';
  const numMedia  = parseInt(req.body.NumMedia || '0');
  const mediaUrl  = req.body.MediaUrl0 || null;
  const mediaMime = req.body.MediaContentType0 || null;

  if (!from) return;

  const text     = body.trim();
  const tl       = text.toLowerCase();
  const hasMedia = numMedia > 0;
  const mediaInfo = hasMedia ? { mediaUrl, mimeType: mediaMime } : null;

  console.log(`📩 [${from}] "${text || '[media]'}"${hasMedia ? ' +file' : ''}`);

  try {
    // ── Full report (async) ───────────────────────────────────
    if (tl === 'report' || tl === 'informe') {
      const session = ss.get(from);
      if (!session || ss.answeredCount(session) === 0) {
        return send(from, session?.lang === 'es'
          ? 'Aún no hay secciones completadas. Elija una sección (A–E) para comenzar.'
          : 'No sections completed yet. Choose a section (A–E) to begin.');
      }
      await send(from, session.lang === 'es'
        ? '⏳ Generando su Informe Completo Dr. HOA...'
        : '⏳ Generating your Complete Dr. HOA Report...');
      const report = await generateFullReport(session);
      await sendMany(from, splitReport(report));
      return;
    }

    // ── Admin: manually confirm payment ──────────────────────
    // Send "confirm:whatsapp:+1XXXXXXXXXX" to unlock a user
    if (tl.startsWith('confirm:')) {
      const targetPhone = text.split(':').slice(1).join(':');
      const targetSession = ss.get(targetPhone);
      if (targetSession) {
        targetSession.unlockedFull = true;
        targetSession.state        = 'MENU';
        ss.save(targetSession);
        await send(targetPhone, msgs.paymentConfirmed(targetSession));
        await send(from, `✅ Unlocked: ${targetPhone}`);
      } else {
        await send(from, `❌ Session not found: ${targetPhone}`);
      }
      return;
    }

    // ── Normal flow ───────────────────────────────────────────
    const replies = await handle(from, text, mediaInfo);
    await sendMany(from, replies);

  } catch (err) {
    console.error(`❌ [${from}]`, err.message);
    try {
      const s = ss.get(from);
      await send(from, s?.lang === 'es'
        ? '⚠️ Algo salió mal. Por favor intente de nuevo.'
        : '⚠️ Something went wrong. Please try again.');
    } catch (_) {}
  }
});

// Status callback
router.post('/status', (req, res) => {
  console.log(`📬 ${req.body.MessageStatus} → ${req.body.To}`);
  res.sendStatus(200);
});

// Admin: view leads
router.get('/leads', (req, res) => {
  const sessions = ss.getAll();
  res.json({
    total: sessions.length,
    leads: sessions
      .filter(s => s.name || s.email)
      .map(s => ({
        name:            s.name,
        community:       s.communityName,
        email:           s.email || null,
        phone:           s.phone.replace(/\d(?=\d{4})/g, '*'),
        lang:            s.lang,
        freeSectionUsed: s.freeSectionUsed,
        unlocked:        s.unlockedFull,
        state:           s.state,
        answered:        ss.answeredCount(s),
        score:           ss.overallScore(s, ASSESSMENT),
        lastActive:      s.lastActive,
      }))
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
  });
});

function splitReport(text, max = 1400) {
  if (text.length <= max) return [text];
  const chunks = [];
  const parts  = text.split(/\n(?=\*[^*\n]{2,40}\*)/);
  let cur = '';
  for (const p of parts) {
    if ((cur + '\n' + p).length > max) { if (cur) chunks.push(cur.trim()); cur = p; }
    else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

module.exports = router;

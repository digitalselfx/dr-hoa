const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP, sectionByLabel } = require('../data/assessment');
const ss   = require('./sessionStore');
const msgs = require('./messages');
const claudeSvc = require('./claude');
const { fetchTwilioMedia, isSupported, fileLabel } = require('./mediaFetcher');

function t(session, en, es) { return session?.lang === 'es' ? es : en; }

function isTrigger(tl, en, es) {
  return tl === en || tl === es || tl === '/'+en || tl === '/'+es;
}

async function handle(phone, text, mediaInfo) {
  const session = ss.getOrCreate(phone);
  const raw = (text || '').trim();
  const tl  = raw.toLowerCase();

  // ── Global commands ───────────────────────────────────────
  if (isTrigger(tl,'reset','reiniciar')) {
    ss.remove(phone);
    const f = ss.getOrCreate(phone);
    ss.save(f);
    return [msgs.welcomeLanguage()];
  }
  if (isTrigger(tl,'help','ayuda'))       return [msgs.helpMessage(session)];
  if (isTrigger(tl,'menu','menú') || isTrigger(tl,'menu','menu')) {
    session.state = 'MENU';
    session.activeSectionId = null;
    session.activeCatId = null;
    ss.save(session);
    return [msgs.mainMenu(session)];
  }
  if (isTrigger(tl,'scores','puntajes'))  return [msgs.mainMenu(session)];
  if (isTrigger(tl,'consult','consulta')) {
    session.consultOffered = true;
    ss.save(session);
    return [msgs.consultationOffer(session)];
  }
  if (isTrigger(tl,'upload','subir'))     return [msgs.uploadPrompt(session)];
  if (isTrigger(tl,'back','atrás') || isTrigger(tl,'back','atras')) return handleBack(session);
  if (isTrigger(tl,'done','listo'))       return handleDone(session);
  if (isTrigger(tl,'report','informe'))   return ['__FULL_REPORT__'];
  if (isTrigger(tl,'analyze','analizar')) return ['__SECTION_REPORT__'];

  // ── STEP 1: Language selection ────────────────────────────
  if (session.state === 'WELCOME' || !session.lang) {
    if (raw === '1') {
      session.lang  = 'en';
      session.state = 'ONBOARD_NAME';
      ss.save(session);
      return [msgs.welcomeAfterLang('en')];
    }
    if (raw === '2') {
      session.lang  = 'es';
      session.state = 'ONBOARD_NAME';
      ss.save(session);
      return [msgs.welcomeAfterLang('es')];
    }
    // Any other message — show language menu
    return [msgs.welcomeLanguage()];
  }

  // ── STEP 2: Collect name ──────────────────────────────────
  if (session.state === 'ONBOARD_NAME') {
    if (!raw) {
      return [t(session,
        'Please tell me your name to continue.',
        'Por favor dígame su nombre para continuar.'
      )];
    }
    session.name = raw
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    session.state = 'ONBOARD_COMMUNITY';
    ss.save(session);
    return [msgs.askCommunity(session)];
  }

  // ── STEP 3: Collect community name ───────────────────────
  if (session.state === 'ONBOARD_COMMUNITY') {
    if (!raw) {
      return [t(session,
        'Please enter the community or HOA name.',
        'Por favor ingrese el nombre de la comunidad o HOA.'
      )];
    }
    session.communityName = raw;
    session.state = 'ONBOARD_ROLE';
    ss.save(session);
    return [msgs.askRole(session)];
  }

  // ── STEP 4: Collect role ──────────────────────────────────
  if (session.state === 'ONBOARD_ROLE') {
    const roleMap = { '1':'board', '2':'manager', '3':'homeowner', '4':'other' };
    session.role  = roleMap[raw] || 'other';
    session.state = 'MENU';
    ss.save(session);
    const greeting = t(session,
      `Welcome, *${session.name}*! 🩺\n\nReady to diagnose *${session.communityName}*.\nWork on any section in any order. Upload documents for evidence.\n\nType *help* at any time for available commands.`,
      `¡Bienvenido/a, *${session.name}*! 🩺\n\nListo para diagnosticar *${session.communityName}*.\nTrabaje en cualquier sección en cualquier orden.\n\nEscriba *ayuda* en cualquier momento para ver los comandos disponibles.`
    );
    return [greeting, msgs.mainMenu(session)];
  }

  // ── Email capture ─────────────────────────────────────────
  if (session.state === 'AWAITING_EMAIL') {
    if (isTrigger(tl,'skip','saltar') || isTrigger(tl,'skip','omitir')) {
      session.state = 'MENU';
      ss.save(session);
      return [msgs.consultationOffer(session)];
    }
    if (raw.includes('@') && raw.includes('.')) {
      session.email = raw.toLowerCase().trim();
      session.state = 'MENU';
      ss.save(session);
      console.log(`🎯 LEAD: ${session.name} | ${session.communityName} | ${session.email}`);
      return [msgs.emailConfirmed(session), msgs.consultationOffer(session)];
    }
    return [t(session,
      'Please enter a valid email address, or type *skip*.',
      'Por favor ingrese un correo válido, o escriba *saltar*.'
    )];
  }

  // ── Section navigation ────────────────────────────────────
  if (/^[a-eA-E]$/.test(raw)) return goToSection(session, raw.toUpperCase());
  const namedSec = sectionByLabel(raw);
  if (namedSec && raw.length > 1) return goToSection(session, namedSec.id);

  // ── Category selection 1-5 ────────────────────────────────
  if (/^[1-5]$/.test(raw) && session.activeSectionId) {
    return goToCategory(session, parseInt(raw) - 1);
  }

  // ── Document upload ───────────────────────────────────────
  if (mediaInfo) return handleDoc(session, raw, mediaInfo);

  // ── Assessment conversation ───────────────────────────────
  if (session.activeCatId && raw) return handleConvo(session, raw);

  // ── Free chat fallback ────────────────────────────────────
  if (raw) {
    try {
      const { reply } = await claudeSvc.chat(session, raw);
      return [reply];
    } catch {
      return [t(session,
        '⚠️ Something went wrong. Please try again.',
        '⚠️ Algo salió mal. Por favor intente de nuevo.'
      )];
    }
  }

  return [msgs.mainMenu(session)];
}

// ── Navigation helpers ────────────────────────────────────────

function goToSection(session, id) {
  const sec = SECTION_MAP[id];
  if (!sec) return [
    session?.lang === 'es'
      ? 'Sección no encontrada. Responda A–E.'
      : 'Section not found. Reply A–E.'
  ];
  session.activeSectionId = id;
  session.activeCatId     = null;
  session.state           = 'SECTION';
  ss.save(session);
  return [msgs.sectionMenu(session, id)];
}

function goToCategory(session, idx) {
  const sec = SECTION_MAP[session.activeSectionId];
  const cat = sec?.categories[idx];
  if (!cat) return [
    session?.lang === 'es'
      ? 'Por favor responda 1–5.'
      : 'Please reply 1–5.'
  ];
  session.activeCatId = cat.id;
  session.state       = 'CATEGORY';
  ss.save(session);
  return [msgs.categoryIntro(cat, session)];
}

function handleBack(session) {
  if (session.activeCatId) {
    session.activeCatId = null;
    ss.save(session);
    return [msgs.sectionMenu(session, session.activeSectionId)];
  }
  if (session.activeSectionId) {
    session.activeSectionId = null;
    session.state           = 'MENU';
    ss.save(session);
    return [msgs.mainMenu(session)];
  }
  return [msgs.mainMenu(session)];
}

function handleDone(session) {
  if (session.activeCatId) {
    session.activeCatId = null;
    ss.save(session);
    return [msgs.sectionMenu(session, session.activeSectionId)];
  }
  session.activeSectionId = null;
  session.state           = 'MENU';
  ss.save(session);
  return [msgs.mainMenu(session)];
}

// ── Document handler ──────────────────────────────────────────

async function handleDoc(session, caption, mediaInfo) {
  const { mimeType, mediaUrl } = mediaInfo;
  const fLabel    = fileLabel(mimeType);
  const sectionId = session.activeSectionId || 'general';
  if (!session.documents[sectionId]) session.documents[sectionId] = [];

  const fetchMsg = session?.lang === 'es'
    ? `📎 ${fLabel} recibido. Analizando...`
    : `📎 ${fLabel} received. Analyzing...`;

  try {
    const payload = await fetchTwilioMedia(mediaUrl, mimeType);

    if (!isSupported(mimeType)) {
      session.documents[sectionId].push({
        fileName: caption || fLabel, mediaUrl, mimeType, uploadedAt: new Date()
      });
      ss.save(session);
      return [session?.lang === 'es'
        ? '📎 Archivo guardado. Para análisis de IA suba un *PDF o imagen* (JPG/PNG).'
        : '📎 File saved. For AI analysis please upload a *PDF or image* (JPG/PNG).'];
    }

    const { analysis, suggestedRatings } = await claudeSvc.analyzeDocument(
      session, payload, caption
    );

    const applied = [];
    for (const r of suggestedRatings) {
      if (!session.answers[r.catId]) session.answers[r.catId] = {};
      if (session.answers[r.catId][r.itemIdx] === undefined) {
        session.answers[r.catId][r.itemIdx] = {
          rating: r.rating, note: `[Doc] ${r.note}`, source: 'document'
        };
        applied.push(r);
      }
    }

    session.documents[sectionId].push({
      fileName: caption || fLabel, mediaUrl, mimeType,
      analysis: analysis.slice(0, 400), uploadedAt: new Date()
    });
    ss.save(session);

    const replies = [fetchMsg, analysis];
    if (applied.length) replies.push(msgs.ratingsApplied(applied, session));
    return replies;

  } catch (err) {
    console.error('Doc error:', err.message);
    return [session?.lang === 'es'
      ? '⚠️ No se pudo procesar el archivo. Intente de nuevo.'
      : "⚠️ Couldn't process that file. Please try again."];
  }
}

// ── Conversation handler ──────────────────────────────────────

async function handleConvo(session, text) {
  const cat = CATEGORY_MAP[session.activeCatId];
  if (!cat) return [session?.lang === 'es'
    ? 'Categoría no encontrada. Escriba *atrás*.'
    : 'Category not found. Type *back*.'];

  // Format "2: 3" → rate item 2 as 3
  const specific = text.match(/^([1-5])\s*[:\-]?\s*([0-3])$/);
  if (specific) {
    const idx    = parseInt(specific[1]) - 1;
    const rating = parseInt(specific[2]);
    if (idx >= 0 && idx < cat.items.length) {
      if (!session.answers[cat.id]) session.answers[cat.id] = {};
      session.answers[cat.id][idx] = { rating, note: '', source: 'manual' };
      ss.save(session);
      return [session?.lang === 'es'
        ? `✅ Calificado ${rating}/3. Continúe o escriba *listo*.`
        : `✅ Rated ${rating}/3. Keep going or type *done*.`];
    }
  }

  // Single digit 0-3 → apply to first unanswered item
  if (/^[0-3]$/.test(text)) {
    const rating = parseInt(text);
    const first  = cat.items.findIndex(
      (_, i) => session.answers[cat.id]?.[i]?.rating === undefined
    );
    if (first >= 0) {
      if (!session.answers[cat.id]) session.answers[cat.id] = {};
      session.answers[cat.id][first] = { rating, note: '', source: 'manual' };
      ss.save(session);
      const item    = cat.items[first];
      const text2   = session.lang === 'es' ? item.es : item.en;
      const remain  = cat.items.filter(
        (_, i) => session.answers[cat.id]?.[i]?.rating === undefined
      ).length;
      const next    = cat.items[first + 1];
      const nextMsg = next && remain > 0
        ? `\n\n${session.lang === 'es' ? 'Siguiente' : 'Next'}: *${session.lang === 'es' ? next.es : next.en}*`
        : '';
      return [`✅ ${text2} → ${rating}/3${nextMsg}`];
    }
  }

  // Natural language → Claude
  try {
    const { reply, extractedRatings } = await claudeSvc.chat(session, text);
    for (const r of extractedRatings) {
      if (!session.answers[r.catId]) session.answers[r.catId] = {};
      if (session.answers[r.catId][r.itemIdx] === undefined) {
        session.answers[r.catId][r.itemIdx] = {
          rating: r.rating, note: r.note, source: 'conversation'
        };
      }
    }
    ss.save(session);
    const replies = [reply];
    if (extractedRatings.length) replies.push(msgs.ratingsApplied(extractedRatings, session));
    return replies;
  } catch {
    return [session?.lang === 'es'
      ? '⚠️ Algo salió mal. Por favor intente de nuevo.'
      : '⚠️ Something went wrong. Please try again.'];
  }
}

module.exports = { handle };

/**
 * Dr. HOA — Conversational Assessment Flow
 *
 * Freemium model:
 * - 1 section completely free
 * - After free section: payment required ($49)
 * - Email collected → payment link sent
 * - No calls, no discounts, no special offers
 */

const { ASSESSMENT, SECTION_MAP } = require('../data/assessment');
const ss     = require('./sessionStore');
const claude = require('./claude');
const msgs   = require('./messages');

function t(session, en, es) {
  return session?.lang === 'es' ? es : en;
}

// One open conversational question per category
const CATEGORY_QUESTIONS = {
  en: {
    A1: "Let's start with board meetings. How often does your board meet, and would you say meetings are well-organized with proper notice and clear agendas?",
    A2: "Tell me about your meeting minutes — are agendas prepared in advance and are decisions clearly documented after each meeting?",
    A3: "How does your HOA handle annual meetings and board elections? Are procedures clear and well-documented?",
    A4: "When the board makes decisions, how are action items tracked and followed up on between meetings?",
    A5: "Does your HOA have active committees? How are they structured and supervised by the board?",
    B1: "How are your HOA records organized — can anyone find a document quickly, or does it depend on one person knowing where things are?",
    B2: "Do you have a document retention policy? How long are records kept and how are older documents archived?",
    B3: "When a homeowner requests records or documents, walk me through that process from request to delivery.",
    B4: "Are all your vendor contracts on file and easy to find? Do you track renewal dates and key terms?",
    B5: "How do you manage insurance policies and governing documents — are they centralized and are expiration dates tracked?",
    C1: "Walk me through how your HOA prepares its annual budget — who is involved, when does it start, and how is it approved?",
    C2: "How are homeowner assessments billed and collected? Is there a clear system for tracking payments?",
    C3: "What happens when a homeowner falls behind on payments? Describe your delinquency process.",
    C4: "How are invoices approved and paid? Is there more than one person involved in that process?",
    C5: "Who handles the finances day to day and who oversees them? How does the board stay informed?",
    D1: "Tell me about your vendor relationships — do you have written contracts with all vendors and track when they expire?",
    D2: "Does your HOA have a preventive maintenance schedule, or is maintenance mostly reactive when something breaks?",
    D3: "When a resident submits a maintenance request, how is it tracked from submission to completion?",
    D4: "When you need a new vendor or major repair, do you get multiple bids? How are those decisions documented?",
    D5: "How do you track important dates like contract renewals, insurance expirations, and required inspections?",
    E1: "How does your HOA handle rule violations — is there a defined process with standard notices and consistent enforcement?",
    E2: "When a homeowner submits an architectural or improvement request, what is the review and approval process?",
    E3: "How quickly does your HOA respond to homeowner inquiries, and who is responsible for following up?",
    E4: "What happens when a new owner moves in — do they receive a welcome packet with rules and important information?",
    E5: "Do you communicate with residents in both English and Spanish? How do you handle language barriers with vendors or residents?",
  },
  es: {
    A1: "Comencemos con las reuniones de la junta. ¿Con qué frecuencia se reúne y diría que están bien organizadas con aviso previo y agendas claras?",
    A2: "Hábleme sobre las actas — ¿se preparan las agendas con anticipación y se documentan claramente las decisiones?",
    A3: "¿Cómo maneja su HOA las reuniones anuales y las elecciones? ¿Los procedimientos son claros y están documentados?",
    A4: "Cuando la junta toma decisiones, ¿cómo se rastrean y se da seguimiento a los puntos de acción entre reuniones?",
    A5: "¿Su HOA tiene comités activos? ¿Cómo están estructurados y supervisados por la junta?",
    B1: "¿Cómo están organizados los registros de su HOA — cualquiera puede encontrar un documento rápidamente, o depende de que una persona sepa dónde están?",
    B2: "¿Tienen una política de retención de documentos? ¿Por cuánto tiempo se guardan los registros?",
    B3: "Cuando un propietario solicita registros, descríbame ese proceso desde la solicitud hasta la entrega.",
    B4: "¿Todos sus contratos de proveedores están archivados y son fáciles de encontrar? ¿Rastrean las fechas de renovación?",
    B5: "¿Cómo administran las pólizas de seguro y documentos de gobierno — están centralizados y rastrean los vencimientos?",
    C1: "Descríbame cómo prepara su HOA el presupuesto anual — ¿quién participa, cuándo comienza y cómo se aprueba?",
    C2: "¿Cómo se facturan y cobran las cuotas? ¿Hay un sistema claro para rastrear los pagos?",
    C3: "¿Qué sucede cuando un propietario se atrasa en pagos? Descríbame su proceso de morosidad.",
    C4: "¿Cómo se aprueban y pagan las facturas? ¿Hay más de una persona involucrada?",
    C5: "¿Quién maneja las finanzas día a día y quién las supervisa? ¿Cómo se mantiene informada la junta?",
    D1: "Hábleme sobre sus proveedores — ¿tienen contratos escritos con todos y rastrean cuándo vencen?",
    D2: "¿Su HOA tiene un programa de mantenimiento preventivo, o el mantenimiento es principalmente reactivo?",
    D3: "Cuando un residente envía una solicitud de mantenimiento, ¿cómo se rastrea desde la presentación hasta la finalización?",
    D4: "Cuando necesitan un nuevo proveedor o reparación importante, ¿obtienen múltiples cotizaciones? ¿Cómo se documentan?",
    D5: "¿Cómo rastrean fechas importantes como renovaciones de contratos, vencimientos de seguros e inspecciones?",
    E1: "¿Cómo maneja su HOA las violaciones de reglas — hay un proceso definido con avisos estándar y aplicación consistente?",
    E2: "Cuando un propietario presenta una solicitud arquitectónica, ¿cuál es el proceso de revisión y aprobación?",
    E3: "¿Con qué rapidez responde su HOA a las consultas de propietarios y quién es responsable del seguimiento?",
    E4: "¿Qué sucede cuando un nuevo propietario se muda — recibe un paquete de bienvenida con reglas e información?",
    E5: "¿Se comunican con los residentes en inglés y español? ¿Cómo manejan las barreras de idioma?",
  },
};

async function handle(phone, text, mediaInfo) {
  const session = ss.getOrCreate(phone);
  const raw = (text || '').trim();
  const tl  = raw.toLowerCase();

  // ── Global commands ───────────────────────────────────────
  if (tl === 'reset' || tl === 'reiniciar') {
    ss.remove(phone);
    return [msgs.welcomeLanguage()];
  }
  if (tl === 'help' || tl === 'ayuda')     return [msgs.helpMessage(session)];
  if (tl === 'menu' || tl === 'menú') {
    session.state           = 'MENU';
    session.activeSectionId = null;
    session.activeCatIdx    = 0;
    ss.save(session);
    return [msgs.mainMenu(session)];
  }
  if (tl === 'report' || tl === 'informe') return ['__FULL_REPORT__'];

  // ── Language selection ────────────────────────────────────
  if (session.state === 'WELCOME' || !session.lang) {
    if (raw === '1') { session.lang = 'en'; session.state = 'ONBOARD_NAME'; ss.save(session); return [msgs.welcomeAfterLang('en')]; }
    if (raw === '2') { session.lang = 'es'; session.state = 'ONBOARD_NAME'; ss.save(session); return [msgs.welcomeAfterLang('es')]; }
    return [msgs.welcomeLanguage()];
  }

  // ── Onboarding: name ──────────────────────────────────────
  if (session.state === 'ONBOARD_NAME') {
    if (!raw) return [t(session, 'What is your name?', '¿Cuál es su nombre?')];
    session.name  = raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    session.state = 'ONBOARD_COMMUNITY';
    ss.save(session);
    return [msgs.askCommunity(session)];
  }

  // ── Onboarding: community ─────────────────────────────────
  if (session.state === 'ONBOARD_COMMUNITY') {
    if (!raw) return [t(session, 'Please enter the community name.', 'Por favor ingrese el nombre de la comunidad.')];
    session.communityName = raw;
    session.state         = 'ONBOARD_ROLE';
    ss.save(session);
    return [msgs.askRole(session)];
  }

  // ── Onboarding: role ──────────────────────────────────────
  if (session.state === 'ONBOARD_ROLE') {
    const roleMap = { '1':'board','2':'manager','3':'homeowner','4':'other' };
    session.role  = roleMap[raw] || 'other';
    session.state = 'MENU';
    ss.save(session);
    const greeting = t(session,
      `Welcome, *${session.name}*! 🩺\n\nReady to diagnose *${session.communityName}*.\n\nJust answer my questions naturally — I handle the analysis. You get *1 section free* to start.`,
      `¡Bienvenido/a, *${session.name}*! 🩺\n\nListo para diagnosticar *${session.communityName}*.\n\nResponda mis preguntas naturalmente — yo me encargo del análisis. Tiene *1 sección gratis* para empezar.`
    );
    return [greeting, msgs.mainMenu(session)];
  }

  // ── Email capture (payment flow) ──────────────────────────
  if (session.state === 'AWAITING_EMAIL') {
    if (raw.includes('@') && raw.includes('.')) {
      session.email = raw.toLowerCase().trim();
      session.state = 'PENDING_PAYMENT';
      ss.save(session);
      console.log(`🎯 LEAD: ${session.name} | ${session.communityName} | ${session.email}`);
      return [
        msgs.emailConfirmed(session),
        msgs.paymentLinkMessage(session),
      ];
    }
    return [t(session,
      'Please send a valid email address to receive the payment link.',
      'Por favor envíe una dirección de correo válida para recibir el enlace de pago.'
    )];
  }

  // ── Pending payment state ─────────────────────────────────
  if (session.state === 'PENDING_PAYMENT') {
    // Admin can unlock manually by texting: unlock:PHONE
    if (tl.startsWith('unlock:') || tl === 'paid' || tl === 'pagado') {
      session.unlockedFull = true;
      session.state        = 'MENU';
      ss.save(session);
      return [msgs.paymentConfirmed(session)];
    }
    return [t(session,
      `⏳ We are waiting for payment confirmation.\n\nIf you have already paid, please wait a moment. Questions? Email us at ${require('../data/brand').companyEmail}`,
      `⏳ Estamos esperando la confirmación del pago.\n\nSi ya pagó, por favor espere un momento. ¿Preguntas? Escríbanos a ${require('../data/brand').companyEmail}`
    )];
  }

  // ── Section selection ─────────────────────────────────────
  if (/^[a-eA-E]$/.test(raw)) return startSection(session, raw.toUpperCase());

  // ── Conversational assessment ─────────────────────────────
  if (session.state === 'ASSESSING') return handleAnswer(session, raw);

  // ── Fallback chat ─────────────────────────────────────────
  if (raw) {
    try {
      const { reply } = await claude.chat(session, raw);
      return [reply];
    } catch {
      return [msgs.mainMenu(session)];
    }
  }

  return [msgs.mainMenu(session)];
}

// ── Start a section ───────────────────────────────────────────────

function startSection(session, sectionId) {
  const section = SECTION_MAP[sectionId];
  if (!section) return [t(session, 'Section not found. Reply A–E.', 'Sección no encontrada. Responda A–E.')];

  // Freemium gate
  const isNewSection = !session.freeSectionUsed || session.freeSectionUsed === sectionId;
  if (!session.unlockedFull && !isNewSection) {
    session.state = 'AWAITING_EMAIL';
    ss.save(session);
    return [msgs.lockedMessage(session)];
  }

  // Mark free section
  if (!session.freeSectionUsed) session.freeSectionUsed = sectionId;

  session.activeSectionId = sectionId;
  session.activeCatIdx    = 0;
  session.state           = 'ASSESSING';
  ss.save(session);

  const label = secLabel(section, session.lang);
  const total = section.categories.length;

  const intro = t(session,
    `${section.emoji} *${label}*\n\nI will ask you ${total} questions about this area. Just answer naturally.\n\n*Question 1 of ${total}:*\n\n`,
    `${section.emoji} *${label}*\n\nLe haré ${total} preguntas sobre esta área. Responda naturalmente.\n\n*Pregunta 1 de ${total}:*\n\n`
  );

  return [intro + getCategoryQuestion(session, sectionId, 0)];
}

// ── Handle conversational answer ─────────────────────────────────

async function handleAnswer(session, text) {
  const sectionId = session.activeSectionId;
  const section   = SECTION_MAP[sectionId];
  const catIdx    = session.activeCatIdx || 0;
  const cat       = section.categories[catIdx];

  if (!cat) {
    session.state = 'MENU';
    ss.save(session);
    return [msgs.mainMenu(session)];
  }

  try {
    const { ratings, summary } = await claude.inferRatings(session, cat, text);

    // Save ratings silently
    if (!session.answers[cat.id]) session.answers[cat.id] = {};
    ratings.forEach((r, i) => {
      session.answers[cat.id][i] = { rating: r.rating, note: r.note, source: 'conversation' };
    });

    session.activeCatIdx = catIdx + 1;
    ss.save(session);

    const replies = [];

    // Brief acknowledgment
    replies.push(t(session, `Got it. ${summary}`, `Entendido. ${summary}`));

    // More questions?
    if (session.activeCatIdx < section.categories.length) {
      const qNum  = session.activeCatIdx + 1;
      const total = section.categories.length;
      const nextQ = getCategoryQuestion(session, sectionId, session.activeCatIdx);
      replies.push(
        t(session,
          `*Question ${qNum} of ${total}:*\n\n${nextQ}`,
          `*Pregunta ${qNum} de ${total}:*\n\n${nextQ}`
        )
      );
    } else {
      // All answered — generate report
      replies.push(t(session,
        '✅ All questions answered. Analyzing your responses...',
        '✅ Todas las preguntas respondidas. Analizando sus respuestas...'
      ));
      session.state = 'MENU';
      ss.save(session);

      const report = await claude.generateConversationalReport(session, sectionId);
      replies.push(report);

      // After report — payment invite (if not already unlocked)
      if (!session.unlockedFull) {
        session.state = 'AWAITING_EMAIL';
        ss.save(session);
        replies.push(msgs.freeSessionComplete(session));
      } else {
        replies.push(msgs.continueAssessment(session));
      }
    }

    return replies;

  } catch (err) {
    console.error('handleAnswer error:', err.message);
    // Never show error to user — just ask again gently
    return [t(session,
      'Could you tell me a bit more about that? Any detail helps.',
      '¿Podría contarme un poco más sobre eso? Cualquier detalle ayuda.'
    )];
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function getCategoryQuestion(session, sectionId, catIdx) {
  const section   = SECTION_MAP[sectionId];
  const cat       = section.categories[catIdx];
  const lang      = session.lang || 'en';
  const questions = CATEGORY_QUESTIONS[lang];
  return questions[cat.id] || t(session,
    `Tell me about *${cat.label}* in your HOA. How does it currently work?`,
    `Cuénteme sobre *${cat.labelEs || cat.label}* en su HOA. ¿Cómo funciona actualmente?`
  );
}

function secLabel(s, lang) {
  if (lang === 'es') return s.labelEs || s.es || s.label || s.en || s.id;
  return s.label || s.en || s.id;
}

module.exports = { handle, CATEGORY_QUESTIONS };

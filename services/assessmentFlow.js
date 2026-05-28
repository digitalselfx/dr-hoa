/**
 * Dr. HOA — Conversational Assessment Flow
 *
 * Flow per section:
 * 1. User picks section (A–E)
 * 2. Dr. HOA asks ONE friendly open question per category (5 questions total)
 * 3. Claude infers all 5 item ratings from each answer silently
 * 4. After all 5 categories → immediate findings + recommendations
 * 5. Invite user to send email for full assessment package (50% discount)
 *
 * Freemium: 1 section free, then email gate
 */

const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss     = require('./sessionStore');
const claude = require('./claude');
const msgs   = require('./messages');
const brand  = require('../data/brand');

function t(session, en, es) {
  return session?.lang === 'es' ? es : en;
}

// One open question per category — friendly and conversational
const CATEGORY_QUESTIONS = {
  en: {
    // Governance
    A1: "Let's start with your board meetings. How often does your board meet, and would you say meetings are well-organized with proper notice and clear agendas?",
    A2: "Tell me about your meeting minutes — are agendas prepared ahead of time and are decisions documented clearly after each meeting?",
    A3: "How does your HOA handle annual meetings and board elections? Are procedures clear and well-documented?",
    A4: "When the board makes decisions, how are action items tracked and followed up on between meetings?",
    A5: "Does your HOA have committees like architectural review or social? How are they structured and supervised by the board?",
    // Records & Admin
    B1: "How are your HOA's official records organized — do you have a system where anyone can find a document quickly, or does it depend on one person knowing where things are?",
    B2: "Do you have a document retention policy? How long are records kept and how are older documents archived?",
    B3: "When a homeowner requests records or documents, walk me through how that process works from request to delivery.",
    B4: "Are all your vendor contracts on file and easy to find? Do you track renewal dates and key terms?",
    B5: "How do you manage insurance policies and critical governing documents — are they centralized and are expiration dates tracked?",
    // Financial
    C1: "Walk me through how your HOA prepares its annual budget — who is involved, when does it start, and how is it approved?",
    C2: "How are homeowner assessments billed and collected? Is there a clear system for tracking who has paid and who hasn't?",
    C3: "What happens when a homeowner falls behind on payments? Describe your delinquency process from first notice to legal action.",
    C4: "How are invoices approved and paid? Is there more than one person involved in that process?",
    C5: "Who handles the finances day to day, and who oversees them? How does the board stay informed about the financial health of the HOA?",
    // Maintenance
    D1: "Tell me about your vendor relationships — do you have written contracts with all vendors and do you track when they expire?",
    D2: "Does your HOA have a preventive maintenance schedule, or is maintenance mostly reactive when something breaks?",
    D3: "When a resident submits a maintenance request, how is it tracked from submission to completion?",
    D4: "When you need a new vendor or a major repair, do you get multiple bids? How are those decisions documented?",
    D5: "How do you track important dates like contract renewals, insurance expirations, and required inspections — is there a calendar system with reminders?",
    // Resident Communications
    E1: "How does your HOA handle rule violations — is there a defined process with standard notices and consistent enforcement?",
    E2: "When a homeowner submits an architectural or improvement request, what is the review and approval process?",
    E3: "How quickly does your HOA respond to homeowner inquiries and requests, and who is responsible for following up?",
    E4: "What happens when a new owner moves in — do they receive a welcome packet with rules, contacts, and important information?",
    E5: "Do you communicate with residents in both English and Spanish, and how do you handle language barriers with vendors or residents?",
  },
  es: {
    // Gobernanza
    A1: "Comencemos con las reuniones de la junta. ¿Con qué frecuencia se reúne su junta y diría que las reuniones están bien organizadas con aviso previo y agendas claras?",
    A2: "Hábleme sobre las actas de sus reuniones — ¿se preparan las agendas con anticipación y se documentan claramente las decisiones después de cada reunión?",
    A3: "¿Cómo maneja su HOA las reuniones anuales y las elecciones de la junta? ¿Los procedimientos son claros y están bien documentados?",
    A4: "Cuando la junta toma decisiones, ¿cómo se rastrean y se da seguimiento a los puntos de acción entre reuniones?",
    A5: "¿Su HOA tiene comités como revisión arquitectónica o social? ¿Cómo están estructurados y supervisados por la junta?",
    // Registros y Admin
    B1: "¿Cómo están organizados los registros oficiales de su HOA — tienen un sistema donde cualquiera puede encontrar un documento rápidamente, o depende de que una persona sepa dónde están las cosas?",
    B2: "¿Tienen una política de retención de documentos? ¿Por cuánto tiempo se guardan los registros y cómo se archivan los documentos más antiguos?",
    B3: "Cuando un propietario solicita registros o documentos, descríbame cómo funciona ese proceso desde la solicitud hasta la entrega.",
    B4: "¿Todos sus contratos de proveedores están archivados y son fáciles de encontrar? ¿Rastrean las fechas de renovación y los términos clave?",
    B5: "¿Cómo administran las pólizas de seguro y los documentos de gobierno críticos — están centralizados y se rastrean las fechas de vencimiento?",
    // Finanzas
    C1: "Descríbame cómo prepara su HOA el presupuesto anual — ¿quién participa, cuándo comienza y cómo se aprueba?",
    C2: "¿Cómo se facturan y cobran las cuotas de los propietarios? ¿Hay un sistema claro para rastrear quién ha pagado y quién no?",
    C3: "¿Qué sucede cuando un propietario se atrasa en los pagos? Descríbame su proceso de morosidad desde el primer aviso hasta la acción legal.",
    C4: "¿Cómo se aprueban y pagan las facturas? ¿Hay más de una persona involucrada en ese proceso?",
    C5: "¿Quién maneja las finanzas día a día y quién las supervisa? ¿Cómo se mantiene informada la junta sobre la salud financiera de la HOA?",
    // Mantenimiento
    D1: "Hábleme sobre sus relaciones con proveedores — ¿tienen contratos escritos con todos los proveedores y rastrean cuándo vencen?",
    D2: "¿Su HOA tiene un programa de mantenimiento preventivo, o el mantenimiento es principalmente reactivo cuando algo se rompe?",
    D3: "Cuando un residente envía una solicitud de mantenimiento, ¿cómo se rastrea desde la presentación hasta la finalización?",
    D4: "Cuando necesitan un nuevo proveedor o una reparación importante, ¿obtienen múltiples cotizaciones? ¿Cómo se documentan esas decisiones?",
    D5: "¿Cómo rastrean fechas importantes como renovaciones de contratos, vencimientos de seguros e inspecciones requeridas — tienen un sistema de calendario con recordatorios?",
    // Comunicación
    E1: "¿Cómo maneja su HOA las violaciones de reglas — hay un proceso definido con avisos estándar y aplicación consistente?",
    E2: "Cuando un propietario presenta una solicitud arquitectónica o de mejora, ¿cuál es el proceso de revisión y aprobación?",
    E3: "¿Con qué rapidez responde su HOA a las consultas y solicitudes de los propietarios, y quién es responsable del seguimiento?",
    E4: "¿Qué sucede cuando un nuevo propietario se muda — reciben un paquete de bienvenida con reglas, contactos e información importante?",
    E5: "¿Se comunican con los residentes en inglés y español, y cómo manejan las barreras de idioma con proveedores o residentes?",
  },
};

async function handle(phone, text, mediaInfo) {
  const session = ss.getOrCreate(phone);
  const raw = (text || '').trim();
  const tl  = raw.toLowerCase();

  // ── Global resets / help ────────────────────────────────────
  if (tl === 'reset' || tl === 'reiniciar') {
    ss.remove(phone);
    return [msgs.welcomeLanguage()];
  }
  if (tl === 'help' || tl === 'ayuda') return [msgs.helpMessage(session)];
  if (tl === 'menu' || tl === 'menú')  {
    session.state = 'MENU';
    session.activeSectionId = null;
    session.activeCatIdx = 0;
    ss.save(session);
    return [msgs.mainMenu(session)];
  }

  // ── Language selection ──────────────────────────────────────
  if (session.state === 'WELCOME' || !session.lang) {
    if (raw === '1') { session.lang = 'en'; session.state = 'ONBOARD_NAME'; ss.save(session); return [msgs.welcomeAfterLang('en')]; }
    if (raw === '2') { session.lang = 'es'; session.state = 'ONBOARD_NAME'; ss.save(session); return [msgs.welcomeAfterLang('es')]; }
    return [msgs.welcomeLanguage()];
  }

  // ── Onboarding ──────────────────────────────────────────────
  if (session.state === 'ONBOARD_NAME') {
    if (!raw) return [t(session, 'What is your name?', '¿Cuál es su nombre?')];
    session.name  = raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    session.state = 'ONBOARD_COMMUNITY';
    ss.save(session);
    return [msgs.askCommunity(session)];
  }

  if (session.state === 'ONBOARD_COMMUNITY') {
    if (!raw) return [t(session, 'Please enter the community name.', 'Por favor ingrese el nombre de la comunidad.')];
    session.communityName = raw;
    session.state         = 'ONBOARD_ROLE';
    ss.save(session);
    return [msgs.askRole(session)];
  }

  if (session.state === 'ONBOARD_ROLE') {
    const roleMap = { '1':'board','2':'manager','3':'homeowner','4':'other' };
    session.role  = roleMap[raw] || 'other';
    session.state = 'MENU';
    ss.save(session);
    const greeting = t(session,
      `Welcome, *${session.name}*! 🩺\n\nI'm ready to help you diagnose *${session.communityName}*.\n\nI'll ask you a few simple questions about each area. Just answer naturally — no forms or scores needed.\n\nYou get *1 full section free* to try Dr. HOA.`,
      `¡Bienvenido/a, *${session.name}*! 🩺\n\nEstoy listo para ayudarle a diagnosticar *${session.communityName}*.\n\nLe haré algunas preguntas simples sobre cada área. Responda naturalmente — sin formularios ni puntuaciones.\n\nTiene *1 sección completa gratis* para probar Dr. HOA.`
    );
    return [greeting, msgs.mainMenu(session)];
  }

  // ── Email capture (after free section) ─────────────────────
  if (session.state === 'AWAITING_EMAIL') {
    if (tl === 'skip' || tl === 'saltar') {
      session.state = 'MENU';
      ss.save(session);
      return [msgs.mainMenu(session)];
    }
    if (raw.includes('@') && raw.includes('.')) {
      session.email = raw.toLowerCase().trim();
      session.state = 'MENU';
      ss.save(session);
      console.log(`🎯 LEAD: ${session.name} | ${session.communityName} | ${session.email}`);
      return [msgs.emailConfirmed(session), msgs.discountOffer(session)];
    }
    return [t(session,
      'Please enter a valid email or type *skip* to continue.',
      'Por favor ingrese un correo válido o escriba *saltar* para continuar.'
    )];
  }

  // ── Section selection ───────────────────────────────────────
  if (/^[a-eA-E]$/.test(raw)) return startSection(session, raw.toUpperCase());

  // ── Conversational assessment ───────────────────────────────
  if (session.state === 'ASSESSING') return handleAnswer(session, raw);

  // ── Locked section (freemium gate) ─────────────────────────
  if (session.state === 'LOCKED') {
    return [msgs.lockedMessage(session)];
  }

  // ── Fallback ────────────────────────────────────────────────
  if (raw) {
    try {
      const { reply } = await claude.chat(session, raw);
      return [reply];
    } catch {
      return [t(session, '⚠️ Something went wrong. Please try again.', '⚠️ Algo salió mal. Intente de nuevo.')];
    }
  }

  return [msgs.mainMenu(session)];
}

// ── Start a section ─────────────────────────────────────────────

function startSection(session, sectionId) {
  const section = SECTION_MAP[sectionId];
  if (!section) return [t(session, 'Section not found. Reply A–E.', 'Sección no encontrada. Responda A–E.')];

  // Freemium gate — if user already used their free section
  if (!session.unlockedFull && session.freeSectionUsed && session.freeSectionUsed !== sectionId) {
    session.state = 'LOCKED';
    ss.save(session);
    return [msgs.lockedMessage(session)];
  }

  // Mark this as their free section
  if (!session.freeSectionUsed) session.freeSectionUsed = sectionId;

  session.activeSectionId = sectionId;
  session.activeCatIdx    = 0;
  session.state           = 'ASSESSING';
  ss.save(session);

  const label = secLabel(section, session.lang);
  const intro = t(session,
    `${section.emoji} *${label}*\n\nGreat choice. I'll ask you ${section.categories.length} questions about this area.\n\nJust answer in your own words — I'll take care of the analysis. Ready? Here's the first one:\n\n`,
    `${section.emoji} *${label}*\n\nExcelente elección. Le haré ${section.categories.length} preguntas sobre esta área.\n\nResponda con sus propias palabras — yo me encargo del análisis. ¿Listo? Aquí va la primera:\n\n`
  );

  const question = getCategoryQuestion(session, sectionId, 0);
  return [intro + question];
}

// ── Handle a conversational answer ─────────────────────────────

async function handleAnswer(session, text) {
  const sectionId = session.activeSectionId;
  const section   = SECTION_MAP[sectionId];
  const catIdx    = session.activeCatIdx || 0;
  const cat       = section.categories[catIdx];

  if (!cat) return [msgs.mainMenu(session)];

  // Ask Claude to infer ratings from the answer
  try {
    const { ratings, summary } = await claude.inferRatings(session, cat, text);

    // Save inferred ratings silently
    if (!session.answers[cat.id]) session.answers[cat.id] = {};
    ratings.forEach((r, i) => {
      session.answers[cat.id][i] = { rating: r.rating, note: r.note, source: 'conversation' };
    });

    // Move to next category
    session.activeCatIdx = catIdx + 1;
    ss.save(session);

    const replies = [];

    // Show brief acknowledgment
    const ack = t(session,
      `Got it. ${summary}`,
      `Entendido. ${summary}`
    );
    replies.push(ack);

    // More categories to go?
    if (session.activeCatIdx < section.categories.length) {
      const nextQ = getCategoryQuestion(session, sectionId, session.activeCatIdx);
      const progress = t(session,
        `\n*Question ${session.activeCatIdx + 1} of ${section.categories.length}:*\n\n${nextQ}`,
        `\n*Pregunta ${session.activeCatIdx + 1} de ${section.categories.length}:*\n\n${nextQ}`
      );
      replies.push(progress);
    } else {
      // All categories done — generate section report
      replies.push(t(session,
        '✅ All questions answered. Analyzing your responses...',
        '✅ Todas las preguntas respondidas. Analizando sus respuestas...'
      ));
      session.state = 'MENU';
      ss.save(session);

      // Generate and return findings + recommendations
      const report = await claude.generateConversationalReport(session, sectionId);
      replies.push(report);

      // After report — invite to unlock or get full package
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
    return [t(session,
      '⚠️ I had trouble analyzing that. Could you give me a bit more detail?',
      '⚠️ Tuve dificultades para analizar eso. ¿Podría darme un poco más de detalle?'
    )];
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function getCategoryQuestion(session, sectionId, catIdx) {
  const section = SECTION_MAP[sectionId];
  const cat     = section.categories[catIdx];
  const lang    = session.lang || 'en';
  const questions = CATEGORY_QUESTIONS[lang];
  return questions[cat.id] || (lang === 'es'
    ? `Cuénteme sobre *${cat.labelEs || cat.label}* en su HOA. ¿Cómo funciona actualmente?`
    : `Tell me about *${cat.label}* in your HOA. How does it currently work?`
  );
}

function secLabel(s, lang) {
  if (lang === 'es') return s.labelEs || s.es || s.label || s.en || s.id;
  return s.label || s.en || s.id;
}

module.exports = { handle, CATEGORY_QUESTIONS };

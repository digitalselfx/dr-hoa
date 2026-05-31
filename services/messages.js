const brand = require('../data/brand');
const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss = require('./sessionStore');

function t(session, en, es) { return session?.lang === 'es' ? es : en; }

function secLabel(s, lang) {
  if (lang === 'es') return s.labelEs || s.es || s.label || s.en || s.id;
  return s.label || s.en || s.id;
}

// ── Welcome / onboarding ──────────────────────────────────────────

function welcomeLanguage() {
  return (
    `🩺 *Dr. HOA*\n` +
    `_Your HOA Health Specialist · Su Especialista en Salud HOA_\n\n` +
    `Welcome! / ¡Bienvenido!\n\n` +
    `*1* — English 🇺🇸\n` +
    `*2* — Español 🇪🇸`
  );
}

function welcomeAfterLang(lang) {
  return lang === 'es'
    ? (
      `🩺 *Dr. HOA* — Su Especialista en Salud HOA\n\n` +
      `¡Hola! Soy Dr. HOA. Realizo diagnósticos operativos para HOAs de forma conversacional — sin formularios ni puntuaciones complicadas.\n\n` +
      `Solo responda mis preguntas con sus propias palabras y yo me encargo del análisis.\n\n` +
      `Tiene *1 sección completamente gratis* para conocer cómo funciona.\n\n` +
      `¿Cuál es su nombre?`
    )
    : (
      `🩺 *Dr. HOA* — Your HOA Health Specialist\n\n` +
      `Hello! I'm Dr. HOA. I run operational diagnostics for HOAs through conversation — no forms, no complicated scores.\n\n` +
      `Just answer my questions in your own words and I'll take care of the analysis.\n\n` +
      `You get *1 section completely free* to see how it works.\n\n` +
      `What's your name?`
    );
}

function askCommunity(session) {
  return t(session,
    `Nice to meet you, *${session.name}*! 👋\n\nWhat is the name of the HOA or community you are assessing?`,
    `¡Mucho gusto, *${session.name}*! 👋\n\n¿Cuál es el nombre de la HOA o comunidad que está evaluando?`
  );
}

function askRole(session) {
  return t(session,
    `Got it — *${session.communityName}*. What is your role?\n\n*1* — Board Member\n*2* — Property Manager\n*3* — Homeowner\n*4* — Other`,
    `Entendido — *${session.communityName}*. ¿Cuál es su rol?\n\n*1* — Miembro de Junta\n*2* — Administrador\n*3* — Propietario\n*4* — Otro`
  );
}

// ── Main menu ─────────────────────────────────────────────────────

function mainMenu(session) {
  const overall  = ss.overallScore(session, ASSESSMENT);
  const answered = ss.answeredCount(session);

  const sLines = ASSESSMENT.map(s => {
    const score  = ss.sectionScore(session, s.id, ASSESSMENT);
    const label  = secLabel(s, session.lang);
    const done   = score !== null;
    const locked = !session.unlockedFull
      && session.freeSectionUsed
      && session.freeSectionUsed !== s.id;
    return `${s.emoji} *${s.id}.* ${label}${done ? ' ✅' : locked ? ' 🔒' : ''}`;
  }).join('\n');

  const header = `🩺 *Dr. HOA*${session.communityName ? ` — ${session.communityName}` : ''}\n`;

  const scoreBlock = overall !== null
    ? t(session, `Health score: *${overall}/3*\n`, `Puntaje de salud: *${overall}/3*\n`)
    : '';

  const nav = t(session,
    `\nReply *A*, *B*, *C*, *D* or *E* to begin a section.\n_1 section free · Full evaluation ${brand.packagePrice}_`,
    `\nResponda *A*, *B*, *C*, *D* o *E* para comenzar una sección.\n_1 sección gratis · Evaluación completa ${brand.packagePrice}_`
  );

  return header + scoreBlock + '\n' + sLines + nav;
}

// ── Locked — payment required ─────────────────────────────────────

function lockedMessage(session) {
  return t(session,
    (
      `🔒 *This section requires the full evaluation package.*\n\n` +
      `You have completed your free section. To continue with all 5 sections, purchase the *${brand.packageName}*.\n\n` +
      `A payment link and full package proposal will be sent to your email.\n\n` +
      `📧 Please send your email address to receive the payment link.`
    ),
    (
      `🔒 *Esta sección requiere el paquete de evaluación completa.*\n\n` +
      `Ha completado su sección gratuita. Para continuar con las 5 secciones, adquiera el *${brand.packageName}*.\n\n` +
      `Un enlace de pago y la propuesta completa del paquete serán enviados a su correo.\n\n` +
      `📧 Por favor envíe su correo electrónico para recibir el enlace de pago.`
    )
  );
}

// ── After free section — payment invite ───────────────────────────

function freeSessionComplete(session) {
  const perks = brand.packageIncludes[session.lang || 'en'];
  const perkLines = perks.map(p => `• ${p}`).join('\n');

  return t(session,
    (
      `━━━━━━━━━━━━━━━━━\n` +
      `🩺 *Want the complete diagnosis?*\n\n` +
      `You have just seen a sample of what Dr. HOA can do. The *${brand.packageName}* covers all 5 areas:\n\n` +
      `${perkLines}\n\n` +
      `*Price: ${brand.packagePrice}*\n\n` +
      `📧 Send your email and we will send you the payment link and full package proposal.\n` +
      `━━━━━━━━━━━━━━━━━`
    ),
    (
      `━━━━━━━━━━━━━━━━━\n` +
      `🩺 *¿Quiere el diagnóstico completo?*\n\n` +
      `Acaba de ver una muestra de lo que Dr. HOA puede hacer. El *${brand.packageName}* cubre las 5 áreas:\n\n` +
      `${perkLines}\n\n` +
      `*Precio: ${brand.packagePrice}*\n\n` +
      `📧 Envíe su correo y le enviaremos el enlace de pago y la propuesta completa del paquete.\n` +
      `━━━━━━━━━━━━━━━━━`
    )
  );
}

// ── Email captured — send payment link ───────────────────────────

function emailCaptured(session) {
  return t(session,
    (
      `✅ Got it! We will send the payment link and package proposal to *${session.email}* shortly.\n\n` +
      `Once payment is confirmed, you will have full access to all 5 sections.\n\n` +
      `Questions? Email us at ${brand.companyEmail}`
    ),
    (
      `✅ ¡Listo! Enviaremos el enlace de pago y la propuesta del paquete a *${session.email}* en breve.\n\n` +
      `Una vez confirmado el pago, tendrá acceso completo a las 5 secciones.\n\n` +
      `¿Preguntas? Escríbanos a ${brand.companyEmail}`
    )
  );
}

// ── Payment link message (sent after email captured) ─────────────

function paymentLinkMessage(session) {
  const perks = brand.packageIncludes[session.lang || 'en'];
  const perkLines = perks.map(p => `• ${p}`).join('\n');

  return t(session,
    (
      `🩺 *${brand.packageName}*\n\n` +
      `${perkLines}\n\n` +
      `*Price: ${brand.packagePrice} USD*\n\n` +
      `👉 *Pay here:* ${brand.stripeLink}\n\n` +
      `After payment is confirmed your full evaluation will begin immediately.\n\n` +
      `_${brand.companyEmail} · ${brand.companyWebsite}_`
    ),
    (
      `🩺 *${brand.packageName}*\n\n` +
      `${perkLines}\n\n` +
      `*Precio: ${brand.packagePrice} USD*\n\n` +
      `👉 *Pagar aquí:* ${brand.stripeLink}\n\n` +
      `Tras confirmar el pago su evaluación completa comenzará de inmediato.\n\n` +
      `_${brand.companyEmail} · ${brand.companyWebsite}_`
    )
  );
}

// ── Payment confirmed — unlock full access ────────────────────────

function paymentConfirmed(session) {
  return t(session,
    (
      `✅ *Payment confirmed! Full access unlocked.*\n\n` +
      `Welcome to your complete Dr. HOA evaluation, *${session.name}*.\n\n` +
      `Reply *A*, *B*, *C*, *D* or *E* to continue with any section.`
    ),
    (
      `✅ *¡Pago confirmado! Acceso completo desbloqueado.*\n\n` +
      `Bienvenido/a a su evaluación completa Dr. HOA, *${session.name}*.\n\n` +
      `Responda *A*, *B*, *C*, *D* o *E* para continuar con cualquier sección.`
    )
  );
}

// ── Continue after section ────────────────────────────────────────

function continueAssessment(session) {
  const remaining = ASSESSMENT.filter(s =>
    ss.sectionScore(session, s.id, ASSESSMENT) === null
  );

  if (!remaining.length) {
    return t(session,
      `🎉 *All 5 sections complete!*\n\nReply *report* to receive your full Dr. HOA diagnosis report.`,
      `🎉 *¡Las 5 secciones completas!*\n\nResponda *informe* para recibir su informe completo de diagnóstico Dr. HOA.`
    );
  }

  const next  = remaining[0];
  const label = secLabel(next, session.lang);

  return t(session,
    `${remaining.length} section${remaining.length > 1 ? 's' : ''} remaining.\n\nReply *${next.id}* to continue with *${label}*, or choose any section (*A–E*).`,
    `Quedan ${remaining.length} sección${remaining.length > 1 ? 'es' : ''}.\n\nResponda *${next.id}* para continuar con *${label}*, o elija cualquier sección (*A–E*).`
  );
}

// ── Email confirmed (onboarding) ──────────────────────────────────

function emailConfirmed(session) {
  return t(session,
    `✅ Email received: *${session.email}*`,
    `✅ Correo recibido: *${session.email}*`
  );
}

// ── Help ──────────────────────────────────────────────────────────

function helpMessage(session) {
  return t(session,
    (
      `❓ *Dr. HOA — How it works*\n\n` +
      `• Reply *A, B, C, D* or *E* to start a section\n` +
      `• Answer each question in your own words\n` +
      `• I analyze your answers and give you findings\n` +
      `• *1 section is completely free*\n` +
      `• Full evaluation (all 5 sections): *${brand.packagePrice}*\n\n` +
      `*Commands:*\n` +
      `• *menu* — main menu\n` +
      `• *report* — full diagnosis report\n` +
      `• *reset* — start over`
    ),
    (
      `❓ *Dr. HOA — Cómo funciona*\n\n` +
      `• Responda *A, B, C, D* o *E* para iniciar una sección\n` +
      `• Responda cada pregunta con sus propias palabras\n` +
      `• Analizo sus respuestas y le doy hallazgos\n` +
      `• *1 sección es completamente gratis*\n` +
      `• Evaluación completa (5 secciones): *${brand.packagePrice}*\n\n` +
      `*Comandos:*\n` +
      `• *menú* — menú principal\n` +
      `• *informe* — informe completo\n` +
      `• *reiniciar* — comenzar de nuevo`
    )
  );
}

// ── Ratings applied (document uploads) ───────────────────────────

function ratingsApplied(ratings, session) {
  if (!ratings || !ratings.length) return null;
  const header = t(session, '*📝 Noted from your document:*', '*📝 Registrado de su documento:*');
  const lines  = ratings.map(r => {
    const cat  = CATEGORY_MAP[r.catId];
    const item = cat?.items[r.itemIdx];
    const text = item
      ? (session.lang === 'es' ? (item.es || item.en) : (item.en || item.es))
      : '';
    const short = text.length > 50 ? text.slice(0, 50) + '…' : text;
    return `• "${short}"${r.note ? ` — ${r.note}` : ''}`;
  }).join('\n');
  return `${header}\n${lines}`;
}

// ── Upload prompt ─────────────────────────────────────────────────

function uploadPrompt(session) {
  return t(session,
    `📎 *Send a document*\n\nYou can upload meeting minutes, contracts, financial statements, insurance certificates, or any relevant HOA document.\n\n_Supports: PDF, JPG, PNG_\n\nI will analyze it and factor it into the assessment.`,
    `📎 *Envíe un documento*\n\nPuede subir actas de reuniones, contratos, estados financieros, certificados de seguro o cualquier documento relevante de la HOA.\n\n_Compatible: PDF, JPG, PNG_\n\nLo analizaré y lo incluiré en la evaluación.`
  );
}

module.exports = {
  welcomeLanguage, welcomeAfterLang, askCommunity, askRole,
  mainMenu, lockedMessage, freeSessionComplete,
  emailCaptured, paymentLinkMessage, paymentConfirmed,
  continueAssessment, emailConfirmed,
  helpMessage, ratingsApplied, uploadPrompt,
};

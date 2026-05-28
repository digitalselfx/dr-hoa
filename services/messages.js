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
      `¡Hola! Soy Dr. HOA. Realizo diagnósticos operativos para HOAs de forma conversacional — sin formularios, sin puntuaciones complicadas.\n\n` +
      `Solo responda mis preguntas con sus propias palabras y yo me encargo del análisis.\n\n` +
      `Tiene *1 sección completamente gratis* para conocer cómo funciona.\n\n` +
      `¿Cuál es su nombre?`
    )
    : (
      `🩺 *Dr. HOA* — Your HOA Health Specialist\n\n` +
      `Hello! I'm Dr. HOA. I run operational diagnostics for HOAs through conversation — no forms, no complicated scores.\n\n` +
      `Just answer my questions in your own words and I'll take care of the analysis.\n\n` +
      `You get *1 full section completely free* to see how it works.\n\n` +
      `What's your name?`
    );
}

function askCommunity(session) {
  return t(session,
    `Nice to meet you, *${session.name}*! 👋\n\nWhat is the name of the HOA or community you're assessing?`,
    `¡Mucho gusto, *${session.name}*! 👋\n\n¿Cuál es el nombre de la HOA o comunidad que está evaluando?`
  );
}

function askRole(session) {
  return t(session,
    `Got it — *${session.communityName}*. And what is your role?\n\n*1* — Board Member\n*2* — Property Manager\n*3* — Homeowner\n*4* — Other`,
    `Entendido — *${session.communityName}*. ¿Y cuál es su rol?\n\n*1* — Miembro de Junta\n*2* — Administrador\n*3* — Propietario\n*4* — Otro`
  );
}

// ── Main menu ─────────────────────────────────────────────────────

function mainMenu(session) {
  const overall  = ss.overallScore(session, ASSESSMENT);
  const answered = ss.answeredCount(session);

  const sLines = ASSESSMENT.map(s => {
    const score = ss.sectionScore(session, s.id, ASSESSMENT);
    const label = secLabel(s, session.lang);
    const done  = score !== null;
    const locked = !session.unlockedFull && session.freeSectionUsed && session.freeSectionUsed !== s.id;
    return `${s.emoji} *${s.id}.* ${label}${done ? ` ✅` : locked ? ' 🔒' : ''}`;
  }).join('\n');

  const header = t(session,
    `🩺 *Dr. HOA*${session.communityName ? ` — ${session.communityName}` : ''}\n`,
    `🩺 *Dr. HOA*${session.communityName ? ` — ${session.communityName}` : ''}\n`
  );

  const scoreBlock = overall !== null
    ? t(session,
        `Overall health: *${overall}/3*\n`,
        `Salud general: *${overall}/3*\n`
      )
    : '';

  const nav = t(session,
    `\nReply *A*, *B*, *C*, *D*, or *E* to begin a section.\n\n_1 section free · Unlock all 5 with your email_`,
    `\nResponda *A*, *B*, *C*, *D* o *E* para comenzar una sección.\n\n_1 sección gratis · Desbloquee las 5 con su correo_`
  );

  return header + scoreBlock + '\n' + sLines + nav;
}

// ── Locked section message ────────────────────────────────────────

function lockedMessage(session) {
  return t(session,
    `🔒 *This section is locked.*\n\nYou've used your 1 free section. To access all 5 sections and receive your complete Dr. HOA diagnosis package with a *50% discount*, just send your email address below.`,
    `🔒 *Esta sección está bloqueada.*\n\nYa usó su sección gratuita. Para acceder a las 5 secciones y recibir su paquete completo de diagnóstico Dr. HOA con *50% de descuento*, simplemente envíe su correo electrónico.`
  );
}

// ── Free section complete — email invite ─────────────────────────

function freeSessionComplete(session) {
  return t(session,
    (
      `━━━━━━━━━━━━━━━━━\n` +
      `🎁 *Want the full picture?*\n\n` +
      `You've just seen what Dr. HOA can do for *one* area of your HOA.\n\n` +
      `Get the *Complete HOA Health Package*:\n` +
      `• All 5 sections diagnosed\n` +
      `• Full findings report by email\n` +
      `• Prioritized action plan\n` +
      `• Free 30-min consultation with ${brand.companyName}\n\n` +
      `*Special offer: 50% discount* for completing this assessment.\n\n` +
      `📧 Send your email to unlock everything — or type *skip* to continue.\n` +
      `━━━━━━━━━━━━━━━━━`
    ),
    (
      `━━━━━━━━━━━━━━━━━\n` +
      `🎁 *¿Quiere el panorama completo?*\n\n` +
      `Acaba de ver lo que Dr. HOA puede hacer por *una* área de su HOA.\n\n` +
      `Obtenga el *Paquete Completo de Salud HOA*:\n` +
      `• Las 5 secciones diagnosticadas\n` +
      `• Informe completo de hallazgos por correo\n` +
      `• Plan de acción priorizado\n` +
      `• Consulta gratuita de 30 min con ${brand.companyName}\n\n` +
      `*Oferta especial: 50% de descuento* por completar esta evaluación.\n\n` +
      `📧 Envíe su correo para desbloquear todo — o escriba *saltar* para continuar.\n` +
      `━━━━━━━━━━━━━━━━━`
    )
  );
}

// ── Discount offer (after email confirmed) ────────────────────────

function discountOffer(session) {
  return t(session,
    (
      `✅ *Full access unlocked!*\n\n` +
      `Your complete Dr. HOA package is on its way to *${session.email}*.\n\n` +
      `Our team at *${brand.companyName}* will also reach out within 1 business day to schedule your free consultation.\n\n` +
      `You can now assess all 5 sections. Reply *A–E* to continue.`
    ),
    (
      `✅ *¡Acceso completo desbloqueado!*\n\n` +
      `Su paquete completo Dr. HOA está en camino a *${session.email}*.\n\n` +
      `Nuestro equipo de *${brand.companyName}* también se comunicará dentro de 1 día hábil para programar su consulta gratuita.\n\n` +
      `Ahora puede evaluar las 5 secciones. Responda *A–E* para continuar.`
    )
  );
}

// ── Continue assessment after section ────────────────────────────

function continueAssessment(session) {
  const remaining = ASSESSMENT.filter(s => {
    const score = ss.sectionScore(session, s.id, ASSESSMENT);
    return score === null;
  });

  if (!remaining.length) {
    return t(session,
      `🎉 *All sections complete!* Reply *report* to receive your full Dr. HOA diagnosis report.`,
      `🎉 *¡Todas las secciones completas!* Responda *informe* para recibir su informe completo de diagnóstico Dr. HOA.`
    );
  }

  const nextSection = remaining[0];
  const label = secLabel(nextSection, session.lang);

  return t(session,
    `Great work! ${remaining.length} section${remaining.length > 1 ? 's' : ''} remaining.\n\nReply *${nextSection.id}* to continue with *${label}*, or choose any section from the menu (*A–E*).`,
    `¡Excelente! Quedan ${remaining.length} sección${remaining.length > 1 ? 'es' : ''}.\n\nResponda *${nextSection.id}* para continuar con *${label}*, o elija cualquier sección del menú (*A–E*).`
  );
}

// ── Email confirmed ───────────────────────────────────────────────

function emailConfirmed(session) {
  return t(session,
    `✅ Perfect! We have your email: *${session.email}*`,
    `✅ ¡Perfecto! Tenemos su correo: *${session.email}*`
  );
}

// ── Consultation offer ────────────────────────────────────────────

function consultationOffer(session) {
  const lang  = session?.lang || 'en';
  const offer = brand.consultation?.[lang] || brand.consultation?.en;
  if (!offer) {
    return t(session,
      `🎁 *Free 30-min HOA Consultation*\nContact us:\n📞 ${brand.companyPhone}\n📧 ${brand.companyEmail}`,
      `🎁 *Consulta HOA Gratuita de 30 min*\nContáctenos:\n📞 ${brand.companyPhone}\n📧 ${brand.companyEmail}`
    );
  }
  return (
    `━━━━━━━━━━━━━━━━━\n` +
    `🎁 *${offer.title}*\n\n` +
    `${offer.body}\n\n` +
    `👉 ${brand.calendlyLink}\n` +
    `📞 ${brand.companyPhone}\n` +
    `📧 ${brand.companyEmail}\n` +
    `━━━━━━━━━━━━━━━━━`
  );
}

// ── Help message ──────────────────────────────────────────────────

function helpMessage(session) {
  return t(session,
    (
      `❓ *Dr. HOA — How it works*\n\n` +
      `• Reply *A, B, C, D, or E* to start a section\n` +
      `• Answer each question in your own words\n` +
      `• I'll analyze your answers and give you findings\n` +
      `• *1 section is completely free*\n\n` +
      `*Commands:*\n` +
      `• *menu* — main menu\n` +
      `• *report* — full diagnosis report\n` +
      `• *consult* — free consultation\n` +
      `• *reset* — start over`
    ),
    (
      `❓ *Dr. HOA — Cómo funciona*\n\n` +
      `• Responda *A, B, C, D o E* para iniciar una sección\n` +
      `• Responda cada pregunta con sus propias palabras\n` +
      `• Analizaré sus respuestas y le daré hallazgos\n` +
      `• *1 sección es completamente gratis*\n\n` +
      `*Comandos:*\n` +
      `• *menú* — menú principal\n` +
      `• *informe* — informe completo\n` +
      `• *consulta* — consulta gratuita\n` +
      `• *reiniciar* — comenzar de nuevo`
    )
  );
}

// ── Ratings applied (for document uploads) ────────────────────────

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
    `📎 *Send a document*\n\nYou can upload meeting minutes, contracts, financial statements, insurance certificates, or any relevant HOA document.\n\n_Supports: PDF, JPG, PNG_\n\nI'll analyze it and factor it into the assessment.`,
    `📎 *Envíe un documento*\n\nPuede subir actas de reuniones, contratos, estados financieros, certificados de seguro o cualquier documento relevante de la HOA.\n\n_Compatible: PDF, JPG, PNG_\n\nLo analizaré y lo incluiré en la evaluación.`
  );
}

module.exports = {
  welcomeLanguage, welcomeAfterLang, askCommunity, askRole,
  mainMenu, lockedMessage, freeSessionComplete, discountOffer,
  continueAssessment, emailConfirmed, consultationOffer,
  helpMessage, ratingsApplied, uploadPrompt,
};

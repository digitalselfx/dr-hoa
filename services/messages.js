const brand = require('../data/brand');
const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss = require('./sessionStore');

function t(session, en, es) { return session?.lang === 'es' ? es : en; }
function fill(str) { return str.replace(/{company}/g, brand.companyName).replace(/{website}/g, brand.companyWebsite); }

function welcomeLanguage() {
  return `🩺 *Dr. HOA*\n_${brand.tagline}_\n\nWelcome! / ¡Bienvenido!\n\nPlease choose your language / Por favor elija su idioma:\n\n*1* — English 🇺🇸\n*2* — Español 🇪🇸`;
}

function welcomeAfterLang(lang) {
  return lang === 'es'
    ? `🩺 *Dr. HOA* — Su Especialista en Salud HOA\n\n¡Hola! Realizo diagnosticos operativos gratuitos para HOAs.\n\n✅ Evalue cualquier seccion en cualquier orden\n📎 Suba documentos para analisis IA\n📊 Reciba un informe de diagnostico completo\n🎁 Oferta de consulta gratuita con ${brand.companyName}\n\n¿Cual es su nombre?`
    : `🩺 *Dr. HOA* — Your HOA Health Specialist\n\nHello! I run free operational diagnostics for HOAs.\n\n✅ Assess any section in any order\n📎 Upload documents for AI analysis\n📊 Receive a full diagnosis report\n🎁 Free consultation offer from ${brand.companyName}\n\nWhat's your name?`;
}

function askCommunity(session) {
  return t(session,
    `Great to meet you, *${session.name}*! 👋\n\nWhat is the name of the HOA or community you're assessing?`,
    `¡Mucho gusto, *${session.name}*! 👋\n\n¿Cual es el nombre de la HOA o comunidad que esta evaluando?`
  );
}

function askRole(session) {
  return t(session,
    `Got it — *${session.communityName}*.\n\nWhat is your role?\n\n*1* — Board Member\n*2* — Property Manager\n*3* — Homeowner\n*4* — Other`,
    `Entendido — *${session.communityName}*.\n\n¿Cual es su rol?\n\n*1* — Miembro de Junta\n*2* — Administrador\n*3* — Propietario\n*4* — Otro`
  );
}

function mainMenu(session) {
  const overall   = ss.overallScore(session, ASSESSMENT);
  const answered  = ss.answeredCount(session);
  const tier      = ss.tierLabel(overall, session.lang);
  const sLines    = ASSESSMENT.map(s => {
    const sc = ss.sectionScore(session, s.id, ASSESSMENT);
    const lb = session.lang === 'es' ? s.labelEs : s.label;
    return `${s.emoji} *${s.id}.* ${lb}${sc !== null ? ` — ${sc}/3` : ''}`;
  }).join('\n');
  const header = t(session,
    `🩺 *Dr. HOA — Health Dashboard*\n${session.communityName ? `🏘️ ${session.communityName}\n` : ''}`,
    `🩺 *Dr. HOA — Panel de Salud*\n${session.communityName ? `🏘️ ${session.communityName}\n` : ''}`
  );
  const score = overall !== null ? `${t(session,'Overall','General')}: *${overall}/3* — ${tier}\n` : '';
  const prog  = t(session, `📋 ${answered}/125 answered\n`, `📋 ${answered}/125 respondidos\n`);
  const nav   = t(session,
    `\nReply *A–E* for a section\n*scores* · *report* · *upload* · *consult* · *help*`,
    `\nResponda *A–E* para una seccion\n*puntajes* · *informe* · *subir* · *consulta* · *ayuda*`
  );
  return header + score + prog + '\n' + sLines + nav;
}

function sectionMenu(session, sectionId) {
  const section = SECTION_MAP[sectionId];
  const score   = ss.sectionScore(session, sectionId, ASSESSMENT);
  const tier    = ss.tierLabel(score, session.lang);
  const label   = session.lang === 'es' ? section.labelEs : section.label;
  const desc    = session.lang === 'es' ? section.descriptionEs : section.description;
  const catLines = section.categories.map((cat, i) => {
    const cs = ss.catScore(session, cat.id);
    const cl = session.lang === 'es' ? cat.labelEs : cat.label;
    const answered = [0,1,2,3,4].filter(ii => session.answers[cat.id]?.[ii]?.rating !== undefined).length;
    return `  ${i + 1}. ${cl} — ${cs !== null ? cs + '/3' : answered + '/5'}`;
  }).join('\n');
  const docs = (session.documents[sectionId] || []).length;
  return `${section.emoji} *${label}*\n_${desc}_\n\n${score !== null ? `${t(session,'Score','Puntaje')}: *${score}/3* — ${tier}\n\n` : ''}${catLines}\n\n📎 ${docs} ${t(session,'doc(s)','doc(s)')}\n\n${t(session,'Reply *1–5* for a category · *upload* · *analyze* · *back*','Responda *1–5* para una categoria · *subir* · *analizar* · *atras*')}`;
}

function categoryIntro(cat, session) {
  const label = session.lang === 'es' ? cat.labelEs : cat.label;
  const items = cat.items.map((item, i) => {
    const text   = session.lang === 'es' ? item.es : item.en;
    const ans    = session.answers[cat.id]?.[i];
    const status = ans?.rating !== undefined ? `✅ ${ans.rating}/3` : '○';
    const flag   = item.critical ? ' ⚡' : '';
    return `${i + 1}. [${status}] ${text}${flag}`;
  }).join('\n');
  const legend = t(session, '_⚡ high-risk item · 0=Missing 1=Weak 2=Adequate 3=Strong_', '_⚡ elemento de alto riesgo · 0=Ausente 1=Debil 2=Adecuado 3=Solido_');
  const hint   = t(session, '\nDescribe how you handle this, rate items 0–3, or *upload* a document. Type *done* when finished.', '\nDescriba como maneja esto, califique 0-3, o *suba* un documento. Escriba *listo* cuando termine.');
  return `📋 *${label}*\n\n${items}\n\n${legend}${hint}`;
}

function ratingsApplied(ratings, session) {
  if (!ratings.length) return null;
  const header = t(session, '*📝 Recorded:*', '*📝 Registrado:*');
  const lines  = ratings.map(r => {
    const cat  = CATEGORY_MAP[r.catId];
    const item = cat?.items[r.itemIdx];
    const text = item ? (session.lang === 'es' ? item.es : item.en) : '';
    const short = text.length > 50 ? text.slice(0, 50) + '…' : text;
    return `✅ "${short}" → *${r.rating}/3*${r.note ? `\n   _${r.note}_` : ''}`;
  }).join('\n');
  return `${header}\n${lines}`;
}

function criticalAlert(session) {
  return t(session,
    `⚠️ *Critical issue detected.* Problems at this level expose the HOA to legal and financial risk. ${brand.companyName} specializes in resolving exactly these situations. Reply *consult* for a free call.`,
    `⚠️ *Problema critico detectado.* Problemas de este nivel exponen a la HOA a riesgos legales y financieros. ${brand.companyName} se especializa en resolver estas situaciones. Responda *consulta* para una llamada gratuita.`
  );
}

function consultationOffer(session) {
  const offer = brand.consultation[session?.lang || 'en'];
  return `━━━━━━━━━━━━━━━━━\n🎁 *${offer.title}*\n\n${offer.body}\n\n👉 ${brand.calendlyLink}\n📞 ${brand.companyPhone}\n📧 ${brand.companyEmail}\n━━━━━━━━━━━━━━━━━`;
}

function askEmail(session) {
  return t(session,
    `📧 To send your full *Dr. HOA Diagnosis Report*, what email should we use?\n\n_Reply with your email or type *skip*._`,
    `📧 Para enviar su *Informe de Diagnostico Dr. HOA* completo, ¿que correo usamos?\n\n_Responda con su correo o escriba *saltar*._`
  );
}

function emailConfirmed(session) {
  return t(session,
    `✅ Report will be sent to *${session.email}*.\n\nOur team at *${brand.companyName}* will follow up within 1 business day.`,
    `✅ El informe sera enviado a *${session.email}*.\n\nNuestro equipo de *${brand.companyName}* dara seguimiento en 1 dia habil.`
  );
}

function uploadPrompt(session) {
  const sLabel = session.activeSectionId ? SECTION_MAP[session.activeSectionId]?.[session.lang === 'es' ? 'labelEs' : 'label'] : '';
  return t(session,
    `📎 *Upload a Document*${sLabel ? ` for ${sLabel}` : ''}\n\nSend any relevant file:\n• Meeting minutes / agendas\n• Contracts or vendor agreements\n• Financial statements\n• Insurance certificates\n• Policies or procedures\n\n_PDF, JPG, PNG supported_\n\nI'll analyze it and auto-score relevant items.`,
    `📎 *Subir Documento*${sLabel ? ` para ${sLabel}` : ''}\n\nEnvie cualquier archivo relevante:\n• Actas de reuniones / agendas\n• Contratos de proveedores\n• Estados financieros\n• Certificados de seguro\n• Politicas o procedimientos\n\n_Compatible: PDF, JPG, PNG_\n\nLo analizare y puntuare elementos relevantes automaticamente.`
  );
}

function helpMessage(session) {
  return t(session,
    `❓ *Dr. HOA Commands*\n\n*Navigation:*\n• A–E → go to section\n• 1–5 → pick category\n• menu → main dashboard\n• back / done → go back\n\n*Assessment:*\n• Describe naturally or rate 0–3\n• upload → add a document\n\n*Reports:*\n• scores → view scores\n• analyze → section report\n• report → full diagnosis\n\n*Other:*\n• consult → free consultation\n• reset → start over`,
    `❓ *Comandos Dr. HOA*\n\n*Navegacion:*\n• A–E → ir a seccion\n• 1–5 → elegir categoria\n• menu → panel principal\n• atras / listo → regresar\n\n*Evaluacion:*\n• Describa naturalmente o califique 0–3\n• subir → agregar documento\n\n*Informes:*\n• puntajes → ver puntajes\n• analizar → informe de seccion\n• informe → diagnostico completo\n\n*Otros:*\n• consulta → consulta gratuita\n• reiniciar → comenzar de nuevo`
  );
}

module.exports = {
  welcomeLanguage, welcomeAfterLang, askCommunity, askRole,
  mainMenu, sectionMenu, categoryIntro,
  ratingsApplied, criticalAlert, consultationOffer,
  askEmail, emailConfirmed, uploadPrompt, helpMessage,
};

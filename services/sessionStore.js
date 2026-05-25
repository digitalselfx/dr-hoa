/**
 * Per-user session store (in-memory).
 * For production with persistent storage, swap the Map for Redis.
 */

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const store = new Map();

function get(phone) {
  const s = store.get(phone);
  if (!s) return null;
  if (Date.now() - s.lastActive > SESSION_TTL) { store.delete(phone); return null; }
  s.lastActive = new Date();
  return s;
}

function getOrCreate(phone) {
  let s = get(phone);
  if (!s) {
    s = {
      phone,
      lang: null,            // 'en' | 'es'
      name: null,
      communityName: null,
      email: null,           // captured lead email
      role: null,
      state: 'WELCOME',
      answers: {},           // { catId: { itemIdx: { rating, note, source } } }
      documents: {},         // { sectionId: [{ fileName, mimeType, analysis }] }
      activeSectionId: null,
      activeCatId: null,
      chatHistory: [],
      consultOffered: false,
      criticalIssues: [],
      startedAt: new Date(),
      lastActive: new Date(),
    };
    store.set(phone, s);
  }
  return s;
}

function save(s) { s.lastActive = new Date(); store.set(s.phone, s); }
function remove(phone) { store.delete(phone); }
function getAll() { return [...store.values()]; }

// ── Scoring ────────────────────────────────────────────────────────
function catScore(session, catId) {
  const cat = session.answers[catId];
  if (!cat) return null;
  const vals = Object.values(cat).map(v => v.rating).filter(v => v !== undefined);
  if (!vals.length) return null;
  return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

function sectionScore(session, sectionId, ASSESSMENT) {
  const section = ASSESSMENT.find(s => s.id === sectionId);
  if (!section) return null;
  const avgs = section.categories.map(c => catScore(session, c.id)).filter(v => v !== null);
  if (!avgs.length) return null;
  return +(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2);
}

function overallScore(session, ASSESSMENT) {
  const avgs = ASSESSMENT.map(s => sectionScore(session, s.id, ASSESSMENT)).filter(v => v !== null);
  if (!avgs.length) return null;
  return +(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2);
}

function answeredCount(session) {
  let n = 0;
  Object.values(session.answers).forEach(cat =>
    Object.values(cat).forEach(i => { if (i.rating !== undefined) n++; })
  );
  return n;
}

function docCount(session) {
  return Object.values(session.documents).reduce((a, d) => a + d.length, 0);
}

function tierLabel(score, lang) {
  if (score === null) return lang === 'es' ? 'Sin puntaje' : 'Not scored';
  const n = parseFloat(score);
  const labels = lang === 'es'
    ? ['Excelente ✅', 'Bueno ✅', 'Necesita Tratamiento ⚠️', 'Critico 🔴', 'Emergencia 🚨']
    : ['Excellent ✅', 'Good ✅', 'Needs Treatment ⚠️', 'Critical 🔴', 'Emergency 🚨'];
  if (n >= 2.8) return labels[0];
  if (n >= 2.5) return labels[1];
  if (n >= 1.8) return labels[2];
  if (n >= 1.0) return labels[3];
  return labels[4];
}

function addChat(session, role, content) {
  session.chatHistory.push({ role, content: typeof content === 'string' ? content : JSON.stringify(content) });
  if (session.chatHistory.length > 16) session.chatHistory.splice(0, 2);
}

module.exports = {
  get, getOrCreate, save, remove, getAll,
  catScore, sectionScore, overallScore,
  answeredCount, docCount, tierLabel, addChat,
};

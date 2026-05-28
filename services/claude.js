const Anthropic = require('@anthropic-ai/sdk');
const brand     = require('../data/brand');
const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss = require('./sessionStore');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── System prompt ─────────────────────────────────────────────────
function systemPrompt(session) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  return `You are Dr. HOA, an expert HOA management consultant conducting assessments via WhatsApp for ${brand.companyName}.

LANGUAGE: Respond ONLY in ${isEs ? 'Spanish' : 'English'}.
TONE: Warm, professional, conversational. Like a trusted advisor — not a form or a robot.
FORMAT: Short paragraphs. Use *bold* for key points. No long lists. Max 3 sentences per paragraph.
MEDICAL THEME: Occasionally use health metaphors (diagnosis, treatment, symptoms, healthy/critical).

Community: ${session.communityName || 'unknown'} | Assessor: ${session.name || 'unknown'}`;
}

// ── Infer all 5 ratings from one conversational answer ─────────────
async function inferRatings(session, cat, userAnswer) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';

  const itemList = cat.items.map((item, i) => {
    const text = isEs ? (item.es || item.en) : (item.en || item.es);
    return `${i}: ${text}`;
  }).join('\n');

  const prompt = isEs
    ? `El usuario respondió esta pregunta sobre "${cat.labelEs || cat.label}" en su HOA:\n\n"${userAnswer}"\n\nBasándote en esta respuesta, asigna una calificación (0-3) a cada uno de estos elementos:\n${itemList}\n\nEscala: 0=No existe, 1=Débil/Inconsistente, 2=Adecuado/Parcial, 3=Sólido/Consistente\n\nResponde SOLO en este formato JSON exacto:\n{"ratings":[{"idx":0,"rating":X,"note":"brief reason"},{"idx":1,"rating":X,"note":"brief reason"},{"idx":2,"rating":X,"note":"brief reason"},{"idx":3,"rating":X,"note":"brief reason"},{"idx":4,"rating":X,"note":"brief reason"}],"summary":"Una oración resumiendo el estado de esta área."}`
    : `The user answered this question about "${cat.label}" in their HOA:\n\n"${userAnswer}"\n\nBased on this answer, assign a rating (0-3) to each of these items:\n${itemList}\n\nScale: 0=Not in place, 1=Weak/Inconsistent, 2=Adequate/Partial, 3=Strong/Consistent\n\nRespond ONLY in this exact JSON format:\n{"ratings":[{"idx":0,"rating":X,"note":"brief reason"},{"idx":1,"rating":X,"note":"brief reason"},{"idx":2,"rating":X,"note":"brief reason"},{"idx":3,"rating":X,"note":"brief reason"},{"idx":4,"rating":X,"note":"brief reason"}],"summary":"One sentence summarizing the state of this area."}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();

  try {
    // Strip markdown code blocks if present
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      ratings: parsed.ratings.map(r => ({ rating: r.rating, note: r.note })),
      summary: parsed.summary || '',
    };
  } catch {
    // Fallback — assign neutral ratings if parsing fails
    return {
      ratings: cat.items.map(() => ({ rating: 1, note: 'Inferred from conversation' })),
      summary: isEs ? 'Respuesta registrada.' : 'Response recorded.',
    };
  }
}

// ── Generate section findings + recommendations ───────────────────
async function generateConversationalReport(session, sectionId) {
  const lang    = session.lang || 'en';
  const isEs    = lang === 'es';
  const section = SECTION_MAP[sectionId];
  const score   = ss.sectionScore(session, sectionId, ASSESSMENT);

  // Build category summaries
  const catSummaries = section.categories.map(cat => {
    const avg = ss.catScore(session, cat.id);
    const label = isEs ? (cat.labelEs || cat.label) : cat.label;
    const items = cat.items.map((item, i) => {
      const ans  = session.answers[cat.id]?.[i];
      const text = isEs ? (item.es || item.en) : (item.en || item.es);
      return `  - ${text}: ${ans?.rating ?? '?'}/3${ans?.note ? ` (${ans.note})` : ''}`;
    }).join('\n');
    return `${label} (avg: ${avg ?? 'n/a'}):\n${items}`;
  }).join('\n\n');

  const prompt = isEs
    ? `Eres Dr. HOA, un consultor experto en gestión de HOAs para ${brand.companyName}. Acaba de completar la evaluación de la sección *${section.labelEs || section.label}* para ${session.communityName}.\n\nPuntaje general de la sección: ${score ?? 'parcial'}/3.00\n\nCALIFICACIONES:\n${catSummaries}\n\nEscriba un mensaje de WhatsApp con:\n1. *Diagnóstico* — 2-3 oraciones sobre la salud de esta sección (use metáforas médicas ocasionalmente)\n2. *Lo que está funcionando bien* — máximo 2 puntos con •\n3. *Áreas críticas que necesitan atención* — máximo 3 puntos con • y consecuencias concretas si no se atienden\n4. *3 acciones inmediatas* — numeradas, claras y específicas, ordenadas por urgencia\n\nAl final agregue:\n"Para un diagnóstico completo de las 5 áreas con plan de acción detallado, ingrese su correo."\n\nFormato WhatsApp: *negrita*, • viñetas, párrafos cortos. Total: máximo 350 palabras. Sea directo y útil.`
    : `You are Dr. HOA, an expert HOA management consultant for ${brand.companyName}. You just completed the *${section.label}* section assessment for ${session.communityName}.\n\nSection overall score: ${score ?? 'partial'}/3.00\n\nRATINGS:\n${catSummaries}\n\nWrite a WhatsApp message with:\n1. *Diagnosis* — 2-3 sentences on the health of this section (use medical metaphors occasionally)\n2. *What is working well* — max 2 points with •\n3. *Critical areas needing attention* — max 3 points with • and concrete consequences if not addressed\n4. *3 immediate actions* — numbered, clear and specific, ordered by urgency\n\nAt the end add:\n"For a complete diagnosis of all 5 areas with a detailed action plan, share your email below."\n\nWhatsApp format: *bold*, • bullets, short paragraphs. Total: max 350 words. Be direct and helpful.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: systemPrompt(session),
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── General conversational chat ───────────────────────────────────
async function chat(session, userText, mediaPayload = null) {
  const content = [];

  if (mediaPayload?.mimeType?.startsWith('image/')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 } });
  } else if (mediaPayload?.mimeType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 } });
  }

  if (userText) content.push({ type: 'text', text: userText });

  ss.addChat(session, 'user', userText || '[media]');

  const messages = [
    ...session.chatHistory.slice(-10),
    { role: 'user', content: content.length === 1 && content[0].text ? content[0].text : content },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: systemPrompt(session),
    messages,
  });

  const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  ss.addChat(session, 'assistant', reply);

  return { reply, extractedRatings: [] };
}

// ── Document analysis ─────────────────────────────────────────────
async function analyzeDocument(session, mediaPayload, caption) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  const section = session.activeSectionId ? SECTION_MAP[session.activeSectionId] : null;

  const prompt = isEs
    ? `Analiza este documento HOA${section ? ` relacionado con ${section.labelEs || section.label}` : ''}.\n${caption ? `Nota: "${caption}"` : ''}\n\nIdentifica el tipo de documento, extrae información relevante para la evaluación operacional, señala fortalezas y brechas. Resume en 4-5 puntos con •.`
    : `Analyze this HOA document${section ? ` related to ${section.label}` : ''}.\n${caption ? `Note: "${caption}"` : ''}\n\nIdentify the document type, extract relevant information for the operational assessment, note strengths and gaps. Summarize in 4-5 bullet points with •.`;

  const content = [];
  if (mediaPayload.mimeType.startsWith('image/')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 } });
  } else if (mediaPayload.mimeType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 } });
  } else {
    return { analysis: isEs ? '⚠️ Tipo de archivo no compatible. Suba un PDF o imagen.' : '⚠️ File type not supported. Please upload a PDF or image.', suggestedRatings: [] };
  }
  content.push({ type: 'text', text: prompt });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: systemPrompt(session),
    messages: [{ role: 'user', content }],
  });

  return { analysis: response.content[0].text, suggestedRatings: [] };
}

// ── Section report (for webhook analyze command) ──────────────────
async function generateSectionReport(session, sectionId) {
  return generateConversationalReport(session, sectionId);
}

// ── Full report ───────────────────────────────────────────────────
async function generateFullReport(session) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  const overall = ss.overallScore(session, ASSESSMENT);

  const sectionSummaries = ASSESSMENT.map(s => {
    const score = ss.sectionScore(session, s.id, ASSESSMENT);
    const label = isEs ? (s.labelEs || s.label) : s.label;
    return `${s.emoji} ${label}: ${score ?? 'n/a'}/3`;
  }).join('\n');

  const prompt = isEs
    ? `Genera el INFORME COMPLETO DR. HOA para ${session.communityName}.\nPuntaje general: ${overall ?? 'parcial'}/3\n\n${sectionSummaries}\n\nEscribe un informe ejecutivo con diagnóstico general, hallazgos por sección, problemas críticos y plan de acción top 5. Formato WhatsApp.`
    : `Generate the COMPLETE DR. HOA REPORT for ${session.communityName}.\nOverall score: ${overall ?? 'partial'}/3\n\n${sectionSummaries}\n\nWrite an executive report with overall diagnosis, section findings, critical issues, and top 5 action plan. WhatsApp format.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt(session),
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = {
  inferRatings,
  generateConversationalReport,
  generateSectionReport,
  generateFullReport,
  chat,
  analyzeDocument,
};

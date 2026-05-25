const Anthropic = require('@anthropic-ai/sdk');
const brand = require('../data/brand');
const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss = require('./sessionStore');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function systemPrompt(session) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';

  return `You are *Dr. HOA*, an expert HOA operations diagnostician working for ${brand.companyName}.
You conduct professional HOA health assessments via WhatsApp with the authority and care of a specialist doctor.

LANGUAGE: Respond ONLY in ${isEs ? 'Spanish' : 'English'}.
PERSONA: Warm but professional. Use occasional medical metaphors ("this area needs treatment", "I'm detecting a chronic issue here"). Never be alarmist — be helpful and solution-oriented.
BRAND: You represent ${brand.companyName}. When gaps are identified, naturally mention that ${brand.companyName} helps HOAs resolve exactly these issues. Do NOT be pushy — one soft mention per section is enough.

ASSESSMENT CONTEXT:
Community: ${session.communityName || 'unknown'}
User: ${session.name || 'unknown'} (${session.role || 'unknown role'})
Section: ${session.activeSectionId || 'none'} | Category: ${session.activeCatId || 'none'}
Items answered: ${ss.answeredCount(session)}/125

RATING SCALE: 0=Not in place · 1=Weak · 2=Adequate · 3=Strong
When users describe their situation, extract the appropriate rating and explain your assessment.

FORMAT: WhatsApp-friendly. *bold* for emphasis, • for bullets, short paragraphs (max 3 sentences). Under 900 characters unless generating a report.
Never use markdown headers (###) — use *bold* instead.`;
}

// ── Conversational assessment ──────────────────────────────────────────────────
async function chat(session, userText, mediaPayload = null) {
  const content = [];

  if (mediaPayload?.mimeType?.startsWith('image/')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 } });
  } else if (mediaPayload?.mimeType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 } });
  }

  if (userText) content.push({ type: 'text', text: userText });
  else if (mediaPayload) content.push({ type: 'text', text: '[User uploaded a file]' });

  // Build context-aware prompt
  let contextNote = '';
  if (session.activeCatId) {
    const cat = CATEGORY_MAP[session.activeCatId];
    const lang = session.lang || 'en';
    const unanswered = cat.items
      .map((item, i) => ({ i, text: lang === 'es' ? item.es : item.en, answered: session.answers[cat.id]?.[i]?.rating !== undefined }))
      .filter(x => !x.answered);
    if (unanswered.length) {
      contextNote = `\n\nUnanswered items in current category:\n${unanswered.map(x => `${x.i}: ${x.text}`).join('\n')}`;
    }
  }

  const messages = [
    ...session.chatHistory.slice(-10),
    { role: 'user', content: content.length === 1 && typeof content[0].text === 'string' ? content[0].text + contextNote : content },
  ];

  ss.addChat(session, 'user', userText || '[media]');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    system: systemPrompt(session),
    messages,
  });

  const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  ss.addChat(session, 'assistant', reply);

  // Extract ratings silently
  const extractedRatings = await extractRatings(session, userText, reply, mediaPayload);

  return { reply, extractedRatings };
}

// ── Document analysis ──────────────────────────────────────────────────────────
async function analyzeDocument(session, mediaPayload, caption) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  const section = session.activeSectionId ? SECTION_MAP[session.activeSectionId] : null;
  const sLabel = section ? (isEs ? section.labelEs : section.label) : '';

  const prompt = isEs
    ? `Analiza este documento HOA como parte de una evaluación operacional${sLabel ? ` para la sección de ${sLabel}` : ''}.\n${caption ? `Nota del usuario: "${caption}"` : ''}\n\nPor favor:\n1. Identifica qué tipo de documento es\n2. Extrae información relevante para la evaluación operacional\n3. Sugiere calificaciones (0-3) para los elementos que puedas evaluar\n4. Señala brechas o señales de alerta\n5. Resume en 4-5 puntos con viñetas\n\nFormato WhatsApp: *negrita*, • viñetas, párrafos cortos.`
    : `Analyze this HOA document as part of an operational assessment${sLabel ? ` for the ${sLabel} section` : ''}.\n${caption ? `User note: "${caption}"` : ''}\n\nPlease:\n1. Identify what type of document this is\n2. Extract information relevant to the operational assessment\n3. Suggest ratings (0-3) for items you can evaluate\n4. Note any gaps or red flags\n5. Summarize in 4-5 bullet points\n\nWhatsApp format: *bold*, • bullets, short paragraphs.`;

  const content = [];
  if (mediaPayload.mimeType.startsWith('image/')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 } });
  } else if (mediaPayload.mimeType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 } });
  } else {
    return { analysis: isEs ? '⚠️ Este tipo de archivo no puede analizarse directamente. Por favor suba un PDF o imagen.' : '⚠️ This file type cannot be analyzed directly. Please upload a PDF or image.', suggestedRatings: [] };
  }
  content.push({ type: 'text', text: prompt });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt(session),
    messages: [{ role: 'user', content }],
  });

  const analysis = response.content[0].text;
  const suggestedRatings = await extractRatingsFromDoc(session, analysis);

  return { analysis, suggestedRatings };
}

// ── Section report ─────────────────────────────────────────────────────────────
async function generateSectionReport(session, sectionId) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  const section = SECTION_MAP[sectionId];
  const score = ss.sectionScore(session, sectionId, ASSESSMENT);
  const healthLbl = ss.healthLabel(score, lang, brand);

  const catDetails = section.categories.map(cat => {
    const catLabel = isEs ? cat.labelEs : cat.label;
    const items = cat.items.map((item, i) => {
      const text = isEs ? item.es : item.en;
      const ans = session.answers[cat.id]?.[i];
      const r = ans?.rating !== undefined ? `${ans.rating}/3` : (isEs ? 'no evaluado' : 'not rated');
      const note = ans?.note ? ` — "${ans.note}"` : '';
      return `  • ${text}: ${r}${note}`;
    }).join('\n');
    const avg = ss.catScore(session, cat.id);
    return `*${catLabel}* (${isEs ? 'promedio' : 'avg'}: ${avg ?? 'n/a'})\n${items}`;
  }).join('\n\n');

  const docs = (session.documents[sectionId] || []);
  const docsNote = docs.length
    ? (isEs ? `\nDocumentos revisados: ${docs.map(d => d.fileName || 'archivo').join(', ')}` : `\nDocuments reviewed: ${docs.map(d => d.fileName || 'file').join(', ')}`)
    : '';

  const prompt = isEs
    ? `Genera un informe de diagnóstico estilo Dr. HOA para la sección *${section.labelEs}* de ${session.communityName || 'esta HOA'}.\n\nPuntaje: ${score ?? 'parcial'}/3.00 — ${healthLbl}${docsNote}\n\nCALIFICACIONES:\n${catDetails}\n\nEscribe un informe con:\n1. *Diagnóstico* — 2 oraciones sobre la salud general de esta sección\n2. *Fortalezas* — lo que funciona bien (2-3 con •)\n3. *Áreas Críticas* — brechas urgentes (con consecuencias concretas si no se corrigen)\n4. *Plan de Tratamiento* — 3-5 acciones priorizadas numeradas\n5. *Evaluación de Riesgo* — Bajo / Medio / Alto y por qué\n\nAl final, mencione sutilmente que ${brand.companyName} puede ayudar a implementar estas mejoras.\n\nFormato WhatsApp: *negrita* para encabezados, • viñetas, párrafos de 2-3 oraciones. Total: ~1500 caracteres.`
    : `Generate a Dr. HOA diagnostic report for the *${section.label}* section of ${session.communityName || 'this HOA'}.\n\nScore: ${score ?? 'partial'}/3.00 — ${healthLbl}${docsNote}\n\nRATINGS:\n${catDetails}\n\nWrite a report with:\n1. *Diagnosis* — 2 sentences on overall health of this section\n2. *Strengths* — what's working well (2-3 bullet points)\n3. *Critical Areas* — urgent gaps (with concrete consequences if not fixed)\n4. *Treatment Plan* — 3-5 prioritized numbered actions\n5. *Risk Assessment* — Low / Medium / High and why\n\nAt the end, subtly mention that ${brand.companyName} can help implement these improvements.\n\nWhatsApp format: *bold* headers, • bullets, 2-3 sentence paragraphs. Total: ~1500 characters.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1400,
    system: systemPrompt(session),
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── Full diagnostic report ─────────────────────────────────────────────────────
async function generateFullReport(session) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';
  const overall = ss.overallScore(session, ASSESSMENT);
  const healthLbl = ss.healthLabel(overall, lang, brand);
  const answered = ss.answeredCount(session);
  const docs = ss.docCount(session);

  const sectionSummaries = ASSESSMENT.map(s => {
    const score = ss.sectionScore(session, s.id, ASSESSMENT);
    const sLabel = isEs ? s.labelEs : s.label;
    const catLines = s.categories.map(c => {
      const cs = ss.catScore(session, c.id);
      const cLabel = isEs ? c.labelEs : c.label;
      return `  ${cLabel}: ${cs ?? '—'}`;
    }).join('\n');
    return `${s.emoji} ${sLabel}: ${score ?? '—'}/3\n${catLines}`;
  }).join('\n\n');

  const criticals = session.criticalIssuesFound || [];
  const criticalBlock = criticals.slice(0, 8).map(c => {
    const cat = CATEGORY_MAP[c.catId];
    const item = cat?.items[c.itemIdx];
    const text = item ? (isEs ? item.es : item.en) : c.text;
    return `• ${text} (${c.rating}/3)`;
  }).join('\n');

  const prompt = isEs
    ? `Genera el INFORME COMPLETO DE DIAGNÓSTICO DR. HOA para *${session.communityName || 'esta HOA'}*.\n\nEvaluador: ${session.name} | Rol: ${session.role}\nPuntaje general: ${overall ?? 'parcial'}/3.00 — ${healthLbl}\nElementos evaluados: ${answered}/125 | Documentos: ${docs}\n\nPUNTAJES POR SECCIÓN:\n${sectionSummaries}\n\n${criticalBlock ? `PROBLEMAS CRÍTICOS (0-1):\n${criticalBlock}\n` : ''}\n\nEscribe el informe completo con:\n1. *Resumen Ejecutivo* (3-4 oraciones — diagnóstico general)\n2. *Hallazgos por Sección* (un párrafo por cada una de las 5 secciones)\n3. *Problemas Críticos* (lista de los más urgentes con consecuencias)\n4. *Plan de Acción Prioritario* (top 10 acciones numeradas, más urgente primero)\n5. *Evaluación de Riesgo General* y próximos pasos recomendados\n\nAl final, incluya una transición natural hacia ${brand.companyName}: mencione que ofrecen consultas gratuitas para HOAs que deseen implementar estas mejoras.\n\nFormato WhatsApp: *negrita*, • viñetas, párrafos cortos. Total: 3000-3500 caracteres (se enviará en múltiples mensajes).`
    : `Generate the COMPLETE DR. HOA DIAGNOSTIC REPORT for *${session.communityName || 'this HOA'}*.\n\nAssessor: ${session.name} | Role: ${session.role}\nOverall score: ${overall ?? 'partial'}/3.00 — ${healthLbl}\nItems assessed: ${answered}/125 | Documents reviewed: ${docs}\n\nSECTION SCORES:\n${sectionSummaries}\n\n${criticalBlock ? `CRITICAL ISSUES (rated 0-1):\n${criticalBlock}\n` : ''}\n\nWrite the full report with:\n1. *Executive Summary* (3-4 sentences — overall diagnosis)\n2. *Section-by-Section Findings* (one paragraph per each of the 5 sections)\n3. *Critical Issues* (most urgent items with real consequences if unaddressed)\n4. *Priority Action Plan* (top 10 numbered actions, most urgent first)\n5. *Overall Risk Assessment* and recommended next steps\n\nAt the end, include a natural transition to ${brand.companyName}: mention they offer free consultations for HOAs looking to implement these improvements.\n\nWhatsApp format: *bold*, • bullets, short paragraphs. Total: 3000-3500 characters (will be sent as multiple messages).`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2800,
    system: systemPrompt(session),
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── Rating extraction helpers ──────────────────────────────────────────────────
async function extractRatings(session, userText, assistantReply, mediaPayload) {
  if (!session.activeCatId || !userText) return [];
  const cat = CATEGORY_MAP[session.activeCatId];
  if (!cat) return [];
  const lang = session.lang || 'en';

  const unanswered = cat.items
    .map((item, i) => ({ i, text: lang === 'es' ? item.es : item.en }))
    .filter(x => session.answers[cat.id]?.[x.i]?.rating === undefined);

  if (!unanswered.length) return [];

  const p = `Extract HOA assessment ratings from this exchange.\nCategory: ${lang === 'es' ? cat.labelEs : cat.label}\nUnanswered items:\n${unanswered.map(x => `${x.i}: ${x.text}`).join('\n')}\n\nUser: "${userText}"\nAssistant: "${assistantReply.slice(0, 400)}"\n\nFor each item addressed, output: RATING:<idx>:<0-3>:<brief note>\nOutput NONE if nothing extractable.`;

  try {
    const r = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: p }],
    });
    const text = r.content[0].text.trim();
    if (text === 'NONE') return [];
    return text.split('\n').filter(l => l.startsWith('RATING:')).map(l => {
      const [, idxStr, rStr, ...noteParts] = l.split(':');
      const idx = parseInt(idxStr), rating = parseInt(rStr);
      if (isNaN(idx) || isNaN(rating) || rating < 0 || rating > 3) return null;
      return { catId: cat.id, itemIdx: idx, rating, note: noteParts.join(':').trim() };
    }).filter(Boolean);
  } catch { return []; }
}

async function extractRatingsFromDoc(session, analysisText) {
  if (!session.activeSectionId) return [];
  const section = SECTION_MAP[session.activeSectionId];
  if (!section) return [];

  const allItems = section.categories.flatMap(cat =>
    cat.items.map((item, i) => `${cat.id}:${i}:${item.en}`)
  );

  const p = `From this HOA document analysis, extract suggested ratings.\nAnalysis: "${analysisText.slice(0, 800)}"\nItems:\n${allItems.join('\n')}\nOutput: RATING:<catId>:<idx>:<0-3>:<justification>\nOutput NONE if nothing extractable.`;

  try {
    const r = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: p }],
    });
    const text = r.content[0].text.trim();
    if (text === 'NONE') return [];
    return text.split('\n').filter(l => l.startsWith('RATING:')).map(l => {
      const parts = l.split(':');
      if (parts.length < 4) return null;
      const catId = parts[1], itemIdx = parseInt(parts[2]), rating = parseInt(parts[3]);
      const note = parts.slice(4).join(':').trim();
      if (!catId || isNaN(itemIdx) || isNaN(rating) || rating < 0 || rating > 3) return null;
      return { catId, itemIdx, rating, note };
    }).filter(Boolean);
  } catch { return []; }
}

module.exports = { chat, analyzeDocument, generateSectionReport, generateFullReport };

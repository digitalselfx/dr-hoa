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
// This NEVER fails — it always returns 5 ratings no matter what the user says.
async function inferRatings(session, cat, userAnswer) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';

  const itemList = cat.items.map((item, i) => {
    const text = isEs ? (item.es || item.en) : (item.en || item.es);
    return `Item ${i}: ${text}`;
  }).join('\n');

  // Use a two-step approach:
  // Step 1 — ask Claude to reason about the answer
  // Step 2 — extract ratings with a very forgiving parser

  const prompt = isEs
    ? `Eres un consultor experto en HOAs. Un usuario respondió esta pregunta sobre su HOA:

PREGUNTA: Sobre "${cat.labelEs || cat.label}"
RESPUESTA DEL USUARIO: "${userAnswer || 'El usuario no proporcionó detalles'}"

Evalúa qué tan bien funciona esta HOA en cada uno de estos elementos basándote en la respuesta. Si la respuesta es vaga o corta, usa tu criterio profesional para inferir el estado más probable.

Escala de calificación:
0 = No existe en absoluto
1 = Existe pero es débil o inconsistente  
2 = Funciona de manera adecuada
3 = Funciona muy bien y de forma consistente

${itemList}

Para cada elemento (0 al 4), proporciona:
- Una calificación del 0 al 3
- Una nota breve de máximo 8 palabras explicando el porqué

IMPORTANTE: Si la respuesta es vaga, corta o el usuario dice "no sé", asigna 1 como calificación predeterminada.

Responde en este formato exacto, una línea por elemento:
ITEM0: [calificación] | [nota]
ITEM1: [calificación] | [nota]
ITEM2: [calificación] | [nota]
ITEM3: [calificación] | [nota]
ITEM4: [calificación] | [nota]
RESUMEN: [una oración resumiendo el estado general de esta área]`

    : `You are an expert HOA consultant. A user answered this question about their HOA:

QUESTION: About "${cat.label}"
USER'S ANSWER: "${userAnswer || 'The user did not provide details'}"

Evaluate how well this HOA is performing on each of these items based on the answer. If the answer is vague or short, use your professional judgment to infer the most likely state.

Rating scale:
0 = Does not exist at all
1 = Exists but weak or inconsistent
2 = Works adequately
3 = Works very well and consistently

${itemList}

For each item (0 through 4), provide:
- A rating from 0 to 3
- A brief note of maximum 8 words explaining why

IMPORTANT: If the answer is vague, short, or the user says "I don't know", assign 1 as the default rating.

Respond in this exact format, one line per item:
ITEM0: [rating] | [note]
ITEM1: [rating] | [note]
ITEM2: [rating] | [note]
ITEM3: [rating] | [note]
ITEM4: [rating] | [note]
SUMMARY: [one sentence summarizing the overall state of this area]`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].text.trim();
    return parseRatings(raw, cat, isEs);

  } catch (err) {
    console.error('inferRatings API error:', err.message);
    // Always return something — never crash
    return fallbackRatings(cat, isEs);
  }
}

// ── Parse ratings from Claude's text response ─────────────────────
// Very forgiving — works even if Claude adds extra text
function parseRatings(text, cat, isEs) {
  const ratings = [];
  const lines   = text.split('\n');

  for (let i = 0; i < 5; i++) {
    // Look for ITEM0:, ITEM1:, etc. — case insensitive
    const pattern = new RegExp(`ITEM${i}[:\\s]+([0-3])\\s*\\|?\\s*(.*)`, 'i');
    let found = false;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const rating = parseInt(match[1]);
        const note   = (match[2] || '').trim().slice(0, 80);
        ratings.push({
          rating: isNaN(rating) ? 1 : Math.min(3, Math.max(0, rating)),
          note:   note || (isEs ? 'Inferido de la respuesta' : 'Inferred from response'),
        });
        found = true;
        break;
      }
    }

    // If item not found in response — default to 1
    if (!found) {
      ratings.push({
        rating: 1,
        note: isEs ? 'Sin información suficiente' : 'Insufficient information',
      });
    }
  }

  // Extract summary
  let summary = '';
  for (const line of lines) {
    if (/^SUMMAR[YI]/i.test(line) || /^RESUMEN/i.test(line)) {
      summary = line.replace(/^(SUMMARY|RESUMEN)\s*:?\s*/i, '').trim();
      break;
    }
  }
  if (!summary) {
    summary = isEs ? 'Área evaluada.' : 'Area assessed.';
  }

  return { ratings, summary };
}

// ── Fallback — always works, never throws ─────────────────────────
function fallbackRatings(cat, isEs) {
  return {
    ratings: cat.items.map(() => ({
      rating: 1,
      note: isEs ? 'Respuesta registrada' : 'Response recorded',
    })),
    summary: isEs
      ? 'Área registrada. Se necesita más información para un análisis preciso.'
      : 'Area recorded. More information needed for precise analysis.',
  };
}

// ── Generate section findings + recommendations ───────────────────
async function generateConversationalReport(session, sectionId) {
  const lang    = session.lang || 'en';
  const isEs    = lang === 'es';
  const section = SECTION_MAP[sectionId];
  const score   = ss.sectionScore(session, sectionId, ASSESSMENT);

  // Build what we know from the conversation
  const catSummaries = section.categories.map(cat => {
    const avg   = ss.catScore(session, cat.id);
    const label = isEs ? (cat.labelEs || cat.label) : cat.label;
    const notes = cat.items.map((item, i) => {
      const ans  = session.answers[cat.id]?.[i];
      const text = isEs ? (item.es || item.en) : (item.en || item.es);
      return `  • ${text}: ${ans?.rating ?? 1}/3${ans?.note ? ` — ${ans.note}` : ''}`;
    }).join('\n');
    return `${label} (avg: ${avg ?? 'n/a'}):\n${notes}`;
  }).join('\n\n');

  const prompt = isEs
    ? `Eres Dr. HOA, consultor experto en gestión de HOAs para ${brand.companyName}.

Acaba de completar la evaluación conversacional de la sección *${section.labelEs || section.label}* para la HOA "${session.communityName}".

Puntaje general de la sección: ${score ?? 'parcial'}/3.00

HALLAZGOS:
${catSummaries}

Redacta un mensaje de WhatsApp claro, simple y preciso con:

1. *Diagnóstico* (2 oraciones — estado general, usa metáfora médica si aplica)
2. *Lo que funciona bien* (máximo 2 puntos con •)
3. *Áreas críticas* (máximo 3 puntos con •, incluye la consecuencia real si no se atiende)
4. *3 Acciones Inmediatas* (numeradas 1, 2, 3 — específicas, ordenadas por urgencia)

Termina con esta línea exacta:
"Para un diagnóstico completo de las 5 áreas, comparta su correo electrónico."

Formato WhatsApp: *negrita*, • viñetas. Máximo 300 palabras. Directo y útil.`

    : `You are Dr. HOA, an expert HOA management consultant for ${brand.companyName}.

You just completed the conversational assessment of the *${section.label}* section for "${session.communityName}" HOA.

Section overall score: ${score ?? 'partial'}/3.00

FINDINGS:
${catSummaries}

Write a clear, simple, and precise WhatsApp message with:

1. *Diagnosis* (2 sentences — overall condition, use medical metaphor if appropriate)
2. *What is working well* (max 2 points with •)
3. *Critical areas* (max 3 points with •, include the real consequence if not addressed)
4. *3 Immediate Actions* (numbered 1, 2, 3 — specific, ordered by urgency)

End with this exact line:
"For a complete diagnosis of all 5 areas, share your email below."

WhatsApp format: *bold*, • bullets. Max 300 words. Direct and helpful.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt(session),
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('generateConversationalReport error:', err.message);
    return isEs
      ? `⚠️ Hubo un problema generando el informe. Sus respuestas fueron guardadas. Escriba *informe* para intentar de nuevo.`
      : `⚠️ There was a problem generating the report. Your answers were saved. Type *report* to try again.`;
  }
}

// ── General conversational chat ───────────────────────────────────
async function chat(session, userText, mediaPayload = null) {
  const content = [];

  if (mediaPayload?.mimeType?.startsWith('image/')) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 }
    });
  } else if (mediaPayload?.mimeType === 'application/pdf') {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 }
    });
  }

  if (userText) content.push({ type: 'text', text: userText });

  ss.addChat(session, 'user', userText || '[media]');

  const messages = [
    ...session.chatHistory.slice(-10),
    {
      role: 'user',
      content: content.length === 1 && content[0].text ? content[0].text : content
    },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt(session),
      messages,
    });

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    ss.addChat(session, 'assistant', reply);
    return { reply, extractedRatings: [] };

  } catch (err) {
    console.error('chat error:', err.message);
    const lang = session.lang || 'en';
    return {
      reply: lang === 'es'
        ? 'Puede continuar con su evaluación respondiendo A, B, C, D o E para seleccionar una sección.'
        : 'You can continue your assessment by replying A, B, C, D or E to select a section.',
      extractedRatings: [],
    };
  }
}

// ── Document analysis ─────────────────────────────────────────────
async function analyzeDocument(session, mediaPayload, caption) {
  const lang    = session.lang || 'en';
  const isEs    = lang === 'es';
  const section = session.activeSectionId ? SECTION_MAP[session.activeSectionId] : null;

  const prompt = isEs
    ? `Analiza este documento HOA${section ? ` relacionado con ${section.labelEs || section.label}` : ''}.\n${caption ? `Nota: "${caption}"` : ''}\n\nIdentifica el tipo de documento, extrae información relevante, señala fortalezas y brechas. Resume en 4-5 puntos con •. Sé directo y útil.`
    : `Analyze this HOA document${section ? ` related to ${section.label}` : ''}.\n${caption ? `Note: "${caption}"` : ''}\n\nIdentify the document type, extract relevant information, note strengths and gaps. Summarize in 4-5 bullet points with •. Be direct and helpful.`;

  const content = [];
  if (mediaPayload.mimeType?.startsWith('image/')) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 }
    });
  } else if (mediaPayload.mimeType === 'application/pdf') {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 }
    });
  } else {
    return {
      analysis: isEs
        ? '📎 Archivo guardado. Para análisis de IA suba un PDF o imagen (JPG/PNG).'
        : '📎 File saved. For AI analysis please upload a PDF or image (JPG/PNG).',
      suggestedRatings: [],
    };
  }

  content.push({ type: 'text', text: prompt });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt(session),
      messages: [{ role: 'user', content }],
    });
    return { analysis: response.content[0].text, suggestedRatings: [] };
  } catch (err) {
    console.error('analyzeDocument error:', err.message);
    return {
      analysis: isEs
        ? '⚠️ No se pudo analizar el documento. Fue guardado en su sesión.'
        : '⚠️ Could not analyze the document. It was saved to your session.',
      suggestedRatings: [],
    };
  }
}

// ── Section report wrapper ────────────────────────────────────────
async function generateSectionReport(session, sectionId) {
  return generateConversationalReport(session, sectionId);
}

// ── Full report ───────────────────────────────────────────────────
async function generateFullReport(session) {
  const lang  = session.lang || 'en';
  const isEs  = lang === 'es';
  const overall = ss.overallScore(session, ASSESSMENT);

  const sectionSummaries = ASSESSMENT.map(s => {
    const score = ss.sectionScore(session, s.id, ASSESSMENT);
    const label = isEs ? (s.labelEs || s.label) : s.label;
    return `${s.emoji} ${label}: ${score !== null ? score + '/3' : (isEs ? 'No evaluada' : 'Not assessed')}`;
  }).join('\n');

  const prompt = isEs
    ? `Genera el INFORME COMPLETO DR. HOA para "${session.communityName}".\nPuntaje general: ${overall ?? 'parcial'}/3\n\n${sectionSummaries}\n\nEscribe un informe ejecutivo con: diagnóstico general, hallazgos por sección evaluada, problemas críticos y plan de acción top 5 (numerado, ordenado por urgencia). Formato WhatsApp. Máximo 400 palabras.`
    : `Generate the COMPLETE DR. HOA REPORT for "${session.communityName}".\nOverall score: ${overall ?? 'partial'}/3\n\n${sectionSummaries}\n\nWrite an executive report with: overall diagnosis, findings per assessed section, critical issues, and top 5 action plan (numbered, ordered by urgency). WhatsApp format. Max 400 words.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt(session),
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('generateFullReport error:', err.message);
    return isEs
      ? '⚠️ Error generando el informe. Por favor intente de nuevo escribiendo *informe*.'
      : '⚠️ Error generating the report. Please try again by typing *report*.';
  }
}

module.exports = {
  inferRatings,
  generateConversationalReport,
  generateSectionReport,
  generateFullReport,
  chat,
  analyzeDocument,
};

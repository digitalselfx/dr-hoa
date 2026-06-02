const Anthropic = require('@anthropic-ai/sdk');
const brand     = require('../data/brand');
const { ASSESSMENT, SECTION_MAP, CATEGORY_MAP } = require('../data/assessment');
const ss = require('./sessionStore');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Florida Statute 720 knowledge base ────────────────────────────
// Built-in knowledge of Florida HOA law — used in every report
const FLORIDA_720_KNOWLEDGE = `
FLORIDA STATUTE CHAPTER 720 — HOMEOWNERS' ASSOCIATIONS (Key Provisions for HOA Operations)

GOVERNANCE & MEETINGS (§720.303):
- Board meetings must be noticed at least 48 hours in advance (posted in conspicuous place)
- Annual meetings require 14-day written notice to all members
- Quorum = majority of board members unless bylaws specify otherwise
- Minutes must be kept for all board and member meetings
- Members have the right to attend and speak at board meetings
- Board members must certify in writing they have read governing documents

BOARD MEMBER REQUIREMENTS (§720.303, HB 1203 effective July 1, 2024):
- New directors must complete state-approved 4-hour education within 90 days of election
- Large associations (2,500+ parcels): directors must complete 8 hours CE annually
- Directors who were serving before 2024 had until June 30, 2025 to complete initial course
- Failure to comply can result in criminal charges for board members

OFFICIAL RECORDS (§720.303):
- Association must maintain official records for at least 7 years
- Members have right to inspect and copy official records within 10 business days of request
- Associations with 100+ parcels must post on website by Jan 1, 2025:
  * Articles of incorporation and amendments
  * Recorded bylaws and amendments
  * Declaration of covenants and amendments
  * Current rules and regulations
  * List of all current executory contracts
- Willful failure to provide records = civil penalty up to $500 per incident

FINANCIAL OBLIGATIONS (§720.303, §720.308):
- Budget must be adopted annually; members must receive copy 14 days before adoption
- Reserves required unless members vote to waive (majority of total voting interests)
- Financial reports required based on association size:
  * Under $150K annual revenue: compiled financial statement
  * $150K-$300K: reviewed financial statement
  * $300K-$500K: reviewed or audited
  * Over $500K: audited financial statement
- Fidelity bonding required for associations with $100K+ in funds

ASSESSMENT COLLECTION (§720.3085):
- Assessments are personal obligations of the parcel owner
- Association may file lien after 45 days of delinquency with proper notice
- Lien must be filed within 1 year of delinquency
- Foreclosure action may begin after claim of lien filed
- Delinquent owners may be denied access to common areas (except for emergency)
- Late fees limited to the greater of $25 or 5% of the delinquent amount

ARCHITECTURAL CONTROL (§720.3035):
- ARC/ACC must act on applications within 45 days or deemed approved
- Decisions must be in writing
- Rules must be applied uniformly and consistently
- Cannot enforce rules not in recorded governing documents

VIOLATIONS & ENFORCEMENT (§720.305):
- Written notice required before fine
- Right to hearing before fines levied (must be offered within 14 days)
- Fines limited to $100/day per violation; max $1,000 for continuing violations
- Suspension of use rights allowed after proper notice
- Association cannot fine or suspend for unpaid assessments separately from collection process

ELECTION REQUIREMENTS (§720.306):
- Elections must be by secret ballot
- Candidates must be announced 60 days before election
- Ballots must be returned by mail or in person (not email)
- Election materials must be retained for 1 year
- DBPR can be petitioned to arbitrate election disputes

RULE ADOPTION (§720.303):
- Rules cannot conflict with governing documents or Florida law
- Before Oct 1, 2024: associations must provide copy of rules and covenants to every member
- Must provide updated rules whenever amended
- Members must have opportunity to comment before adoption

DISPUTE RESOLUTION (§720.311):
- Mandatory pre-suit mediation for most disputes
- DBPR arbitration available for election and covenant enforcement disputes
- Prevailing party may recover attorney's fees and costs
`;

// ── System prompt with Florida 720 built in ───────────────────────
function systemPrompt(session) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';

  const hoaDocs = buildHoaDocsContext(session);

  return `You are Dr. HOA, an expert HOA management consultant conducting assessments via WhatsApp for ${brand.companyName}.

LANGUAGE: Respond ONLY in ${isEs ? 'Spanish' : 'English'}.
TONE: Warm, professional, conversational. Like a trusted advisor.
FORMAT: Short paragraphs. Use *bold* for key points. No long lists. Max 3 sentences per paragraph.
STYLE: Occasionally use health metaphors (diagnosis, treatment, healthy/critical condition).

Community: ${session.communityName || 'unknown'} | Assessor: ${session.name || 'unknown'}

LEGAL KNOWLEDGE BASE — FLORIDA STATUTE 720:
${FLORIDA_720_KNOWLEDGE}

${hoaDocs}

When you identify a gap or issue, reference the specific Florida Statute section that applies.
When something is being done correctly, acknowledge it as compliant with Florida law.
Always frame legal requirements as protective — they exist to protect homeowners and boards alike.`;
}

// ── Build HOA-specific document context ───────────────────────────
function buildHoaDocsContext(session) {
  const docs = session.documents || {};
  const allDocs = Object.values(docs).flat();

  if (!allDocs.length) return '';

  const docSummaries = allDocs
    .filter(d => d.analysis)
    .map(d => `Document: ${d.fileName}\nAnalysis: ${d.analysis}`)
    .join('\n\n');

  if (!docSummaries) return '';

  return `\nHOA-SPECIFIC DOCUMENTS UPLOADED BY USER:\n${docSummaries}\n\nUse this information alongside Florida Statute 720 to give specific, document-aware recommendations.`;
}

// ── Infer all 5 ratings — never fails ────────────────────────────
async function inferRatings(session, cat, userAnswer) {
  const lang = session.lang || 'en';
  const isEs = lang === 'es';

  const itemList = cat.items.map((item, i) => {
    const text = isEs ? (item.es || item.en) : (item.en || item.es);
    return `Item ${i}: ${text}`;
  }).join('\n');

  const answer = userAnswer?.trim() || (isEs ? 'Sin información proporcionada' : 'No information provided');

  const prompt = isEs
    ? `Eres un consultor experto en HOAs en Florida. Un representante de una HOA respondió sobre "${cat.labelEs || cat.label}":

RESPUESTA: "${answer}"

Evalúa los siguientes elementos basándote en la respuesta. Si la respuesta es vaga o corta, usa tu criterio profesional y el contexto de Florida Statute 720 para inferir el estado más probable.

Escala: 0=No existe, 1=Débil/Inconsistente, 2=Adecuado/Parcial, 3=Sólido/Consistente

${itemList}

Responde en este formato exacto:
Item0: [0-3] | [nota breve máx 10 palabras]
Item1: [0-3] | [nota breve máx 10 palabras]
Item2: [0-3] | [nota breve máx 10 palabras]
Item3: [0-3] | [nota breve máx 10 palabras]
Item4: [0-3] | [nota breve máx 10 palabras]
Resumen: [una oración sobre el estado general de esta área]`

    : `You are an expert HOA consultant in Florida. An HOA representative answered about "${cat.label}":

ANSWER: "${answer}"

Evaluate the following items based on this answer. If the answer is vague or short, use your professional judgment and Florida Statute 720 context to infer the most likely state.

Scale: 0=Not in place, 1=Weak/Inconsistent, 2=Adequate/Partial, 3=Strong/Consistent

${itemList}

Respond in this exact format:
Item0: [0-3] | [brief note max 10 words]
Item1: [0-3] | [brief note max 10 words]
Item2: [0-3] | [brief note max 10 words]
Item3: [0-3] | [brief note max 10 words]
Item4: [0-3] | [brief note max 10 words]
Summary: [one sentence on the overall state of this area]`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].text.trim();
    return parseRatings(raw, cat, isEs);

  } catch (err) {
    console.error('inferRatings error:', err.message);
    return fallbackRatings(cat, isEs);
  }
}

// ── Forgiving parser — always returns 5 ratings ───────────────────
function parseRatings(text, cat, isEs) {
  const ratings = [];
  const lines   = text.split('\n');

  for (let i = 0; i < 5; i++) {
    // Match "Item0:", "ITEM0:", "item0:" all work
    const pattern = new RegExp(`[Ii]tem${i}\\s*:\\s*([0-3])\\s*\\|?\\s*(.*)`, 'i');
    let found = false;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const rating = parseInt(match[1]);
        const note   = (match[2] || '').trim().slice(0, 100);
        ratings.push({
          rating: isNaN(rating) ? 1 : Math.min(3, Math.max(0, rating)),
          note:   note || (isEs ? 'Inferido de la respuesta' : 'Inferred from response'),
        });
        found = true;
        break;
      }
    }

    if (!found) {
      ratings.push({
        rating: 1,
        note: isEs ? 'Información insuficiente' : 'Insufficient information',
      });
    }
  }

  // Extract summary
  let summary = '';
  for (const line of lines) {
    if (/^(Summary|Resumen)\s*:/i.test(line)) {
      summary = line.replace(/^(Summary|Resumen)\s*:\s*/i, '').trim();
      break;
    }
  }
  if (!summary) summary = isEs ? 'Área evaluada.' : 'Area assessed.';

  return { ratings, summary };
}

function fallbackRatings(cat, isEs) {
  return {
    ratings: cat.items.map(() => ({
      rating: 1,
      note: isEs ? 'Respuesta registrada' : 'Response recorded',
    })),
    summary: isEs ? 'Área registrada.' : 'Area recorded.',
  };
}

// ── Generate section report — NEVER returns an error message ──────
async function generateConversationalReport(session, sectionId) {
  const lang    = session.lang || 'en';
  const isEs    = lang === 'es';
  const section = SECTION_MAP[sectionId];
  const score   = ss.sectionScore(session, sectionId, ASSESSMENT);

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

  const hoaDocs = buildHoaDocsContext(session);

  const prompt = isEs
    ? `Eres Dr. HOA, consultor experto en HOAs de Florida para ${brand.companyName}.

Acaba de completar la evaluación de *${section.labelEs || section.label}* para "${session.communityName}".

Puntaje: ${score ?? 'parcial'}/3.00
${hoaDocs ? '\nDOCUMENTOS HOA:\n' + hoaDocs : ''}

HALLAZGOS:
${catSummaries}

Escribe un diagnóstico de WhatsApp con:

1. *Diagnóstico* — 2 oraciones sobre el estado de salud. Usa metáfora médica si aplica.
2. *Lo que funciona bien* — máximo 2 puntos con •
3. *Áreas críticas* — máximo 3 puntos con •. Para cada una, menciona el artículo específico de Florida Statute 720 que aplica y la consecuencia real de no cumplirlo.
4. *3 Acciones Inmediatas* — numeradas, específicas, ordenadas por urgencia. Incluye referencia a Florida Statute 720 donde aplique.

Termina con:
"Para un diagnóstico completo de las 5 áreas con revisión legal de sus documentos de gobierno, contacte a Dr. HOA."

Formato: *negrita*, • viñetas, párrafos cortos. Máximo 350 palabras.`

    : `You are Dr. HOA, an expert Florida HOA consultant for ${brand.companyName}.

You just completed the *${section.label}* assessment for "${session.communityName}".

Score: ${score ?? 'partial'}/3.00
${hoaDocs ? '\nHOA DOCUMENTS ON FILE:\n' + hoaDocs : ''}

FINDINGS:
${catSummaries}

Write a WhatsApp diagnosis with:

1. *Diagnosis* — 2 sentences on the health condition. Use medical metaphor if appropriate.
2. *What is working well* — max 2 points with •
3. *Critical areas* — max 3 points with •. For each one, cite the specific Florida Statute 720 section that applies and the real consequence of non-compliance.
4. *3 Immediate Actions* — numbered, specific, ordered by urgency. Reference Florida Statute 720 where applicable.

End with:
"For a complete diagnosis of all 5 areas including legal review of your governing documents, contact Dr. HOA."

Format: *bold*, • bullets, short paragraphs. Max 350 words.`;

  // Try up to 3 times — report MUST be generated
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt(session),
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0]?.text;
      if (text && text.length > 50) return text;
    } catch (err) {
      console.error(`Report attempt ${attempt} failed:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  // Final fallback — always returns SOMETHING useful, never an error
  return generateFallbackReport(session, sectionId, isEs, score, catSummaries);
}

// ── Fallback report — generated locally, no API needed ───────────
function generateFallbackReport(session, sectionId, isEs, score, catSummaries) {
  const section = SECTION_MAP[sectionId];
  const label   = isEs ? (section.labelEs || section.label) : section.label;
  const scoreNum = parseFloat(score) || 1;

  const health = isEs
    ? scoreNum >= 2.5 ? 'buena salud operacional' : scoreNum >= 1.8 ? 'necesita tratamiento' : 'condición crítica'
    : scoreNum >= 2.5 ? 'good operational health' : scoreNum >= 1.8 ? 'needs treatment' : 'critical condition';

  if (isEs) {
    return (
      `🩺 *${label} — Diagnóstico*\n\n` +
      `*Diagnóstico:* Esta área muestra ${health}. Los hallazgos registrados revelan oportunidades de mejora importantes para el cumplimiento con Florida Statute 720.\n\n` +
      `*3 Acciones Inmediatas:*\n` +
      `1. Revise sus procedimientos actuales contra los requisitos de Florida Statute 720\n` +
      `2. Documente por escrito todos los procesos que actualmente se manejan de forma informal\n` +
      `3. Consulte con Dr. HOA para una revisión legal completa de sus documentos de gobierno\n\n` +
      `Para un diagnóstico completo de las 5 áreas con revisión legal de sus documentos de gobierno, contacte a Dr. HOA.`
    );
  }

  return (
    `🩺 *${label} — Diagnosis*\n\n` +
    `*Diagnosis:* This area shows ${health}. The recorded findings reveal important improvement opportunities for Florida Statute 720 compliance.\n\n` +
    `*3 Immediate Actions:*\n` +
    `1. Review your current procedures against Florida Statute 720 requirements\n` +
    `2. Document in writing all processes currently handled informally\n` +
    `3. Contact Dr. HOA for a complete legal review of your governing documents\n\n` +
    `For a complete diagnosis of all 5 areas including legal review of your governing documents, contact Dr. HOA.`
  );
}

// ── Ask user to upload HOA documents ─────────────────────────────
function buildDocumentRequest(session, communityName) {
  const lang = session.lang || 'en';
  return lang === 'es'
    ? (
      `📋 *Documentos de ${communityName}*\n\n` +
      `Para personalizar su diagnóstico con los documentos específicos de su HOA, suba cualquiera de estos archivos:\n\n` +
      `• *Declaración de Convenios* (CC&Rs)\n` +
      `• *Estatutos* (Bylaws)\n` +
      `• *Reglamento Interno* (Rules & Regulations)\n` +
      `• *Presupuesto anual*\n` +
      `• *Actas de reuniones recientes*\n\n` +
      `_Sube el archivo ahora o continúe sin él. El diagnóstico se generará de cualquier manera._`
    )
    : (
      `📋 *${communityName} Documents*\n\n` +
      `To personalize your diagnosis with your HOA's specific documents, upload any of these files:\n\n` +
      `• *Declaration of Covenants* (CC&Rs)\n` +
      `• *Bylaws*\n` +
      `• *Rules & Regulations*\n` +
      `• *Annual budget*\n` +
      `• *Recent meeting minutes*\n\n` +
      `_Upload the file now or continue without it. The diagnosis will be generated either way._`
    );
}

// ── General chat ──────────────────────────────────────────────────
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

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt(session),
      messages,
    });
    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    ss.addChat(session, 'assistant', reply);
    return { reply, extractedRatings: [] };
  } catch (err) {
    console.error('chat error:', err.message);
    const lang = session.lang || 'en';
    return {
      reply: lang === 'es'
        ? `Responda *A, B, C, D* o *E* para continuar con una sección de evaluación, o suba un documento de su HOA.`
        : `Reply *A, B, C, D* or *E* to continue with an assessment section, or upload an HOA document.`,
      extractedRatings: [],
    };
  }
}

// ── Document analysis ─────────────────────────────────────────────
async function analyzeDocument(session, mediaPayload, caption) {
  const lang    = session.lang || 'en';
  const isEs    = lang === 'es';
  const section = session.activeSectionId ? SECTION_MAP[session.activeSectionId] : null;

  const content = [];
  if (mediaPayload.mimeType?.startsWith('image/')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaPayload.mimeType, data: mediaPayload.base64 } });
  } else if (mediaPayload.mimeType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mediaPayload.base64 } });
  } else {
    return {
      analysis: isEs
        ? '📎 Archivo guardado. Suba un PDF o imagen para análisis de IA.'
        : '📎 File saved. Upload a PDF or image for AI analysis.',
      suggestedRatings: [],
    };
  }

  const prompt = isEs
    ? `Analiza este documento HOA${section ? ` para la sección de ${section.labelEs || section.label}` : ''}.\n${caption ? `Nota del usuario: "${caption}"` : ''}\n\nCon base en Florida Statute 720:\n1. ¿Qué tipo de documento es?\n2. ¿Qué información relevante contiene para la evaluación operacional?\n3. ¿Está en cumplimiento con Florida Statute 720?\n4. ¿Qué brechas o riesgos legales presenta?\n5. Resumen en 4-5 puntos con •`
    : `Analyze this HOA document${section ? ` for the ${section.label} section` : ''}.\n${caption ? `User note: "${caption}"` : ''}\n\nBased on Florida Statute 720:\n1. What type of document is this?\n2. What relevant information does it contain for the operational assessment?\n3. Is it compliant with Florida Statute 720?\n4. What gaps or legal risks does it present?\n5. Summary in 4-5 bullet points with •`;

  content.push({ type: 'text', text: prompt });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      system: systemPrompt(session),
      messages: [{ role: 'user', content }],
    });
    return { analysis: response.content[0].text, suggestedRatings: [] };
  } catch (err) {
    console.error('analyzeDocument error:', err.message);
    return {
      analysis: isEs ? '📎 Documento guardado en su sesión.' : '📎 Document saved to your session.',
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

  const hoaDocs = buildHoaDocsContext(session);

  const prompt = isEs
    ? `Genera el INFORME COMPLETO DR. HOA para "${session.communityName}".\nPuntaje general: ${overall ?? 'parcial'}/3\n\n${sectionSummaries}\n${hoaDocs}\n\nEscribe un informe ejecutivo con:\n1. Diagnóstico general (metáfora médica)\n2. Hallazgos por sección evaluada con referencias a Florida Statute 720\n3. Problemas críticos de cumplimiento legal\n4. Plan de acción top 5 (urgente a importante)\n5. Llamado a contratar el paquete completo Dr. HOA\n\nFormato WhatsApp. Máximo 400 palabras.`
    : `Generate the COMPLETE DR. HOA REPORT for "${session.communityName}".\nOverall score: ${overall ?? 'partial'}/3\n\n${sectionSummaries}\n${hoaDocs}\n\nWrite an executive report with:\n1. Overall diagnosis (medical metaphor)\n2. Findings per assessed section with Florida Statute 720 references\n3. Critical legal compliance issues\n4. Top 5 action plan (urgent to important)\n5. Call to engage the complete Dr. HOA package\n\nWhatsApp format. Max 400 words.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt(session),
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0]?.text;
      if (text && text.length > 50) return text;
    } catch (err) {
      console.error(`Full report attempt ${attempt} failed:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  return isEs
    ? `🩺 *Informe Dr. HOA — ${session.communityName}*\n\nSu evaluación ha sido registrada. Contáctenos en ${brand.companyEmail} para recibir su informe completo con análisis de Florida Statute 720.`
    : `🩺 *Dr. HOA Report — ${session.communityName}*\n\nYour assessment has been recorded. Contact us at ${brand.companyEmail} to receive your complete report with Florida Statute 720 analysis.`;
}

module.exports = {
  inferRatings,
  generateConversationalReport,
  generateSectionReport,
  generateFullReport,
  buildDocumentRequest,
  chat,
  analyzeDocument,
};

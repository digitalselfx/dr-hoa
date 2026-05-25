/**
 * Dr. HOA — Brand Configuration
 * ─────────────────────────────────────────────────
 * THIS IS THE ONLY FILE YOU NEED TO EDIT.
 * Replace every value marked ← EDIT with your real information.
 */

module.exports = {

  // ── Bot identity (leave these as-is) ───────────────
  botName:  'Dr. HOA',
  tagline:  'Your HOA Health Specialist',
  botEmoji: '🩺',

  // ── Your company ← EDIT ALL OF THESE ───────────────
  companyName:    'Your Management Company',       // ← EDIT
  companyPhone:   '+1 (555) 000-0000',             // ← EDIT
  companyEmail:   'hello@yourcompany.com',          // ← EDIT
  companyWebsite: 'https://yourcompany.com',        // ← EDIT
  calendlyLink:   'https://calendly.com/yourco',   // ← EDIT (or any booking URL)

  // ── Freemium gate ──────────────────────────────────
  freeItemLimit: 5,   // number of items users can rate before paywall

  // ── Consultation offer copy (shown after report) ───
  consultation: {
    en: {
      title: 'Free 30-min HOA Consultation',
      body:  'Our team reviews your Dr. HOA results and gives you a clear action plan — at no cost.',
      cta:   'Book free consultation',
    },
    es: {
      title: 'Consulta HOA Gratuita de 30 min',
      body:  'Nuestro equipo revisa sus resultados y le da un plan de accion claro — sin costo.',
      cta:   'Agendar consulta gratuita',
    },
  },

  // ── Services you offer (shown in paywall perks) ────
  perks: {
    en: [
      'All 5 sections · 125 items',
      'AI diagnosis report by email',
      'Priority recommendations',
      'Free 30-min consultation',
    ],
    es: [
      '5 secciones · 125 elementos',
      'Informe de diagnostico IA por correo',
      'Recomendaciones prioritarias',
      'Consulta gratuita de 30 minutos',
    ],
  },
};

/**
 * Dr. HOA — Brand Configuration
 * ─────────────────────────────
 * Edit this file to update company info, payment link, and pricing.
 */

module.exports = {

  // ── Bot identity ───────────────────────────────────────────
  botName:    'Dr. HOA',
  tagline:    'Your HOA Health Specialist',
  botEmoji:   '🩺',

  // ── Company ────────────────────────────────────────────────
  companyName:    'Dr. HOA',
  companyEmail:   'hello@drhoa.com',          // ← EDIT
  companyWebsite: 'https://drhoa.com',         // ← EDIT

  // ── Payment ────────────────────────────────────────────────
  // Replace with your real Stripe payment link after creating it at:
  // dashboard.stripe.com → Payment Links → Create payment link
  stripeLink:  'https://buy.stripe.com/yourlink',  // ← EDIT
  packagePrice: '$49',
  packageName:  'Dr. HOA Complete Evaluation',

  // ── What is included in the paid package ──────────────────
  packageIncludes: {
    en: [
      'All 5 sections fully assessed (125 items)',
      'Complete AI diagnosis report by email',
      'Prioritized action plan for your HOA',
      'Detailed findings per section',
    ],
    es: [
      'Las 5 secciones completamente evaluadas (125 elementos)',
      'Informe completo de diagnóstico IA por correo',
      'Plan de acción priorizado para su HOA',
      'Hallazgos detallados por sección',
    ],
  },
};

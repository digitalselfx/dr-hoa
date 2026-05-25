require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');
const webhook    = require('./routes/webhook');
const brand      = require('./data/brand');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve the web app from public/
app.use(express.static(path.join(__dirname, 'public')));

// WhatsApp webhook routes
app.use('/webhook', webhook);

// Health check
app.get('/health', (req, res) => res.json({
  status: 'ok',
  app: brand.botName,
  company: brand.companyName,
  timestamp: new Date().toISOString(),
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🩺 ${brand.botName} — ${brand.tagline}`);
  console.log(`🏢 ${brand.companyName}`);
  console.log(`🌐 Web app:  http://localhost:${PORT}`);
  console.log(`📱 Webhook:  ${process.env.BASE_URL || 'http://localhost:'+PORT}/webhook/whatsapp`);
  console.log(`📊 Leads:    ${process.env.BASE_URL || 'http://localhost:'+PORT}/webhook/leads\n`);
});

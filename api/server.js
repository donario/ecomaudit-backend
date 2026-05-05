/**
 * EcomAudit — Express Server
 *
 * Endpoints:
 * POST /api/audit         — Generate a new audit
 * GET  /api/audit/:id     — Get audit results
 * GET  /api/health        — Health check
 *
 * Environment variables needed:
 * ANTHROPIC_API_KEY  — Claude API key
 * PORT               — Server port (default: 3000)
 */

const express = require('express');
const cors = require('cors');
const { runAudit } = require('./audit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory store (replace with DB in production)
const audits = new Map();

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ecomaudit-backend', timestamp: new Date().toISOString() });
});

// Generate audit
app.post('/api/audit', async (req, res) => {
  const { url, plan = 'growth', email } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Generate audit ID
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store as pending
  audits.set(auditId, {
    id: auditId,
    status: 'processing',
    url,
    plan,
    email,
    created_at: new Date().toISOString()
  });

  // Return ID immediately (client can poll for results)
  res.json({
    id: auditId,
    status: 'processing',
    message: 'Auditoria en proceso. Consulta el estado en /api/audit/' + auditId
  });

  // Generate audit in background
  try {
    const result = await runAudit(url, plan);
    audits.set(auditId, {
      id: auditId,
      status: 'completed',
      url,
      plan,
      email,
      created_at: audits.get(auditId).created_at,
      completed_at: new Date().toISOString(),
      result
    });
    console.log(`Audit ${auditId} completed for ${url}`);

  } catch (err) {
    console.error(`Audit ${auditId} failed:`, err.message);
    audits.set(auditId, {
      ...audits.get(auditId),
      status: 'failed',
      error: err.message
    });
  }
});

// Get audit results (polling endpoint)
app.get('/api/audit/:id', (req, res) => {
  const audit = audits.get(req.params.id);
  if (!audit) {
    return res.status(404).json({ error: 'Audit not found' });
  }
  res.json(audit);
});

// Webhook endpoint for Shopify (when customer purchases)
app.post('/api/webhook/shopify', async (req, res) => {
  const order = req.body;
  console.log('New Shopify order received');

  // Extract URL from order notes or custom field
  const websiteUrl = order.note || order.note_attributes?.find(a => a.name === 'website_url')?.value;
  const customerEmail = order.email;

  // Determine plan from product
  let plan = 'starter';
  if (order.line_items) {
    const productTitle = order.line_items[0]?.title?.toLowerCase() || '';
    if (productTitle.includes('pro')) plan = 'pro';
    else if (productTitle.includes('growth')) plan = 'growth';
  }

  if (websiteUrl) {
    // Trigger audit automatically
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    audits.set(auditId, {
      id: auditId,
      status: 'processing',
      url: websiteUrl,
      plan,
      email: customerEmail,
      shopify_order_id: order.id,
      created_at: new Date().toISOString()
    });

    // Run audit in background
    runAudit(websiteUrl, plan).then(result => {
      audits.set(auditId, {
        ...audits.get(auditId),
        status: 'completed',
        completed_at: new Date().toISOString(),
        result
      });
    }).catch(err => {
      audits.set(auditId, {
        ...audits.get(auditId),
        status: 'failed',
        error: err.message
      });
    });
  }

  res.status(200).json({ received: true });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`EcomAudit Backend API running on port ${PORT}`);
});

module.exports = app;

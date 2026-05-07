/**
 * EcomAudit — Express Server
 *
 * Endpoints:
 * POST /api/audit     — Generate a new audit (legacy/standalone)
 * POST /analyze       — Generate audit triggered by dashboard (calls back to Vercel)
 * GET  /api/audit/:id — Get audit results
 * GET  /api/health    — Health check
 *
 * Environment variables needed:
 * ANTHROPIC_API_KEY  — Claude API key
 * RESEND_API_KEY     — Resend email API key
 * FROM_EMAIL         — Sender email (default: auditorias@ecomaudit.shop)
 * PORT               — Server port (default: 3000)
 * CALLBACK_URL       — Vercel callback URL (https://ecomaudit.shop/api/audit/callback)
 * INTERNAL_API_KEY   — Shared secret for callback authentication
 */

const express = require('express');
const cors = require('cors');
const { runAudit } = require('../audit');
const { sendAuditEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory store (replace with DB in production)
const audits = new Map();

// ==============================================
// ROUTES
// ==============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ecomaudit-backend', timestamp: new Date().toISOString() });
});

// Generate audit (legacy standalone endpoint)
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
    message: 'Auditoría en proceso. Consulta el estado en /api/audit/' + auditId
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
    console.log(`✅ Audit ${auditId} completed for ${url}`);

    // Send email with results
    if (email) {
      await sendAuditEmail(email, result, url, plan);
    }
  } catch (err) {
    console.error(`❌ Audit ${auditId} failed:`, err.message);
    audits.set(auditId, {
      ...audits.get(auditId),
      status: 'failed',
      error: err.message
    });
  }
});

// ==============================================
// NEW: Dashboard-triggered audit with callback
// ==============================================
app.post('/analyze', async (req, res) => {
  const { url, auditId, customerId, plan = 'growth' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`\n📋 Dashboard audit received:`);
  console.log(`   URL: ${url}`);
  console.log(`   Audit ID: ${auditId}`);
  console.log(`   Customer ID: ${customerId}`);
  console.log(`   Plan: ${plan}`);

  // Respond immediately — audit runs in background
  res.json({ received: true, auditId });

  // Run audit in background
  try {
    const result = await runAudit(url, plan);
    console.log(`✅ Audit ${auditId} completed for ${url}`);
    console.log(`📊 Result keys:`, Object.keys(result));
    if (result.scores) console.log(`📊 Scores keys:`, Object.keys(result.scores));
    if (result.categories) console.log(`📊 Categories keys:`, Object.keys(result.categories));

    // Map audit result to callback format
    // The result shape from audit.js varies — try multiple field paths
    const scores = {};

    // Global score
    scores.overall = result.global_score || result.scores?.overall || result.score || 0;

    // Category scores — try direct scores object, then categories object
    const categoryNames = ['seo', 'performance', 'ux', 'conversion', 'mobile', 'security', 'content', 'technical'];
    for (const cat of categoryNames) {
      scores[cat] = result.scores?.[cat]
        || result.categories?.[cat]?.score
        || result[cat]?.score
        || result[cat]
        || 0;
    }

    const callbackPayload = {
      auditId,
      status: 'done',
      scores,
      issues: result.issues || result.top_issues || [],
      quickWins: result.quickWins || result.quick_wins || result.recommendations || [],
      summary: result.summary || result.executive_summary || result.resumen || '',
      pdfUrl: result.pdfUrl || null,
      // Pass full result for debugging/future use
      fullResult: result,
    };

    // Call back to Vercel to update Supabase
    const callbackUrl = process.env.CALLBACK_URL || 'https://ecomaudit.shop/api/audit/callback';
    const internalApiKey = process.env.INTERNAL_API_KEY;

    if (!internalApiKey) {
      console.error('❌ INTERNAL_API_KEY not set — cannot call back to Vercel');
      return;
    }

    console.log(`📤 Calling back to ${callbackUrl}...`);

    const callbackRes = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': internalApiKey,
      },
      body: JSON.stringify(callbackPayload),
    });

    if (callbackRes.ok) {
      console.log(`✅ Callback successful — audit ${auditId} saved to Supabase`);
    } else {
      const errText = await callbackRes.text();
      console.error(`❌ Callback failed (${callbackRes.status}):`, errText);
    }

  } catch (err) {
    console.error(`❌ Audit ${auditId} failed:`, err.message);

    // Try to report failure back to Vercel
    try {
      const callbackUrl = process.env.CALLBACK_URL || 'https://ecomaudit.shop/api/audit/callback';
      const internalApiKey = process.env.INTERNAL_API_KEY;
      if (internalApiKey) {
        await fetch(callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': internalApiKey,
          },
          body: JSON.stringify({
            auditId,
            status: 'failed',
            scores: { overall: 0 },
            issues: [],
            quickWins: [],
            summary: `Error: ${err.message}`,
          }),
        });
      }
    } catch (callbackErr) {
      console.error('❌ Failed to report error to Vercel:', callbackErr.message);
    }
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

// Shopify webhook (legacy)
app.post('/shopify/webhook', async (req, res) => {
  const order = req.body;
  console.log('Shopify webhook received:', order.id);

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
    runAudit(websiteUrl, plan).then(async (result) => {
      audits.set(auditId, {
        ...audits.get(auditId),
        status: 'completed',
        completed_at: new Date().toISOString(),
        result
      });

      console.log(`✅ Audit ${auditId} completed for ${websiteUrl}`);

      // Send email with results
      if (customerEmail) {
        await sendAuditEmail(customerEmail, result, websiteUrl, plan);
      }
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

// ==============================================
// START SERVER
// ==============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║     EcomAudit Backend API             ║
║     Running on port ${PORT}              ║
╚═══════════════════════════════════════╝
  `);
});

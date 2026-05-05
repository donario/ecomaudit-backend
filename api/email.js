/**
 * EcomAudit — Email Module (Resend)
 *
 * Sends audit results to customers via email.
 * Requires RESEND_API_KEY environment variable.
 */

const fetch = require('node-fetch');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'auditorias@ecomaudit.shop';

/**
 * Send audit results email to customer
 */
async function sendAuditEmail(to, auditResult, websiteUrl, plan) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - skipping email');
    return { success: false, error: 'No API key' };
  }

  const scoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const overallScore = auditResult.puntuacion_general || auditResult.overall_score || 0;

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px 16px 0 0;padding:40px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">EcomAudit</h1>
      <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Tu auditoria web esta lista</p>
    </div>
    <div style="background:#fff;padding:32px;text-align:center;border-bottom:1px solid #e2e8f0;">
      <p style="color:#64748b;margin:0 0 8px;font-size:14px;">Puntuacion general</p>
      <div style="display:inline-block;width:80px;height:80px;border-radius:50%;background:${scoreColor(overallScore)};line-height:80px;text-align:center;">
        <span style="color:#fff;font-size:32px;font-weight:700;">${overallScore}</span>
      </div>
      <p style="color:#334155;margin:16px 0 0;font-size:16px;font-weight:600;">${websiteUrl}</p>
      <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Plan: ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
    </div>
    <div style="background:#fff;padding:32px;">
      <h2 style="color:#0f172a;margin:0 0 20px;font-size:18px;">Resumen de la auditoria</h2>
      <p style="color:#64748b;">Los detalles completos de tu auditoria han sido generados. Visita ecomaudit.shop para ver el informe completo.</p>
    </div>
    <div style="background:#fff;padding:24px 32px 32px;text-align:center;border-radius:0 0 16px 16px;">
      <a href="https://ecomaudit.shop" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Ver auditoria completa</a>
    </div>
    <div style="padding:24px 32px;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">EcomAudit - Auditorias web para e-commerce<br><a href="https://ecomaudit.shop" style="color:#64748b;">ecomaudit.shop</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EcomAudit <' + FROM_EMAIL + '>',
        to: [to],
        subject: 'Tu auditoria de ' + websiteUrl + ' esta lista - Puntuacion: ' + overallScore + '/100',
        html: htmlBody
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Email sent to ' + to + ' for ' + websiteUrl);
      return { success: true, id: data.id };
    } else {
      console.error('Email failed:', data);
      return { success: false, error: data };
    }
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendAuditEmail };

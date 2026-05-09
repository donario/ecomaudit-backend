/**
 * Auto-Audit Cron Job
 * 
 * Runs on the 1st of each month at 08:00 UTC.
 * Queries Supabase for customers with auto_audit = true,
 * checks their plan limits, and triggers audits for their URLs.
 */

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Plan limits
const PLAN_LIMITS = {
  starter: 1,
  growth: 2,
  pro: 4,
};

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function runAutoAudits() {
  console.log('\n🔄 Auto-audit cron started:', new Date().toISOString());

  const supabase = getSupabase();
  if (!supabase) return;

  try {
    // 1. Get customers with auto_audit enabled and paid plans
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, email, plan, audits_used, audits_limit, auto_audit_urls')
      .eq('auto_audit', true)
      .in('plan', ['starter', 'growth', 'pro']);

    if (custErr) {
      console.error('❌ Error fetching customers:', custErr.message);
      return;
    }

    if (!customers || customers.length === 0) {
      console.log('ℹ️  No customers with auto_audit enabled');
      return;
    }

    console.log(`📋 Found ${customers.length} customers with auto_audit`);

    // 2. Reset audits_used for the new month
    const { error: resetErr } = await supabase
      .from('customers')
      .update({ audits_used: 0 })
      .in('plan', ['starter', 'growth', 'pro']);

    if (resetErr) {
      console.error('❌ Error resetting audits_used:', resetErr.message);
    } else {
      console.log('🔄 Reset audits_used for all paid customers');
    }

    // 3. Process each customer
    for (const customer of customers) {
      const limit = PLAN_LIMITS[customer.plan] || 0;
      const urls = customer.auto_audit_urls || [];

      if (urls.length === 0) {
        console.log(`⚠️  Customer ${customer.id} has no URLs configured, skipping`);
        continue;
      }

      // Cap URLs to plan limit
      const urlsToAudit = urls.slice(0, limit);
      console.log(`\n👤 Customer ${customer.id} (${customer.plan}): ${urlsToAudit.length} audit(s)`);

      for (const url of urlsToAudit) {
        try {
          // Create audit record in Supabase
          const { data: audit, error: auditErr } = await supabase
            .from('audits')
            .insert({
              customer_id: customer.id,
              url,
              status: 'running',
              plan: customer.plan,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (auditErr) {
            console.error(`❌ Error creating audit for ${url}:`, auditErr.message);
            continue;
          }

          // Increment audits_used
          await supabase
            .from('customers')
            .update({ audits_used: (customer.audits_used || 0) + 1 })
            .eq('id', customer.id);

          // Trigger the audit via local /analyze endpoint
          const analyzeUrl = `http://localhost:${process.env.PORT || 3000}/analyze`;
          const payload = {
            url,
            auditId: audit.id,
            customerId: customer.id,
            plan: customer.plan,
          };

          console.log(`🚀 Triggering audit for ${url} (audit ${audit.id})`);

          fetch(analyzeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(err => {
            console.error(`❌ Failed to trigger audit for ${url}:`, err.message);
          });

          // Small delay between triggers to avoid overload
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (err) {
          console.error(`❌ Error processing ${url} for customer ${customer.id}:`, err.message);
        }
      }
    }

    console.log('\n✅ Auto-audit cron completed');
  } catch (err) {
    console.error('❌ Auto-audit cron error:', err.message);
  }
}

/**
 * Start the cron scheduler.
 * Schedule: 1st of every month at 08:00 UTC
 * Cron expression: '0 8 1 * *'
 */
function startCron() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log('⚠️  Supabase not configured — auto-audit cron disabled');
    return;
  }

  // Run on 1st of each month at 08:00 UTC
  cron.schedule('0 8 1 * *', () => {
    runAutoAudits();
  }, { timezone: 'UTC' });

  console.log('⏰ Auto-audit cron scheduled (1st of each month, 08:00 UTC)');
}

module.exports = { startCron, runAutoAudits };

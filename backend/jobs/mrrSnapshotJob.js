const cron = require('node-cron');
const { getOne, getAll, run } = require('../config/database');

const TIER_PRICES = { free: 0, growth: 29, pro: 59 };

async function takeMRRSnapshot() {
  try {
    const month = new Date();
    month.setDate(1);
    const monthStr = month.toISOString().split('T')[0];

    const tenants = await getAll(
      "SELECT subscription_tier, subscription_status FROM tenants WHERE active = TRUE"
    );
    const activePaid = tenants.filter(t => t.subscription_status === 'active');
    const totalMRR = activePaid.reduce((sum, t) => sum + (TIER_PRICES[t.subscription_tier] || 0), 0);

    const freeCount = tenants.filter(t => t.subscription_tier === 'free' || !t.subscription_tier).length;
    const growthCount = tenants.filter(t => t.subscription_tier === 'growth').length;
    const proCount = tenants.filter(t => t.subscription_tier === 'pro').length;

    const newResult = await getOne(
      "SELECT COUNT(*)::int as count FROM tenants WHERE created_at >= DATE_TRUNC('month', NOW())"
    );
    const churnResult = await getOne(
      "SELECT COUNT(*)::int as count FROM tenants WHERE active = FALSE AND updated_at >= DATE_TRUNC('month', NOW())"
    );

    await run(
      `INSERT INTO platform_mrr_snapshots (month, total_mrr, tenant_count, free_count, growth_count, pro_count, churn_count, new_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (month) DO UPDATE SET
         total_mrr = $2, tenant_count = $3, free_count = $4, growth_count = $5,
         pro_count = $6, churn_count = $7, new_count = $8, snapshot_at = CURRENT_TIMESTAMP`,
      [monthStr, totalMRR, tenants.length, freeCount, growthCount, proCount, churnResult.count, newResult.count]
    );

    console.log(`[MRR Snapshot] ${monthStr}: £${totalMRR} MRR, ${tenants.length} tenants`);
  } catch (err) {
    console.error('[MRR Snapshot] Error:', err);
  }
}

function initMRRSnapshotJob() {
  // 1st of every month at 2:00 AM
  cron.schedule('0 2 1 * *', () => {
    console.log('[MRR Snapshot] Taking monthly snapshot...');
    takeMRRSnapshot();
  });

  // Take initial snapshot on startup if none exists for current month
  takeMRRSnapshot();

  console.log('[MRR Snapshot] Job scheduled (1st of each month at 2:00 AM)');
}

module.exports = { initMRRSnapshotJob, takeMRRSnapshot };

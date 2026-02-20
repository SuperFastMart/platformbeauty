const { run } = require('../config/database');

async function logActivity(tenantId, userType, userId, userEmail, action, details) {
  try {
    await run(
      `INSERT INTO activity_log (tenant_id, user_type, user_id, user_email, action, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId || null, userType, userId || null, userEmail || null, action, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

module.exports = { logActivity };

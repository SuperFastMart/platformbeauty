const { getOne, getAll, run } = require('../config/database');

/**
 * GDPR-compliant customer data deletion.
 * Deletes personal data, anonymises financial records.
 * Used by both admin deletion and customer self-service.
 */
async function deleteCustomerData(customerId, tenantId, customerEmail) {
  // 1. Delete personal data records (no financial value)
  await run('DELETE FROM booking_requests WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);
  await run('DELETE FROM email_logs WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);
  await run('DELETE FROM messages WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);

  // 2. Delete loyalty data
  await run('DELETE FROM customer_category_stamps WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);
  await run('DELETE FROM loyalty_transactions WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);
  await run('DELETE FROM redeemed_rewards WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]);

  // 3. Delete waitlist entries
  await run('DELETE FROM waitlist WHERE customer_id = $1 AND tenant_id = $2', [customerId, tenantId]).catch(() => {});

  // 4. Anonymise discount code uses (preserve for reporting)
  await run(
    'UPDATE discount_code_uses SET customer_id = NULL WHERE customer_id = $1 AND tenant_id = $2',
    [customerId, tenantId]
  );

  // 5. Anonymise reviews (preserve ratings for business)
  await run(
    `UPDATE reviews SET customer_name = 'Deleted Customer', customer_id = NULL
     WHERE customer_id = $1 AND tenant_id = $2`,
    [customerId, tenantId]
  );

  // 6. Anonymise bookings (preserve for revenue reporting)
  await run(
    `UPDATE bookings SET
      customer_name = 'Deleted Customer',
      customer_email = 'deleted@removed.local',
      customer_phone = NULL,
      customer_id = NULL,
      notes = NULL
    WHERE customer_email = $1 AND tenant_id = $2`,
    [customerEmail, tenantId]
  );

  // 7. Delete customer record
  await run('DELETE FROM customers WHERE id = $1 AND tenant_id = $2', [customerId, tenantId]);

  return { deleted: true };
}

module.exports = { deleteCustomerData };

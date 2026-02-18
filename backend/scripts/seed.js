require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, getOne, run } = require('../config/database');

async function seed() {
  console.log('Seeding database...');

  // 1. Create platform admin
  const existingAdmin = await getOne('SELECT id FROM platform_admins WHERE email = $1', ['admin@bookingplatform.com']);

  if (!existingAdmin) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    await run(
      'INSERT INTO platform_admins (email, password, name, role) VALUES ($1, $2, $3, $4)',
      ['admin@bookingplatform.com', adminPassword, 'Platform Admin', 'admin']
    );
    console.log('  ✓ Platform admin created (admin@bookingplatform.com / admin123)');
  } else {
    console.log('  - Platform admin already exists');
  }

  // 2. Create demo tenant "Studio Jen"
  const existingTenant = await getOne('SELECT id FROM tenants WHERE slug = $1', ['studiojen']);
  let tenantId;

  if (!existingTenant) {
    const tenant = await getOne(
      `INSERT INTO tenants (name, slug, owner_email, owner_name, business_phone, primary_color, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
       RETURNING id`,
      ['Studio Jen', 'studiojen', 'jen@studiojen.com', 'Jennifer Smith', '07700 900123', '#8B2635']
    );
    tenantId = tenant.id;
    console.log('  ✓ Tenant "Studio Jen" created');
  } else {
    tenantId = existingTenant.id;
    console.log('  - Tenant "Studio Jen" already exists');
  }

  // 3. Create tenant admin user
  const existingUser = await getOne(
    'SELECT id FROM tenant_users WHERE tenant_id = $1 AND email = $2',
    [tenantId, 'jen@studiojen.com']
  );

  if (!existingUser) {
    const tenantPassword = await bcrypt.hash('admin123', 10);
    await run(
      'INSERT INTO tenant_users (tenant_id, username, email, password, role) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, 'jen', 'jen@studiojen.com', tenantPassword, 'admin']
    );
    console.log('  ✓ Tenant admin created (jen@studiojen.com / admin123)');
  } else {
    console.log('  - Tenant admin already exists');
  }

  // 4. Create sample services
  const existingServices = await getOne('SELECT id FROM services WHERE tenant_id = $1 LIMIT 1', [tenantId]);

  if (!existingServices) {
    const services = [
      // Hair
      { name: 'Wash & Blowdry', description: 'Shampoo, condition and professional blowdry', duration: 30, price: 25.00, category: 'Hair', order: 1 },
      { name: 'Cut & Blowdry', description: 'Precision cut with wash and blowdry finish', duration: 60, price: 45.00, category: 'Hair', order: 2 },
      { name: 'Full Colour', description: 'Root to tip single-process colour', duration: 90, price: 75.00, category: 'Hair', order: 3 },
      { name: 'Highlights (Half Head)', description: 'Foil highlights for natural dimension', duration: 90, price: 85.00, category: 'Hair', order: 4 },
      // Nails
      { name: 'Gel Manicure', description: 'Gel polish application with nail shaping and cuticle care', duration: 45, price: 30.00, category: 'Nails', order: 1 },
      { name: 'Gel Pedicure', description: 'Full pedicure with gel polish', duration: 60, price: 35.00, category: 'Nails', order: 2 },
      // Treatments
      { name: 'Express Facial', description: 'Quick rejuvenating facial treatment', duration: 30, price: 35.00, category: 'Treatments', order: 1 },
      { name: 'Deep Cleanse Facial', description: 'Thorough deep cleansing facial', duration: 60, price: 55.00, category: 'Treatments', order: 2 },
    ];

    for (const s of services) {
      await run(
        'INSERT INTO services (tenant_id, name, description, duration, price, category, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [tenantId, s.name, s.description, s.duration, s.price, s.category, s.order]
      );
    }
    console.log('  ✓ 8 sample services created');
  } else {
    console.log('  - Services already exist');
  }

  // 5. Create slot templates (Mon-Sat, 9am-5pm, 30min slots)
  const existingTemplates = await getOne('SELECT id FROM slot_templates WHERE tenant_id = $1 LIMIT 1', [tenantId]);

  if (!existingTemplates) {
    const days = [
      { day: 1, name: 'Monday' },
      { day: 2, name: 'Tuesday' },
      { day: 3, name: 'Wednesday' },
      { day: 4, name: 'Thursday' },
      { day: 5, name: 'Friday' },
      { day: 6, name: 'Saturday' },
    ];

    for (const d of days) {
      await run(
        'INSERT INTO slot_templates (tenant_id, name, day_of_week, start_time, end_time, slot_duration) VALUES ($1, $2, $3, $4, $5, $6)',
        [tenantId, d.name, d.day, '09:00', '17:00', 30]
      );
    }
    console.log('  ✓ Slot templates created (Mon-Sat, 9am-5pm)');
  } else {
    console.log('  - Slot templates already exist');
  }

  console.log('Seeding complete.');
}

// Run standalone or export for server.js
if (require.main === module) {
  seed()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { seed };

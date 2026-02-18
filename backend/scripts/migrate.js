require('dotenv').config();
const { pool, run } = require('../config/database');

const migrations = [
  // ============================================
  // PLATFORM-LEVEL TABLES (no tenant_id)
  // ============================================
  {
    name: '001_create_tenants',
    sql: `
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        owner_email VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        business_phone VARCHAR(50),
        business_address TEXT,
        logo_url TEXT,
        primary_color VARCHAR(7) DEFAULT '#8B2635',
        subscription_tier VARCHAR(20) DEFAULT 'basic',
        subscription_status VARCHAR(20) DEFAULT 'trial',
        trial_ends_at TIMESTAMP,
        stripe_publishable_key TEXT,
        stripe_secret_key TEXT,
        brevo_enabled BOOLEAN DEFAULT FALSE,
        sms_enabled BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '002_create_platform_admins',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },

  // ============================================
  // TENANT-LEVEL TABLES (all have tenant_id)
  // ============================================
  {
    name: '003_create_tenant_users',
    sql: `
      CREATE TABLE IF NOT EXISTS tenant_users (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, username),
        UNIQUE(tenant_id, email)
      )
    `
  },
  {
    name: '004_create_services',
    sql: `
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100),
        display_order INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '005_create_time_slots',
    sql: `
      CREATE TABLE IF NOT EXISTS time_slots (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '006_create_bookings',
    sql: `
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        service_ids TEXT,
        service_names TEXT,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        total_price DECIMAL(10,2),
        total_duration INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        payment_status VARCHAR(20) DEFAULT 'pending',
        stripe_payment_intent_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '007_create_customers',
    sql: `
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        notes TEXT,
        stripe_customer_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, email)
      )
    `
  },
  {
    name: '008_create_tenant_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, setting_key)
      )
    `
  },
  {
    name: '009_create_reviews',
    sql: `
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_name VARCHAR(255) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '010_create_slot_templates',
    sql: `
      CREATE TABLE IF NOT EXISTS slot_templates (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        day_of_week INTEGER NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        slot_duration INTEGER DEFAULT 30,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '011_create_slot_exceptions',
    sql: `
      CREATE TABLE IF NOT EXISTS slot_exceptions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        date DATE NOT NULL,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },

  // ============================================
  // INDEXES
  // ============================================
  {
    name: '012_add_timeslot_unique_index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_timeslots_unique
      ON time_slots (tenant_id, date, start_time)
    `
  },

  // ============================================
  // MIGRATION TRACKING
  // ============================================
  {
    name: '000_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    runFirst: true
  },
];

async function migrate() {
  console.log('Running migrations...');

  // Run migrations table creation first
  const migrationsTable = migrations.find(m => m.runFirst);
  if (migrationsTable) {
    await run(migrationsTable.sql);
  }

  // Run remaining migrations in order
  for (const migration of migrations.filter(m => !m.runFirst)) {
    const existing = await pool.query(
      'SELECT id FROM migrations WHERE name = $1',
      [migration.name]
    );

    if (existing.rows.length === 0) {
      console.log(`  Running: ${migration.name}`);
      await run(migration.sql);
      await run(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migration.name]
      );
      console.log(`  ✓ ${migration.name}`);
    } else {
      console.log(`  - ${migration.name} (already run)`);
    }
  }

  console.log('Migrations complete.');
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };

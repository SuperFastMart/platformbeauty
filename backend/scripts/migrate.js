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
  // SPRINT 1: Customer Portal + Email + Booking Requests
  // ============================================
  {
    name: '013_alter_customers_auth',
    sql: `
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS magic_link_token VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS magic_link_expires TIMESTAMP;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_date DATE;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_visits INTEGER DEFAULT 0;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
    `
  },
  {
    name: '014_alter_bookings_tracking',
    sql: `
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by VARCHAR(20) DEFAULT 'customer';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sms_24h_sent BOOLEAN DEFAULT FALSE;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS marked_noshow BOOLEAN DEFAULT FALSE;
    `
  },
  {
    name: '015_create_payments',
    sql: `
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        amount DECIMAL(10,2),
        payment_method VARCHAR(20) DEFAULT 'pay_at_salon',
        payment_status VARCHAR(20) DEFAULT 'pending',
        stripe_payment_id TEXT,
        stripe_payment_method_id TEXT,
        noshow_charge_id TEXT,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '016_create_booking_requests',
    sql: `
      CREATE TABLE IF NOT EXISTS booking_requests (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        request_type VARCHAR(20) NOT NULL,
        reason TEXT,
        requested_date DATE,
        requested_time TIME,
        hours_notice DECIMAL(5,1),
        status VARCHAR(20) DEFAULT 'pending',
        admin_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `
  },
  {
    name: '017_create_email_logs',
    sql: `
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255),
        email_type VARCHAR(50),
        subject VARCHAR(500),
        booking_id INTEGER,
        customer_id INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        provider_message_id TEXT,
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '018_alter_slot_templates_break',
    sql: `
      ALTER TABLE slot_templates ADD COLUMN IF NOT EXISTS break_start TIME;
      ALTER TABLE slot_templates ADD COLUMN IF NOT EXISTS break_end TIME;
    `
  },
  {
    name: '019_alter_slot_exceptions_custom_hours',
    sql: `
      ALTER TABLE slot_exceptions ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT TRUE;
      ALTER TABLE slot_exceptions ADD COLUMN IF NOT EXISTS custom_start_time TIME;
      ALTER TABLE slot_exceptions ADD COLUMN IF NOT EXISTS custom_end_time TIME;
    `
  },

  // ============================================
  // SPRINT 3: Loyalty + Discount Codes + Reviews + Reports
  // ============================================
  {
    name: '020_create_loyalty_config',
    sql: `
      CREATE TABLE IF NOT EXISTS loyalty_config (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) UNIQUE,
        stamps_needed INTEGER DEFAULT 6,
        discount_percent INTEGER DEFAULT 50,
        active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '021_create_customer_category_stamps',
    sql: `
      CREATE TABLE IF NOT EXISTS customer_category_stamps (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        category VARCHAR(100) NOT NULL,
        stamps INTEGER DEFAULT 0,
        lifetime_stamps INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, customer_id, category)
      )
    `
  },
  {
    name: '022_create_loyalty_rewards',
    sql: `
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255),
        points_cost INTEGER,
        reward_type VARCHAR(50) DEFAULT 'percentage_discount',
        reward_value INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '023_create_redeemed_rewards',
    sql: `
      CREATE TABLE IF NOT EXISTS redeemed_rewards (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        reward_id INTEGER REFERENCES loyalty_rewards(id),
        code VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        used_at TIMESTAMP,
        booking_id INTEGER,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '024_create_loyalty_transactions',
    sql: `
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        booking_id INTEGER,
        points_change INTEGER,
        transaction_type VARCHAR(20),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '025_create_discount_codes',
    sql: `
      CREATE TABLE IF NOT EXISTS discount_codes (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        code VARCHAR(50) NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INTEGER,
        uses_count INTEGER DEFAULT 0,
        min_spend DECIMAL(10,2) DEFAULT 0,
        category VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, code)
      )
    `
  },
  {
    name: '026_create_discount_code_uses',
    sql: `
      CREATE TABLE IF NOT EXISTS discount_code_uses (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        discount_code_id INTEGER REFERENCES discount_codes(id),
        booking_id INTEGER,
        customer_id INTEGER,
        discount_amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '027_alter_bookings_discount',
    sql: `
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code_id INTEGER;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
    `
  },
  {
    name: '028_alter_reviews_extra',
    sql: `
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id INTEGER;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id INTEGER;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS service_category VARCHAR(100);
    `
  },

  // ============================================
  // SPRINT 4: Messages + Site Settings + Reviews Enhancements
  // ============================================
  {
    name: '029_create_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        booking_id INTEGER,
        direction VARCHAR(20) NOT NULL,
        subject VARCHAR(500),
        body TEXT NOT NULL,
        sent_via VARCHAR(20) DEFAULT 'email',
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '030_create_message_templates',
    sql: `
      CREATE TABLE IF NOT EXISTS message_templates (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        body TEXT NOT NULL,
        category VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '031_alter_slot_exceptions_unique',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_exceptions_unique
      ON slot_exceptions (tenant_id, date)
    `
  },

  // ============================================
  // SPRINT 6: Support, Notifications, Impersonation, Activity Log
  // ============================================
  {
    name: '032_create_support_tickets',
    sql: `
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        subject TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'open',
        created_by_email TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

      CREATE TABLE IF NOT EXISTS ticket_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
    `
  },
  {
    name: '033_create_platform_notifications',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_notifications (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        metadata JSONB,
        tenant_id INTEGER REFERENCES tenants(id),
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_platform_notifications_read ON platform_notifications(read_at);
      CREATE INDEX IF NOT EXISTS idx_platform_notifications_created ON platform_notifications(created_at DESC);
    `
  },
  {
    name: '034_create_impersonation_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS impersonation_sessions (
        id SERIAL PRIMARY KEY,
        impersonator_type TEXT NOT NULL,
        impersonator_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_tenant_id INTEGER REFERENCES tenants(id),
        target_customer_id INTEGER,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      );

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS allow_admin_impersonation BOOLEAN DEFAULT FALSE;
    `
  },
  {
    name: '035_create_activity_log',
    sql: `
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id),
        user_type TEXT NOT NULL,
        user_id INTEGER,
        user_email TEXT,
        action TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
    `
  },

  {
    name: '036_alter_tenant_users_last_login',
    sql: `
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
    `
  },

  {
    name: '037_alter_tenants_stripe_subscription',
    sql: `
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_stripe_customer_id TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_price_id TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP;
    `
  },

  {
    name: '038_create_subscription_plans',
    sql: `
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        tier VARCHAR(50) NOT NULL UNIQUE,
        stripe_product_id TEXT,
        stripe_price_id TEXT,
        price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
        features JSONB DEFAULT '[]',
        max_services INTEGER,
        max_bookings_per_month INTEGER,
        sms_enabled BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed default plans
      INSERT INTO subscription_plans (name, tier, price_monthly, display_order, features, max_services, max_bookings_per_month, sms_enabled)
      VALUES
        ('Free', 'free', 0, 0, '["Up to 3 services", "Up to 20 bookings/month", "Basic booking page", "Email notifications"]', 3, 20, FALSE),
        ('Starter', 'starter', 14.99, 1, '["Up to 10 services", "Up to 100 bookings/month", "Custom branding", "Email notifications", "Customer management", "Basic reports"]', 10, 100, FALSE),
        ('Professional', 'professional', 29.99, 2, '["Unlimited services", "Unlimited bookings", "Custom branding & fonts", "Email + SMS notifications", "Loyalty programme", "Discount codes", "Full reports & analytics", "Review collection"]', NULL, NULL, TRUE),
        ('Enterprise', 'enterprise', 49.99, 3, '["Everything in Professional", "Priority support", "Custom domain support", "API access", "Multiple staff members", "Advanced analytics"]', NULL, NULL, TRUE)
      ON CONFLICT (tier) DO NOTHING;
    `
  },

  {
    name: '040_update_subscription_tiers',
    sql: `
      -- Update Free tier: 5 services, 50 bookings
      UPDATE subscription_plans SET
        max_services = 5, max_bookings_per_month = 50,
        features = '["Up to 5 services","Up to 50 bookings/month","Basic booking page","Email notifications"]',
        updated_at = NOW()
      WHERE tier = 'free';

      -- Rename Starter → Growth, new pricing
      UPDATE subscription_plans SET
        name = 'Growth', tier = 'growth', price_monthly = 12.99,
        max_services = NULL, max_bookings_per_month = NULL, sms_enabled = FALSE,
        features = '["Unlimited services","Unlimited bookings","Custom branding & fonts","Email notifications","Customer management","Discount codes","Reports & analytics"]',
        display_order = 1, stripe_product_id = NULL, stripe_price_id = NULL,
        updated_at = NOW()
      WHERE tier = 'starter';

      -- Rename Professional → Pro, new pricing
      UPDATE subscription_plans SET
        name = 'Pro', tier = 'pro', price_monthly = 24.99,
        features = '["Everything in Growth","SMS notifications","Loyalty programme","Review collection","Priority support","Calendar feed"]',
        display_order = 2, stripe_product_id = NULL, stripe_price_id = NULL,
        updated_at = NOW()
      WHERE tier = 'professional';

      -- Deactivate Enterprise tier
      UPDATE subscription_plans SET is_active = FALSE, updated_at = NOW() WHERE tier = 'enterprise';

      -- Migrate existing tenants to new tier names
      UPDATE tenants SET subscription_tier = 'growth' WHERE subscription_tier = 'starter';
      UPDATE tenants SET subscription_tier = 'pro' WHERE subscription_tier IN ('professional', 'enterprise');
    `
  },

  {
    name: '039_alter_tenant_users_verification_mfa',
    sql: `
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;
      ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS mfa_dismissed_at TIMESTAMP;
      -- Mark existing users as verified since they pre-date this feature
      UPDATE tenant_users SET email_verified = TRUE WHERE email_verified = FALSE;
    `
  },

  {
    name: '041_fix_customers_stripe_column',
    sql: `
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
    `
  },

  {
    name: '042_add_deposits',
    sql: `
      -- Services: per-service deposit configuration
      ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(20) DEFAULT 'fixed';
      ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_value DECIMAL(10,2) DEFAULT 0;

      -- Bookings: deposit tracking
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(20) DEFAULT 'none';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_payment_intent_id VARCHAR(255);
    `
  },

  {
    name: '043_add_intake_forms',
    sql: `
      CREATE TABLE IF NOT EXISTS intake_questions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        question_text VARCHAR(500) NOT NULL,
        question_type VARCHAR(20) NOT NULL,
        required BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        options JSONB,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS intake_responses JSONB;
    `
  },

  // 044 — Service forms (file attachments sent with booking emails)
  {
    name: '044_add_service_forms',
    sql: `
      CREATE TABLE IF NOT EXISTS service_forms (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        form_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        file_data BYTEA NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },

  // 045 — DAC7 compliance: tax/identity info on tenants
  {
    name: '045_add_tenant_tax_info',
    sql: `
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS legal_entity_type VARCHAR(20) DEFAULT 'individual',
        ADD COLUMN IF NOT EXISTS tax_reference VARCHAR(50),
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS postcode VARCHAR(20),
        ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'United Kingdom',
        ADD COLUMN IF NOT EXISTS tax_info_completed_at TIMESTAMP;
    `
  },

  // ============================================
  // SPRINT 9 — Client Preferences, SMS, Add-ons, Waitlist
  // ============================================
  {
    name: '046_add_customer_preferences',
    sql: `
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS allergies TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferences TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT;
    `
  },
  {
    name: '047_add_sms_2h_tracking',
    sql: `
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sms_2h_sent BOOLEAN DEFAULT FALSE;
    `
  },
  {
    name: '048_add_service_addons',
    sql: `
      ALTER TABLE services ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS service_addon_links (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        parent_service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        addon_service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, parent_service_id, addon_service_id)
      );
      CREATE INDEX IF NOT EXISTS idx_addon_links_parent ON service_addon_links(parent_service_id);
    `
  },
  {
    name: '049_create_waitlist',
    sql: `
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        customer_id INTEGER REFERENCES customers(id),
        date DATE NOT NULL,
        preferred_start_time TIME,
        preferred_end_time TIME,
        service_ids TEXT,
        service_names TEXT,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'waiting',
        notified_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_waitlist_tenant_date ON waitlist(tenant_id, date);
      CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
    `
  },

  {
    name: '050_trial_pro_defaults',
    sql: `
      -- New tenants should start on Pro trial
      ALTER TABLE tenants ALTER COLUMN subscription_tier SET DEFAULT 'pro';

      -- Existing 'basic' tenants still on active trial → give them pro
      UPDATE tenants SET subscription_tier = 'pro'
      WHERE subscription_tier = 'basic' AND subscription_status = 'trial'
        AND (trial_ends_at IS NULL OR trial_ends_at >= NOW());

      -- Expired 'basic' trial tenants → downgrade to free
      UPDATE tenants SET subscription_tier = 'free', subscription_status = 'trial_expired'
      WHERE subscription_tier = 'basic'
        AND (subscription_status != 'trial' OR (trial_ends_at IS NOT NULL AND trial_ends_at < NOW()));
    `
  },

  // ============================================
  // SPRINT 10 — Platform Analytics, Customer Mgmt, Reports, Payments
  // ============================================
  {
    name: '051_create_platform_mrr_snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_mrr_snapshots (
        id SERIAL PRIMARY KEY,
        month DATE NOT NULL UNIQUE,
        total_mrr DECIMAL(12,2) DEFAULT 0,
        tenant_count INTEGER DEFAULT 0,
        free_count INTEGER DEFAULT 0,
        growth_count INTEGER DEFAULT 0,
        pro_count INTEGER DEFAULT 0,
        churn_count INTEGER DEFAULT 0,
        new_count INTEGER DEFAULT 0,
        snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: '052_create_customer_photos',
    sql: `
      CREATE TABLE IF NOT EXISTS customer_photos (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        booking_id INTEGER REFERENCES bookings(id),
        photo_type VARCHAR(20) NOT NULL CHECK (photo_type IN ('before', 'after')),
        pair_id VARCHAR(50),
        caption TEXT,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        file_data BYTEA NOT NULL,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_photos_customer ON customer_photos(tenant_id, customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_photos_pair ON customer_photos(pair_id);
    `
  },
  {
    name: '053_create_customer_segments',
    sql: `
      CREATE TABLE IF NOT EXISTS customer_segments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        filters JSONB NOT NULL,
        customer_count INTEGER DEFAULT 0,
        last_computed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant ON customer_segments(tenant_id);
    `
  },
  {
    name: '054_add_booking_source',
    sql: `
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_source VARCHAR(50) DEFAULT 'direct';
      CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(tenant_id, booking_source);
    `
  },
  {
    name: '055_create_gift_cards',
    sql: `
      CREATE TABLE IF NOT EXISTS gift_cards (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        code VARCHAR(20) NOT NULL,
        initial_balance DECIMAL(10,2) NOT NULL,
        remaining_balance DECIMAL(10,2) NOT NULL,
        sender_name VARCHAR(255),
        sender_email VARCHAR(255),
        recipient_name VARCHAR(255),
        recipient_email VARCHAR(255),
        message TEXT,
        purchased_by_customer_id INTEGER REFERENCES customers(id),
        stripe_payment_intent_id TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(tenant_id, code);
      CREATE INDEX IF NOT EXISTS idx_gift_cards_tenant ON gift_cards(tenant_id);

      CREATE TABLE IF NOT EXISTS gift_card_transactions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
        booking_id INTEGER REFERENCES bookings(id),
        amount DECIMAL(10,2) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'redemption', 'refund')),
        balance_after DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gift_card_id INTEGER;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gift_card_amount DECIMAL(10,2) DEFAULT 0;
    `
  },
  {
    name: '056_create_service_packages',
    sql: `
      CREATE TABLE IF NOT EXISTS service_packages (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        package_price DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2),
        session_count INTEGER NOT NULL,
        category VARCHAR(100),
        valid_days INTEGER DEFAULT 365,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_service_packages_tenant ON service_packages(tenant_id);

      CREATE TABLE IF NOT EXISTS package_services (
        id SERIAL PRIMARY KEY,
        package_id INTEGER NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(id),
        UNIQUE(package_id, service_id)
      );

      CREATE TABLE IF NOT EXISTS customer_packages (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        package_id INTEGER NOT NULL REFERENCES service_packages(id),
        sessions_remaining INTEGER NOT NULL,
        sessions_used INTEGER DEFAULT 0,
        stripe_payment_intent_id TEXT,
        payment_status VARCHAR(20) DEFAULT 'pending',
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'exhausted', 'cancelled'))
      );
      CREATE INDEX IF NOT EXISTS idx_customer_packages_customer ON customer_packages(tenant_id, customer_id);

      CREATE TABLE IF NOT EXISTS package_usage (
        id SERIAL PRIMARY KEY,
        customer_package_id INTEGER NOT NULL REFERENCES customer_packages(id),
        booking_id INTEGER REFERENCES bookings(id),
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_package_id INTEGER;
    `
  },
  {
    name: '057_create_memberships',
    sql: `
      CREATE TABLE IF NOT EXISTS membership_plans (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price_monthly DECIMAL(10,2) NOT NULL,
        included_sessions INTEGER DEFAULT 0,
        discount_percent INTEGER DEFAULT 0,
        priority_booking BOOLEAN DEFAULT FALSE,
        stripe_product_id TEXT,
        stripe_price_id TEXT,
        active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_membership_plans_tenant ON membership_plans(tenant_id);

      CREATE TABLE IF NOT EXISTS membership_included_services (
        id SERIAL PRIMARY KEY,
        membership_plan_id INTEGER NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id),
        category VARCHAR(100),
        sessions_per_month INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS customer_memberships (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        membership_plan_id INTEGER NOT NULL REFERENCES membership_plans(id),
        stripe_subscription_id TEXT,
        stripe_customer_id TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'cancelling')),
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        sessions_used_this_period INTEGER DEFAULT 0,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer ON customer_memberships(tenant_id, customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_memberships_stripe ON customer_memberships(stripe_subscription_id);

      CREATE TABLE IF NOT EXISTS membership_usage (
        id SERIAL PRIMARY KEY,
        customer_membership_id INTEGER NOT NULL REFERENCES customer_memberships(id),
        booking_id INTEGER REFERENCES bookings(id),
        service_id INTEGER REFERENCES services(id),
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS membership_id INTEGER;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS membership_discount_amount DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT;
    `
  },
  {
    name: '058_add_tips',
    sql: `
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;
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

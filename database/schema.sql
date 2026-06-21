-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Packages
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    duration_months INTEGER NOT NULL CHECK (duration_months > 0),
    price_eur NUMERIC(10, 2) NOT NULL CHECK (price_eur >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. LTC Addresses
CREATE TABLE IF NOT EXISTS ltc_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ltc_address TEXT UNIQUE NOT NULL,
    address_index INTEGER UNIQUE NOT NULL CHECK (address_index >= 0 AND address_index < 50),
    is_reserved BOOLEAN NOT NULL DEFAULT FALSE,
    reserved_until TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indices for rotation optimization
CREATE INDEX IF NOT EXISTS idx_ltc_addresses_rotation ON ltc_addresses (is_reserved, reserved_until, last_used_at ASC NULLS FIRST);

-- 3. Upgrader Keys
CREATE TABLE IF NOT EXISTS upgrader_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'usable' CHECK (status IN ('usable', 'active', 'expired', 'error')),
    spotify_account_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upgrader_keys_status ON upgrader_keys (status);

-- 4. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    flags INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'de', 'ru')),
    last_delivery_failed_at TIMESTAMPTZ,
    check_prompt_sent_at TIMESTAMPTZ,
    checkout_blocked_until TIMESTAMPTZ,
    lockout_count INTEGER NOT NULL DEFAULT 0,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    requires_admin_decision BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id),
    key_id UUID REFERENCES upgrader_keys(id) ON DELETE SET NULL,
    spotify_email TEXT,
    spotify_password_encrypted TEXT,
    status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'activating', 'active', 'expired', 'renewing', 'failed', 'cancelled')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry ON subscriptions (expires_at);

-- 6. Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ltc_address_id UUID NOT NULL REFERENCES ltc_addresses(id),
    amount_eur NUMERIC(10, 2) NOT NULL,
    amount_ltc NUMERIC(20, 8) NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'detected', 'confirmed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_status_expiry ON invoices (status, expires_at);

-- 7. System Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level TEXT NOT NULL CHECK (level IN ('INFO', 'ERROR')),
    component TEXT NOT NULL CHECK (component IN ('BOT', 'WATCHER', 'API')),
    message TEXT NOT NULL,
    details JSONB,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_unresolved ON system_logs (is_resolved) WHERE is_resolved = FALSE;

-- 8. Broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    sent_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status_sched ON broadcasts (status, scheduled_at);

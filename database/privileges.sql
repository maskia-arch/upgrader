-- =========================================================================
-- PostgreSQL Privilege Separation Script for Spotify Premium Upgrade Bot
-- -------------------------------------------------------------------------
-- Run this script as the database administrator (postgres) to create a
-- restricted role for the Telegram Bot and grant it limited privileges.
-- =========================================================================

-- 1. Create a restricted role for the Telegram Bot
-- IMPORTANT: Change 'bot_secure_password' to a strong random password!
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'bot_user') THEN
    CREATE ROLE bot_user WITH LOGIN PASSWORD 'bot_secure_password';
  END IF;
END
$$;

-- 2. Grant connection and schema usage
GRANT CONNECT ON DATABASE postgres TO bot_user;
GRANT USAGE ON SCHEMA public TO bot_user;

-- 3. Grant SELECT (read) privilege on all tables (read-only for all tables)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bot_user;

-- 4. Grant INSERT (write) privileges on bot-writable tables
-- The bot needs to insert new users, subscriptions (orders), invoices, logs, and cleanups.
GRANT INSERT ON TABLE users, subscriptions, invoices, system_logs, feedback, bot_messages_cleanup TO bot_user;

-- 5. Grant UPDATE privileges on bot-updatable tables
-- The bot needs to update users (bans/lockouts), subscriptions (status/email), 
-- invoices (payments), and ltc_addresses (address rotation reservation).
GRANT UPDATE ON TABLE users, subscriptions, invoices, ltc_addresses TO bot_user;

-- 6. Grant DELETE privileges ONLY on bot_messages_cleanup
-- The bot needs to delete message tracking rows for cleanup, but should never delete tables or core records.
GRANT DELETE ON TABLE bot_messages_cleanup TO bot_user;

-- 7. Grant EXECUTE privileges on functions
-- Grants rights to run address rotation and coupon increment/decrement RPC procedures.
GRANT EXECUTE ON FUNCTION rotate_ltc_address(), increment_coupon_uses(UUID), decrement_coupon_uses(UUID) TO bot_user;

-- -------------------------------------------------------------------------
-- Verification queries (run as bot_user to verify):
-- SELECT * FROM packages; (Should succeed)
-- INSERT INTO system_logs(level, component, message) VALUES ('INFO', 'BOT', 'Test'); (Should succeed)
-- DELETE FROM packages WHERE id = '...'; (Should fail - Permission Denied)
-- =========================================================================

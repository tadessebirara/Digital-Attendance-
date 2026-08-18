-- Migration 017: Auto-generate qr_secret if empty, ensure geofence defaults exist
-- Fixes deployments where qr_secret was seeded as '' (empty string) causing
-- all QR attendance scans to fail with "QR signing key not configured".

-- Enable pgcrypto for gen_random_bytes if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generate a secure random qr_secret only if the current value is empty or missing
UPDATE system_settings
SET setting_value = encode(gen_random_bytes(32), 'hex'),
    updated_at    = NOW()
WHERE setting_key = 'qr_secret'
  AND (setting_value IS NULL OR TRIM(setting_value) = '');

-- Insert qr_secret if the row doesn't exist at all
INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'qr_secret', encode(gen_random_bytes(32), 'hex'), 'HMAC secret for QR signing (auto-generated)'
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings WHERE setting_key = 'qr_secret'
);

-- Ensure qr_generation_password_hash row exists (was added in 016 but guard anyway)
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('qr_generation_password_hash', '', 'bcrypt hash — admin view password for QR download')
ON CONFLICT (setting_key) DO NOTHING;

-- Ensure geofence rows exist
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('geofence_lat',       '0', 'Office geofence centre latitude'),
  ('geofence_lng',       '0', 'Office geofence centre longitude'),
  ('geofence_radius_m', '100', 'Geofence radius in metres')
ON CONFLICT (setting_key) DO NOTHING;

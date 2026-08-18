-- Migration 041: normalise branding in system_settings
-- Ensures company name is "Alyah Smart Attendance" for both casing variants.
-- Safe to run multiple times — uses ON CONFLICT DO UPDATE.

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('company_name', 'Alyah Smart Attendance', 'Company display name')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'Alyah Smart Attendance', updated_at = NOW();

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('COMPANY_NAME', 'Alyah Smart Attendance', 'Company display name (legacy key)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'Alyah Smart Attendance', updated_at = NOW();

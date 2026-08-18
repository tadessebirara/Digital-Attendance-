-- Migration 013: System settings seed — geofence, QR control, branding
-- Idempotent: ON CONFLICT DO NOTHING

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('company_name',        'Alyah Smart Attendance',  'Company display name'),
  ('company_logo_url',    '',                     'Logo URL (https or data URI)'),
  ('primary_color',       '#0F172A',              'Brand primary colour (hex)'),
  ('geofence_lat',        '0',                    'Office geofence centre latitude'),
  ('geofence_lng',        '0',                    'Office geofence centre longitude'),
  ('geofence_radius_m',   '100',                  'Geofence radius in metres'),
  ('qr_enabled',          'true',                 'Whether QR check-in is active'),
  ('qr_secret',           '',                     'HMAC secret for QR signing (auto-generated if empty)'),
  ('qr_expiry_seconds',   '60',                   'QR code validity window in seconds'),
  ('gps_accuracy_warn_m', '50',                   'GPS accuracy warn threshold (metres)'),
  ('gps_accuracy_max_m',  '100',                  'GPS accuracy hard-reject threshold (metres)')
ON CONFLICT (setting_key) DO NOTHING;

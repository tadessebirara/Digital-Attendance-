-- Fix: add index on offices for geofence queries
-- The engine queries active non-placeholder offices frequently
CREATE INDEX IF NOT EXISTS idx_offices_active_geofence
ON offices (is_active, latitude, longitude)
WHERE is_active = TRUE
  AND NOT (latitude = 0 AND longitude = 0);

-- Fix: set the seed office radius to a sensible default
UPDATE offices
SET radius_meters = 200
WHERE radius_meters IS NULL;

-- Comment the default placeholder office so admins know to update it
COMMENT ON TABLE offices IS
  'Office locations for geofencing. Set latitude/longitude to your actual office location. '
  'Offices with latitude=0 AND longitude=0 are treated as unconfigured and excluded from geofence checks.';

-- Enterprise Office Geofencing
CREATE TABLE IF NOT EXISTS offices (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 200,
    is_active BOOLEAN DEFAULT true
);

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS radius_meters INTEGER;

UPDATE offices
SET radius_meters = COALESCE(radius_meters, 200)
WHERE radius_meters IS NULL;

-- Link users to offices (Optional, can default to nearest)
ALTER TABLE users ADD COLUMN IF NOT EXISTS office_id INTEGER REFERENCES offices(id);

-- Default office seeded with 0,0 coordinates so geofence is disabled until
-- admin sets a real location via Admin → Office Management.
-- Set latitude/longitude to your actual office location to enable geofencing.
INSERT INTO offices (name, latitude, longitude, radius_meters) 
VALUES ('Main Office', 0.0, 0.0, 200)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_offices_location
ON offices (latitude, longitude)
WHERE is_active = true;

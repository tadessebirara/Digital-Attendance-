-- Track which office an employee checked in and out from
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS checkin_office_id   INTEGER REFERENCES offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkin_office_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS checkout_office_id   INTEGER REFERENCES offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_office_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_attendance_checkin_office  ON attendance_records(checkin_office_id);
CREATE INDEX IF NOT EXISTS idx_attendance_checkout_office ON attendance_records(checkout_office_id);

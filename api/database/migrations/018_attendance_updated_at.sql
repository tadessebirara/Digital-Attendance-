-- Migration 018: Add updated_at to attendance_records (missing from 001 schema)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Back-fill from created_at
UPDATE attendance_records SET updated_at = created_at WHERE updated_at IS NULL;

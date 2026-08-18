-- Migration 011: Truth Resolver System
-- Add source tracking for deterministic conflict resolution.

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED'));

ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'REALTIME' 
CHECK (source IN ('REALTIME', 'OFFLINE', 'MANUAL', 'QR', 'LEAVE'));

ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS write_context VARCHAR(32) DEFAULT 'USER_ACTION'
CHECK (write_context IN ('USER_ACTION', 'SYNC_REPLAY', 'SYSTEM_RECONCILIATION', 'ADMIN_CORRECTION'));

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_attendance_source ON attendance_records(source);

CREATE INDEX IF NOT EXISTS idx_attendance_write_context
ON attendance_records(write_context);

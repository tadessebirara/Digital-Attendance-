-- Migration 003: Add schedule_type to user_schedules
-- Tracks which preset was used (Regular / Flexible / Shift / Custom)

ALTER TABLE user_schedules
  ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) DEFAULT 'REGULAR'
    CHECK (schedule_type IN ('REGULAR', 'FLEXIBLE', 'SHIFT', 'CUSTOM'));

-- Index for fast lookup by type
CREATE INDEX IF NOT EXISTS idx_user_schedules_type ON user_schedules(schedule_type);

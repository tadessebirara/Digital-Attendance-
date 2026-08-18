-- ── Enterprise Indexing Strategy ──────────────────────────────────────────────
-- Optimizes queries for Dashboard, History, and Analytics modules

-- 1. Accelerates daily status checks and history lookups by user + date
CREATE INDEX IF NOT EXISTS idx_attendance_user_date 
ON attendance_records (user_id, DATE(clock_in_time));

-- 2. Optimizes HR monitoring for 'LATE' or 'ABSENT' status across the company
CREATE INDEX IF NOT EXISTS idx_attendance_status_time 
ON attendance_records (status, clock_in_time DESC);

-- 3. Optimizes Device security lookups
CREATE INDEX IF NOT EXISTS idx_user_devices_lookup 
ON user_devices (user_id, device_id, status);

-- 4. Accelerates JWT session validation — only if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_lookup ON refresh_tokens (token, device_id);
  END IF;
END$$;

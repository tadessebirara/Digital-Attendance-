-- Performance Indices (safe — all use IF NOT EXISTS or conditional creation)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date_trunc ON attendance_records (user_id, DATE(clock_in_time));

-- refresh_tokens index — only create if the table exists (added in a later migration)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
  END IF;
END $$;

-- Set database timezone to UTC
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE ' || current_database() || ' SET timezone TO ''UTC''';
EXCEPTION WHEN OTHERS THEN
  -- May fail if not superuser on managed DB — safe to ignore
  NULL;
END $$;

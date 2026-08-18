-- Add token versioning for global session invalidation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;

-- Add index for session tracking performance (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_tracking') THEN
    CREATE INDEX IF NOT EXISTS idx_session_tracking_user_id ON session_tracking (user_id);
  END IF;
END$$;

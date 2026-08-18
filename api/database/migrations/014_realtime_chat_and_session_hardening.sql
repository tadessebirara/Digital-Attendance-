-- Migration 014: realtime chat state + session/device hardening

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS client_temp_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS delete_everyone_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS chat_message_reads (
  message_id INT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NULL,
  seen_at TIMESTAMPTZ NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_seen
ON chat_message_reads (user_id, seen_at, delivered_at);

INSERT INTO chat_message_reads (message_id, user_id, delivered_at, seen_at)
SELECT
  cm.id,
  cp.user_id,
  cm.created_at,
  CASE
    WHEN cp.user_id = cm.sender_id THEN cm.created_at
    WHEN cm.is_read THEN cm.created_at
    ELSE NULL
  END
FROM chat_messages cm
JOIN chat_participants cp
  ON cp.room_id = cm.room_id
ON CONFLICT (message_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_message_deletions (
  message_id INT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_deletions_user
ON chat_message_deletions (user_id, deleted_at DESC);

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS session_id UUID NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

-- session_tracking may not exist yet — create it if missing, then add columns
CREATE TABLE IF NOT EXISTS session_tracking (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID         NULL,
  device_id     VARCHAR(255) NULL,
  ip_address    VARCHAR(45)  NULL,
  user_agent    TEXT         NULL,
  token_hash    VARCHAR(255) NULL,
  last_activity TIMESTAMP    DEFAULT NOW(),
  created_at    TIMESTAMP    DEFAULT NOW(),
  expires_at    TIMESTAMPTZ  NULL,
  revoked_at    TIMESTAMPTZ  NULL
);

ALTER TABLE session_tracking
  ADD COLUMN IF NOT EXISTS session_id UUID         NULL,
  ADD COLUMN IF NOT EXISTS device_id  VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ  NULL;

UPDATE session_tracking
SET expires_at = COALESCE(expires_at, NOW() + INTERVAL '10 minutes')
WHERE expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_tracking_session_id
ON session_tracking (session_id)
WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_tracking_active
ON session_tracking (user_id, session_id, expires_at)
WHERE revoked_at IS NULL;

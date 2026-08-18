-- ============================================================
-- Migration 010: Chat Schema Fixes
--
-- Ensures chat_messages has all columns the controller expects.
-- Uses ADD COLUMN IF NOT EXISTS so it's safe to run on any DB
-- state — whether the column exists or not.
-- ============================================================

-- is_edited: tracks whether a message has been edited
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;

-- is_deleted: soft-delete flag
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- updated_at: timestamp of last edit
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

-- Index for fast unread count queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON chat_messages (room_id, sender_id, is_read)
  WHERE is_read = FALSE AND is_deleted = FALSE;

-- Index for message fetch (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON chat_messages (room_id, created_at DESC)
  WHERE is_deleted = FALSE;

-- Migration 023: Make chat sends idempotent across socket ACK retries and HTTP fallback.

-- Remove duplicate client_temp_id rows first (keep the lowest id per group)
-- so the unique index can be created cleanly.
DELETE FROM chat_messages
WHERE id NOT IN (
  SELECT MIN(id)
  FROM chat_messages
  WHERE client_temp_id IS NOT NULL
  GROUP BY room_id, sender_id, client_temp_id
)
AND client_temp_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_temp_id_once
ON chat_messages (room_id, sender_id, client_temp_id)
WHERE client_temp_id IS NOT NULL;

-- ============================================================
-- Migration 011: Add document_url and description to leave_requests
-- ============================================================

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS document_url  TEXT         NULL,
  ADD COLUMN IF NOT EXISTS description   TEXT         NULL;

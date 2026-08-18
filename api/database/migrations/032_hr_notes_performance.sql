-- Migration 032: HR Notes + Performance Ratings
-- Adds hr_notes column to users (HR-only internal notes about an employee)
-- and a performance_ratings table for HR to record periodic evaluations.

-- ── HR Notes ──────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS hr_notes TEXT;

-- ── Performance Ratings ───────────────────────────────────────────────────────
-- HR/Admin can rate employees periodically (monthly/quarterly).
-- rating: 1–5  |  category: ATTENDANCE, PUNCTUALITY, OVERALL, CONDUCT
CREATE TABLE IF NOT EXISTS performance_ratings (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rated_by     INT NOT NULL REFERENCES users(id),
  period       VARCHAR(7) NOT NULL,               -- e.g. "2026-07"  (YYYY-MM)
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category     VARCHAR(30) NOT NULL DEFAULT 'OVERALL'
                 CHECK (category IN ('OVERALL','ATTENDANCE','PUNCTUALITY','CONDUCT')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period, category)
);

CREATE INDEX IF NOT EXISTS idx_perf_ratings_user ON performance_ratings (user_id, period DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_perf_ratings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS perf_ratings_set_updated_at ON performance_ratings;
CREATE TRIGGER perf_ratings_set_updated_at
  BEFORE UPDATE ON performance_ratings
  FOR EACH ROW EXECUTE FUNCTION trg_perf_ratings_updated_at();

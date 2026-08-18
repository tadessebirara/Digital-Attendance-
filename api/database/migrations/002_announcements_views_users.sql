-- ============================================================
-- Migration 002: Announcements scheduling + views + user fixes
-- ============================================================

-- ── 1. Extend announcements table ────────────────────────────
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS scheduled_at   TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS published_at   TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20)  NOT NULL DEFAULT 'PUBLISHED'
    CHECK (status IN ('PUBLISHED', 'SCHEDULED', 'DRAFT')),
  ADD COLUMN IF NOT EXISTS edited_at      TIMESTAMP    NULL,
  ADD COLUMN IF NOT EXISTS edited_by      INT          REFERENCES users(id);

-- Back-fill: existing rows are already published
UPDATE announcements SET status = 'PUBLISHED', published_at = created_at WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS idx_announcements_status      ON announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled   ON announcements(scheduled_at) WHERE status = 'SCHEDULED';

-- ── 2. Announcement views tracking ───────────────────────────
CREATE TABLE IF NOT EXISTS announcement_views (
  id              SERIAL PRIMARY KEY,
  announcement_id INT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_views_ann  ON announcement_views(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_views_user ON announcement_views(user_id);

-- ── 3. Fix users table status enum to include all used values ─
-- PostgreSQL doesn't support ALTER COLUMN ... SET CHECK directly;
-- drop and re-add the constraint.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('ACTIVE','INACTIVE','PENDING','LOCKED',
                    'PENDING_APPROVAL','REJECTED','LOCKED_ROLE'));

-- ── 4. Add missing user columns if not present ────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_login         BOOLEAN      DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS primary_device_id   VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS created_by          VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS working_time_type   VARCHAR(20)  DEFAULT 'FULL_TIME'
    CHECK (working_time_type IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN')),
  ADD COLUMN IF NOT EXISTS working_days_per_week  SMALLINT  DEFAULT 5,
  ADD COLUMN IF NOT EXISTS working_hours_per_day  NUMERIC(4,1) DEFAULT 8.0;

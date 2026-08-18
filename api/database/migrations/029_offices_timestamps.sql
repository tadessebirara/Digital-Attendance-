-- Add created_at and updated_at timestamps to the offices table.
-- The controller was already referencing these columns; this migration
-- adds them safely so existing rows get a sensible default.

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Back-fill existing rows so timestamps are not epoch-zero
UPDATE offices
  SET created_at = NOW(), updated_at = NOW()
  WHERE created_at IS NULL OR updated_at IS NULL;

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION trg_offices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offices_set_updated_at ON offices;
CREATE TRIGGER offices_set_updated_at
  BEFORE UPDATE ON offices
  FOR EACH ROW EXECUTE FUNCTION trg_offices_updated_at();

-- ============================================================
-- Migration 021: Ethiopian Public Holidays
--
-- Creates a public_holidays table and seeds all Ethiopian
-- public holidays (both fixed Gregorian and recurring annual).
--
-- Ethiopian holidays observed in the Gregorian calendar:
--   Fixed dates (same Gregorian date every year):
--     Jan  7  — Ethiopian Christmas (Genna / Lidat)
--     Jan 19  — Ethiopian Epiphany (Timkat)
--     Mar  2  — Victory of Adwa
--     Apr 23  — Ethiopian Patriots Day
--     May  1  — International Labour Day
--     May  5  — Liberation Day (Derg Downfall)
--     May 28  — Downfall of the Derg / National Day
--     Sep 11  — Ethiopian New Year (Enkutatash)
--     Sep 27  — Meskel (Finding of the True Cross)
--
--   Islamic holidays (approximate Gregorian dates — shift each year):
--     Eid al-Fitr    (end of Ramadan)
--     Eid al-Adha    (Feast of Sacrifice)
--     Mawlid         (Prophet's Birthday)
--
--   Easter (moves each year — Ethiopian Orthodox calendar):
--     Ethiopian Easter (Fasika) — pre-seeded 2024–2030
--     Good Friday before Fasika
--
-- Note: Islamic holiday exact dates shift ~11 days/year.
--       The table stores confirmed dates per year.
--       HR can add/edit via the API.
-- ============================================================

CREATE TABLE IF NOT EXISTS public_holidays (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  name_am       TEXT,                        -- Amharic name (optional display)
  date          DATE        NOT NULL,
  type          TEXT        NOT NULL DEFAULT 'NATIONAL',  -- NATIONAL | RELIGIOUS | OPTIONAL
  religion      TEXT,                        -- CHRISTIAN | MUSLIM | null
  is_recurring  BOOLEAN     NOT NULL DEFAULT TRUE,        -- true = repeats same month/day every year
  recurring_month INT,                       -- 1-12, used when is_recurring=true
  recurring_day   INT,                       -- 1-31, used when is_recurring=true
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_holidays_date
  ON public_holidays (date);

CREATE INDEX IF NOT EXISTS idx_public_holidays_month_day
  ON public_holidays (recurring_month, recurring_day)
  WHERE is_recurring = TRUE;

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_public_holiday()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_public_holiday ON public_holidays;
CREATE TRIGGER trg_touch_public_holiday
  BEFORE UPDATE ON public_holidays
  FOR EACH ROW EXECUTE FUNCTION touch_public_holiday();

-- ============================================================
-- Seed: Fixed annual Ethiopian holidays (recurring)
-- ============================================================
INSERT INTO public_holidays (name, name_am, date, type, religion, is_recurring, recurring_month, recurring_day, description)
VALUES
  -- Jan 7 — Ethiopian Christmas
  ('Ethiopian Christmas', 'ገና / ልደት', '2026-01-07', 'NATIONAL', 'CHRISTIAN', TRUE, 1, 7,
   'Genna (Lidat) — Ethiopian Orthodox Christmas, celebrated on January 7th'),

  -- Jan 19 — Timkat (Epiphany)
  ('Timkat', 'ጥምቀት', '2026-01-19', 'NATIONAL', 'CHRISTIAN', TRUE, 1, 19,
   'Ethiopian Epiphany celebrating the baptism of Jesus. Major national holiday.'),

  -- Mar 2 — Adwa Victory Day
  ('Adwa Victory Day', 'የዓድዋ ድል', '2026-03-02', 'NATIONAL', NULL, TRUE, 3, 2,
   'Commemorates Ethiopia''s victory over Italy at the Battle of Adwa (1896).'),

  -- Apr 23 — Patriots Day
  ('Ethiopian Patriots Day', 'የአርበኞች ቀን', '2026-04-23', 'NATIONAL', NULL, TRUE, 4, 23,
   'Honors those who resisted Italian occupation (1936–1941).'),

  -- May 1 — Labour Day
  ('International Labour Day', 'የሠራተኞች ቀን', '2026-05-01', 'NATIONAL', NULL, TRUE, 5, 1,
   'International Workers'' Day — public holiday in Ethiopia.'),

  -- May 5 — Liberation Day
  ('Liberation Day', 'የቀዳማዊ ኃይለሥላሴ መንበር መልሰ ዕለት', '2026-05-05', 'NATIONAL', NULL, TRUE, 5, 5,
   'Marks the return of Emperor Haile Selassie and liberation from Italian occupation (1941).'),

  -- May 28 — Republic Day / Fall of Derg
  ('Downfall of the Derg', 'ደርግ መወረድ', '2026-05-28', 'NATIONAL', NULL, TRUE, 5, 28,
   'Marks the fall of the Derg military regime and establishment of the transitional government (1991).'),

  -- Sep 11 — Ethiopian New Year (Enkutatash)
  ('Ethiopian New Year', 'እንቁጣጣሽ / አዲስ ዓመት', '2026-09-11', 'NATIONAL', NULL, TRUE, 9, 11,
   'Enkutatash — Ethiopian New Year celebrated on 1 Meskerem in the Ethiopian calendar (Sep 11 on Gregorian). Sep 12 in leap years.'),

  -- Sep 27 — Meskel
  ('Meskel', 'መስቀል', '2026-09-27', 'NATIONAL', 'CHRISTIAN', TRUE, 9, 27,
   'Finding of the True Cross — one of the most important Ethiopian Orthodox holidays. Large celebrations in Addis Ababa.')

ON CONFLICT (date) DO NOTHING;

-- ============================================================
-- Seed: Ethiopian Orthodox Easter (Fasika) 2024–2030
-- These move each year — not recurring by fixed month/day
-- ============================================================
INSERT INTO public_holidays (name, name_am, date, type, religion, is_recurring, description)
VALUES
  ('Ethiopian Good Friday 2024',  'ስቅለት', '2024-05-03', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2024'),
  ('Ethiopian Easter 2024',       'ፋሲካ',   '2024-05-05', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2024'),
  ('Ethiopian Good Friday 2025',  'ስቅለት', '2025-04-18', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2025'),
  ('Ethiopian Easter 2025',       'ፋሲካ',   '2025-04-20', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2025'),
  ('Ethiopian Good Friday 2026',  'ስቅለት', '2026-04-10', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2026'),
  ('Ethiopian Easter 2026',       'ፋሲካ',   '2026-04-12', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2026'),
  ('Ethiopian Good Friday 2027',  'ስቅለት', '2027-04-23', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2027'),
  ('Ethiopian Easter 2027',       'ፋሲካ',   '2027-04-25', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2027'),
  ('Ethiopian Good Friday 2028',  'ስቅለት', '2028-04-14', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2028'),
  ('Ethiopian Easter 2028',       'ፋሲካ',   '2028-04-16', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2028'),
  ('Ethiopian Good Friday 2029',  'ስቅለት', '2029-05-04', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2029'),
  ('Ethiopian Easter 2029',       'ፋሲካ',   '2029-05-06', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2029'),
  ('Ethiopian Good Friday 2030',  'ስቅለት', '2030-04-26', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Good Friday (Siklet) 2030'),
  ('Ethiopian Easter 2030',       'ፋሲካ',   '2030-04-28', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Easter (Fasika) 2030')
ON CONFLICT (date) DO NOTHING;

-- ============================================================
-- Seed: Islamic Holidays 2024–2027 (approximate Gregorian dates)
-- ============================================================
INSERT INTO public_holidays (name, name_am, date, type, religion, is_recurring, description)
VALUES
  -- Eid al-Fitr (End of Ramadan)
  ('Eid al-Fitr 2024',  'ኢድ አል-ፈጥር', '2024-04-10', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Fitr — End of Ramadan 2024'),
  ('Eid al-Fitr 2025',  'ኢድ አል-ፈጥር', '2025-03-30', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Fitr — End of Ramadan 2025'),
  ('Eid al-Fitr 2026',  'ኢድ አል-ፈጥር', '2026-03-20', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Fitr — End of Ramadan 2026'),
  ('Eid al-Fitr 2027',  'ኢድ አል-ፈጥር', '2027-03-09', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Fitr — End of Ramadan 2027'),

  -- Eid al-Adha (Feast of Sacrifice)
  ('Eid al-Adha 2024',  'ኢድ አል-አዱሃ', '2024-06-17', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Adha — Feast of Sacrifice 2024'),
  ('Eid al-Adha 2025',  'ኢድ አል-አዱሃ', '2025-06-06', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Adha — Feast of Sacrifice 2025'),
  ('Eid al-Adha 2026',  'ኢድ አል-አዱሃ', '2026-05-27', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Adha — Feast of Sacrifice 2026'),
  ('Eid al-Adha 2027',  'ኢድ አል-አዱሃ', '2027-05-16', 'NATIONAL', 'MUSLIM', FALSE, 'Eid al-Adha — Feast of Sacrifice 2027'),

  -- Mawlid (Prophet Mohammed's Birthday)
  ('Mawlid 2024',  'መውሊድ', '2024-09-16', 'NATIONAL', 'MUSLIM', FALSE, 'Prophet Mohammed''s Birthday (Mawlid) 2024'),
  ('Mawlid 2025',  'መውሊድ', '2025-09-04', 'NATIONAL', 'MUSLIM', FALSE, 'Prophet Mohammed''s Birthday (Mawlid) 2025'),
  ('Mawlid 2026',  'መውሊድ', '2026-08-25', 'NATIONAL', 'MUSLIM', FALSE, 'Prophet Mohammed''s Birthday (Mawlid) 2026'),
  ('Mawlid 2027',  'መውሊድ', '2027-08-14', 'NATIONAL', 'MUSLIM', FALSE, 'Prophet Mohammed''s Birthday (Mawlid) 2027')

ON CONFLICT (date) DO NOTHING;

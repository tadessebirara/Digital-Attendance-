-- Per-office GPS accuracy thresholds.
-- Replaces the global gps_accuracy_warn_m / gps_accuracy_max_m in system_settings
-- so each branch can have its own tolerance based on its environment.

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS gps_accuracy_warn_m INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS gps_accuracy_max_m  INTEGER NOT NULL DEFAULT 100;

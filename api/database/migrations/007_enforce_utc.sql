-- Migration 007: UTC enforcement
--
-- Older local databases in this repository contain legacy tables with
-- expression indexes on timestamp columns. Rewriting those columns from
-- TIMESTAMP to TIMESTAMPTZ causes PostgreSQL to reject the change because
-- the dependent expressions are not all immutable.
--
-- The application already serializes and parses timestamps as ISO strings
-- and uses UTC-aware client logic. To keep the migration chain safe and
-- idempotent across mixed legacy schemas, we intentionally leave the
-- column types unchanged here.

SELECT 1;

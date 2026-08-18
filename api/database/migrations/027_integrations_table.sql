-- Migration 027: Create integrations table for storing third-party integration configs
CREATE TABLE IF NOT EXISTS integrations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  type        VARCHAR(50)  NOT NULL DEFAULT 'EXTERNAL',
  status      VARCHAR(20)  NOT NULL DEFAULT 'INACTIVE',
  config      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_name   ON integrations (name);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations (status);

-- Migration 033: Employee documents table
-- Stores HR-uploaded documents per employee (CV, contracts, IDs, certificates).

CREATE TABLE IF NOT EXISTS employee_documents (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by  INT NOT NULL REFERENCES users(id),
  doc_type     VARCHAR(50) NOT NULL
                 CHECK (doc_type IN ('CV_RESUME','EMPLOYMENT_CONTRACT','NATIONAL_ID','CERTIFICATE','OTHER')),
  label        VARCHAR(200) NOT NULL,
  file_url     TEXT NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  file_size    INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_docs_user
  ON employee_documents (user_id, created_at DESC);

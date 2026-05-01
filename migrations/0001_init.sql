CREATE TABLE batches (
  id              TEXT PRIMARY KEY,
  created_at      INTEGER NOT NULL,
  prompt          TEXT NOT NULL,
  search_provider TEXT NOT NULL,
  llm_provider    TEXT NOT NULL,
  total_rows      INTEGER NOT NULL,
  done_rows       INTEGER NOT NULL DEFAULT 0,
  failed_rows     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,
  email           TEXT,
  upload_r2_key   TEXT,
  result_r2_key   TEXT,
  completed_at    INTEGER
);

CREATE TABLE analyses (
  id              TEXT PRIMARY KEY,
  batch_id        TEXT,
  row_index       INTEGER,
  created_at      INTEGER NOT NULL,
  company_name    TEXT NOT NULL,
  company_domain  TEXT,
  extra_input     TEXT,
  status          TEXT NOT NULL,
  answer          TEXT,
  sources         TEXT,
  search_provider TEXT NOT NULL,
  llm_provider    TEXT NOT NULL,
  latency_ms      INTEGER,
  error           TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE INDEX idx_analyses_batch   ON analyses(batch_id);
CREATE INDEX idx_analyses_status  ON analyses(status);
CREATE INDEX idx_batches_created  ON batches(created_at DESC);

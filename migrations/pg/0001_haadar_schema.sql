-- Migração 0001: Esquema Haadar isolado no Neon PostgreSQL
CREATE SCHEMA IF NOT EXISTS haadar;

-- 1. Rodadas de Descoberta (execuções do cron)
CREATE TABLE IF NOT EXISTS haadar.discovery_rounds (
  id TEXT PRIMARY KEY,
  round_slot TEXT NOT NULL UNIQUE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  portfolio_revision TEXT NOT NULL,
  budget_state TEXT NOT NULL DEFAULT 'NORMAL',
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'partial', 'deferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tarefas da Fila por Adaptador/Query
CREATE TABLE IF NOT EXISTS haadar.discovery_tasks (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES haadar.discovery_rounds(id) ON DELETE CASCADE,
  query_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'retryable', 'terminal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Vagas Únicas Canônicas (Impedem duplicações)
CREATE TABLE IF NOT EXISTS haadar.vacancies (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  organization TEXT,
  location TEXT,
  work_model TEXT NOT NULL DEFAULT 'unknown',
  description_summary TEXT,
  published_at TIMESTAMPTZ,
  fingerprint TEXT NOT NULL UNIQUE,
  fingerprint_version TEXT NOT NULL DEFAULT 'v1',
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Identidades de Origem da Vaga (Mapeia ID na Gupy/Greenhouse/etc para a vaga única)
CREATE TABLE IF NOT EXISTS haadar.vacancy_source_identities (
  source_id TEXT NOT NULL,
  source_vacancy_id TEXT NOT NULL,
  vacancy_id TEXT NOT NULL REFERENCES haadar.vacancies(id) ON DELETE CASCADE,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_id, source_vacancy_id)
);

-- 5. Ocorrências por Rodada (Rastreabilidade de onde foi vista sem reinserir a vaga)
CREATE TABLE IF NOT EXISTS haadar.vacancy_occurrences (
  id BIGSERIAL PRIMARY KEY,
  vacancy_id TEXT NOT NULL REFERENCES haadar.vacancies(id) ON DELETE CASCADE,
  round_id TEXT REFERENCES haadar.discovery_rounds(id) ON DELETE SET NULL,
  source_id TEXT NOT NULL,
  source_vacancy_id TEXT,
  query_id TEXT NOT NULL,
  observed_url TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vacancy_id, round_id, query_id, source_id)
);

-- 6. Histórico de Rejeições com TTL e sem repetições infinitas
CREATE TABLE IF NOT EXISTS haadar.candidate_rejections (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  reason TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  first_rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrences_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (source, source_job_id, stage, reason)
);

-- 7. Fila de Alertas (Outbox para Telegram)
CREATE TABLE IF NOT EXISTS haadar.notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'telegram',
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Índices essenciais para consultas de alta performance
CREATE INDEX IF NOT EXISTS idx_haadar_vacancies_fingerprint ON haadar.vacancies(fingerprint);
CREATE INDEX IF NOT EXISTS idx_haadar_occurrences_observed ON haadar.vacancy_occurrences(observed_at);
CREATE INDEX IF NOT EXISTS idx_haadar_rejections_last_seen ON haadar.candidate_rejections(last_rejected_at);
CREATE INDEX IF NOT EXISTS idx_haadar_outbox_pending ON haadar.notification_outbox(status) WHERE status = 'pending';

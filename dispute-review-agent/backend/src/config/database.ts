/**
 * PostgreSQL + pgvector connection and schema bootstrap.
 *
 * One database holds both the relational data (documents, company records)
 * and the vector index (document_chunks.embedding), so a single query can
 * filter by case and rank by semantic similarity.
 */

import pg from 'pg'
import { env } from './env'
import { createLogger } from './logger'

const logger = createLogger('Database')

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 })

pool.on('error', (err) => {
  logger.error({ err }, 'Idle PostgreSQL client error')
})

let ready = false

export const isDatabaseReady = () => ready

const schemaSql = (dim: number) => `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           TEXT,
  source_type       TEXT NOT NULL CHECK (source_type IN ('pdf', 'text', 'image', 'company_record')),
  title             TEXT NOT NULL,
  original_filename TEXT,
  mime_type         TEXT,
  storage_path      TEXT,
  size_bytes        INTEGER,
  sha256            TEXT NOT NULL,
  extracted_text    TEXT NOT NULL DEFAULT '',
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error             TEXT,
  chunk_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same file uploaded twice to the same case is stored once
CREATE UNIQUE INDEX IF NOT EXISTS documents_sha256_case_uq
  ON documents (sha256, COALESCE(case_id, ''));
CREATE INDEX IF NOT EXISTS documents_case_idx ON documents (case_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  case_id      TEXT,
  source_type  TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  page         INTEGER,
  content      TEXT NOT NULL,
  embedding    vector(${dim}) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS document_chunks_case_idx ON document_chunks (case_id);
CREATE INDEX IF NOT EXISTS document_chunks_document_idx ON document_chunks (document_id);

-- Raw structured records pulled from the company internal API
CREATE TABLE IF NOT EXISTS company_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type  TEXT NOT NULL CHECK (record_type IN ('dispute', 'rider', 'driver', 'trip')),
  external_id  TEXT NOT NULL,
  case_id      TEXT,
  data         JSONB NOT NULL,
  document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_type, external_id)
);
`

/**
 * Create the extension and tables if missing. Safe to run on every start.
 */
export async function initDatabase(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(schemaSql(env.EMBED_DIM))

    // Fail loudly if the stored vector size no longer matches the configured model
    const { rows } = await client.query<{ dim: number }>(
      `SELECT atttypmod AS dim FROM pg_attribute
       WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding'`
    )
    if (rows[0] && rows[0].dim !== env.EMBED_DIM) {
      throw new Error(
        `document_chunks.embedding is vector(${rows[0].dim}) but EMBED_DIM=${env.EMBED_DIM}. ` +
          'Re-create the table (or restore the previous EMBED_MODEL) before continuing.'
      )
    }

    // Jobs that were mid-flight when the server stopped will never finish
    await client.query(
      `UPDATE documents SET status = 'failed', error = 'Interrupted by server restart', updated_at = now()
       WHERE status = 'processing'`
    )

    ready = true
  } finally {
    client.release()
  }
}

export async function closeDatabase(): Promise<void> {
  ready = false
  await pool.end()
}

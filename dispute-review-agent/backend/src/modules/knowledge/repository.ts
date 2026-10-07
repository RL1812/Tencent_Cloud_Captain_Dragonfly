/**
 * Knowledge Base — PostgreSQL / pgvector queries
 */

import type { PoolClient } from 'pg'
import { pool } from '../../config/database'
import type {
  Chunk,
  CompanyRecordType,
  DocumentStatus,
  KnowledgeDocument,
  SearchHit,
  SearchOptions,
  SourceType,
} from './types'

/** pgvector's text format: '[0.1,0.2,...]' */
export const toVectorLiteral = (vec: number[]) => `[${vec.join(',')}]`

const DOCUMENT_COLUMNS = `
  id, case_id, source_type, title, original_filename, mime_type, size_bytes,
  status, error, chunk_count, metadata, created_at, updated_at`

interface DocumentRow {
  id: string
  case_id: string | null
  source_type: SourceType
  title: string
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  status: DocumentStatus
  error: string | null
  chunk_count: number
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
  extracted_text?: string
  storage_path?: string | null
}

function toDocument(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    caseId: row.case_id,
    sourceType: row.source_type,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.extracted_text !== undefined ? { extractedText: row.extracted_text } : {}),
  }
}

export interface NewDocument {
  caseId: string | null
  sourceType: SourceType
  title: string
  originalFilename?: string
  mimeType?: string
  storagePath?: string
  sizeBytes?: number
  sha256: string
}

/**
 * Insert a document in 'processing' state. If the same content already exists
 * for this case, returns the existing row with duplicate=true instead.
 */
export async function createDocument(
  doc: NewDocument
): Promise<{ document: KnowledgeDocument; duplicate: boolean }> {
  const { rows } = await pool.query<DocumentRow>(
    `INSERT INTO documents
       (case_id, source_type, title, original_filename, mime_type, storage_path, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (sha256, COALESCE(case_id, '')) DO NOTHING
     RETURNING ${DOCUMENT_COLUMNS}`,
    [
      doc.caseId,
      doc.sourceType,
      doc.title,
      doc.originalFilename ?? null,
      doc.mimeType ?? null,
      doc.storagePath ?? null,
      doc.sizeBytes ?? null,
      doc.sha256,
    ]
  )
  if (rows[0]) return { document: toDocument(rows[0]), duplicate: false }

  const existing = await pool.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents
     WHERE sha256 = $1 AND COALESCE(case_id, '') = COALESCE($2, '')`,
    [doc.sha256, doc.caseId]
  )
  return { document: toDocument(existing.rows[0]), duplicate: true }
}

/**
 * Replace a document's chunks and mark it ready, in one transaction.
 */
export async function saveChunks(
  documentId: string,
  extractedText: string,
  metadata: Record<string, unknown>,
  chunks: Chunk[],
  embeddings: number[][]
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ case_id: string | null; source_type: SourceType }>(
      'SELECT case_id, source_type FROM documents WHERE id = $1 FOR UPDATE',
      [documentId]
    )
    if (!rows[0]) throw new Error(`Document ${documentId} was deleted during processing`)
    const { case_id, source_type } = rows[0]

    await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId])
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks
           (document_id, case_id, source_type, chunk_index, page, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
        [
          documentId,
          case_id,
          source_type,
          chunks[i].chunkIndex,
          chunks[i].page ?? null,
          chunks[i].content,
          toVectorLiteral(embeddings[i]),
        ]
      )
    }
    await client.query(
      `UPDATE documents
       SET status = 'ready', error = NULL, extracted_text = $2, metadata = metadata || $3::jsonb,
           chunk_count = $4, updated_at = now()
       WHERE id = $1`,
      [documentId, extractedText, JSON.stringify(metadata), chunks.length]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function markFailed(documentId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [documentId, error.slice(0, 2000)]
  )
}

export async function markProcessing(documentId: string): Promise<void> {
  await pool.query(
    `UPDATE documents SET status = 'processing', error = NULL, updated_at = now() WHERE id = $1`,
    [documentId]
  )
}

export async function listDocuments(filter: {
  caseId?: string
  sourceType?: SourceType
  status?: DocumentStatus
}): Promise<KnowledgeDocument[]> {
  const { rows } = await pool.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents
     WHERE ($1::text IS NULL OR case_id = $1)
       AND ($2::text IS NULL OR source_type = $2)
       AND ($3::text IS NULL OR status = $3)
     ORDER BY created_at DESC
     LIMIT 500`,
    [filter.caseId ?? null, filter.sourceType ?? null, filter.status ?? null]
  )
  return rows.map(toDocument)
}

export async function getDocument(
  id: string
): Promise<(KnowledgeDocument & { storagePath: string | null }) | null> {
  const { rows } = await pool.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS}, extracted_text, storage_path FROM documents WHERE id = $1`,
    [id]
  )
  if (!rows[0]) return null
  return { ...toDocument(rows[0]), storagePath: rows[0].storage_path ?? null }
}

/** Deletes the document (chunks cascade). Returns its storage path, if any. */
export async function deleteDocument(id: string): Promise<{ storagePath: string | null } | null> {
  const { rows } = await pool.query<{ storage_path: string | null }>(
    'DELETE FROM documents WHERE id = $1 RETURNING storage_path',
    [id]
  )
  return rows[0] ? { storagePath: rows[0].storage_path } : null
}

/**
 * Cosine-similarity search over chunks, optionally scoped to a case and source types.
 */
export async function searchChunks(embedding: number[], options: SearchOptions): Promise<SearchHit[]> {
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    // With filters, keep scanning the HNSW index until enough rows pass them (pgvector >= 0.8)
    await client.query(`SET LOCAL hnsw.iterative_scan = strict_order`)
    const { rows } = await client.query(
      `SELECT c.id AS chunk_id, c.document_id, c.case_id, d.title, c.source_type,
              d.original_filename, c.page, c.chunk_index, c.content,
              1 - (c.embedding <=> $1::vector) AS score
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE ($2::text IS NULL OR c.case_id = $2 OR ($3 AND c.case_id IS NULL))
         AND ($4::text[] IS NULL OR c.source_type = ANY($4))
       ORDER BY c.embedding <=> $1::vector
       LIMIT $5`,
      [
        toVectorLiteral(embedding),
        options.caseId ?? null,
        options.includeGlobal ?? true,
        options.sourceTypes?.length ? options.sourceTypes : null,
        options.topK ?? 6,
      ]
    )
    await client.query('COMMIT')

    return rows
      .map((r) => ({
        chunkId: Number(r.chunk_id),
        documentId: r.document_id,
        caseId: r.case_id,
        title: r.title,
        sourceType: r.source_type,
        originalFilename: r.original_filename,
        page: r.page,
        chunkIndex: r.chunk_index,
        content: r.content,
        score: Number(Number(r.score).toFixed(4)),
      }))
      .filter((hit) => hit.score >= (options.minScore ?? 0))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ============================================
// Company records
// ============================================

export async function upsertCompanyRecord(record: {
  recordType: CompanyRecordType
  externalId: string
  caseId: string | null
  data: Record<string, unknown>
}): Promise<{ id: string; previousDocumentId: string | null }> {
  const { rows } = await pool.query<{ id: string; previous_document_id: string | null }>(
    `WITH previous AS (
       SELECT document_id FROM company_records WHERE record_type = $1 AND external_id = $2
     )
     INSERT INTO company_records (record_type, external_id, case_id, data)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (record_type, external_id)
     DO UPDATE SET data = EXCLUDED.data, case_id = EXCLUDED.case_id, fetched_at = now()
     RETURNING id, (SELECT document_id FROM previous) AS previous_document_id`,
    [record.recordType, record.externalId, record.caseId, JSON.stringify(record.data)]
  )
  return { id: rows[0].id, previousDocumentId: rows[0].previous_document_id }
}

export async function linkCompanyRecordDocument(recordId: string, documentId: string): Promise<void> {
  await pool.query('UPDATE company_records SET document_id = $2 WHERE id = $1', [recordId, documentId])
}

export async function listCompanyRecords(caseId?: string) {
  const { rows } = await pool.query(
    `SELECT id, record_type, external_id, case_id, data, document_id, fetched_at
     FROM company_records
     WHERE ($1::text IS NULL OR case_id = $1)
     ORDER BY fetched_at DESC
     LIMIT 500`,
    [caseId ?? null]
  )
  return rows.map((r) => ({
    id: r.id,
    recordType: r.record_type as CompanyRecordType,
    externalId: r.external_id,
    caseId: r.case_id,
    data: r.data,
    documentId: r.document_id,
    fetchedAt: (r.fetched_at as Date).toISOString(),
  }))
}

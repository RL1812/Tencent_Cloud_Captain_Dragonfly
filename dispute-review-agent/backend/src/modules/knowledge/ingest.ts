/**
 * Ingestion pipeline: store source file → extract text → chunk → embed → save.
 *
 * Every document keeps its source on disk (uploads, pasted text and rendered
 * company records alike), so any document can be reprocessed later, e.g.
 * after Ollama was down or the embedding model changed.
 */

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { env } from '../../config/env'
import { createLogger } from '../../config/logger'
import { embedTexts } from '../../lib/ollama'
import { chunkSections, normalizeText } from './chunker'
import { parseFile } from './parsers'
import * as repo from './repository'
import {
  fetchDisputeBundle,
  recordExternalId,
  recordTitle,
  recordToText,
  type CompanyRecord,
} from './company-api'
import type { CompanyRecordType, KnowledgeDocument, SourceType } from './types'

const logger = createLogger('Ingest')

export const uploadDir = path.resolve(env.UPLOAD_DIR)

export interface IngestResult {
  document: KnowledgeDocument
  duplicate: boolean
  /** Resolves when processing finishes (immediately for duplicates) */
  done: Promise<void>
}

// ============================================
// Serial job queue — OCR and embedding are CPU-heavy, run one at a time
// ============================================

let queueTail: Promise<void> = Promise.resolve()

function enqueue(job: () => Promise<void>): Promise<void> {
  const run = queueTail.then(job)
  queueTail = run.catch(() => {})
  return run
}

async function processDocument(documentId: string, storagePath: string, sourceType: SourceType) {
  try {
    const buffer = await fs.readFile(storagePath)
    const parsed = await parseFile(buffer, sourceType)
    const chunks = chunkSections(parsed.sections)
    const embeddings = chunks.length ? await embedTexts(chunks.map((c) => c.content)) : []
    const extractedText = parsed.sections.map((s) => normalizeText(s.text)).join('\n\n')

    await repo.saveChunks(documentId, extractedText, parsed.metadata, chunks, embeddings)
    logger.info({ documentId, chunks: chunks.length }, 'Document ingested')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, documentId }, 'Document ingestion failed')
    await repo.markFailed(documentId, message).catch(() => {})
  }
}

const sha256 = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex')

async function writeSource(content: string, ext = '.txt'): Promise<string> {
  await fs.mkdir(uploadDir, { recursive: true })
  const storagePath = path.join(uploadDir, `${crypto.randomUUID()}${ext}`)
  await fs.writeFile(storagePath, content, 'utf8')
  return storagePath
}

async function createAndQueue(
  doc: repo.NewDocument & { storagePath: string },
  discardSourceIfDuplicate: boolean
): Promise<IngestResult> {
  const { document, duplicate } = await repo.createDocument(doc)
  if (duplicate) {
    if (discardSourceIfDuplicate) await fs.rm(doc.storagePath, { force: true })
    return { document, duplicate, done: Promise.resolve() }
  }
  const done = enqueue(() => processDocument(document.id, doc.storagePath, doc.sourceType))
  return { document, duplicate, done }
}

// ============================================
// Public entry points
// ============================================

export async function ingestUploadedFile(
  file: { path: string; originalname: string; mimetype: string; size: number },
  sourceType: SourceType,
  options: { caseId: string | null; title?: string }
): Promise<IngestResult> {
  const buffer = await fs.readFile(file.path)
  return createAndQueue(
    {
      caseId: options.caseId,
      sourceType,
      title: options.title || file.originalname,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      storagePath: file.path,
      sizeBytes: file.size,
      sha256: sha256(buffer),
    },
    true
  )
}

export async function ingestText(input: {
  text: string
  title: string
  caseId: string | null
}): Promise<IngestResult> {
  const storagePath = await writeSource(input.text)
  return createAndQueue(
    {
      caseId: input.caseId,
      sourceType: 'text',
      title: input.title,
      mimeType: 'text/plain',
      storagePath,
      sizeBytes: Buffer.byteLength(input.text),
      sha256: sha256(input.text),
    },
    true
  )
}

async function ingestCompanyRecord(
  type: CompanyRecordType,
  record: CompanyRecord,
  caseId: string | null
): Promise<IngestResult & { recordType: CompanyRecordType; externalId: string }> {
  const externalId = recordExternalId(type, record)
  const text = recordToText(type, record)

  const { id: recordId, previousDocumentId } = await repo.upsertCompanyRecord({
    recordType: type,
    externalId,
    caseId,
    data: record,
  })

  const storagePath = await writeSource(text)
  const result = await createAndQueue(
    {
      caseId,
      sourceType: 'company_record',
      title: recordTitle(type, externalId),
      mimeType: 'text/plain',
      storagePath,
      sizeBytes: Buffer.byteLength(text),
      sha256: sha256(text),
    },
    true
  )
  await repo.linkCompanyRecordDocument(recordId, result.document.id)

  // The record changed since last import: drop the stale version from search
  if (previousDocumentId && previousDocumentId !== result.document.id) {
    await deleteDocumentAndFile(previousDocumentId)
  }
  return { ...result, recordType: type, externalId }
}

/**
 * Pull a dispute ticket and its trip, rider and driver from the company API.
 * Returns null if the dispute does not exist.
 */
export async function importDispute(disputeId: string, caseId: string | null) {
  const bundle = await fetchDisputeBundle(disputeId)
  if (!bundle) return null

  const entries: [CompanyRecordType, CompanyRecord | null][] = [
    ['dispute', bundle.dispute],
    ['trip', bundle.trip],
    ['rider', bundle.rider],
    ['driver', bundle.driver],
  ]
  const results = []
  for (const [type, record] of entries) {
    if (record) results.push(await ingestCompanyRecord(type, record, caseId))
  }
  return results
}

export async function importSingleRecord(type: CompanyRecordType, record: CompanyRecord, caseId: string | null) {
  return ingestCompanyRecord(type, record, caseId)
}

/**
 * Re-run extraction and embedding for an existing document.
 */
export async function reprocessDocument(id: string): Promise<IngestResult | null> {
  const doc = await repo.getDocument(id)
  if (!doc) return null
  if (!doc.storagePath) throw new Error('Document has no stored source to reprocess')

  await repo.markProcessing(id)
  const storagePath = doc.storagePath
  const done = enqueue(() => processDocument(id, storagePath, doc.sourceType))
  return { document: { ...doc, status: 'processing', error: null }, duplicate: false, done }
}

export async function deleteDocumentAndFile(id: string): Promise<boolean> {
  const deleted = await repo.deleteDocument(id)
  if (!deleted) return false
  if (deleted.storagePath) await fs.rm(deleted.storagePath, { force: true })
  return true
}

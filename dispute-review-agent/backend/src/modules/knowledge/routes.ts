/**
 * Knowledge Base — API Routes (mounted at /api/knowledge)
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../../config/env'
import { isDatabaseReady, pool } from '../../config/database'
import { AppError } from '../../middleware/errorHandler'
import { listModels } from '../../lib/ollama'
import { ACCEPTED_EXTENSIONS, detectSourceType } from './parsers'
import { companyRecordsClient } from './company-api'
import {
  deleteDocumentAndFile,
  importDispute,
  importSingleRecord,
  ingestText,
  ingestUploadedFile,
  reprocessDocument,
  uploadDir,
  type IngestResult,
} from './ingest'
import { askQuestion, semanticSearch } from './rag'
import * as repo from './repository'

export const knowledgeRouter: Router = Router()

const MAX_FILES_PER_REQUEST = 10

const sourceTypeSchema = z.enum(['pdf', 'text', 'image', 'company_record'])
const recordTypeSchema = z.enum(['dispute', 'rider', 'driver', 'trip'])
const optionalId = z.string().trim().min(1).max(100).optional()

const searchSchema = z.object({
  caseId: optionalId,
  includeGlobal: z.boolean().default(true),
  sourceTypes: z.array(sourceTypeSchema).optional(),
  topK: z.number().int().min(1).max(20).default(6),
  minScore: z.number().min(-1).max(1).default(0),
})

const askSchema = searchSchema.extend({
  question: z.string().trim().min(3).max(2000),
})

const querySchema = searchSchema.extend({
  query: z.string().trim().min(1).max(2000),
})

const textSchema = z.object({
  text: z.string().trim().min(1).max(500_000),
  title: z.string().trim().min(1).max(200),
  caseId: optionalId,
})

const importSchema = z.union([
  z.object({ disputeId: z.string().trim().min(1), caseId: optionalId }),
  z.object({ type: recordTypeSchema, id: z.string().trim().min(1), caseId: optionalId }),
])

// ============================================
// Uploads
// ============================================

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(uploadDir, { recursive: true })
      cb(null, uploadDir)
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
    },
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    // multer decodes names as latin1; restore UTF-8 (e.g. Chinese filenames)
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
    if (detectSourceType(file.mimetype, file.originalname)) return cb(null, true)
    cb(new AppError(415, `Unsupported file "${file.originalname}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`))
  },
})

/** All knowledge routes need the database */
knowledgeRouter.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path === '/health' || isDatabaseReady()) return next()
  next(new AppError(503, 'Knowledge base database is not available. Check DATABASE_URL and that PostgreSQL is running.'))
})

/** ?wait=true holds the response until processing finishes */
async function respondWithIngest(req: Request, res: Response, results: IngestResult[]) {
  const wait = req.query.wait === 'true'
  if (wait) await Promise.all(results.map((r) => r.done))

  const documents = await Promise.all(
    results.map(async (r) => {
      const latest = wait ? await repo.getDocument(r.document.id) : null
      const { storagePath: _omit, extractedText: _text, ...doc } = latest ?? { ...r.document, storagePath: null }
      return { ...doc, duplicate: r.duplicate }
    })
  )
  res.status(wait ? 201 : 202).json({ data: documents })
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/knowledge/health — DB and model availability
 */
knowledgeRouter.get('/health', async (_req: Request, res: Response) => {
  let database = isDatabaseReady()
  if (database) {
    database = await pool.query('SELECT 1').then(() => true, () => false)
  }
  const models = await listModels()
  const has = (name: string) => !!models?.some((m) => m === name || m === `${name}:latest`)

  res.json({
    data: {
      database,
      ollama: models !== null,
      embedModel: { name: env.EMBED_MODEL, available: has(env.EMBED_MODEL) },
      llmModel: { name: env.LLM_MODEL, available: has(env.LLM_MODEL) },
      visionModel: env.VISION_MODEL ? { name: env.VISION_MODEL, available: has(env.VISION_MODEL) } : null,
      companyApi: companyRecordsClient.name,
    },
  })
})

/**
 * POST /api/knowledge/documents — Upload files (multipart field "files", optional caseId, title)
 */
knowledgeRouter.post(
  '/documents',
  upload.array('files', MAX_FILES_PER_REQUEST),
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (files.length === 0) throw new AppError(400, 'No files uploaded. Use multipart field "files".')

    const results: IngestResult[] = []
    try {
      const { caseId, title } = z
        .object({ caseId: optionalId, title: z.string().trim().max(200).optional() })
        .parse(req.body)

      for (const file of files) {
        const sourceType = detectSourceType(file.mimetype, file.originalname)!
        results.push(
          await ingestUploadedFile(file, sourceType, {
            caseId: caseId ?? null,
            // A single title only makes sense for a single file
            title: files.length === 1 ? title : undefined,
          })
        )
      }
    } catch (err) {
      // Don't leave files on disk that no document points to
      for (const file of files.slice(results.length)) fs.rmSync(file.path, { force: true })
      throw err
    }
    await respondWithIngest(req, res, results)
  }
)

/**
 * POST /api/knowledge/documents/text — Store pasted text (notes, statements)
 */
knowledgeRouter.post('/documents/text', async (req: Request, res: Response) => {
  const body = textSchema.parse(req.body)
  const result = await ingestText({ text: body.text, title: body.title, caseId: body.caseId ?? null })
  await respondWithIngest(req, res, [result])
})

/**
 * GET /api/knowledge/documents?caseId=&sourceType=&status=
 */
knowledgeRouter.get('/documents', async (req: Request, res: Response) => {
  const filter = z
    .object({
      caseId: optionalId,
      sourceType: sourceTypeSchema.optional(),
      status: z.enum(['processing', 'ready', 'failed']).optional(),
    })
    .parse(req.query)
  res.json({ data: await repo.listDocuments(filter) })
})

/**
 * GET /api/knowledge/documents/:id — Document with extracted text
 */
knowledgeRouter.get('/documents/:id', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id)
  const doc = await repo.getDocument(id)
  if (!doc) throw new AppError(404, 'Document not found')
  const { storagePath: _omit, ...data } = doc
  res.json({ data })
})

/**
 * GET /api/knowledge/documents/:id/file — Download the original file
 */
knowledgeRouter.get('/documents/:id/file', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id)
  const doc = await repo.getDocument(id)
  if (!doc?.storagePath || !fs.existsSync(doc.storagePath)) throw new AppError(404, 'File not found')
  const filename = doc.originalFilename ?? `${doc.title}.txt`
  if (doc.mimeType) res.type(doc.mimeType)
  res.download(doc.storagePath, filename)
})

/**
 * POST /api/knowledge/documents/:id/reprocess — Re-extract and re-embed
 */
knowledgeRouter.post('/documents/:id/reprocess', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id)
  const result = await reprocessDocument(id)
  if (!result) throw new AppError(404, 'Document not found')
  await respondWithIngest(req, res, [result])
})

/**
 * DELETE /api/knowledge/documents/:id
 */
knowledgeRouter.delete('/documents/:id', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id)
  if (!(await deleteDocumentAndFile(id))) throw new AppError(404, 'Document not found')
  res.status(204).end()
})

/**
 * GET /api/knowledge/company-records?caseId= — Records already imported
 */
knowledgeRouter.get('/company-records', async (req: Request, res: Response) => {
  const { caseId } = z.object({ caseId: optionalId }).parse(req.query)
  res.json({ data: await repo.listCompanyRecords(caseId) })
})

/**
 * GET /api/knowledge/company-records/:type/:id — Preview a record from the company API (not stored)
 */
knowledgeRouter.get('/company-records/:type/:id', async (req: Request, res: Response) => {
  const type = recordTypeSchema.parse(req.params.type)
  const record = await companyRecordsClient.get(type, String(req.params.id))
  if (!record) throw new AppError(404, `No ${type} record ${req.params.id} in company API`)
  res.json({ data: record, source: companyRecordsClient.name })
})

/**
 * POST /api/knowledge/company-records/import
 *   { disputeId, caseId? }      — dispute + its trip, rider and driver
 *   { type, id, caseId? }       — a single record
 * caseId defaults to the dispute ID.
 */
knowledgeRouter.post('/company-records/import', async (req: Request, res: Response) => {
  const body = importSchema.parse(req.body)

  if ('disputeId' in body) {
    const results = await importDispute(body.disputeId, body.caseId ?? body.disputeId)
    if (!results) throw new AppError(404, `Dispute ${body.disputeId} not found in company API`)
    return respondWithIngest(req, res, results)
  }

  const record = await companyRecordsClient.get(body.type, body.id)
  if (!record) throw new AppError(404, `No ${body.type} record ${body.id} in company API`)
  const result = await importSingleRecord(body.type, record, body.caseId ?? null)
  await respondWithIngest(req, res, [result])
})

/**
 * POST /api/knowledge/search — Vector search only, no LLM
 */
knowledgeRouter.post('/search', async (req: Request, res: Response) => {
  const { query, ...options } = querySchema.parse(req.body)
  try {
    res.json({ data: await semanticSearch(query, options) })
  } catch (err) {
    throw toEmbeddingError(err)
  }
})

/**
 * POST /api/knowledge/ask — Embed question → vector search → LLM answer with citations
 */
knowledgeRouter.post('/ask', async (req: Request, res: Response) => {
  const { question, ...options } = askSchema.parse(req.body)
  try {
    res.json({ data: await askQuestion(question, options) })
  } catch (err) {
    throw toEmbeddingError(err)
  }
})

function toEmbeddingError(err: unknown): unknown {
  if (err instanceof Error && err.message.includes('Ollama')) {
    return new AppError(503, `Embedding service unavailable: ${err.message}`)
  }
  return err
}

/**
 * Dispute Review — Evidence file uploads (photos, PDFs, any file).
 *
 * POST /api/uploads            multipart field "file" -> { fileName, fileUrl, mimeType, sizeBytes }
 * GET  /api/uploads/evidence/* serves stored files
 *
 * Files are stored on disk under UPLOAD_DIR/evidence. The returned fileUrl is
 * attached to an evidence item (see EvidenceItem.fileUrl). This does not need
 * the knowledge-base database.
 */

import { Router, Request, Response, NextFunction } from 'express'
import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { env } from '../../config/env'
import { AppError } from '../../middleware/errorHandler'

export const EVIDENCE_URL_PREFIX = `${env.API_PREFIX}/uploads/evidence/`
export const evidenceUploadDir = path.resolve(env.UPLOAD_DIR, 'evidence')

const INLINE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.pdf'])

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(evidenceUploadDir, { recursive: true })
      cb(null, evidenceUploadDir)
    },
    filename: (_req, file, cb) => {
      // Random name on disk; the original name is returned to the client
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')
      cb(null, `${crypto.randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
})

export const uploadsRouter: Router = Router()

uploadsRouter.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const tooLarge = err.code === 'LIMIT_FILE_SIZE'
        return next(
          new AppError(
            tooLarge ? 413 : 400,
            tooLarge ? `文件过大，上限 ${env.MAX_UPLOAD_MB}MB` : `上传失败：${err.message}`
          )
        )
      }
      next(err)
    })
  },
  (req: Request, res: Response) => {
    const file = req.file
    if (!file) throw new AppError(400, '未收到文件（表单字段名应为 "file"）')
    // multer decodes names as latin1; restore UTF-8 (e.g. Chinese filenames)
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    res.status(201).json({
      data: {
        fileName,
        fileUrl: `${EVIDENCE_URL_PREFIX}${file.filename}`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    })
  }
)

// Serve stored files. Only images/PDFs are shown inline; everything else is
// downloaded, and uploads are sandboxed so they can never run scripts.
uploadsRouter.use(
  '/evidence',
  express.static(evidenceUploadDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'")
      if (!INLINE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        res.setHeader('Content-Disposition', 'attachment')
      }
    },
  })
)

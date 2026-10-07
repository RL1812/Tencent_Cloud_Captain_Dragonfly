import express, { Application } from 'express'
import cors from 'cors'
import compression from 'compression'
import 'express-async-errors'
import path from 'path'
import fs from 'fs'
import { env } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { httpLogger } from './middleware/logger'
import { systemRouter } from './modules/system'
import { disputeRouter } from './modules/dispute/routes'
import { uploadsRouter } from './modules/dispute/uploads'
import { knowledgeRouter } from './modules/knowledge/routes'

export const createApp = (): Application => {
  const app = express()

  // HTTP request logging
  app.use(httpLogger)

  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN,
      credentials: env.CORS_ORIGIN !== '*',
    })
  )

  // Body parsing and compression
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(compression())

  // API routes - System & Health
  app.use(env.API_PREFIX, systemRouter)

  // Dispute Review Agent routes
  app.use(`${env.API_PREFIX}/disputes`, disputeRouter)

  // Evidence file uploads (photos, PDFs, any file)
  app.use(`${env.API_PREFIX}/uploads`, uploadsRouter)

  // Knowledge base: uploads, company records, vector search, RAG Q&A
  app.use(`${env.API_PREFIX}/knowledge`, knowledgeRouter)

  // Serve built frontend (production)
  const staticDir = path.join(process.cwd(), 'public')
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir))
    // SPA fallback: non-/api routes serve index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith(env.API_PREFIX)) return next()
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  // Error handling
  app.use(errorHandler)

  return app
}

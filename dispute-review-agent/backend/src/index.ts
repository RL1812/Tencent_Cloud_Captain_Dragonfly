import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { closeDatabase, initDatabase } from './config/database'
import { terminateOcr } from './modules/knowledge/parsers'

const startServer = async () => {
  try {
    // The dispute review features work without the knowledge base, so a
    // missing database is a warning, not a reason to stop the server
    await initDatabase().catch((err) => {
      // A refused connection to "localhost" is an AggregateError with an empty
      // message (one attempt per address), so log the code instead
      const reason =
        (err as NodeJS.ErrnoException)?.code ||
        (err instanceof Error && err.message) ||
        String(err)
      logger.warn(
        { err: reason },
        'Knowledge base database unavailable; /api/knowledge routes will return 503. ' +
          'Start PostgreSQL with `docker compose up -d` in dispute-review-agent/, ' +
          'or ignore this if you do not need the knowledge base'
      )
    })

    const app = createApp()

    app.listen(env.PORT, () => {
      // Only show minimal startup info in development
      if (env.NODE_ENV === 'development') {
        console.log(`Server running on http://localhost:${env.PORT}${env.API_PREFIX}`)
      }
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

const shutdown = async () => {
  await Promise.allSettled([terminateOcr(), closeDatabase()])
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

startServer()

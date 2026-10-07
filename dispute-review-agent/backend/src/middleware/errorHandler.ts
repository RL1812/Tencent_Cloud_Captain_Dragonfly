import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { MulterError } from 'multer'
import { createLogger } from '../config/logger'

const logger = createLogger('ErrorHandler')

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    logger.warn(
      {
        method: req.method,
        url: req.url,
        errors: err.errors,
      },
      'Validation error'
    )

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // Upload errors (file too large, too many files, wrong field name)
  if (err instanceof MulterError) {
    logger.warn({ method: req.method, url: req.url, code: err.code }, err.message)
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      status: 'error',
      message: err.message,
    })
  }

  // Application errors
  if (err instanceof AppError) {
    logger.warn(
      {
        method: req.method,
        url: req.url,
        statusCode: err.statusCode,
      },
      err.message
    )

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    })
  }

  // Unknown errors
  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
    },
    'Unhandled error'
  )

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  })
}

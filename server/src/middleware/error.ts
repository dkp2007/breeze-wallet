import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors.js'

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input' })
    return
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
}
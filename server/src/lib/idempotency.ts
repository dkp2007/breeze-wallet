import type { Request, RequestHandler, Response } from 'express'
import { pool } from '../db.js'
import { AppError } from './errors.js'
import { config } from '../config.js'

export function getIdempotencyKey(req: Request): string | undefined {
  const raw = req.headers['idempotency-key']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return undefined
  const key = value.trim()
  if (key.length < 8 || key.length > 255) return undefined
  return key
}

export async function claimKey(userId: string, key: string, endpoint: string): Promise<'claimed' | 'replay'> {
  const claim = await pool.query(
    'insert into idempotency_keys (user_id, idempotency_key, endpoint) values ($1, $2, $3) on conflict do nothing returning user_id',
    [userId, key, endpoint]
  )
  if (claim.rowCount === 0) {
    const existing = await pool.query(
      'select endpoint, response_status, response_body from idempotency_keys where user_id = $1 and idempotency_key = $2',
      [userId, key]
    )
    const row = existing.rows[0]
    if (!row) {
      throw new AppError(409, 'The previous request with this key is still being processed. Try again shortly.')
    }
    if (row.endpoint !== endpoint) {
      throw new AppError(409, 'This request key was already used for a different operation')
    }
    if (row.response_status === null) {
      throw new AppError(409, 'Your previous request with this key is still being processed. Try again shortly.')
    }
    return 'replay'
  }
  return 'claimed'
}

export async function storeResponse(userId: string, key: string, status: number, body: unknown): Promise<void> {
  await pool.query('update idempotency_keys set response_status = $3, response_body = $4 where user_id = $1 and idempotency_key = $2', [
    userId,
    key,
    status,
    JSON.stringify(body)
  ])
}

export async function releaseKey(userId: string, key: string): Promise<void> {
  await pool.query('delete from idempotency_keys where user_id = $1 and idempotency_key = $2', [userId, key])
}

export function idempotencyGuard(endpoint: string): RequestHandler {
  return (req, res, next) => {
    const key = getIdempotencyKey(req)
    const userId = req.user?.userId
    if (!key || !userId) {
      next()
      return
    }
    claimKey(userId, key, endpoint)
      .then(async (result) => {
        if (result === 'replay') {
          const { rows } = await pool.query(
            'select response_status, response_body from idempotency_keys where user_id = $1 and idempotency_key = $2',
            [userId, key]
          )
          res.status(rows[0].response_status).json(rows[0].response_body)
          return
        }
        const json = res.json.bind(res)
        res.json = ((body: unknown) => {
          void storeResponse(userId, key, res.statusCode, body).catch(() => {})
          return json(body)
        }) as typeof res.json
        next()
      })
      .catch(next)
  }
}

export function startKeyCleanup(): void {
  const deleteOlderThan = () => {
    void pool
      .query('delete from idempotency_keys where created_at < now() - make_interval(secs => $1)', [
        config.idempotencyRetentionSeconds
      ])
      .catch(() => {})
  }
  deleteOlderThan()
  setInterval(deleteOlderThan, 6 * 60 * 60 * 1000).unref()
}

import type { Request } from 'express'
import { pool } from '../db.js'
import { AppError } from './errors.js'
import { parseTokenClaims } from './mfa.js'

export interface DeviceInfo {
  device_name: string
  device_type: string
  browser: string | null
  os: string | null
}

export function parseUserAgent(ua: string | undefined): DeviceInfo {
  const raw = (ua ?? '').trim()
  if (!raw) {
    return { device_name: 'Unrecognized device', device_type: 'unknown', browser: null, os: null }
  }

  let browser = 'Unknown browser'
  if (/edg(?:e|a|ios)/i.test(raw)) browser = 'Edge'
  else if (/opr\/|opera/i.test(raw)) browser = 'Opera'
  else if (/samsungbrowser/i.test(raw)) browser = 'Samsung Internet'
  else if (/firefox|fxios/i.test(raw)) browser = 'Firefox'
  else if (/chrome|crios/i.test(raw)) browser = 'Chrome'
  else if (/safari/i.test(raw)) browser = 'Safari'

  let os = 'Unknown system'
  if (/windows/i.test(raw)) os = 'Windows'
  else if (/android/i.test(raw)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(raw)) os = 'iOS'
  else if (/mac os x|macintosh/i.test(raw)) os = 'macOS'
  else if (/linux/i.test(raw)) os = 'Linux'

  const deviceType = /mobile|android|iphone/i.test(raw) ? 'mobile' : 'desktop'
  const osLabel = os === 'Unknown system' ? '' : os
  const browserLabel = browser === 'Unknown browser' ? '' : browser
  const device_name = [browserLabel, osLabel].filter(Boolean).join(' on ') || 'Unrecognized device'

  return { device_name, device_type: deviceType, browser, os }
}

export interface TokenMeta {
  sessionId: string
  jti: string | null
}

export function extractTokenMeta(token: string): TokenMeta | null {
  const claims = parseTokenClaims(token)
  if (!claims) return null
  const sessionId = claims.session_id
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  const jti = claims.jti
  return { sessionId, jti: typeof jti === 'string' && jti.length > 0 ? jti : null }
}

export async function touchSession(
  userId: string,
  sessionId: string,
  jti: string | null,
  device: DeviceInfo,
  ip: string
): Promise<void> {
  await pool.query(
    `insert into server_sessions (session_id, user_id, device_name, device_type, browser, os, ip, current_jti, created_at, last_seen_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
     on conflict (session_id) do update
       set current_jti = excluded.current_jti,
           ip = excluded.ip,
           last_seen_at = now()`,
    [sessionId, userId, device.device_name, device.device_type, device.browser, device.os, ip, jti]
  )
}

export async function assertSessionActive(userId: string, sessionId: string): Promise<void> {
  const { rows } = await pool.query(
    'select 1 from server_sessions where session_id = $1 and user_id = $2 and revoked_at is null limit 1',
    [sessionId, userId]
  )
  if (rows.length === 0) {
    throw new AppError(401, 'You were signed out on this device. Please sign in again.')
  }
}

export async function listUserSessions(userId: string): Promise<
  {
    sessionId: string
    deviceName: string
    deviceType: string
    browser: string | null
    os: string | null
    ip: string | null
    createdAt: string
    lastSeenAt: string
  }[]
> {
  const { rows } = await pool.query(
    `select session_id, device_name, device_type, browser, os, ip, created_at, last_seen_at
     from server_sessions where user_id = $1 and revoked_at is null order by last_seen_at desc`,
    [userId]
  )
  return rows.map((row) => ({
    sessionId: row.session_id,
    deviceName: row.device_name,
    deviceType: row.device_type,
    browser: row.browser,
    os: row.os,
    ip: row.ip,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  }))
}

export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'update server_sessions set revoked_at = now() where session_id = $1 and user_id = $2 and revoked_at is null',
    [sessionId, userId]
  )
  return (rowCount ?? 0) > 0
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const { rowCount } = await pool.query(
    'update server_sessions set revoked_at = now() where user_id = $1 and session_id <> $2 and revoked_at is null',
    [userId, currentSessionId]
  )
  return rowCount ?? 0
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip ?? ''
}

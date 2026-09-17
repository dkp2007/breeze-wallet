import type { Request } from 'express'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { AppError } from '../lib/errors.js'
import { supabaseAdmin } from '../db.js'
import { extractTokenMeta, listUserSessions, revokeOtherSessions, revokeSession } from '../lib/sessions.js'

const router = Router()

function currentSessionId(req: Request): string {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  const meta = extractTokenMeta(token)
  if (!meta) {
    throw new AppError(401, 'Invalid session token')
  }
  return meta.sessionId
}

router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = currentSessionId(req)
    const sessions = await listUserSessions(req.user!.userId)
    res.json({
      currentSessionId: current,
      sessions: sessions.map((session) => ({ ...session, isCurrent: session.sessionId === current }))
    })
  })
)

router.delete(
  '/sessions/:sessionId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = currentSessionId(req)
    if (req.params.sessionId === current) {
      throw new AppError(400, 'Use the sign-out button to leave this device')
    }
    const revoked = await revokeSession(req.user!.userId, req.params.sessionId)
    if (!revoked) {
      throw new AppError(404, 'That device was not found on your account')
    }
    res.json({ ok: true })
  })
)

router.post(
  '/sessions/sign-out-everywhere',
  requireAuth,
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
    const current = currentSessionId(req)
    const count = await revokeOtherSessions(req.user!.userId, current)
    if (token) {
      await supabaseAdmin.auth.admin.signOut(token, 'others').catch(() => {})
    }
    res.json({ ok: true, revokedCount: count })
  })
)

export default router

import type { NextFunction, Request, Response } from 'express'
import { supabaseAdmin } from '../db.js'
import { AppError, MfaRequiredError } from '../lib/errors.js'
import { hasVerifiedFactor, parseTokenClaims, tokenHasSecondFactor } from '../lib/mfa.js'
import { assertSessionActive, clientIp, extractTokenMeta, parseUserAgent, touchSession } from '../lib/sessions.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'Missing access token'))
    return
  }
  const token = header.slice(7)
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) {
    next(new AppError(401, 'Invalid or expired session'))
    return
  }
  const meta = extractTokenMeta(token)
  if (!meta) {
    next(new AppError(401, 'Invalid session token'))
    return
  }
  await touchSession(data.user.id, meta.sessionId, meta.jti, parseUserAgent(req.headers['user-agent']), clientIp(req)).catch(
    () => {}
  )
  try {
    await assertSessionActive(data.user.id, meta.sessionId)
  } catch (err) {
    next(err)
    return
  }
  if (!tokenHasSecondFactor(parseTokenClaims(token))) {
    const { data: factorData } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.user.id })
    if (hasVerifiedFactor(factorData?.factors)) {
      next(new MfaRequiredError())
      return
    }
  }
  req.user = { userId: data.user.id, email: data.user.email ?? '' }
  next()
}
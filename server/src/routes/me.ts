import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { AppError } from '../lib/errors.js'
import { getWallet, recordLogin, setLimits, setWalletCurrency } from '../services/wallet.js'
import { CURRENCIES, CURRENCY_CODES, assertSupportedCurrency } from '../lib/currencies.js'
import { supabaseAdmin } from '../db.js'
import { pool } from '../db.js'
import { normalizeLimitCents } from '../lib/limits.js'
import { clientIp } from '../lib/sessions.js'
import { config } from '../config.js'

const router = Router()

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const wallet = await getWallet(req.user!.userId)
    const loginRisk = await recordLogin(req.user!.userId, clientIp(req), req.headers['user-agent'] ?? '')
    const { rows } = await pool.query('select full_name, phone, city, bio, avatar_url from profiles where id = $1', [req.user!.userId])
    res.json({
      user: { id: req.user!.userId, email: req.user!.email, fullName: rows[0]?.full_name ?? '' },
      availableCurrencies: CURRENCY_CODES.map((code) => CURRENCIES[code]),
      profileDetails: rows[0]
        ? {
            fullName: rows[0].full_name ? String(rows[0].full_name) : '',
            phone: rows[0].phone ? String(rows[0].phone) : '',
            city: rows[0].city ? String(rows[0].city) : '',
            bio: rows[0].bio ? String(rows[0].bio) : '',
            avatarUrl: rows[0].avatar_url ? String(rows[0].avatar_url) : ''
          }
        : null,
      wallet,
      loginRisk
    })
  })
)

const updateSchema = z.object({
  fullName: z.string().trim().min(1, 'Tell us your name').max(80, 'That name is too long').optional(),
  phone: z
    .string()
    .trim()
    .max(20, 'That phone number is too long')
    .regex(/^[+\d][\d\s()-]*$/, 'That does not look like a phone number')
    .optional(),
  city: z.string().trim().max(80, 'That city name is too long').optional(),
  bio: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
  avatarUrl: z.union([z.string().max(400), z.null()]).optional(),
  limits: z
    .object({
      perTransaction: z.number().nonnegative().max(50_000_00).nullable(),
      daily: z.number().nonnegative().max(100_000_00).nullable()
    })
    .optional(),
  currency: z.string().optional()
})

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body)
    const userId = req.user!.userId

    if (body.fullName !== undefined) {
      const fullName = body.fullName
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: fullName }
      })
      if (metadataError) {
        throw new AppError(500, 'Could not save your profile')
      }
      await pool.query('update profiles set full_name = $2 where id = $1', [userId, fullName])
    }

    const fields: string[] = []
    const values: unknown[] = [userId]
    if (body.phone !== undefined) {
      values.push(clean(body.phone))
      fields.push(`phone = $${values.length}`)
    }
    if (body.city !== undefined) {
      values.push(clean(body.city))
      fields.push(`city = $${values.length}`)
    }
    if (body.bio !== undefined) {
      values.push(clean(body.bio))
      fields.push(`bio = $${values.length}`)
    }
    if (body.avatarUrl !== undefined) {
      const url = body.avatarUrl?.trim() ?? ''
      const allowed = url === '' || url.startsWith(`${config.supabaseUrl}/storage/v1/object/public/avatars/`)
      if (!allowed) {
        throw new AppError(400, 'The profile picture must be one you uploaded here')
      }
      values.push(url === '' ? null : url)
      fields.push(`avatar_url = $${values.length}`)
    }
    if (fields.length > 0) {
      await pool.query(`update profiles set ${fields.join(', ')} where id = $1`, values)
    }

    if (body.limits !== undefined) {
      await setLimits(userId, {
        perTransactionLimit: normalizeLimitCents(body.limits.perTransaction),
        dailyLimit: normalizeLimitCents(body.limits.daily)
      })
    }

    if (body.currency !== undefined) {
      const currentWallet = await getWallet(userId)
      const current = currentWallet?.currency ?? 'inr'
      const next = assertSupportedCurrency(body.currency)
      if (next !== current) {
        await setWalletCurrency(userId, next)
      }
    }

    const wallet = await getWallet(userId)
    res.json({ wallet })
  })
)

export default router
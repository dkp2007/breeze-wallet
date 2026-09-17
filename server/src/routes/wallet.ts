import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { getWallet, listTransactions } from '../services/wallet.js'

const router = Router()

router.get(
  '/wallet',
  requireAuth,
  asyncHandler(async (req, res) => {
    const wallet = await getWallet(req.user!.userId)
    const recent = await listTransactions(req.user!.userId, { limit: 10 })
    res.json({ wallet, recent: recent.rows })
  })
)

router.get(
  '/transactions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined
    const result = await listTransactions(req.user!.userId, { type, status, limit, offset })
    res.json(result)
  })
)

export default router
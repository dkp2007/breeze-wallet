import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { listAlerts, markAlertRead } from '../services/wallet.js'

const router = Router()

router.get(
  '/alerts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listAlerts(req.user!.userId)
    res.json(result)
  })
)

router.patch(
  '/alerts/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await markAlertRead(req.user!.userId, req.params.id)
    res.json({ ok: true })
  })
)

export default router
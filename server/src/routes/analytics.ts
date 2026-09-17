import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { breakdown, fraudHits, overview, trends } from '../services/analytics.js'

const router = Router()

router.get(
  '/analytics/overview',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await overview(req.user!.userId))
  })
)

router.get(
  '/analytics/trends',
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30
    res.json({ days, points: await trends(req.user!.userId, days) })
  })
)

router.get(
  '/analytics/breakdown',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ points: await breakdown(req.user!.userId) })
  })
)

router.get(
  '/analytics/fraud',
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30
    res.json({ days, rules: await fraudHits(req.user!.userId, days) })
  })
)

export default router
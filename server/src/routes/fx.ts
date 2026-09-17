import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { getRates } from '../lib/currencies.js'

const router = Router()

router.get(
  '/fx',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getRates())
  })
)

export default router

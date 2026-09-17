import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { idempotencyGuard } from '../lib/idempotency.js'
import { amountToCents } from '../lib/money.js'
import { createTopUpSession } from '../services/payments.js'
import { getWalletCurrency } from '../services/wallet.js'

const router = Router()

router.post(
  '/deposits',
  requireAuth,
  idempotencyGuard('deposits'),
  asyncHandler(async (req, res) => {
    const amountCents = amountToCents(req.body?.amount)
    const currency = await getWalletCurrency(req.user!.userId)
    const url = await createTopUpSession(req.user!.userId, amountCents, currency)
    res.json({ url })
  })
)

export default router
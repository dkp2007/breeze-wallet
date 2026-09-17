import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { idempotencyGuard } from '../lib/idempotency.js'
import { amountToCents } from '../lib/money.js'
import { createTransfer } from '../services/wallet.js'
import { z } from 'zod'

const router = Router()

const transferSchema = z.object({
  recipientEmail: z.string().email('Enter a valid email address').transform((email) => email.trim().toLowerCase()),
  amount: z.union([z.string(), z.number()])
})

router.post(
  '/transfers',
  requireAuth,
  idempotencyGuard('transfers'),
  asyncHandler(async (req, res) => {
    const body = transferSchema.parse(req.body)
    const amountCents = amountToCents(body.amount)
    const result = await createTransfer(req.user!.userId, {
      recipientEmail: body.recipientEmail,
      amountCents
    })
    res.json(result)
  })
)

export default router
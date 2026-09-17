import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import Stripe from 'stripe'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { idempotencyGuard } from '../lib/idempotency.js'
import { AppError } from '../lib/errors.js'
import { amountToCents } from '../lib/money.js'
import { debitForWithdrawal, listTransactions, refundWithdrawal } from '../services/wallet.js'
import { createPayout, createTransferToAccount, getAccountPayoutCurrency } from '../services/payments.js'
import { pool } from '../db.js'

const router = Router()

router.post(
  '/withdrawals',
  requireAuth,
  idempotencyGuard('withdrawals'),
  asyncHandler(async (req, res) => {
    const amountCents = amountToCents(req.body?.amount)
    const userId = req.user!.userId

    const { rows } = await pool.query('select stripe_account_id, payouts_enabled from profiles where id = $1', [userId])
    const accountId = rows[0]?.stripe_account_id as string | null
    if (!accountId || !rows[0].payouts_enabled) {
      throw new AppError(400, 'Link your bank account first, then try your withdrawal again', 'bank_not_linked')
    }

    const reference = `withdrawal_${randomUUID()}`
    const withdrawal = await debitForWithdrawal(userId, amountCents, reference)
    try {
      const payoutCurrency = await getAccountPayoutCurrency(accountId)
      await createTransferToAccount(userId, accountId, amountCents, withdrawal.id, payoutCurrency)
      await createPayout(userId, amountCents, withdrawal.id, accountId, payoutCurrency)
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        console.error(`Withdrawal payment error (${error.statusCode}): ${error.message}`)
      }
      await refundWithdrawal(withdrawal.id)
      throw new AppError(502, 'Withdrawal could not be processed and your funds were returned')
    }
    res.json({ withdrawal })
  })
)

router.get(
  '/withdrawals',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listTransactions(req.user!.userId, { type: 'withdrawal', limit: 20 })
    res.json({ withdrawals: result.rows })
  })
)

export default router
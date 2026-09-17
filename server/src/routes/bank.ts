import { Router } from 'express'
import { z } from 'zod'
import Stripe from 'stripe'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { AppError } from '../lib/errors.js'
import { pool } from '../db.js'
import { createConnectedAccount, createOnboardingLink, getAccountStatus } from '../services/payments.js'

const router = Router()

function paymentProviderError(error: unknown): never {
  if (error instanceof Stripe.errors.StripeError) {
    console.error(`Stripe error (${error.statusCode} ${error.code ?? ''}): ${error.message}`)
  } else {
    console.error('Unexpected payment provider error:', error)
  }
  if (error instanceof Stripe.errors.StripeError && error.statusCode === 401) {
    throw new AppError(502, 'Our payment provider rejected its access key. The site owner needs to check the Stripe settings.')
  }
  if (error instanceof Stripe.errors.StripeError) {
    throw new AppError(502, 'Could not reach our payment provider. Please try again in a moment.')
  }
  throw new AppError(502, 'Could not reach our payment provider. Please try again in a moment.')
}

router.get(
  '/bank',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId
    const { rows } = await pool.query('select stripe_account_id, payouts_enabled from profiles where id = $1', [userId])
    const accountId = rows[0]?.stripe_account_id ?? null
    const payoutsEnabled = rows[0]?.payouts_enabled ?? false

    if (!accountId) {
      res.json({ linked: false, payoutsEnabled: false })
      return
    }

    let live = payoutsEnabled
    try {
      const status = await getAccountStatus(accountId)
      live = status.payoutsEnabled
      if (live !== payoutsEnabled) {
        await pool.query('update profiles set payouts_enabled = $2 where id = $1', [userId, live])
      }
    } catch {
    }

    res.json({ linked: true, payoutsEnabled: live })
  })
)

router.post(
  '/bank/link',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId
    const email = req.user!.email

    const { rows } = await pool.query('select stripe_account_id, payouts_enabled from profiles where id = $1', [userId])
    let accountId: string | null = rows[0]?.stripe_account_id ?? null
    const payoutsEnabled = rows[0]?.payouts_enabled ?? false

    if (!accountId) {
      let account
      try {
        account = await createConnectedAccount(email)
      } catch (error) {
        paymentProviderError(error)
      }
      accountId = account.id
      await pool.query('update profiles set stripe_account_id = $2 where id = $1', [userId, accountId])
    } else if (payoutsEnabled) {
      res.json({ url: null, alreadyLinked: true })
      return
    }

    let url: string
    try {
      url = await createOnboardingLink(accountId, email)
    } catch (error) {
      paymentProviderError(error)
    }
    res.json({ url, alreadyLinked: false })
  })
)

const unlinkSchema = z.object({
  confirm: z.literal(true)
})

router.post(
  '/bank/unlink',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = unlinkSchema.parse(req.body)
    if (!body.confirm) {
      throw new AppError(400, 'Confirmation is required')
    }
    const userId = req.user!.userId
    const { rows } = await pool.query('select stripe_account_id from profiles where id = $1', [userId])
    const accountId = rows[0]?.stripe_account_id
    if (!accountId) {
      throw new AppError(400, 'No bank account is linked')
    }

    try {
      await getAccountStatus(accountId)
    } catch {
    }
    await pool.query('update profiles set stripe_account_id = null, payouts_enabled = false where id = $1', [userId])
    res.json({ ok: true })
  })
)

export default router

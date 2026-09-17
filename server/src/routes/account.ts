import { Router } from 'express'
import { z } from 'zod'
import Stripe from 'stripe'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { AppError } from '../lib/errors.js'
import { supabaseAdmin, pool } from '../db.js'
import { stripe } from '../services/payments.js'

const router = Router()

const closeSchema = z.object({
  password: z.string().min(1, 'Enter your password to close your account')
})

router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = closeSchema.parse(req.body)
    const userId = req.user!.userId
    const email = req.user!.email

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: body.password
    })
    if (signInError || !signIn.session) {
      throw new AppError(403, 'That password is not correct')
    }
    await supabaseAdmin.auth.admin
      .signOut(signIn.session.access_token, 'local')
      .catch(() => {})

    const wallet = await pool.query('select balance from wallets where user_id = $1', [userId])
    const balance = Number(wallet.rows[0]?.balance ?? 0)
    if (balance > 0) {
      throw new AppError(400, 'Your wallet still has money in it. Withdraw or send it first, then close your account.')
    }

    const { rows } = await pool.query('select stripe_account_id from profiles where id = $1', [userId])
    const accountId = rows[0]?.stripe_account_id
    if (accountId) {
      try {
        await stripe.accounts.del(accountId)
      } catch (error) {
        if (error instanceof Stripe.errors.StripeError && error.statusCode === 401) {
          throw new AppError(502, 'Our payment provider rejected its access key. The site owner needs to check the Stripe settings.')
        }
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      throw new AppError(500, 'Could not close the account. Nothing was deleted — please try again.')
    }

    res.json({ ok: true })
  })
)

export default router

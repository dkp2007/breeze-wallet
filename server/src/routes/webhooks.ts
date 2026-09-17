import { Router } from 'express'
import express from 'express'
import Stripe from 'stripe'
import { pool } from '../db.js'
import { config } from '../config.js'
import { asyncHandler } from '../lib/http.js'
import { AppError } from '../lib/errors.js'
import { creditWallet, markWithdrawalPaid, refundWithdrawal } from '../services/wallet.js'
import { stripe } from '../services/payments.js'

const router = Router()

router.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature']
    if (!signature || !config.stripeWebhookSecret) {
      throw new AppError(500, 'Stripe webhook secret not configured')
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret)
    } catch {
      throw new AppError(400, 'Invalid webhook signature')
    }

    const claimed = await pool.query('insert into webhook_events (event_id) values ($1) on conflict do nothing returning 1', [event.id])
    if (claimed.rowCount === 0) {
      res.json({ received: true, duplicate: true })
      return
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.payment_status !== 'paid') {
          break
        }
        const userId = session.metadata?.userId
        if (userId && session.amount_total) {
          const currency = session.metadata?.currency ?? config.currency
          await creditWallet(userId, session.amount_total, 'deposit', 'card', `stripe_${session.id}`, {
            provider: 'stripe',
            sessionId: session.id,
            paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : undefined
          }, currency)
        }
        break
      }
      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout
        const transactionId = payout.metadata?.transactionId
        if (transactionId) {
          await markWithdrawalPaid(transactionId)
        }
        break
      }
      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout
        const transactionId = payout.metadata?.transactionId
        if (transactionId) {
          await refundWithdrawal(transactionId)
        }
        break
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const { rows } = await pool.query('select id from profiles where stripe_account_id = $1', [account.id])
        if (rows.length > 0) {
          await pool.query('update profiles set payouts_enabled = $2 where stripe_account_id = $1', [account.id, account.payouts_enabled])
          if (account.payouts_enabled) {
            await pool.query(
              'insert into alerts (user_id, type, severity, message) values ($1, $2, $3, $4)',
              [rows[0].id, 'bank_linked', 'low', 'Your bank account is linked — withdrawals are ready to use']
            )
          }
        }
        break
      }
      default:
        break
    }

    res.json({ received: true })
  })
)

export default router
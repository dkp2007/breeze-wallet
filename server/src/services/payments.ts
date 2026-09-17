import Stripe from 'stripe'
import { config } from '../config.js'

export const stripe = new Stripe(config.stripeSecretKey)

export async function createConnectedAccount(email: string): Promise<Stripe.Response<Stripe.Account>> {
  return stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true }
    },
    business_type: 'individual'
  })
}

export async function createOnboardingLink(accountId: string, existingEmail: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${config.clientUrl}/withdraw?onboarding=retry`,
    return_url: `${config.clientUrl}/withdraw?onboarding=done`,
    type: 'account_onboarding'
  })
  return link.url
}

export async function getAccountStatus(accountId: string): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean; chargesEnabled: boolean }> {
  const account = await stripe.accounts.retrieve(accountId)
  return {
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled
  }
}

export async function createTransferToAccount(userId: string, accountId: string, amountCents: number, transactionId: string, currency: string): Promise<Stripe.Response<Stripe.Transfer>> {
  return stripe.transfers.create({
    amount: amountCents,
    currency,
    destination: accountId,
    metadata: { userId, transactionId }
  })
}

export async function getAccountPayoutCurrency(accountId: string): Promise<string> {
  const account = await stripe.accounts.retrieve(accountId, {
    expand: ['external_accounts.data']
  })
  const banks = account.external_accounts?.data ?? []
  const bank = banks.find((item) => item.default_for_currency) ?? banks[0]
  return bank && 'currency' in bank && typeof bank.currency === 'string' ? bank.currency : config.currency
}

export async function createTopUpSession(userId: string, amountCents: number, currency: string): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: 'Wallet top-up' },
          unit_amount: amountCents
        },
        quantity: 1
      }
    ],
    metadata: { userId, currency },
    success_url: `${config.clientUrl}/topup?payment=success`,
    cancel_url: `${config.clientUrl}/topup?payment=cancelled`
  })
  return session.url ?? ''
}

export async function createPayout(
  userId: string,
  amountCents: number,
  transactionId: string,
  accountId?: string,
  currency?: string
): Promise<Stripe.Payout> {
  return stripe.payouts.create(
    {
      amount: amountCents,
      currency: currency ?? config.currency,
      metadata: { userId, transactionId }
    },
    accountId ? { stripeAccount: accountId } : undefined
  )
}
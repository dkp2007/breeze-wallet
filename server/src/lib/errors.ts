import type { RuleHit } from '../services/fraud.js'
import { currencyMoney } from './http.js'

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
  }
}

export class MfaRequiredError extends AppError {
  constructor() {
    super(
      403,
      'Your wallet needs a verification code before it can move money. Sign in again and enter the code from your phone app.',
      'mfa_required'
    )
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super(400, 'Your wallet balance is too low for this transaction')
  }
}

export class LimitExceededError extends AppError {
  violation: { kind: 'per_transaction' | 'daily'; limitCents: number; currency?: string }

  constructor(violation: { kind: 'per_transaction' | 'daily'; limitCents: number; currency?: string }) {
    const limit = currencyMoney(violation.limitCents, violation.currency ?? 'inr')
    super(
      400,
      violation.kind === 'daily'
        ? `This would go past your daily limit of ${limit}. You can raise it in Settings.`
        : `This is above your per-transaction limit of ${limit}. You can raise it in Settings.`,
      'limit_exceeded'
    )
    this.violation = violation
  }
}

export class FraudBlockedError extends AppError {
  constructor(public hits: RuleHit[]) {
    const reasons = hits.map((hit) => hit.message).join('; ')
    super(403, `We stopped this transaction for your safety. ${reasons}`)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message)
  }
}

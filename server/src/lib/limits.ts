export interface LimitCheck {
  perTransactionLimit: number | null
  dailyLimit: number | null
  dailyOutflowCents: number
}

export interface LimitViolation {
  kind: 'per_transaction' | 'daily'
  limitCents: number
  attemptedCents: number
}

export function checkLimits(amountCents: number, limits: LimitCheck): LimitViolation | null {
  if (limits.perTransactionLimit !== null && amountCents > limits.perTransactionLimit) {
    return { kind: 'per_transaction', limitCents: limits.perTransactionLimit, attemptedCents: amountCents }
  }
  if (limits.dailyLimit !== null && limits.dailyOutflowCents + amountCents > limits.dailyLimit) {
    return { kind: 'daily', limitCents: limits.dailyLimit, attemptedCents: limits.dailyOutflowCents + amountCents }
  }
  return null
}

export function normalizeLimitCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const cents = Math.round(value)
  return cents > 0 ? cents : null
}

import { describe, expect, it } from 'vitest'
import { checkLimits, normalizeLimitCents } from '../src/lib/limits.js'
import { LimitExceededError } from '../src/lib/errors.js'

describe('checkLimits', () => {
  it('allows anything when no limits are set', () => {
    expect(checkLimits(999_999, { perTransactionLimit: null, dailyLimit: null, dailyOutflowCents: 999_999 })).toBeNull()
  })

  it('blocks above the per-transaction limit', () => {
    const violation = checkLimits(5_100, { perTransactionLimit: 5_000, dailyLimit: null, dailyOutflowCents: 0 })
    expect(violation).toEqual({ kind: 'per_transaction', limitCents: 5_000, attemptedCents: 5_100 })
  })

  it('allows exactly the per-transaction limit', () => {
    expect(checkLimits(5_000, { perTransactionLimit: 5_000, dailyLimit: null, dailyOutflowCents: 0 })).toBeNull()
  })

  it('blocks when the daily limit would be crossed', () => {
    const violation = checkLimits(2_000, { perTransactionLimit: null, dailyLimit: 10_000, dailyOutflowCents: 9_000 })
    expect(violation).toEqual({ kind: 'daily', limitCents: 10_000, attemptedCents: 11_000 })
  })

  it('allows spending up to exactly the daily limit', () => {
    expect(checkLimits(1_000, { perTransactionLimit: null, dailyLimit: 10_000, dailyOutflowCents: 9_000 })).toBeNull()
  })

  it('applies the per-transaction limit before the daily limit', () => {
    const violation = checkLimits(6_000, { perTransactionLimit: 5_000, dailyLimit: 10_000, dailyOutflowCents: 0 })
    expect(violation?.kind).toBe('per_transaction')
  })

  it('ignores a daily limit of zero treated as unset', () => {
    expect(checkLimits(1_000, { perTransactionLimit: null, dailyLimit: null, dailyOutflowCents: 0 })).toBeNull()
  })
})

describe('normalizeLimitCents', () => {
  it('keeps positive values', () => {
    expect(normalizeLimitCents(5_000)).toBe(5_000)
    expect(normalizeLimitCents(25.6)).toBe(26)
  })

  it('turns zero and negative into no limit', () => {
    expect(normalizeLimitCents(0)).toBeNull()
    expect(normalizeLimitCents(-5)).toBeNull()
    expect(normalizeLimitCents(Number.NaN)).toBeNull()
  })
})

describe('LimitExceededError', () => {
  it('has a friendly daily message with the code attached', () => {
    const error = new LimitExceededError({ kind: 'daily', limitCents: 10_000 })
    expect(error.status).toBe(400)
    expect(error.code).toBe('limit_exceeded')
    expect(error.message).toContain('daily limit of')
  })

  it('mentions the per-transaction limit', () => {
    const error = new LimitExceededError({ kind: 'per_transaction', limitCents: 5_000 })
    expect(error.message).toContain('per-transaction limit of')
  })
})

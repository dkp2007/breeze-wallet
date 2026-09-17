import { describe, expect, it, vi, beforeAll } from 'vitest'
import { convertCents, isSupportedCurrency, assertSupportedCurrency, FALLBACK_RATES } from '../src/lib/currencies.js'
import { AppError } from '../src/lib/errors.js'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('offline')
  }))
})

describe('currency checks', () => {
  it('accepts the supported currencies', () => {
    expect(isSupportedCurrency('inr')).toBe(true)
    expect(isSupportedCurrency('USD')).toBe(true)
    expect(isSupportedCurrency('eur')).toBe(true)
    expect(isSupportedCurrency('gbp')).toBe(true)
  })

  it('rejects unknown currencies', () => {
    expect(isSupportedCurrency('xyz')).toBe(false)
    expect(isSupportedCurrency(42)).toBe(false)
    expect(isSupportedCurrency(null)).toBe(false)
  })

  it('throws a friendly error for unsupported codes', () => {
    expect(() => assertSupportedCurrency('xyz')).toThrowError(AppError)
  })
})

describe('convertCents', () => {
  it('returns the same amount for the same currency', async () => {
    await expect(convertCents(12345, 'inr', 'inr')).resolves.toBe(12345)
  })

  it('converts using fallback rates when the rate service is unreachable', async () => {
    const result = await convertCents(100, 'usd', 'inr')
    expect(result).toBe(Math.round((100 / FALLBACK_RATES.usd) * FALLBACK_RATES.inr))
  })

  it('round-trips a conversion without losing the whole amount', async () => {
    const inr = await convertCents(10000, 'usd', 'inr')
    const back = await convertCents(inr, 'inr', 'usd')
    expect(Math.abs(back - 10000)).toBeLessThanOrEqual(2)
  })

  it('converts between two non-base currencies', async () => {
    const result = await convertCents(1000, 'eur', 'gbp')
    expect(result).toBe(Math.round((1000 / FALLBACK_RATES.eur) * FALLBACK_RATES.gbp))
  })
})

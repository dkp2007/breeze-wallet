import { AppError } from './errors.js'
import { pool } from '../db.js'

export interface CurrencyInfo {
  code: string
  symbol: string
  locale: string
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  inr: { code: 'inr', symbol: '₹', locale: 'en-IN' },
  usd: { code: 'usd', symbol: '$', locale: 'en-US' },
  eur: { code: 'eur', symbol: '€', locale: 'de-DE' },
  gbp: { code: 'gbp', symbol: '£', locale: 'en-GB' }
}

export const DEFAULT_CURRENCY = 'inr'
export const CURRENCY_CODES = Object.keys(CURRENCIES)

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && code.toLowerCase() in CURRENCIES
}

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES[code.toLowerCase()] ?? CURRENCIES[DEFAULT_CURRENCY]
}

export function assertSupportedCurrency(code: unknown): string {
  if (!isSupportedCurrency(code)) {
    throw new AppError(400, 'That currency is not supported here')
  }
  return code.toLowerCase()
}

export interface RatesInfo {
  base: 'usd'
  rates: Record<string, number>
  source: 'live' | 'fallback'
  fetchedAt: string
}

export const FALLBACK_RATES: Record<string, number> = {
  usd: 1,
  inr: 83.2,
  eur: 0.92,
  gbp: 0.79
}

const RATES_TTL_MS = 60 * 60 * 1000
let cached: RatesInfo | null = null
let inFlight: Promise<RatesInfo> | null = null

async function fetchLiveRates(): Promise<RatesInfo | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> }
    if (json.result !== 'success' || !json.rates) return null
    const rates: Record<string, number> = {}
    for (const code of CURRENCY_CODES) {
      const value = json.rates[code.toUpperCase()]
      if (typeof value !== 'number' || !(value > 0)) return null
      rates[code] = value
    }
    return { base: 'usd', rates, source: 'live', fetchedAt: new Date().toISOString() }
  } catch {
    return null
  }
}

export async function getRates(): Promise<RatesInfo> {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < RATES_TTL_MS) {
    return cached
  }
  if (!inFlight) {
    inFlight = fetchLiveRates()
      .then((live) => live ?? { base: 'usd' as const, rates: FALLBACK_RATES, source: 'fallback' as const, fetchedAt: new Date().toISOString() })
      .then((info) => {
        cached = info
        return info
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export async function convertCents(amountCents: number, from: string, to: string): Promise<number> {
  const source = from.toLowerCase()
  const target = to.toLowerCase()
  if (source === target) return amountCents
  if (!isSupportedCurrency(source) || !isSupportedCurrency(target)) {
    throw new AppError(400, 'That currency is not supported here')
  }
  const { rates } = await getRates()
  return Math.round((amountCents / rates[source]) * rates[target])
}

export async function getWalletCurrency(userId: string): Promise<string> {
  const { rows } = await pool.query('select currency from wallets where user_id = $1', [userId])
  return rows[0]?.currency ?? DEFAULT_CURRENCY
}

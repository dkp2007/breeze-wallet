import type { NextFunction, Request, RequestHandler, Response } from 'express'

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

const SYMBOLS: Record<string, string> = { inr: '₹', usd: '$', eur: '€', gbp: '£' }

export function money(cents: number): string {
  return currencyMoney(cents, 'inr')
}

export function currencyMoney(cents: number, currency: string): string {
  const symbol = SYMBOLS[currency.toLowerCase()] ?? '₹'
  return `${symbol}${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}
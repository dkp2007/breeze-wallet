import type { TransactionType } from './types'

const FORMATTERS: Record<string, Intl.NumberFormat> = {
  inr: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
  usd: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  eur: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
  gbp: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
}

const SYMBOLS: Record<string, string> = { inr: '₹', usd: '$', eur: '€', gbp: '£' }

export function normalizeCurrency(currency: string | null | undefined): string {
  const code = (currency ?? '').toLowerCase()
  return code in FORMATTERS ? code : 'inr'
}

export function currencySymbol(currency: string | null | undefined): string {
  return SYMBOLS[normalizeCurrency(currency)]
}

export function fmtMoney(cents: number, currency: string | null | undefined = 'inr'): string {
  const code = normalizeCurrency(currency)
  return FORMATTERS[code].format(cents / 100)
}

export function fmtCompactMoney(cents: number, currency: string | null | undefined = 'inr'): string {
  const code = normalizeCurrency(currency)
  const amount = cents / 100
  if (Math.abs(amount) >= 1000) {
    return `${currencySymbol(code)} ${(amount / 1000).toFixed(1)}k`
  }
  return `${currencySymbol(code)}${Math.round(amount)}`
}

export function fmtPlainNumber(cents: number): string {
  return Math.round(cents / 100).toLocaleString('en-IN')
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return fmtDate(iso)
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

export const typeLabel: Record<TransactionType, string> = {
  deposit: 'Top-up',
  withdrawal: 'Withdrawal',
  transfer_in: 'Money received',
  transfer_out: 'Money sent',
  refund: 'Refund'
}

export function moneyDirection(type: TransactionType): 'in' | 'out' {
  return type === 'deposit' || type === 'transfer_in' || type === 'refund' ? 'in' : 'out'
}

export function parseAmount(input: string): number {
  const raw = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('Enter an amount with up to two decimal places')
  }
  const cents = Math.round(parseFloat(raw) * 100)
  if (cents <= 0) {
    throw new Error('Amount must be greater than zero')
  }
  return cents
}

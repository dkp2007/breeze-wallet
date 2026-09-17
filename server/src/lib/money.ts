import { AppError } from './errors.js'

export function amountToCents(input: unknown): number {
  if (typeof input !== 'string' && typeof input !== 'number') {
    throw new AppError(400, 'Amount is required')
  }
  const raw = typeof input === 'number' ? input.toString() : input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new AppError(400, 'Please enter an amount with up to two decimal places')
  }
  const cents = Math.round(parseFloat(raw) * 100)
  if (cents <= 0) {
    throw new AppError(400, 'Amount must be greater than zero')
  }
  return cents
}
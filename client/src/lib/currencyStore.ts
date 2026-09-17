const STORAGE_KEY = 'breeze-currency'

let current: string = 'inr'
try {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored) current = stored
} catch {}

const listeners = new Set<(currency: string) => void>()

export function getCurrency(): string {
  return current
}

export function setStoredCurrency(currency: string): void {
  current = currency
  try {
    window.localStorage.setItem(STORAGE_KEY, currency)
  } catch {}
  for (const listener of listeners) {
    listener(currency)
  }
}

export function subscribeCurrency(listener: (currency: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

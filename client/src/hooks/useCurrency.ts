import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getCurrency, setStoredCurrency, subscribeCurrency } from '../lib/currencyStore'

export function useCurrency(): string {
  const { profile } = useAuth()
  const [currency, setCurrency] = useState(getCurrency())

  useEffect(() => {
    return subscribeCurrency(setCurrency)
  }, [])

  useEffect(() => {
    const walletCurrency = profile?.wallet?.currency
    if (walletCurrency && walletCurrency !== getCurrency()) {
      setStoredCurrency(walletCurrency)
    }
  }, [profile?.wallet?.currency])

  return currency
}

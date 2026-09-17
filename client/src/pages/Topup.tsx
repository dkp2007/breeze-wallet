import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { api, newRequestId } from '../lib/api'
import { parseAmount, currencySymbol } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import { Card, ErrorNote, Notice, SuccessNote } from '../components/ui'
import { Leaflet } from '../components/Leaflet'
import { useSound } from '../components/Sound'

const presets = [25, 50, 100, 250]

export default function Topup() {
  const currency = useCurrency()
  const [searchParams, setSearchParams] = useSearchParams()
  const payment = searchParams.get('payment')
  const [amount, setAmount] = useState('50')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leaflet, setLeaflet] = useState(false)
  const [requestKey, setRequestKey] = useState(newRequestId)
  const { play } = useSound()

  useEffect(() => {
    if (payment === 'success') {
      void play('receive-success')
      setLeaflet(true)
    }
  }, [payment, play])
  const clearPayment = () => {
    searchParams.delete('payment')
    setSearchParams(searchParams, { replace: true })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    let cents = 0
    try {
      cents = parseAmount(amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount')
      return
    }
    setBusy(true)
    try {
      const { url } = await api.createDeposit((cents / 100).toFixed(2), requestKey)
      if (url) {
        window.location.assign(url)
        return
      }
      setRequestKey(newRequestId())
      setError('The payment page did not open. The server may not be ready yet — try again in a moment.')
    } catch (err) {
      setRequestKey(newRequestId())
      setError(err instanceof Error ? err.message : 'Could not start the payment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Top up</h1>
        <p className="mt-1 text-sm text-slate-500">Add money to your wallet with a card. It lands instantly.</p>
      </div>

      {payment === 'success' && (
        <>
          <SuccessNote>
            <p className="font-semibold">Payment successful!</p>
            <p className="mt-0.5 font-normal">Your balance has been credited. Thanks for adding money.</p>
            <p className="mt-2 text-xs text-slate-500">You can now send money to the people you know.</p>
          </SuccessNote>

          <Leaflet visible={leaflet} onDismiss={() => setLeaflet(false)} />
        </>
      )}
      {payment === 'cancelled' && (
        <Notice>
          The payment was cancelled. No money moved — try again whenever you are ready.
        </Notice>
      )}
      {payment && (
        <div className="flex justify-end">
          <button type="button" className="text-sm font-medium text-slate-400 hover:text-slate-600" onClick={clearPayment}>
            Dismiss
          </button>
        </div>
      )}

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="amount" className="label">
              Amount
            </label>
            <div className="relative">                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">
                  {currencySymbol(currency)}
                </span>
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                className="input pl-9 text-lg font-semibold tabular-nums"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={`rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition ${
                  Number(amount) === preset
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {currencySymbol(currency)}{preset}
              </button>
            ))}
          </div>

          <ErrorNote message={error} />
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {busy ? 'Opening payment page…' : 'Pay with card'}
          </button>
          <p className="text-center text-xs text-slate-400">
            You will be taken to a secure payment page to finish with your card. Breeze runs in test mode, so no real money moves.
          </p>
        </form>
      </Card>
    </div>
  )
}

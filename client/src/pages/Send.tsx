import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Loader2, Send as SendIcon } from 'lucide-react'
import { api, ApiError, newRequestId } from '../lib/api'
import { fmtMoney, parseAmount, currencySymbol } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import type { TransferResult } from '../lib/types'
import { Card, ErrorNote, RiskCard, StatusBadge } from '../components/ui'
import { useSound } from '../components/Sound'
import { Leaflet } from '../components/Leaflet'

export default function Send() {
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TransferResult | null>(null)
  const [leaflet, setLeaflet] = useState(false)
  const [requestKey, setRequestKey] = useState(newRequestId)
  const { play } = useSound()
  const currency = useCurrency()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    let cents = 0
    try {
      cents = parseAmount(amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount')
      return
    }
    setBusy(true)
    try {
      const transfer = await api.createTransfer(email.trim().toLowerCase(), (cents / 100).toFixed(2), requestKey)
      setResult(transfer)
      setEmail('')
      setAmount('')
      setRequestKey(newRequestId())
      void play('send-success')
      setLeaflet(true)
      setTimeout(() => void play('money-moves'), 180)

      void play('receive-success')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const flagged = result.assessment.decision === 'flag'
    return (
      <div className="relative mx-auto max-w-xl space-y-6">
        <Leaflet visible={leaflet} onDismiss={() => setLeaflet(false)} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Send money</h1>
          <p className="mt-1 text-sm text-slate-500">Here is what happened with your transfer.</p>
        </div>
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">You sent to {result.recipient.email}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                {fmtMoney(result.transaction.amount, result.transaction.currency)}
              </p>
            </div>
            <StatusBadge status={result.transaction.status} />
          </div>
          {result.creditCents !== undefined && result.recipientCurrency && result.recipientCurrency !== result.transaction.currency && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
              {result.recipient.email} uses a different currency, so they received {fmtMoney(result.creditCents, result.recipientCurrency)}.
            </p>
          )}
          <p className="text-sm text-slate-600">
            Reference number {result.transaction.reference}
          </p>
          <RiskCard assessment={result.assessment} />
          {flagged && (
            <p className="text-sm text-slate-500">
              The money has moved, but our system is looking at this transfer. If anything needs your attention, you will see it in your alerts.
            </p>
          )}
          <button type="button" className="btn-secondary w-full" onClick={() => setResult(null)}>
            <ArrowLeft className="h-4 w-4" />
            Send another transfer
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Send money</h1>            <p className="mt-1 text-sm text-slate-500">
          Send money to any Breeze wallet in seconds. Every transfer is checked for unusual activity before it
          moves.
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="recipient" className="label">
              Recipient email
            </label>
            <input
              id="recipient"
              type="email"
              autoComplete="off"
              required
              className="input"
              placeholder="friend@wallet.local"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="amount" className="label">
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">
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
          <ErrorNote message={error} />
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
            Send money
          </button>
          <p className="text-center text-xs text-slate-400">
            If something looks unusual about a transfer, our system shows a note and keeps an eye on it.
          </p>
        </form>
      </Card>
    </div>
  )
}

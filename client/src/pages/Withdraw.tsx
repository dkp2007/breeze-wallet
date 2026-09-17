import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpFromLine, BadgeCheck, Landmark, Loader2 } from 'lucide-react'
import { useShell } from '../components/Layout'
import { api, newRequestId } from '../lib/api'
import { fmtMoney, parseAmount, currencySymbol } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import { Card, ErrorNote, SuccessNote } from '../components/ui'
import { Leaflet } from '../components/Leaflet'
import { useSound } from '../components/Sound'

interface BankStatus {
  linked: boolean
  payoutsEnabled: boolean
}

export default function Withdraw() {
  const { balance, refresh } = useShell()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [leaflet, setLeaflet] = useState(false)
  const [bank, setBank] = useState<BankStatus | null>(null)
  const [linking, setLinking] = useState(false)
  const [bankError, setBankError] = useState('')
  const [bankNotice, setBankNotice] = useState('')
  const [requestKey, setRequestKey] = useState(newRequestId)
  const [searchParams, setSearchParams] = useSearchParams()
  const { play } = useSound()
  const currency = useCurrency()

  const current = balance ?? 0
  const presetMax = () => setAmount(current > 0 ? (current / 100).toFixed(2) : '')

  const checkBank = useCallback(async () => {
    try {
      setBank(await api.bankStatus())
    } catch {
      setBank({ linked: false, payoutsEnabled: false })
    }
  }, [])

  useEffect(() => {
    void checkBank()
  }, [checkBank])

  const onboarding = searchParams.get('onboarding')
  useEffect(() => {
    if (!onboarding) return
    void checkBank()
    setBankNotice(
      onboarding === 'done'
        ? 'Thanks — checking with Stripe whether everything is ready.'
        : 'The setup was not finished. You can pick up where you left off.'
    )
    setSearchParams({}, { replace: true })
  }, [onboarding, checkBank, setSearchParams])

  async function handleLink() {
    setLinking(true)
    setBankError('')
    setBankNotice('')
    try {
      const { url } = await api.linkBank()
      if (url) {
        window.location.assign(url)
        return
      }
      await checkBank()
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Could not start the bank setup')
    } finally {
      setLinking(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setDone(false)
    let cents = 0
    try {
      cents = parseAmount(amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount')
      return
    }
    if (cents > current) {
      setError(`Your available balance is ${fmtMoney(current, currency)}`)
      return
    }
    setBusy(true)
    try {
      await api.createWithdrawal((cents / 100).toFixed(2), requestKey)
      setDone(true)
      setAmount('')
      setRequestKey(newRequestId())
      void play('money-moves')
      setLeaflet(true)
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setBusy(false)
    }
  }

  const balanceBox = (
    <div className="mb-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">Available balance</span>
      <span className="text-lg font-bold tabular-nums text-slate-900">{fmtMoney(current, currency)}</span>
    </div>
  )

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Withdraw</h1>
        <p className="mt-1 text-sm text-slate-500">
          Move money from your wallet to your own bank account. Funds are reserved immediately and paid out as a bank
          transfer.
        </p>
      </div>

      {done && (
        <>
          <SuccessNote>
            <p className="font-semibold">Withdrawal requested</p>
            <p className="mt-0.5 font-normal">
              The amount has been set aside from your balance. The money is on its way to your bank account and should
              arrive shortly.
            </p>
          </SuccessNote>

          <Leaflet visible={leaflet} onDismiss={() => setLeaflet(false)} />
        </>
      )}

      {bank === null ? (
        <Card className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </Card>
      ) : !bank.linked ? (
        <Card className="p-6">
          {balanceBox}
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Link your bank account</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Withdrawals are sent straight to your own bank account. It takes about two minutes: a secure Stripe
                page asks a few questions about you and where the money should go.
              </p>
            </div>
          </div>
          {bankNotice && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{bankNotice}</p>}
          <ErrorNote message={bankError} />
          <button type="button" onClick={() => void handleLink()} disabled={linking} className="btn-primary mt-4 w-full">
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
            Link your bank account
          </button>
        </Card>
      ) : !bank.payoutsEnabled ? (
        <Card className="p-6">
          {balanceBox}
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Almost there</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Stripe still needs a few details from you before money can be sent. You can continue where you left
                off — your progress is saved.
              </p>
            </div>
          </div>
          {bankNotice && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{bankNotice}</p>}
          <ErrorNote message={bankError} />
          <button type="button" onClick={() => void handleLink()} disabled={linking} className="btn-primary mt-4 w-full">
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
            Continue setup
          </button>
        </Card>
      ) : (
        <Card className="p-6">
          {balanceBox}
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <BadgeCheck className="h-4 w-4" />
            Bank account linked
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={presetMax} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Send all
                </button>
              </div>
            </div>
            <ErrorNote message={error} />
            <button type="submit" disabled={busy || current <= 0} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              Request withdrawal
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Landmark className="h-3.5 w-3.5" />
              Sent to the bank account you linked with Stripe
            </p>
          </form>
        </Card>
      )}
    </div>
  )
}

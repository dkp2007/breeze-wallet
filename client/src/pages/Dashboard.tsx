import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import { Activity, ArrowDownToLine, ArrowUpFromLine, Send, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { fmtMoney, currencySymbol } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import type { WalletPayload } from '../lib/types'
import { Card, ErrorNote, RiskCard, Spinner } from '../components/ui'
import { TransactionList } from '../components/TransactionList'
import { useShell } from '../components/Layout'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const INFLOW = '#10b981'
const OUTFLOW = '#f43f5e'
const BRAND = '#0f7d93'
const AMBER = '#f59e0b'
const VIOLET = '#8b5cf6'
const SLATE = '#94a3b8'

const typeLabel: Record<string, string> = {
  deposit: 'Top-ups',
  withdrawal: 'Withdrawals',
  transfer_in: 'Money received',
  transfer_out: 'Money sent',
  refund: 'Refunds'
}

const typeColor: Record<string, string> = {
  deposit: BRAND,
  withdrawal: AMBER,
  transfer_in: INFLOW,
  transfer_out: OUTFLOW,
  refund: VIOLET
}

function greet(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const { unreadAlerts, openAlerts } = useShell()
  const currency = useCurrency()
  const [payload, setPayload] = useState<WalletPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [riskDismissed, setRiskDismissed] = useState(false)

  useEffect(() => {
    let active = true
    api
      .wallet()
      .then((result) => {
        if (active) setPayload(result)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your wallet')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const fullName = String(user?.user_metadata?.full_name ?? 'there')
  const firstName = fullName.split(/\s+/)[0]
  const balance = payload?.wallet?.balance ?? null
  const recent = payload?.recent ?? []
  const settled = recent.filter((tx) => tx.status === 'completed' || tx.status === 'flagged')
  const moneyIn = settled.filter((tx) => ['deposit', 'transfer_in', 'refund'].includes(tx.type)).reduce((sum, tx) => sum + tx.amount, 0)
  const moneyOut = settled.filter((tx) => ['withdrawal', 'transfer_out'].includes(tx.type)).reduce((sum, tx) => sum + tx.amount, 0)
  const loginRisk = profile?.loginRisk ?? null
  const showRisk = loginRisk && !riskDismissed

  const trendData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>()
    for (const tx of settled) {
      const day = new Date(tx.created_at).toISOString().slice(0, 10)
      const entry = map.get(day) ?? { inflow: 0, outflow: 0 }
      if (['deposit', 'transfer_in', 'refund'].includes(tx.type)) entry.inflow += tx.amount / 100
      if (['withdrawal', 'transfer_out'].includes(tx.type)) entry.outflow += tx.amount / 100
      map.set(day, entry)
    }
    const days = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))
    return {
      labels: days.map((day) =>
        new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${day}T00:00:00`))
      ),
      inflow: days.map((day) => Math.round(map.get(day)!.inflow)),
      outflow: days.map((day) => Math.round(map.get(day)!.outflow))
    }
  }, [settled])

  const doughnutData = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of settled) {
      map.set(tx.type, (map.get(tx.type) ?? 0) + tx.amount / 100)
    }
    const types = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    return {
      labels: types.map(([type]) => typeLabel[type] ?? type),
      values: types.map(([, value]) => Math.round(value)),
      colors: types.map(([type]) => typeColor[type] ?? SLATE)
    }
  }, [settled])

  const hasTrend = trendData.labels.length > 0
  const hasDoughnut = doughnutData.values.length > 0

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-sm text-slate-500">{greet()},</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{firstName}</h1>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 p-6 text-white shadow-lg sm:p-8" style={{ animationDelay: '60ms' }}>
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-100">Available balance</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                    {balance === null ? '—' : fmtMoney(balance, currency)}
                  </p>
                </div>
                {unreadAlerts > 0 && (
                  <button
                    type="button"
                    onClick={openAlerts}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-300 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                    </span>
                    {unreadAlerts} new alert{unreadAlerts === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/send" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50">
                  <Send className="h-4 w-4" />
                  Send money
                </Link>
                <Link to="/topup" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-400">
                  <ArrowDownToLine className="h-4 w-4" />
                  Top up
                </Link>
                <Link to="/withdraw" className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25">
                  <ArrowUpFromLine className="h-4 w-4" />
                  Withdraw
                </Link>
              </div>
            </div>
          </div>

          <div className="animate-fade-up grid grid-cols-2 gap-4" style={{ animationDelay: '120ms' }}>
            <Card className="p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                <TrendingUp className="h-4 w-4" />
                Money in · recent
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{fmtMoney(moneyIn, currency)}</p>
            </Card>
            <Card className="p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600">
                <TrendingDown className="h-4 w-4" />
                Money out · recent
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{fmtMoney(moneyOut, currency)}</p>
            </Card>
          </div>

          <Card className="animate-fade-up overflow-hidden p-5 sm:p-6" style={{ animationDelay: '180ms' }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Money in and out</h2>
              <Link to="/analytics" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                See details
              </Link>
            </div>
            {hasTrend ? (
              <div className="h-60">
                <Line
                  data={{
                    labels: trendData.labels,
                    datasets: [
                      {
                        label: 'Money in',
                        data: trendData.inflow,
                        borderColor: INFLOW,
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5
                      },
                      {
                        label: 'Money out',
                        data: trendData.outflow,
                        borderColor: OUTFLOW,
                        backgroundColor: 'rgba(244, 63, 94, 0.12)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
                      tooltip: {
                        callbacks: {
                          label: (item) => `${item.dataset.label}: ${currencySymbol(currency)}${Number(item.parsed.y).toLocaleString('en-IN')}`
                        }
                      }
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
                      y: {
                        border: { display: false },
                        grid: { color: '#f1f5f9' },
                        ticks: {
                          font: { size: 11 },
                          color: '#94a3b8',
                          callback: (value) => `${currencySymbol(currency)}${Number(value).toLocaleString('en-IN')}`
                        }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 text-center">
                <Activity className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Your money chart appears here</p>
                <p className="max-w-xs text-xs text-slate-400">Add money or send a payment and the lines will draw themselves.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="animate-fade-up p-5 sm:p-6" style={{ animationDelay: '140ms' }}>
            <h2 className="mb-4 font-semibold text-slate-900">Where your money goes</h2>
            {hasDoughnut ? (
              <>
                <div className="relative h-52">
                  <Doughnut
                    data={{
                      labels: doughnutData.labels,
                      datasets: [
                        {
                          data: doughnutData.values,
                          backgroundColor: doughnutData.colors,
                          borderWidth: 2,
                          borderColor: '#ffffff',
                          hoverOffset: 6
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '68%',
                      animation: { animateRotate: true, duration: 700, easing: 'easeOutQuart' },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (item) => ` ${currencySymbol(currency)}${Number(item.parsed).toLocaleString('en-IN')}`
                          }
                        }
                      }
                    }}
                  />
                </div>
                <ul className="mt-4 space-y-2">
                  {doughnutData.labels.map((label, index) => (
                    <li key={label} className="flex items-center gap-2.5 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: doughnutData.colors[index] }} />
                      <span className="flex-1 text-slate-600">{label}</span>
                      <span className="font-semibold tabular-nums text-slate-800">{currencySymbol(currency)}{doughnutData.values[index].toLocaleString('en-IN')}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 text-center">
                <Wallet className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nothing to break down yet</p>
                <p className="max-w-xs text-xs text-slate-400">Once you make a few payments, the circle will fill in.</p>
              </div>
            )}
          </Card>

          {showRisk && loginRisk && (
            <Card className="animate-fade-up p-5" style={{ animationDelay: '200ms' }}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Safety check</h2>
                <button type="button" className="text-xs font-medium text-slate-400 hover:text-slate-600" onClick={() => setRiskDismissed(true)}>
                  Dismiss
                </button>
              </div>
              <RiskCard assessment={loginRisk} />
            </Card>
          )}

          {!showRisk && (
            <Card className="animate-fade-up p-5" style={{ animationDelay: '200ms' }}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Safety check</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Every transfer is checked for anything unusual before it moves. Large amounts, new people, odd times of day,
                    and sending too fast can all raise an alert.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={openAlerts} className="btn-secondary w-full">
                  View alerts
                </button>
                <Link to="/analytics" className="btn-ghost w-full">
                  Payment analytics
                </Link>
              </div>
            </Card>
          )}

          {profile?.wallet && (
            <Card className="animate-fade-up p-5" style={{ animationDelay: '260ms' }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Your wallet</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Balance</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{fmtMoney(profile.wallet.balance, currency)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-medium text-slate-900">{user?.email}</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>

      <Card className="animate-fade-up overflow-hidden" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Recent activity</h2>
          <Link to="/history" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <TransactionList
            rows={recent}
            emptyIcon={<Wallet className="h-8 w-8 text-slate-300" />}
            emptyTitle="No activity yet"
            emptyBody="Top up your wallet or send your first transfer to get started."
          />
        )}
      </Card>
    </div>
  )
}

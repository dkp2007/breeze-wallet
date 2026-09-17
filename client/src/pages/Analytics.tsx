import { useEffect, useMemo, useState } from 'react'
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
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { ShieldAlert, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'
import { fmtDate, fmtMoney, currencySymbol } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import type { AnalyticsOverview, BreakdownPoint, FraudRuleStat, TrendPoint } from '../lib/types'
import { Card, Spinner } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const INFLOW = '#10b981'
const OUTFLOW = '#f43f5e'
const BRAND = '#0f7d93'
const AMBER = '#f59e0b'
const VIOLET = '#8b5cf6'
const SLATE = '#94a3b8'

const PIE_COLORS: Record<string, string> = {
  deposit: BRAND,
  withdrawal: AMBER,
  transfer_in: INFLOW,
  transfer_out: OUTFLOW,
  refund: VIOLET
}

const fraudTitles: Record<string, string> = {
  transfer_blocked: 'Payments we stopped',
  transfer_flagged: 'Payments being looked at',
  new_device_login: 'Sign-ins from a new device'
}

const typeNames: Record<string, string> = {
  deposit: 'Top-ups',
  withdrawal: 'Withdrawals',
  transfer_in: 'Money received',
  transfer_out: 'Money sent',
  refund: 'Refunds'
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card className="animate-fade-up p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 truncate text-2xl font-bold tabular-nums tracking-tight ${accent}`}>{value}</p>
    </Card>
  )
}

export default function Analytics() {
  const currency = useCurrency()
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [breakdown, setBreakdown] = useState<BreakdownPoint[]>([])
  const [fraud, setFraud] = useState<FraudRuleStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([api.analyticsOverview(), api.analyticsTrends(30), api.analyticsBreakdown(), api.analyticsFraud(30)])
      .then(([overviewResult, trendsResult, breakdownResult, fraudResult]) => {
        if (!active) return
        setOverview(overviewResult)
        setTrends(trendsResult.points)
        setBreakdown(breakdownResult.points)
        setFraud(fraudResult.rules)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load analytics')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const trendChart = useMemo(() => {
    const labels = trends.map((point) =>
      new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${point.day}T00:00:00`))
    )
    return {
      labels,
      datasets: [
        {
          label: 'Money in',
          data: trends.map((point) => Math.round(point.inflow / 100)),
          borderColor: INFLOW,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        },
        {
          label: 'Money out',
          data: trends.map((point) => Math.round(point.outflow / 100)),
          borderColor: OUTFLOW,
          backgroundColor: 'rgba(244, 63, 94, 0.12)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        }
      ]
    }
  }, [trends])

  const doughnutData = useMemo(() => {
    const sorted = [...breakdown].sort((a, b) => b.volume - a.volume)
    return {
      labels: sorted.map((point) => typeNames[point.type] ?? point.type),
      datasets: [
        {
          data: sorted.map((point) => Math.round(point.volume / 100)),
          backgroundColor: sorted.map((point) => PIE_COLORS[point.type] ?? SLATE),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }
      ]
    }
  }, [breakdown])

  const countChart = useMemo(() => {
    const sorted = [...breakdown].sort((a, b) => b.count - a.count)
    return {
      labels: sorted.map((point) => typeNames[point.type] ?? point.type),
      datasets: [
        {
          label: 'Payments',
          data: sorted.map((point) => point.count),
          backgroundColor: sorted.map((point) => PIE_COLORS[point.type] ?? SLATE),
          borderRadius: 6,
          maxBarThickness: 32
        }
      ]
    }
  }, [breakdown])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lifetime totals plus your daily money coming in and going out over the last 30 days. Breeze runs in test mode, so no
          real money moves.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Balance" value={fmtMoney(overview?.balance ?? 0, currency)} accent="text-slate-900" />
        <StatCard label="Total in" value={fmtMoney(overview?.totalIn ?? 0, currency)} accent="text-emerald-600" />
        <StatCard label="Total out" value={fmtMoney(overview?.totalOut ?? 0, currency)} accent="text-rose-600" />
        <StatCard label="Payments" value={String(overview?.transactionCount ?? 0)} accent="text-slate-900" />
      </div>

      <Card className="animate-fade-up p-5 sm:p-6" style={{ animationDelay: '80ms' }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Cash flow</h2>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INFLOW }} />
              Money coming in
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OUTFLOW }} />
              Money going out
            </span>
          </div>
        </div>
        {trends.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            No activity in the last 30 days yet.
          </div>
        ) : (
          <div className="h-72">
            <Line
              data={trendChart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 700, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (item) => ` ${item.dataset.label}: ${currencySymbol(currency)}${Number(item.parsed.y).toLocaleString('en-IN')}`
                    }
                  }
                },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8', maxRotation: 0, autoSkipPadding: 12 } },
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
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="animate-fade-up p-5 sm:p-6" style={{ animationDelay: '140ms' }}>
          <h2 className="mb-4 font-semibold text-slate-900">Where the money goes</h2>
          {breakdown.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Nothing to break down yet.</div>
          ) : (
            <>
              <div className="relative h-60">
                <Doughnut
                  data={doughnutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    animation: { animateRotate: true, duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
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
                {breakdown.map((point) => (
                  <li key={point.type} className="flex items-center gap-3 text-sm">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[point.type] ?? SLATE }}
                    />
                    <span className="flex-1 text-slate-600">{typeNames[point.type] ?? point.type}</span>
                    <span className="font-medium text-slate-800">{fmtMoney(point.volume, currency)}</span>
                    <span className="w-20 text-right text-xs text-slate-400">
                      {point.count} {point.count === 1 ? 'payment' : 'payments'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="animate-fade-up p-5 sm:p-6" style={{ animationDelay: '200ms' }}>
          <h2 className="mb-4 font-semibold text-slate-900">Payments by kind</h2>
          {breakdown.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Nothing to count yet.</div>
          ) : (
            <div className="h-60">
              <Bar
                data={countChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 700, easing: 'easeOutQuart' },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (item) => ` ${Number(item.parsed.y)} ${Number(item.parsed.y) === 1 ? 'payment' : 'payments'}`
                      }
                    }
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
                    y: {
                      border: { display: false },
                      grid: { color: '#f1f5f9' },
                      ticks: { font: { size: 11 }, color: '#94a3b8', precision: 0 }
                    }
                  }
                }}
              />
            </div>
          )}
        </Card>
      </div>

      <Card className="animate-fade-up p-5 sm:p-6" style={{ animationDelay: '260ms' }}>
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-slate-900">Safety rules triggered</h2>
        </div>
        {fraud.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            All clear — nothing unusual happened in the last 30 days.
          </div>
        ) : (
          <ul className="space-y-4">
            {fraud.map((rule) => {
              const width = Math.max(8, Math.round((rule.hits / Math.max(...fraud.map((item) => item.hits))) * 100))
              return (
                <li key={rule.type}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{fraudTitles[rule.type] ?? rule.type}</span>
                    <span className="text-slate-400">
                      {rule.hits} time{rule.hits === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-700 ease-out"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  {rule.lastHit && <p className="mt-1 text-xs text-slate-400">Last triggered {fmtDate(rule.lastHit)}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

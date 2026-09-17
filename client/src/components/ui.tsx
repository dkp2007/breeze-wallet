import type { ReactNode } from 'react'
import type { AlertSeverity, RiskAssessment, TransactionStatus } from '../lib/types'
import { ShieldAlert } from 'lucide-react'

const statusStyles: Record<TransactionStatus, string> = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  flagged: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  blocked: 'bg-rose-50 text-rose-700 ring-rose-600/20'
}

const statusLabel: Record<TransactionStatus, string> = {
  completed: 'Completed',
  pending: 'On its way',
  flagged: 'Being looked at',
  failed: 'Failed',
  blocked: 'Stopped for your safety'
}

const severityStyles: Record<AlertSeverity, string> = {
  low: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  high: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  critical: 'bg-rose-50 text-rose-700 ring-rose-600/20'
}

const badgeBase = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset'

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return <span className={`${badgeBase} ${statusStyles[status]}`}>{statusLabel[status]}</span>
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <span className={`${badgeBase} capitalize ${severityStyles[severity]}`}>{severity}</span>
}

const markStyles = {
  sm: 'h-8 w-8 rounded-lg p-1',
  md: 'h-9 w-9 rounded-xl p-1',
  lg: 'h-10 w-10 rounded-xl p-1.5'
}

export function BrandMark({ size = 'md' }: { size?: keyof typeof markStyles }) {
  return (
    <div className={`flex shrink-0 items-center justify-center bg-white ${markStyles[size]}`}>
      <img src="/breeze-mark.png" alt="" className="h-full w-full object-contain" />
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <div className={`${className} animate-spin rounded-full border-2 border-slate-300 border-t-brand-600`} />
}

export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-slate-500">Loading your wallet…</p>
      </div>
    </div>
  )
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </div>
  )
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
      {children}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
      {children}
    </div>
  )
}

export function RiskCard({ assessment }: { assessment: RiskAssessment }) {
  const flagged = assessment.decision === 'flag'
  const blocked = assessment.decision === 'block'
  const ring = blocked ? 'border-rose-200 bg-rose-50' : flagged ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
  const title = blocked
    ? 'We stopped this transfer for your safety'
    : flagged
      ? 'This transfer is being looked at'
      : 'This transfer looks fine'
  const sub = blocked
    ? 'We noticed something unusual, so the money did not move.'
    : flagged
      ? 'The money has moved, but our system will check this transfer. You can keep using your wallet.'
      : 'No unusual activity was spotted here.'
  return (
    <div className={`rounded-xl border px-4 py-3 ${ring}`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-current opacity-70" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{sub}</p>
          {assessment.hits.length > 0 && (
            <ul className="mt-2 space-y-1">
              {assessment.hits.map((hit) => (
                <li key={hit.rule} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-700">{hit.message}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                    +{hit.points} points
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

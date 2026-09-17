import type { ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, Landmark, RefreshCcw } from 'lucide-react'
import { moneyDirection, fmtMoney, fmtDateTime, typeLabel } from '../lib/format'
import type { Transaction, TransactionType } from '../lib/types'
import { StatusBadge } from './ui'

const directionMeta: Record<
  'in' | 'out',
  { icon: typeof ArrowDownLeft; className: string; sign: string }
> = {
  in: { icon: ArrowDownLeft, className: 'bg-emerald-50 text-emerald-600', sign: '+' },
  out: { icon: ArrowUpRight, className: 'bg-rose-50 text-rose-600', sign: '−' }
}

function directionFor(type: TransactionType) {
  const meta = directionMeta[moneyDirection(type)]
  const Icon = type === 'withdrawal' ? Landmark : type === 'refund' ? RefreshCcw : meta.icon
  return { ...meta, Icon }
}

export function TransactionList({
  rows,
  emptyIcon,
  emptyTitle,
  emptyBody
}: {
  rows: Transaction[]
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyBody?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        {emptyIcon ?? <RefreshCcw className="h-8 w-8 text-slate-300" />}
        <p className="mt-3 text-sm font-semibold text-slate-600">{emptyTitle ?? 'No transactions yet'}</p>
        <p className="mt-1 max-w-xs text-sm text-slate-400">
          {emptyBody ?? 'Money you send and receive will show up here.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((tx) => {
        const { Icon, className, sign } = directionFor(tx.type)
        return (
          <li key={tx.id} className="flex items-center gap-3 px-5 py-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${className}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{typeLabel[tx.type]}</p>
              <p className="truncate text-xs text-slate-400">
                {tx.counterparty ?? 'Wallet'}
                {' · '}
                {fmtDateTime(tx.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`text-sm font-bold tabular-nums ${moneyDirection(tx.type) === 'in' ? 'text-emerald-600' : 'text-slate-800'}`}>
                {sign}
                {fmtMoney(tx.amount, tx.currency)}
              </span>
              <StatusBadge status={tx.status} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

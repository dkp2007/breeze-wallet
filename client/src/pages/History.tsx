import { useEffect, useState } from 'react'
import { Download, Loader2, ReceiptText } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Transaction, TransactionStatus, TransactionType } from '../lib/types'
import { Card, Spinner } from '../components/ui'
import { TransactionList } from '../components/TransactionList'
import { typeLabel } from '../lib/format'

const pageSize = 25

type TypeFilter = TransactionType | ''
type StatusFilter = TransactionStatus | ''

const typeOptions: { value: TypeFilter; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'deposit', label: typeLabel.deposit },
  { value: 'withdrawal', label: typeLabel.withdrawal },
  { value: 'transfer_in', label: typeLabel.transfer_in },
  { value: 'transfer_out', label: typeLabel.transfer_out },
  { value: 'refund', label: typeLabel.refund }
]

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'On its way' },
  { value: 'flagged', label: 'Being looked at' },
  { value: 'failed', label: 'Failed' },
  { value: 'blocked', label: 'Stopped for your safety' }
]

export default function History() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [type, setType] = useState<TypeFilter>('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [downloadError, setDownloadError] = useState('')

  async function handleDownload() {
    setDownloadState('busy')
    setDownloadError('')
    try {
      const res = await api.downloadStatement()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'breeze-statement.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setDownloadState('done')
      setTimeout(() => setDownloadState('idle'), 3000)
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Could not download your statement')
      setTimeout(() => setDownloadError(''), 4000)
      setDownloadState('idle')
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .transactions({ type, status, limit: pageSize, offset: 0 })
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setTotal(result.total)
        setError('')
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load transactions')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [type, status])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const result = await api.transactions({ type, status, limit: pageSize, offset: rows.length })
      setRows((previous) => [...previous, ...result.rows])
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transactions</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total > 0 ? `${total} payment${total === 1 ? '' : 's'} on record` : 'Every top-up, withdrawal and transfer'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloadState === 'busy'}
            className="btn-secondary"
            title="Download your full history as a spreadsheet file"
          >
            {downloadState === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloadState === 'busy' ? 'Preparing…' : downloadState === 'done' ? 'Downloaded' : 'Download statement'}
          </button>
          <select
            aria-label="Filter by type"
            className="input w-auto py-2 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as TypeFilter)}
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            className="input w-auto py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {downloadError && <p className="text-sm font-medium text-rose-600">{downloadError}</p>}

      <Card className="overflow-hidden">
        {error ? (
          <p className="px-5 py-8 text-center text-sm text-rose-600">{error}</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            <TransactionList
              rows={rows}
              emptyIcon={<ReceiptText className="h-8 w-8 text-slate-300" />}
              emptyTitle="No matching transactions"
              emptyBody="Try changing the filters, or make your first payment."
            />
            {rows.length < total && (
              <div className="border-t border-slate-100 px-5 py-4 text-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Show more ({rows.length} of {total})
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

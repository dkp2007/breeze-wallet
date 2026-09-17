import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CheckCheck, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import type { Alert } from '../lib/types'
import { SeverityBadge, Spinner } from './ui'
import { useShell } from './Layout'

export function AlertsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useShell()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    api
      .alerts()
      .then((result) => {
        if (!active) return
        setAlerts(result.alerts)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  async function markRead(alert: Alert) {
    if (alert.read) return
    try {
      await api.markAlertRead(alert.id)
      setAlerts((previous) => previous.map((item) => (item.id === alert.id ? { ...item, read: true } : item)))
      void refresh()
    } catch {}
  }

  async function markAllRead() {
    const unread = alerts.filter((item) => !item.read)
    if (unread.length === 0) return
    try {
      await Promise.all(unread.map((item) => api.markAlertRead(item.id)))
      setAlerts((previous) => previous.map((item) => ({ ...item, read: true })))
      void refresh()
    } catch {}
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Notifications">
          <motion.div
            className="absolute inset-0 bg-slate-950/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute right-3 top-14 w-[calc(100vw-1.5rem)] max-w-sm sm:right-6"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">Notifications</p>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={loading || !alerts.some((item) => !item.read)}
                  className="text-xs font-semibold text-brand-600 transition hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:text-slate-400"
                >
                  Mark all read
                </button>
              </div>

              <div className="scroll-brand max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Spinner />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-10 text-center">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <BellRing className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">Nothing to catch up on</p>
                    <p className="mt-1 text-xs text-slate-500">New alerts land here the moment they happen.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {alerts.slice(0, 12).map((alert) => (
                      <li key={alert.id} className={`flex items-start gap-3 px-4 py-3 ${alert.read ? '' : 'bg-brand-50/50'}`}>
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <ShieldAlert className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${alert.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
                            {alert.message}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={alert.severity} />
                            <span className="text-xs text-slate-400">{fmtDateTime(alert.created_at)}</span>
                          </div>
                        </div>
                        {!alert.read && (
                          <button
                            type="button"
                            onClick={() => void markRead(alert)}
                            title="Mark read"
                            className="shrink-0 rounded-lg p-1.5 text-brand-600 transition hover:bg-brand-100"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

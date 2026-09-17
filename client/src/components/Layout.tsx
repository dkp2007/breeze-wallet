import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Settings,
  Wallet
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { BrandMark } from './ui'
import { ToastProvider, useToast } from './Toast'
import { useSound } from './Sound'
import { AlertsDialog } from './AlertsDialog'
import { api } from '../lib/api'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { fmtMoney, initials } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import type { Wallet as WalletModel, Alert as AlertModel } from '../lib/types'

interface ShellValue {
  balance: number | null
  currency: string
  unreadAlerts: number
  balanceFlash: boolean
  refresh: () => Promise<void>
  openAlerts: () => void
}

const ShellContext = createContext<ShellValue>({
  balance: null,
  currency: 'inr',
  unreadAlerts: 0,
  balanceFlash: false,
  refresh: async () => {},
  openAlerts: () => {}
})

export function useShell(): ShellValue {
  return useContext(ShellContext)
}

type NavItem = { to: string; label: string; icon: typeof Wallet; end?: boolean }

const bankingNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/send', label: 'Send money', icon: Send },
  { to: '/topup', label: 'Top up', icon: ArrowDownToLine },
  { to: '/withdraw', label: 'Withdraw', icon: ArrowUpFromLine }
]

const manageNav: NavItem[] = [
  { to: '/history', label: 'Transactions', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings }
]

function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function Sidebar() {
  const { user, profile, signOut } = useAuth()
  const { balance, currency, balanceFlash } = useShell()
  const fullName = String(user?.user_metadata?.full_name ?? '')
  const email = user?.email ?? ''
  const avatarUrl = profile?.profileDetails?.avatarUrl ?? ''

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-6 pt-5">
        <BrandMark size="md" />
        <div className="sidebar-label">
          <p className="text-lg font-bold leading-none tracking-tight text-white">Breeze</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">Digital wallet</p>
        </div>
      </div>

      <div className="mx-3 mb-5 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-3 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="sidebar-label min-w-0">
            <p className="text-xs font-medium text-brand-100">Available balance</p>
            <p className={`mt-0.5 truncate text-xl font-bold tabular-nums tracking-tight ${balanceFlash ? 'animate-balance-flash' : ''}`}>
              {balance === null ? '—' : fmtMoney(balance, currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="scroll-dark flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div>
          <p className="sidebar-label px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Move money</p>
          <NavLinks items={bankingNav} />
        </div>
        <div>
          <p className="sidebar-label px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Manage</p>
          <NavLinks items={manageNav} />
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">
              {fullName ? initials(fullName) : '?'}
            </div>
          )}
          <div className="sidebar-label min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{fullName || 'Your account'}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
          <div className="sidebar-label">
            <button type="button" onClick={() => void signOut()} title="Sign out" className="icon-btn">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const toast = useToast()
  const { play } = useSound()
  const currency = useCurrency()
  const [wallet, setWallet] = useState<WalletModel | null>(null)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [balanceFlash, setBalanceFlash] = useState(false)
  const knownAlertIds = useRef<Set<string>>(new Set())
  const firstAlertLoad = useRef(true)

  const refresh = async () => {
    try {
      const [walletPayload, alertsPayload] = await Promise.all([api.wallet(), api.alerts()])
      setWallet(walletPayload.wallet)
      setUnreadAlerts(alertsPayload.unread)

      if (firstAlertLoad.current) {
        for (const alert of alertsPayload.alerts) knownAlertIds.current.add(alert.id)
        firstAlertLoad.current = false
      } else {
        const fresh = alertsPayload.alerts.filter((alert) => !knownAlertIds.current.has(alert.id))
        for (const alert of fresh) {
          knownAlertIds.current.add(alert.id)
          toast.show({
            title: alert.type === 'transfer_blocked' ? 'A transfer was stopped' : 'New alert',
            body: alert.message,
            tone: 'info',
            onClick: () => setAlertsOpen(true)
          })
          void play('receive-success')
        }
      }
    } catch {}
  }

  const previousBalance = useRef<number | null>(null)
  useEffect(() => {
    if (wallet && previousBalance.current !== null && previousBalance.current !== wallet.balance) {
      setBalanceFlash(true)
      const timeout = setTimeout(() => setBalanceFlash(false), 1200)
      previousBalance.current = wallet.balance
      return () => clearTimeout(timeout)
    }
    previousBalance.current = wallet?.balance ?? null
  }, [wallet])

  useEffect(() => {
    void refresh()
  }, [location.pathname])

  useEffect(() => {
    setMobileOpen(false)
    setAlertsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!supabaseConfigured || !user) return
    const channel = supabase
      .channel(`shell-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const alert = payload.new as AlertModel
          if (!alert || knownAlertIds.current.has(alert.id)) return
          knownAlertIds.current.add(alert.id)
          toast.show({
            title: alert.type === 'transfer_blocked' ? 'A transfer was stopped' : 'New alert',
            body: alert.message,
            tone: 'info',
            onClick: () => setAlertsOpen(true)
          })
          void play('receive-success')
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${user.id}` },
        () => void refresh()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  return (
    <ShellContext.Provider
      value={{
        balance: wallet?.balance ?? null,
        currency,
        unreadAlerts,
        balanceFlash,
        refresh,
        openAlerts: () => setAlertsOpen(true)
      }}
    >
      <ToastProvider>
      <div className="flex min-h-screen">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={`sidebar-shell fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col overflow-hidden bg-slate-900 transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-[76px] lg:translate-x-0 lg:shadow-none lg:hover:w-64 ${
            mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full w-72 flex-col lg:w-64">
            <Sidebar />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AlertsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} />
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <BrandMark size="sm" />
              <span className="font-bold text-slate-900">Breeze</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertsOpen((open) => !open)}
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadAlerts > 0 && (
                <>
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadAlerts}
                  </span>
                  <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-ping rounded-full bg-rose-400/60" />
                </>
              )}
            </button>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
      </ToastProvider>
    </ShellContext.Provider>
  )
}

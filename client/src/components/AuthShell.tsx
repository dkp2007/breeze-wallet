import type { ReactNode } from 'react'
import { BellRing, LineChart, ShieldCheck } from 'lucide-react'
import { BrandMark } from './ui'
import { supabaseConfigured } from '../lib/supabase'

const perks = [
  { icon: ShieldCheck, title: 'Protected by default', body: 'Every transfer is checked for anything unusual before it moves.' },
  { icon: BellRing, title: 'Instant alerts', body: 'When something looks off, you see it straight away.' },
  { icon: LineChart, title: 'Clear analytics', body: 'See where your money comes in and goes out.' }
]

export function SetupNotice() {
  if (supabaseConfigured) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">Your wallet is not connected yet</p>
      <p className="mt-1">
        Enter your wallet address (<code>VITE_SUPABASE_URL</code>) and passkey (<code>VITE_SUPABASE_ANON_KEY</code>) in{' '}
        <code className="rounded bg-amber-100 px-1">client/.env</code> to sign in.
      </p>
    </div>
  )
}
export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 lg:flex">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-300/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <BrandMark size="lg" />
          <span className="text-xl font-bold tracking-tight text-white">Breeze</span>
        </div>
        <div className="relative space-y-6">
          <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white">
            Money that moves fast, safely.
          </h1>
          <ul className="space-y-5">
            {perks.map((perk) => {
              const Icon = perk.icon
              return (
                <li key={perk.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{perk.title}</p>
                    <p className="mt-0.5 text-sm text-slate-400">{perk.body}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size="md" />
            <span className="text-xl font-bold tracking-tight text-slate-900">Breeze</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  )
}

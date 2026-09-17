import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, LineChart, Smartphone, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { BrandMark } from '../components/ui'

const shell = 'mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8'

const features = [
  {
    icon: Wallet,
    title: 'Your balance, always clear',
    body: 'See what you have and every payment you have made or received, all in one place.'
  },
  {
    icon: Smartphone,
    title: 'Extra safety when you sign in',
    body: 'Add a code from your phone on top of your password, so only you can get in.'
  },
  {
    icon: BellRing,
    title: 'Told when something looks wrong',
    body: 'If a payment looks unusual, we let you know straight away.'
  },
  {
    icon: LineChart,
    title: 'Know where your money goes',
    body: 'Simple graphs of the money coming in and going out, month by month.'
  }
]

const steps = [
  {
    title: 'Create your account',
    body: 'Sign up with your email, then add a code from your phone for extra safety.'
  },
  {
    title: 'Add money',
    body: 'Top up from your card whenever you need to, as much or as little as you like.'
  },
  {
    title: 'Send and keep track',
    body: 'Send to someone by email, then follow every payment in your history.'
  }
]

export default function Home() {
  const { session } = useAuth()
  const primary = session ? { to: '/dashboard', label: 'Open wallet' } : { to: '/signup', label: 'Create your wallet' }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`${shell} flex h-16 items-center justify-between gap-4`}>
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark size="sm" />
            <span className="text-lg font-semibold tracking-tight text-slate-900">Breeze</span>
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            <a href="#features" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              Features
            </a>
            <a href="#how" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              How it works
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {session ? null : (
              <Link to="/login" className="btn-ghost">
                Sign in
              </Link>
            )}
            <Link to={primary.to} className="btn-primary">
              {primary.label}
            </Link>
          </div>
        </div>
      </header>

      <section className={`${shell} py-20 text-center sm:py-28`}>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          Send money to the people you know
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
          Breeze is a wallet for paying friends and family. Add money when you need it, send it in seconds, and keep a
          clear record of everything that moves.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to={primary.to} className="btn-primary px-5 py-3 text-base">
            {primary.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to={session ? '/send' : '/login'} className="btn-secondary px-5 py-3 text-base">
            {session ? 'Send money' : 'Sign in'}
          </Link>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-t border-slate-200 py-20">
        <div className={shell}>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">What you get</h2>
          <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 border-t border-slate-200 bg-slate-50 py-20">
        <div className={shell}>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">How it works</h2>
          <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shell} py-20`}>
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Ready to send your first payment?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-600">
            Open a wallet in a minute, and start with a balance of zero.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to={primary.to} className="btn-primary px-5 py-3 text-base">
              {primary.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to={session ? '/history' : '/signup'} className="btn-secondary px-5 py-3 text-base">
              {session ? 'See your history' : 'Sign up free'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className={`${shell} py-10`}>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark size="sm" />
                <span className="text-base font-semibold tracking-tight text-slate-900">Breeze</span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-slate-500">
                A wallet for sending money to the people you know.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <p className="text-sm font-semibold text-slate-900">Wallet</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link to="/dashboard" className="text-slate-600 transition hover:text-brand-700">
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link to="/send" className="text-slate-600 transition hover:text-brand-700">
                      Send money
                    </Link>
                  </li>
                  <li>
                    <Link to="/history" className="text-slate-600 transition hover:text-brand-700">
                      Transactions
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Account</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link to="/signup" className="text-slate-600 transition hover:text-brand-700">
                      Create account
                    </Link>
                  </li>
                  <li>
                    <Link to="/login" className="text-slate-600 transition hover:text-brand-700">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link to="/settings" className="text-slate-600 transition hover:text-brand-700">
                      Security
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
            Breeze runs in test mode, so no real money moves.
          </p>
        </div>
      </footer>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AuthShell, SetupNotice } from '../components/AuthShell'
import { ErrorNote } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { pendingSecondStep } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [factorId, setFactorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCredentials(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      })
      if (signInError) {
        throw new Error(signInError.message)
      }
      if (!data.session) {
        throw new Error('Sign-in could not be completed. Check that your email is confirmed.')
      }
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        throw new Error(factorsError.message)
      }
      const totp = factors.totp.find((factor) => factor.status === 'verified')
      if (totp) {
        setFactorId(totp.id)
        setCode('')
        setStep('totp')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleTotp(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim()
      })
      if (verifyError) {
        throw new Error(verifyError.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={step === 'totp' ? 'Enter your verification code' : 'Welcome back'}
      subtitle={
        step === 'totp'
          ? 'A second step is turned on for this wallet. Open the app on your phone for the code.'
          : 'Sign in to your Breeze wallet.'
      }
      footer={
        <>
          New to Breeze?{' '}
          <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <SetupNotice />
        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Forgot password?
              </Link>
            </div>
            <ErrorNote message={error} />
            {!error && !busy && pendingSecondStep === true && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Getting your wallet ready — the first visit after a quiet period can take a few
                seconds. Hang tight, you will be signed in automatically.
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotp} className="space-y-4">
            <div>
              <label htmlFor="code" className="label">
                Six-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                className="input text-center text-2xl font-bold tracking-[0.4em]"
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </div>
            <ErrorNote message={error} />
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Verify &amp; sign in
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setStep('credentials')
                setError('')
              }}
            >
              Back to email &amp; password
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

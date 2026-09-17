import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { AuthShell, SetupNotice } from '../components/AuthShell'
import { ErrorNote, SuccessNote } from '../components/ui'

export default function Signup() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState(false)

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/login`
        }
      })
      if (signUpError) {
        throw new Error(signUpError.message)
      }
      if (data.session) {
        return
      }
      setPendingConfirmation(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your wallet"
      subtitle="A balance, history, and safety checks — set up in under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <SetupNotice />
        {pendingConfirmation ? (
          <SuccessNote>
            <p className="font-semibold">Almost there — check your inbox</p>
            <p className="mt-1 font-normal">
              We sent a confirmation link to <span className="font-semibold">{email}</span>. Click it to activate your
              account, then sign in.
            </p>
          </SuccessNote>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="label">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                className="input"
                placeholder="Ada Lovelace"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <ErrorNote message={error} />
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create wallet
            </button>
            <p className="text-center text-xs text-slate-400">
              By continuing you agree to set up a wallet, start at zero, and have every payment checked for anything unusual.
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

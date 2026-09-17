import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AuthShell, SetupNotice } from '../components/AuthShell'
import { ErrorNote, Spinner } from '../components/ui'

type Stage = 'checking' | 'ready' | 'saving' | 'done' | 'broken'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function claimLink() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const query = new URLSearchParams(window.location.search)
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const linkError = hash.get('error_description') ?? query.get('error_description') ?? hash.get('error')
      const code = query.get('code')

      try {
        if (linkError) {
          throw new Error(linkError)
        }
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (sessionError) {
            throw new Error(sessionError.message)
          }
          window.history.replaceState({}, '', window.location.pathname)
          if (active) setStage('ready')
          return
        }
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            throw new Error(exchangeError.message)
          }
          window.history.replaceState({}, '', window.location.pathname)
          if (active) setStage('ready')
          return
        }
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          if (active) setStage('ready')
          return
        }
        throw new Error('This password link is missing or has already been used.')
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'This password link is not valid.')
          setStage('broken')
        }
      }
    }

    void claimLink()
    return () => {
      active = false
    }
  }, [])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Your new password needs at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setStage('saving')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        throw new Error(updateError.message)
      }
      setStage('done')
      setTimeout(() => navigate('/dashboard', { replace: true }), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the new password')
      setStage('ready')
    }
  }

  return (
    <AuthShell
      title={stage === 'done' ? 'All set' : 'Choose a new password'}
      subtitle={stage === 'done' ? 'Your new password is saved.' : 'Pick something new for your wallet.'}
      footer={
        <>
          Remembered your old password?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <SetupNotice />
        {stage === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner className="h-7 w-7" />
            <p className="text-sm text-slate-500">Checking your reset link…</p>
          </div>
        )}
        {stage === 'broken' && (
          <div className="space-y-4">
            <ErrorNote message={error} />
            <Link to="/forgot-password" className="btn-primary w-full py-3 text-center">
              Request a new link
            </Link>
          </div>
        )}
        {(stage === 'ready' || stage === 'saving' || stage === 'done') && (
          <form onSubmit={handleSave} className="space-y-4">
            {stage === 'done' && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">
                  Your new password is saved. Taking you to your wallet…
                </p>
              </div>
            )}
            <div>
              <label htmlFor="password" className="label">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={stage !== 'ready'}
                className="input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm" className="label">
                Type it again
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={stage !== 'ready'}
                className="input"
                placeholder="••••••••"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <ErrorNote message={error} />
            <button type="submit" disabled={stage !== 'ready'} className="btn-primary w-full py-3">
              {stage === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === 'done' ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {stage === 'done' ? 'Saved' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, Camera, KeyRound, Loader2, LogOut, Mail, MonitorSmartphone, Save, ShieldCheck, ShieldOff, Smartphone, Trash2, Volume2, VolumeX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useSound } from '../components/Sound'
import { api } from '../lib/api'
import { fmtDate, initials, timeAgo } from '../lib/format'
import { useCurrency } from '../hooks/useCurrency'
import { setStoredCurrency } from '../lib/currencyStore'
import { Card, ErrorNote, Spinner, SuccessNote } from '../components/ui'

interface EnrollData {
  factorId: string
  qrCode: string
  secret: string
}

function qrSource(qrCode: string): string {
  if (qrCode.startsWith('data:') || qrCode.startsWith('http')) {
    return qrCode
  }
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`
}

export default function Settings() {
  const { user, profile, signOut, refreshProfile, refreshUser, recheckSecondStep } = useAuth()
  const { muted, toggleMute } = useSound()
  const [factors, setFactors] = useState<{ id: string; status: string; factor_type: string }[]>([])
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [enrolling, setEnrolling] = useState<EnrollData | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [perTxLimit, setPerTxLimit] = useState('')
  const [dailyLimit, setDailyLimit] = useState('')
  const [showClose, setShowClose] = useState(false)
  const [closePassword, setClosePassword] = useState('')
  const [closeBusy, setCloseBusy] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsError, setLimitsError] = useState('')
  const [limitsSaved, setLimitsSaved] = useState(false)
  const currency = useCurrency()
  const walletCurrency = profile?.wallet?.currency ?? currency
  const availableCurrencies = profile?.availableCurrencies ?? []
  const [currencyBusy, setCurrencyBusy] = useState(false)
  const [currencyError, setCurrencyError] = useState('')
  const [currencySaved, setCurrencySaved] = useState(false)
  const [sessions, setSessions] = useState<{
    sessionId: string
    deviceName: string
    deviceType: string
    ip: string | null
    createdAt: string
    lastSeenAt: string
    isCurrent: boolean
  }[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const [sessionBusy, setSessionBusy] = useState('')
  const [sessionsNote, setSessionsNote] = useState('')

  useEffect(() => {
    const toRupeeInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100))
    setPerTxLimit(toRupeeInput(profile?.wallet?.per_transaction_limit))
    setDailyLimit(toRupeeInput(profile?.wallet?.daily_limit))
  }, [profile?.wallet?.per_transaction_limit, profile?.wallet?.daily_limit])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const result = await api.sessions()
      setSessions(result.sessions)
      setSessionsError('')
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Could not load your signed-in devices')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function handleRevokeSession(sessionId: string) {
    setSessionBusy(sessionId)
    setSessionsError('')
    setSessionsNote('')
    try {
      await api.revokeSession(sessionId)
      setSessionsNote('That device has been signed out.')
      await loadSessions()
      setTimeout(() => setSessionsNote(''), 3500)
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Could not sign out that device')
    } finally {
      setSessionBusy('')
    }
  }

  async function handleSignOutEverywhere() {
    if (!window.confirm('Sign out on every other device? Anything those devices had open will stop working right away.')) {
      return
    }
    setSessionBusy('everywhere')
    setSessionsError('')
    setSessionsNote('')
    try {
      const result = await api.signOutEverywhere()
      setSessionsNote(
        result.revokedCount > 0
          ? `Signed out on ${result.revokedCount} other device${result.revokedCount === 1 ? '' : 's'}.`
          : 'No other devices were signed in.'
      )
      await loadSessions()
      setTimeout(() => setSessionsNote(''), 4000)
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Could not sign out everywhere')
    } finally {
      setSessionBusy('')
    }
  }

  async function handleCurrencyChange(next: string) {
    if (next === walletCurrency) return
    setCurrencyError('')
    setCurrencySaved(false)
    const confirmed = window.confirm(
      'Change your wallet currency? This is only possible while your balance is at zero and no withdrawal is on the way.'
    )
    if (!confirmed) return
    setCurrencyBusy(true)
    try {
      await api.setCurrency(next)
      setStoredCurrency(next)
      await refreshProfile()
      setCurrencySaved(true)
      setTimeout(() => setCurrencySaved(false), 3500)
    } catch (err) {
      setCurrencyError(err instanceof Error ? err.message : 'Could not change your currency')
    } finally {
      setCurrencyBusy(false)
    }
  }

  async function handleCloseAccount(event: FormEvent) {
    event.preventDefault()
    setCloseError('')
    setCloseBusy(true)
    try {
      await api.closeAccount(closePassword)
      await signOut()
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Could not close the account')
      setCloseBusy(false)
    }
  }

  async function handleSaveLimits(event: FormEvent) {
    event.preventDefault()
    setLimitsError('')
    setLimitsSaved(false)
    const parse = (raw: string, label: string): number | null => {
      const trimmed = raw.trim()
      if (!trimmed) return null
      if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        throw new Error(`${label} must be an amount like 5000 or 5000.50`)
      }
      const value = Math.round(parseFloat(trimmed) * 100)
      if (value <= 0) {
        throw new Error(`${label} must be greater than zero, or leave it empty for no limit`)
      }
      return value
    }
    let perTx: number | null
    let daily: number | null
    try {
      perTx = parse(perTxLimit, 'Per-transfer limit')
      daily = parse(dailyLimit, 'Daily limit')
    } catch (err) {
      setLimitsError(err instanceof Error ? err.message : 'Check the limit amounts')
      return
    }
    if (daily !== null && perTx !== null && perTx > daily) {
      setLimitsError('The daily limit should be at least the per-transfer limit.')
    }
    setLimitsBusy(true)
    try {
      await api.updateLimits({ perTransaction: perTx, daily })
      await refreshProfile()
      setLimitsSaved(true)
      setTimeout(() => setLimitsSaved(false), 3500)
    } catch (err) {
      setLimitsError(err instanceof Error ? err.message : 'Could not save your limits')
    } finally {
      setLimitsBusy(false)
    }
  }

  const loadFactors = useCallback(async () => {
    const { data, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (!factorsError) {
      setFactors(data.all)
    }
    setLoadingFactors(false)
  }, [])

  useEffect(() => {
    void loadFactors()
  }, [loadFactors])

  const totpFactor = factors.find((factor) => factor.factor_type === 'totp' && factor.status === 'verified') ?? null
  const email = user?.email ?? ''

  useEffect(() => {
    const details = profile?.profileDetails
    setName(details?.fullName || profile?.user.fullName || String(user?.user_metadata?.full_name ?? ''))
    setPhone(details?.phone ?? '')
    setCity(details?.city ?? '')
    setBio(details?.bio ?? '')
    setAvatarUrl(details?.avatarUrl ?? '')
  }, [profile?.profileDetails, profile?.user.fullName, user?.user_metadata?.full_name])

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileError('')
    setProfileSaved(false)
    const trimmed = name.trim()
    if (!trimmed) {
      setProfileError('Tell us your name')
      return
    }
    setProfileBusy(true)
    try {
      await api.updateProfile({ fullName: trimmed, phone: phone.trim(), city: city.trim(), bio: bio.trim() })
      await refreshUser()
      await refreshProfile()
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3500)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file) return
    setAvatarError('')
    if (!file.type.startsWith('image/')) {
      setAvatarError('Choose an image file for your picture')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setAvatarError('Pictures can be up to 4 MB')
      return
    }
    if (!user) return
    setAvatarBusy(true)
    try {
      const path = `${user.id}/avatar`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type
      })
      if (uploadError) {
        throw new Error(uploadError.message)
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await api.updateProfile({ avatarUrl: data.publicUrl })
      await refreshProfile()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not upload the picture')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError('')
    setAvatarBusy(true)
    try {
      await api.updateProfile({ avatarUrl: null })
      await refreshProfile()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove the picture')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSaved(false)
    if (newPassword.length < 8) {
      setPasswordError('Your new password needs at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords do not match.')
      return
    }
    setPasswordBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        throw new Error(updateError.message)
      }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 3500)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      setPasswordBusy(false)
    }
  }

  async function handleEnroll(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrolling!.factorId,
        code: code.trim()
      })
      if (verifyError) {
        throw new Error(verifyError.message)
      }
      recheckSecondStep()
      setEnrolling(null)
      setCode('')
      await loadFactors()
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code')
    } finally {
      setBusy(false)
    }
  }

  async function startEnroll() {
    setError('')
    setBusy(true)
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (enrollError) {
        throw new Error(enrollError.message)
      }
      setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start enrollment')
    } finally {
      setBusy(false)
    }
  }

  async function disableTotp() {
    if (!totpFactor) return
    if (!window.confirm('Disable two-factor authentication? After this, only your password will be needed to sign in.')) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: unenrollError } =      await supabase.auth.mfa.unenroll({ factorId: totpFactor.id })
      if (unenrollError) {
        throw new Error(unenrollError.message)
      }
      recheckSecondStep()
      await loadFactors()
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable two-factor authentication')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEnroll() {
    if (enrolling) {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {})
    }
    setEnrolling(null)
    setCode('')
    setError('')
    await loadFactors()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile and account security.</p>
      </div>

      {error && <ErrorNote message={error} />}

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Profile</h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Your profile" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
                {name.trim() ? initials(name.trim()) : '?'}
              </div>
            )}
            <label
              htmlFor="avatarInput"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 transition hover:text-brand-600"
              title="Change picture"
            >
              {avatarBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </label>
            <input
              id="avatarInput"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={avatarBusy}
              onChange={(event) => {
                void handleAvatarChange(event.target.files?.[0] ?? null)
                event.target.value = ''
              }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900">{name.trim() || 'Unnamed account'}</p>
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Mail className="h-3.5 w-3.5" />
              {email}
            </p>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => void handleRemoveAvatar()}
                disabled={avatarBusy}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-rose-600"
              >
                <Trash2 className="h-3 w-3" />
                Remove picture
              </button>
            )}
          </div>
        </div>
        <ErrorNote message={avatarError} />
        <form onSubmit={handleSaveProfile} className="mt-5 space-y-3">
          <div>
            <label htmlFor="fullName" className="label">
              Your name
            </label>
            <input
              id="fullName"
              type="text"
              className="input"
              placeholder="How should we call you?"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="label">
                Phone (optional)
              </label>
              <input
                id="phone"
                type="tel"
                className="input"
                placeholder="+91 98765 43210"
                value={phone}
                maxLength={20}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="city" className="label">
                City (optional)
              </label>
              <input
                id="city"
                type="text"
                className="input"
                placeholder="Where are you?"
                value={city}
                maxLength={80}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="bio" className="label">
              About you (optional)
            </label>
            <textarea
              id="bio"
              className="input min-h-20 resize-y"
              placeholder="A line or two about yourself"
              value={bio}
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
            />
            <p className="mt-1 text-right text-xs text-slate-400">{bio.length}/280</p>
          </div>
          <ErrorNote message={profileError} />
          {profileSaved && <SuccessNote>Your profile has been updated.</SuccessNote>}
          <button type="submit" disabled={profileBusy} className="btn-primary">
            {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </form>
        {user?.created_at && (
          <p className="mt-4 text-sm text-slate-400">Member since {fmtDate(user.created_at)}</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Currency</h2>
        <p className="mt-2 text-sm text-slate-500">
          The money in your wallet is kept in one currency. Sending to a wallet in another currency converts
          automatically at the day's rate.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availableCurrencies.map((option) => (
            <button
              key={option.code}
              type="button"
              disabled={currencyBusy}
              onClick={() => void handleCurrencyChange(option.code)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                option.code === walletCurrency
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              {option.code === walletCurrency ? `${option.symbol} ${option.code.toUpperCase()} · current` : `${option.symbol} ${option.code.toUpperCase()}`}
            </button>
          ))}
          {availableCurrencies.length === 0 && (
            <p className="col-span-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">{walletCurrency.toUpperCase()} (default)</p>
          )}
        </div>
        {currencyBusy && <p className="mt-3 text-sm text-slate-500">Switching…</p>}
        {currencySaved && <div className="mt-3"><SuccessNote>Your wallet currency has been changed.</SuccessNote></div>}
        <ErrorNote message={currencyError} />
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sounds</h2>
        <div className="mt-4 flex items-start gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${muted ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-600'}`}>
            {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Sounds are {muted ? 'off' : 'on'}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              A soft chime plays when money arrives or a payment goes through. Your choice is remembered on this device.
            </p>
          </div>
          <button type="button" onClick={toggleMute} className="btn-secondary shrink-0">
            {muted ? 'Turn on' : 'Turn off'}
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Spending limits</h2>
        <p className="mt-2 text-sm text-slate-500">
          Optional caps on how much money can leave your wallet. Leave a box empty for no limit.
        </p>
        <form onSubmit={handleSaveLimits} className="mt-4 max-w-sm space-y-3">
          <div>
            <label htmlFor="perTxLimit" className="label">
              Per-transfer limit
            </label>
            <input
              id="perTxLimit"
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="No limit"
              value={perTxLimit}
              onChange={(event) => setPerTxLimit(event.target.value.replace(/[^\d.]/g, ''))}
            />
            <p className="mt-1 text-xs text-slate-400">A single transfer or withdrawal above this is refused.</p>
          </div>
          <div>
            <label htmlFor="dailyLimit" className="label">
              Daily limit
            </label>
            <input
              id="dailyLimit"
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="No limit"
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value.replace(/[^\d.]/g, ''))}
            />
            <p className="mt-1 text-xs text-slate-400">All transfers and withdrawals in a rolling 24 hours count together.</p>
          </div>
          <ErrorNote message={limitsError} />
          {limitsSaved && <SuccessNote>Your limits have been saved.</SuccessNote>}
          <button type="submit" disabled={limitsBusy} className="btn-primary">
            {limitsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save limits
          </button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Security</h2>

        {loadingFactors ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : enrolling ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 text-brand-600" />
              <div>
                <p className="font-semibold text-slate-900">Scan this QR code</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Open the free app on your phone where you keep login codes, add a new entry by scanning, then enter the six-digit code below to finish.
                </p>
              </div>
            </div>
            <div className="flex justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <img src={qrSource(enrolling.qrCode)} alt="TOTP enrollment QR code" className="h-44 w-44" />
            </div>
            <div className="rounded-xl bg-slate-900 px-4 py-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Manual entry key</p>
              <p className="mt-1 font-mono text-sm tracking-widest text-white">{enrolling.secret}</p>
            </div>
            <form onSubmit={handleEnroll} className="space-y-3">
              <label htmlFor="totpCode" className="label">
                Verification code
              </label>
              <input
                id="totpCode"
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
              <div className="flex gap-3">
                <button type="submit" disabled={busy || code.length !== 6} className="btn-primary flex-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify &amp; enable
                </button>
                <button type="button" onClick={() => void cancelEnroll()} disabled={busy} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : totpFactor ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Two-factor authentication is on</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Sign-ins now need your password plus the six-digit code from the app on your phone.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => void disableTotp()} disabled={busy} className="btn-secondary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Disable two-factor authentication
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <ShieldOff className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Two-factor authentication is off</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Add a second step to protect your wallet if someone ever gets your password. You will scan a QR code with the app on your phone.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => void startEnroll()} disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Enable two-factor authentication
            </button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Password</h2>
        <p className="mt-2 text-sm text-slate-500">Change the password you use to sign in. You stay signed in here.</p>
        <form onSubmit={handleChangePassword} className="mt-4 max-w-sm space-y-3">
          <div>
            <label htmlFor="newPassword" className="label">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="input"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="label">
              Type it again
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <ErrorNote message={passwordError} />
          {passwordSaved && <SuccessNote>Your password has been changed.</SuccessNote>}
          <button type="submit" disabled={passwordBusy} className="btn-primary">
            {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Change password
          </button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Your signed-in devices</h2>
        <p className="mt-2 text-sm text-slate-500">See every device using your account, and sign out the ones you don't recognize.</p>
        {sessionsError && <ErrorNote message={sessionsError} />}
        {sessionsNote && <SuccessNote>{sessionsNote}</SuccessNote>}
        {sessionsLoading ? (
          <div className="mt-6 flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {sessions.map((session) => (
              <li key={session.sessionId} className="flex items-center gap-3 py-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  {session.deviceType === 'mobile' ? (
                    <Smartphone className="h-5 w-5" />
                  ) : (
                    <MonitorSmartphone className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{session.deviceName}</span>
                    {session.isCurrent && (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Last used {timeAgo(session.lastSeenAt)}
                    {session.ip ? ` · from ${session.ip}` : ''}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeSession(session.sessionId)}
                    disabled={sessionBusy !== ''}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                  >
                    {sessionBusy === session.sessionId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {sessions.length > 1 && (
          <button
            type="button"
            onClick={() => void handleSignOutEverywhere()}
            disabled={sessionBusy !== ''}
            className="btn-secondary mt-4"
          >
            {sessionBusy === 'everywhere' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Sign out everywhere else
          </button>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Session</h2>
        <p className="mt-2 text-sm text-slate-500">Sign out of Breeze on this device.</p>
        <button type="button" onClick={() => void signOut()} className="btn-secondary mt-4">
          Sign out
        </button>
      </Card>

      <Card className="border-rose-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-600">Danger zone</h2>
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Close this account</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Permanently erases your wallet, transaction history, and alerts. This cannot be undone. Your wallet must
              be empty first.
            </p>
          </div>
        </div>
        {!showClose ? (
          <button
            type="button"
            onClick={() => {
              setShowClose(true)
              setCloseError('')
            }}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            Close my account
          </button>
        ) : (
          <form onSubmit={handleCloseAccount} className="mt-4 max-w-sm space-y-3">
            <div>
              <label htmlFor="closePassword" className="label">
                Confirm with your password
              </label>
              <input
                id="closePassword"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                placeholder="Your password"
                value={closePassword}
                onChange={(event) => setClosePassword(event.target.value)}
              />
            </div>
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              This is the last step. Everything goes away for good — there is no way back.
            </p>
            <ErrorNote message={closeError} />
            <div className="flex gap-3">
              <button type="submit" disabled={closeBusy || !closePassword} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                {closeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Delete everything for good
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowClose(false)
                  setClosePassword('')
                  setCloseError('')
                }}
                disabled={closeBusy}
                className="btn-secondary"
              >
                Keep my account
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

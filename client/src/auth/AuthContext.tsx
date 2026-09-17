import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api, ApiError } from '../lib/api'
import type { MePayload } from '../lib/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: MePayload | null
  loading: boolean
  pendingSecondStep: boolean | null
  recheckSecondStep: () => void
  refreshUser: () => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(): Promise<MePayload | null> {
  try {
    return await api.me()
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<MePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingSecondStep, setPendingSecondStep] = useState<boolean | null>(null)

  const refreshProfile = async () => {
    setProfile(await fetchProfile())
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if ((event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED') && nextSession) {
        void refreshProfile()
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setRetryTick(0)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  const checkSecondStep = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setPendingSecondStep(null)
      setProfile(null)
      return
    }
    try {
      setProfile(await api.me())
      setPendingSecondStep(false)
      setRetryTick(0)
    } catch (error) {
      setProfile(null)
      setPendingSecondStep(!(error instanceof ApiError && error.code === 'mfa_required'))
    }
  }, [])

  useEffect(() => {
    void checkSecondStep(session)
  }, [session, checkSecondStep])

  const [retryTick, setRetryTick] = useState(0)
  useEffect(() => {
    if (!session || pendingSecondStep !== true || retryTick >= 40) return
    const timer = setTimeout(() => {
      setRetryTick((tick) => tick + 1)
      void checkSecondStep(session)
    }, 3000)
    return () => clearTimeout(timer)
  }, [session, pendingSecondStep, retryTick, checkSecondStep])

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      pendingSecondStep,
      recheckSecondStep: () => {
        void checkSecondStep(session)
      },
      refreshUser: async () => {
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser(data.user)
        }
      },
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut()
      }
    }),
    [session, user, profile, loading, checkSecondStep]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}

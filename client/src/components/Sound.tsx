import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

type SoundId = 'send-success' | 'receive-success' | 'money-moves'

interface SoundContextValue {
  muted: boolean
  toggleMute: () => void
  play: (id: SoundId) => void
}

const SoundContext = createContext<SoundContextValue | null>(null)

function buildAudio(id: SoundId, ctx: AudioContext): () => void {
  if (ctx.state === 'suspended') void ctx.resume()
  const t = ctx.currentTime
  switch (id) {
    case 'send-success': {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, t)
      osc.frequency.setValueAtTime(659.25, t + 0.08)
      osc.frequency.setValueAtTime(783.99, t + 0.16)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.08, t + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      osc.connect(env).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.28)
      return () => {}
    }
    case 'receive-success': {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(392, t)
      osc.frequency.setValueAtTime(523.25, t + 0.1)
      osc.frequency.setValueAtTime(659.25, t + 0.2)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.07, t + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(env).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.35)
      return () => {}
    }
    case 'money-moves': {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(220, t)
      osc.frequency.exponentialRampToValueAtTime(440, t + 0.1)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.05, t + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      osc.connect(env).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.2)
      return () => {}
    }
  }
}

const SOUND_STORAGE_KEY = 'breeze-sounds'

function storedMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'on'
  } catch {
    return true
  }
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState<boolean>(() => storedMuted())
  const [ctxRef, setCtxRef] = useState<AudioContext | null>(null)

  useEffect(() => {
    try {
      const ctx = new AudioContext()
      setCtxRef(ctx)
    } catch {
    }
    return () => {
      ctxRef?.close()
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? 'off' : 'on')
      } catch {
      }
      return next
    })
  }, [])

  const play = useCallback(
    (id: SoundId) => {
      if (muted || !ctxRef) return
      buildAudio(id, ctxRef)()
    },
    [muted, ctxRef]
  )

  return (
    <SoundContext.Provider value={{ muted, toggleMute, play }}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSound() {
  const ctx = useContext(SoundContext)
  if (!ctx) throw new Error('useSound must be used inside SoundProvider')
  return ctx
}

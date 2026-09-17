import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X } from 'lucide-react'

export interface Toast {
  id: number
  title: string
  body: string
  tone: 'info' | 'success'
  onClick?: () => void
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++
      setToasts((previous) => [...previous.slice(-2), { ...toast, id }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 6000)
      )
    },
    [dismiss]
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = toast.tone === 'success' ? CheckCircle2 : Info
            const tone = toast.tone === 'success' ? 'text-emerald-500' : 'text-brand-600'
            const Wrapper = toast.onClick ? 'button' : 'div'
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                className="pointer-events-auto"
              >
                <Wrapper
                  onClick={toast.onClick ? () => toast.onClick?.() : undefined}
                  className={`card flex w-full items-start gap-3 p-4 text-left shadow-lg ${
                    toast.onClick ? 'cursor-pointer transition hover:shadow-xl' : ''
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{toast.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      dismiss(toast.id)
                    }}
                    className="rounded p-0.5 text-slate-400 transition hover:text-slate-600"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Wrapper>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

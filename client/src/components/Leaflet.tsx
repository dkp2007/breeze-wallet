import { useEffect, useRef } from 'react'

interface LeafProps {
  size?: number
  className?: string
}

const Leaf = ({ size = 24, className = '' }: LeafProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M4.86 5.14C5.54 3.7 7.22 3 8.82 3.2c1.65.21 2.88 1.36 3.06 3 .18 1.64-.79 3.19-2.2 3.78-.36.15-.74.02-1-.33-.26-.35-.52-.7-.52-1.09 0-.4.18-.77.52-1.09.26-.35.64-.48 1-.33 1.41.59 2.36 2.14 2.2 3.78-.18 1.64-1.41 2.79-3.06 3-1.6-.2-3.28-.87-3.96-2.3-.06-.12-.16-.18-.28-.18z"
      fill="currentColor"
    />
  </svg>
)

interface LeafletProps {
  visible: boolean
  onDismiss: () => void
}

export function Leaflet({ visible, onDismiss }: LeafletProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!visible) return
    const el = ref.current
    if (!el) return
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1.1) rotate(8deg)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0, offset: 1 }
      ],
      { duration: 1400, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
    )
    anim.onfinish = onDismiss
    return () => {}
  }, [visible, onDismiss])

  if (!visible) return null
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      style={{ top: '42%' }}
    >
      <Leaf
        size={160}
        className="drop-shadow-xl text-brand-500"
      />
    </div>
  )
}

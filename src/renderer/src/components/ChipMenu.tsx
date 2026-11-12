import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import './ChipMenu.css'

interface ChipMenuProps {
  icon: ReactNode
  label: string
  title?: string
  disabled?: boolean
  /** Highlights the chip when a non-default value is chosen. */
  active?: boolean
  /** Visual hint for a required, still empty choice. */
  required?: boolean
  /** Popover content; call `close` after a choice. */
  children: (close: () => void) => ReactNode
}

/** Compact chip that opens a small popover above the composer (replaces native selects). */
export function ChipMenu({ icon, label, title, disabled, active, required, children }: ChipMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="chip-menu" ref={ref}>
      <button
        type="button"
        className={`composer-chip ${active ? 'composer-chip-active' : ''} ${required ? 'composer-chip-required' : ''}`}
        disabled={disabled}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span className="composer-chip-label">{label}</span>
        <ChevronDown size={12} strokeWidth={1.75} className="composer-chip-caret" />
      </button>
      {open && (
        <div className="chip-menu-popover" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

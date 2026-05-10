import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { LabelColor } from '../types'

interface Props {
  color: LabelColor
  children: ReactNode
  className?: string
}

// 12 label colors render via the bg-label-X-bg / text-label-X-fg @theme
// tokens. The first 6 mirror the card palette so seeded labels look
// identical to before; the rest are label-only hues.
//
// Static lookup so Tailwind v4 JIT can scan the literal class names —
// dynamic `bg-label-${color}-bg` strings would NOT be picked up.
const COLOR_CLASSES: Record<LabelColor, string> = {
  blue:    'bg-label-blue-bg text-label-blue-fg',
  purple:  'bg-label-purple-bg text-label-purple-fg',
  pink:    'bg-label-pink-bg text-label-pink-fg',
  orange:  'bg-label-orange-bg text-label-orange-fg',
  green:   'bg-label-green-bg text-label-green-fg',
  yellow:  'bg-label-yellow-bg text-label-yellow-fg',
  teal:    'bg-label-teal-bg text-label-teal-fg',
  cyan:    'bg-label-cyan-bg text-label-cyan-fg',
  red:     'bg-label-red-bg text-label-red-fg',
  lime:    'bg-label-lime-bg text-label-lime-fg',
  slate:   'bg-label-slate-bg text-label-slate-fg',
  fuchsia: 'bg-label-fuchsia-bg text-label-fuchsia-fg',
}

// Soft pill for #tag / label rendering. Color required (Label.color is
// SQL NOT NULL).
export function TagPill({ color, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        COLOR_CLASSES[color],
        className
      )}
    >
      {children}
    </span>
  )
}

import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { CardColor } from '../types'

interface Props {
  color: CardColor
  children: ReactNode
  className?: string
}

// Label palette is intentionally distinct from the card palette (which uses
// the bg-card-X-bg / text-card-X-fg @theme tokens). Pills use lighter
// Tailwind -50/-700 stops so a label always sits visually on top of any
// card background — no risk of a "blue label on blue card" disappearing.
// Both palettes share the same 6 color names (CardColor enum) for API
// simplicity; they differ only in rendered class strings.
//
// Static lookup so Tailwind v4 JIT can scan the literal class names —
// dynamic `bg-${color}-50` strings would NOT be picked up.
const COLOR_CLASSES: Record<CardColor, string> = {
  blue:   'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  pink:   'bg-pink-50 text-pink-700',
  orange: 'bg-orange-50 text-orange-700',
  green:  'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
}

// Soft pill for #tag / label rendering. Color required (Label.color is
// SQL NOT NULL); see palette comment above for the dual-track design.
export function TagPill({ color, children, className }: Props) {
  return (
    <span
      className={cn(
        // Rounded pill + compact padding + small bold text, matching the
        // #tag rhythm in the design reference; inline-flex lets parent
        // layouts wrap and place icons inline.
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        COLOR_CLASSES[color],
        className
      )}
    >
      {children}
    </span>
  )
}

import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { CardColor } from '../types'

interface Props {
  color: CardColor
  children: ReactNode
  className?: string
}

// Static class lookup so Tailwind v4 JIT can scan the literal class names.
// Dynamic strings like `bg-card-${color}-bg` are NOT picked up by the
// scanner, so we list every variant explicitly.
const COLOR_CLASSES: Record<CardColor, string> = {
  blue:   'bg-card-blue-bg text-card-blue-fg',
  purple: 'bg-card-purple-bg text-card-purple-fg',
  pink:   'bg-card-pink-bg text-card-pink-fg',
  orange: 'bg-card-orange-bg text-card-orange-fg',
  green:  'bg-card-green-bg text-card-green-fg',
  yellow: 'bg-card-yellow-bg text-card-yellow-fg',
}

// Soft pastel pill for #tag / label rendering. Reuses the 6-color card
// palette so pills feel native to whichever card they sit on. Same-color
// collision (blue pill on blue card) is an accepted ~1/6 edge case;
// distinct typography weight + rounded shape preserve enough visual
// boundary even when bg blends.
export function TagPill({ color, children, className }: Props) {
  return (
    <span
      className={cn(
        // 圆角药丸 + 紧凑 padding + 小号粗体,跟设计参考 #tag 节奏一致;
        // inline-flex 让父级排版能 wrap、能跟 icon 并排
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        COLOR_CLASSES[color],
        className
      )}
    >
      {children}
    </span>
  )
}

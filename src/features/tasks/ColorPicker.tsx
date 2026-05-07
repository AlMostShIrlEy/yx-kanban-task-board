import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CARD_COLORS } from '../../types'
import type { CardColor } from '../../types'

interface Props {
  value: CardColor | null
  onChange: (color: CardColor | null) => void
}

// Static class lookup so Tailwind v4 JIT picks up every literal.
// 6 swatches use card palette so the picker visual = real card preview.
const SWATCH_BG: Record<CardColor, string> = {
  blue:   'bg-card-blue-bg',
  purple: 'bg-card-purple-bg',
  pink:   'bg-card-pink-bg',
  orange: 'bg-card-orange-bg',
  green:  'bg-card-green-bg',
  yellow: 'bg-card-yellow-bg',
}

// Color picker — 6 pastel swatches + 1 "Auto" tile (null value).
// Auto tile uses neutral slate-100 + Sparkles icon to signal "system
// picks based on task hash". No live preview because new tasks don't
// have an id at creation time (and hashing on each render is wasteful).
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Card color" className="flex gap-2">
      {CARD_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn(
            // Circular swatch + ring on selected state; hover shows a
            // light preview ring.
            'h-8 w-8 rounded-full transition-shadow',
            SWATCH_BG[color],
            value === color
              ? 'ring-2 ring-offset-2 ring-slate-900'
              : 'hover:ring-2 hover:ring-slate-300'
          )}
        />
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label="Auto"
        title="Auto color (system picks based on task ID)"
        onClick={() => onChange(null)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 transition-shadow',
          value === null
            ? 'ring-2 ring-offset-2 ring-slate-900'
            : 'hover:ring-2 hover:ring-slate-300'
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
      </button>
    </div>
  )
}

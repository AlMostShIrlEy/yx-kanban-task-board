import { cn } from '../lib/cn'

interface Props {
  userId: string
  size?: 'sm' | 'md'
  className?: string
}

// 6-color avatar palette, deliberately distinct from the card palette.
// Pills already use card colors; if avatars also pulled from the same
// palette, 1/6 of avatars would visually merge into their card.
// `-200 bg + -900 fg` gives uniform pastel saturation across all 6 hues,
// matching the soft premium feel of the rest of the design system.
//
// Static lookup so Tailwind v4 JIT can scan every literal class name —
// dynamic strings like `bg-${color}-200` would NOT be detected.
const AVATAR_COLORS = [
  'rose',
  'sky',
  'emerald',
  'violet',
  'amber',
  'teal',
] as const
type AvatarColor = (typeof AVATAR_COLORS)[number]

const COLOR_CLASSES: Record<AvatarColor, string> = {
  rose:    'bg-rose-200 text-rose-900',
  sky:     'bg-sky-200 text-sky-900',
  emerald: 'bg-emerald-200 text-emerald-900',
  violet:  'bg-violet-200 text-violet-900',
  amber:   'bg-amber-200 text-amber-900',
  teal:    'bg-teal-200 text-teal-900',
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-8 w-8 text-xs',     // 32px, used in TaskCard footer
  md: 'h-10 w-10 text-sm',   // 40px, reserved for headers / emphasis spots
}

// Pick a stable color for a given userId. UUIDs are random so the first
// byte (00–FF) mod 6 distributes evenly across the 6 colors. Same user
// → same color forever, no DB lookup needed.
function pickColor(userId: string): AvatarColor {
  const byte = parseInt(userId.slice(0, 2), 16)
  // NaN guard: malformed userId falls back to the first color rather
  // than throwing during render.
  const idx = Number.isNaN(byte) ? 0 : byte % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// Single-user avatar: colored circle showing the first 2 hex chars of
// userId (uppercase). Deterministic color per userId means the same
// guest always renders identically across views and sessions.
export function AvatarBubble({ userId, size = 'sm', className }: Props) {
  const initials = userId.slice(0, 2).toUpperCase()
  const color = pickColor(userId)

  return (
    <div
      className={cn(
        // Circle + centered text + bold; differentiation comes from bg,
        // no border needed.
        'inline-flex items-center justify-center rounded-full font-semibold',
        SIZE_CLASSES[size],
        COLOR_CLASSES[color],
        className
      )}
      // The 2-char hex has no semantic value; aria-label / title tell
      // assistive tech this is a user avatar, not a decorative badge.
      aria-label={`Guest user ${initials}`}
      title={`Guest ${initials}`}
    >
      {initials}
    </div>
  )
}

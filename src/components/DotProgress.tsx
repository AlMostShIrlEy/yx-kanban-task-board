import { cn } from '../lib/cn'

interface Props {
  progress: number               // 0-100; values outside the range get clamped
  total?: number                 // total dot count, default 12 (CLAUDE.md range 10-15)
  className?: string
  filledClassName?: string       // visual customisation for the filled portion
  unfilledClassName?: string     // ... and the faded remainder
}

// Dotted progress bar — signature element from the design reference.
// A row of small circles, the leading `progress%` filled and the rest
// faded. Currently NOT rendered by TaskCard (we have no real progress
// source — see PLAN.md §8 / Phase 2 decisions). Atomic stays available
// for future use (e.g., when a progress field gets added to the schema).
export function DotProgress({
  progress,
  total = 12,
  className,
  filledClassName = 'bg-slate-700',
  unfilledClassName = 'bg-slate-200',
}: Props) {
  // Clamp 0-100 to handle bad input safely;
  // round to the nearest dot for a clean visual.
  const clamped = Math.max(0, Math.min(100, progress))
  const filledCount = Math.round((clamped / 100) * total)

  return (
    <div
      // gap-1 = 4px 圆点间距,跟 w-2/h-2 (8px) 直径配比看起来均匀
      className={cn('flex items-center gap-1', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            // 8px 正圆点(w-2 h-2 + rounded-full),CLAUDE.md 指定尺寸
            'h-2 w-2 rounded-full',
            i < filledCount ? filledClassName : unfilledClassName
          )}
        />
      ))}
    </div>
  )
}

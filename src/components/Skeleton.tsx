import { cn } from '../lib/cn'

interface Props {
  className?: string
}

// Atomic skeleton primitive. Caller controls shape entirely via className
// (e.g., `h-12 w-full rounded-2xl` for a card; `h-8 w-8 rounded-full` for
// an avatar). Domain-specific compositions like TaskCardSkeleton live in
// the relevant features/ folder so they can stay in lockstep with the
// real component's layout.
export function Skeleton({ className }: Props) {
  return (
    // animate-pulse adds a soft breathing effect; bg-slate-200/70 is
    // semi-transparent so it stays visually soft on both light and
    // dark cards without becoming harsh.
    <div className={cn('animate-pulse bg-slate-200/70', className)} />
  )
}

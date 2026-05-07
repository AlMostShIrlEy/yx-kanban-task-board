import { Skeleton } from '../../components/Skeleton'
import { cn } from '../../lib/cn'

interface Props {
  className?: string
}

// TaskCardSkeleton — placeholder matching TaskCard's 5-layer anatomy.
// Same outer dimensions (rounded-2xl + p-4 + shadow-sm) so layout
// doesn't shift when real cards swap in. Neutral bg-slate-100 lets it
// feel "scaffolded" rather than competing with the real pastel cards.
//
// ⚠️ Keep in sync with TaskCard's layout — if you change TaskCard's
// padding / spacing / row structure, update the corresponding rows here.
export function TaskCardSkeleton({ className }: Props) {
  return (
    <div
      className={cn('rounded-2xl bg-slate-100 p-4 shadow-sm', className)}
      aria-hidden="true"
    >
      {/* Pills row — 2 pill-shape placeholders (mimicking the typical
          card with 1-2 labels). */}
      <div className="mb-3 flex gap-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>

      {/* Title — 2 short bars, mimicking the "title takes 1-2 lines"
          common case. */}
      <Skeleton className="h-4 w-4/5 rounded" />
      <Skeleton className="mt-1.5 h-4 w-3/5 rounded" />

      {/* Note — single full-width bar, mimicking the typical 1-2
          sentence note (some cards have notes, some don't; we render
          one by default). */}
      <Skeleton className="mt-3 h-3 w-full rounded" />

      {/* Footer — avatar (8x8 circle) on the left, 2 chips on the right
          (due-date pill + label-count pill). */}
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      </div>
    </div>
  )
}

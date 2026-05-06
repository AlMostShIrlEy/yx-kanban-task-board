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
      {/* Pills 行 — 2 个 pill-shape 占位(模拟典型卡片有 1-2 个 label) */}
      <div className="mb-3 flex gap-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>

      {/* Title — 2 行短条,模拟"标题占 1-2 行"的真实形态 */}
      <Skeleton className="h-4 w-4/5 rounded" />
      <Skeleton className="mt-1.5 h-4 w-3/5 rounded" />

      {/* Note — 单行长条,模拟典型 1-2 句的 note(部分卡有 note,这里默认渲染) */}
      <Skeleton className="mt-3 h-3 w-full rounded" />

      {/* Footer — 左 avatar(8x8 圆),右 2 个 chip(due-date pill + label-count pill) */}
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

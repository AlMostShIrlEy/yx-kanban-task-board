import { Inbox } from 'lucide-react'

// Empty-column placeholder. Dashed border + muted text + downweighted
// icon signals "intentional empty space" without competing with real
// task cards' pastel weight.
//
// icon 色用 text-slate-300(比文字 text-slate-400 还浅一档)。
// icon 视觉重量天然大于同号字,降权才不抢戏。
// padding py-6(不是 py-8)给 icon 留垂直空间但不让占位过高。
export function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center">
      <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" aria-hidden="true" />
      <p className="text-sm text-slate-400">No tasks yet</p>
    </div>
  )
}

import { Inbox } from 'lucide-react'

// Empty-column placeholder. Dashed border + muted text + downweighted
// icon signals "intentional empty space" without competing with real
// task cards' pastel weight.
//
// Icon uses text-slate-300 (one shade lighter than the text-slate-400
// caption). Icons carry more visual weight than text at the same shade,
// so the icon needs to be downweighted to avoid stealing focus.
// padding py-6 (not py-8) leaves vertical room for the icon without
// making the placeholder too tall.
export function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center">
      <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" aria-hidden="true" />
      <p className="text-sm text-slate-400">No tasks yet</p>
    </div>
  )
}

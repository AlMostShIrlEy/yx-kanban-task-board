import type { ReactNode } from 'react'
import { CheckSquare } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { AvatarBubble } from '../../components/AvatarBubble'

interface Props {
  taskCount: number
  user: User
  children: ReactNode  // widget slot — currently <StatsWidget />, future: LabelManager etc.
}

// Fixed-width left sidebar (240px / w-60). Premium SaaS pattern (Linear,
// Notion). Light theme only — bg-white + shadow on a slate-50 page bg
// gives the visual layering the design reference calls for.
//
// Vertical layout (top → bottom):
//   1. Brand area  — logo + app name, ~60px tall
//   2. Nav area    — currently a single decorative "Tasks" item;
//                    future router items plug in here without changing
//                    structure
//   3. Stats slot  — children area; flex-1 + scroll so widgets can grow
//                    without pushing the user card off-screen
//   4. User card   — avatar + "Guest [hex]" pinned at the bottom
export function Sidebar({ taskCount, user, children }: Props) {
  const shortId = user.id.slice(0, 8)

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-white shadow-sm">
      {/* Brand area — gradient-bg logo tile + app name. */}
      <div className="flex items-center gap-2 p-4">
        <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 p-1.5">
          <CheckSquare className="h-7 w-7 text-white" aria-hidden="true" />
        </div>
        <span className="text-base font-semibold text-slate-900">Kanban</span>
      </div>

      {/* Nav area — only "Tasks" for now (the only view that exists in
          MVP). Decoratively rendered as the active item; not clickable
          (cursor-default makes that obvious). border-l-4 + bg-slate-100
          + text-slate-900 = the active style; future router items here
          will use unstyled / hover variants for inactive state. */}
      <nav className="px-3 pb-3">
        <div
          className="flex cursor-default items-center gap-3 rounded-lg border-l-4 border-slate-900 bg-slate-100 px-4 py-2.5 text-slate-900"
          aria-current="page"
        >
          <CheckSquare className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Tasks</span>
          <span className="ml-auto text-sm tabular-nums text-slate-500">
            {taskCount}
          </span>
        </div>
        {/* Future nav items go here (Activities / Schedule / Note etc.).
            Intentionally NOT rendered as placeholders — empty nav links
            look like broken affordances. Add them when they have real
            routes (PLAN.md §10 sidebar backlog item). */}
      </nav>

      {/* Stats slot — flex-1 + scroll so widgets grow without pushing
          the user card. border-t separates from nav. */}
      <div className="flex-1 overflow-y-auto border-t border-slate-100 px-4 py-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Stats
        </p>
        {children}
      </div>

      {/* User card — avatar + 2-line text block (Guest + short id).
          border-t separates from stats. min-w-0 + flex-1 lets the id
          truncate gracefully if the layout ever shrinks. */}
      <div className="flex items-center gap-3 border-t border-slate-100 p-3">
        <AvatarBubble userId={user.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">Guest</p>
          <p className="font-mono text-xs text-slate-500">{shortId}</p>
        </div>
      </div>
    </aside>
  )
}

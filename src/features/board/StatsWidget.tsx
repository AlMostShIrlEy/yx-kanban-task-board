import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTasks } from '../tasks/hooks/useTasks'
import { cn } from '../../lib/cn'
import type { Task } from '../../types'

export interface Stats {
  total: number
  done: number
  completionPct: number | null  // null when total === 0 (avoids 0/0 NaN + misleading 0%)
  overdue: number
  inProgress: number
  highPriority: number
  normalPriority: number
  lowPriority: number
  dueThisWeek: number
  dueThisMonth: number
}

// "Today + N days" as YYYY-MM-DD in LOCAL timezone — same algorithm as
// DueDateBadge's daysUntil. Postgres `date` columns are timezone-naive,
// so comparing in local time matches the user's mental model of "today".
// Default offset 0 = today.
function localDateIso(daysOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Pure stats computation — single pass over tasks, O(N).
// Exported so it can be unit-tested or reused without rendering.
//
// Counting rules:
//   - Priority counts EXCLUDE done (done isn't "work to do"; including
//     it inflates "I have 5 high priority" when most are already done).
//   - Due-date windows (week / month) INCLUDE overdue and EXCLUDE done.
//     Overdue items still need attention "this week"; done items don't.
//   - completionPct is null when total = 0 to avoid 0/0 = NaN; the UI
//     renders "—" instead of "0%" (a 0-task board isn't 0% complete,
//     it's undefined).
export function computeStats(tasks: Task[]): Stats {
  const today = localDateIso()
  const weekFromNow = localDateIso(7)
  const monthFromNow = localDateIso(30)

  let done = 0
  let overdue = 0
  let inProgress = 0
  let highPriority = 0
  let normalPriority = 0
  let lowPriority = 0
  let dueThisWeek = 0
  let dueThisMonth = 0

  for (const task of tasks) {
    const isDone = task.status === 'done'
    if (isDone) done++
    if (task.status === 'in_progress') inProgress++

    if (!isDone) {
      if (task.priority === 'high') highPriority++
      else if (task.priority === 'normal') normalPriority++
      else if (task.priority === 'low') lowPriority++
    }

    if (task.due_date && !isDone) {
      if (task.due_date < today) overdue++
      if (task.due_date <= weekFromNow) dueThisWeek++
      if (task.due_date <= monthFromNow) dueThisMonth++
    }
  }

  const total = tasks.length
  const completionPct = total === 0 ? null : Math.round((done / total) * 100)

  return {
    total,
    done,
    completionPct,
    overdue,
    inProgress,
    highPriority,
    normalPriority,
    lowPriority,
    dueThisWeek,
    dueThisMonth,
  }
}

// Single row: label on left, number on right, tabular-nums for clean
// vertical alignment of digits across rows.
function StatRow({
  label,
  value,
  highlight,
}: {
  label: ReactNode
  value: ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          highlight ? 'font-semibold text-red-600' : 'text-slate-900'
        )}
      >
        {value}
      </span>
    </div>
  )
}

// Group sub-header — uppercase tiny label that anchors each metric group.
// Optional `subtitle` clarifies counting rules (e.g., "Active tasks only"
// for PRIORITY / DUE DATE which exclude done; OVERVIEW doesn't need it
// since Total + Done make the math self-evident).
function GroupHeader({
  children,
  subtitle,
}: {
  children: ReactNode
  subtitle?: string
}) {
  return (
    <div className="mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {children}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[10px] text-slate-400">{subtitle}</p>
      )}
    </div>
  )
}

// Stats widget rendered inside the Sidebar children slot. Three groups:
// Overview / Priority / Due date. Numbers reactively update from
// useTasks state via useMemo'd computeStats.
export function StatsWidget() {
  const { tasks } = useTasks()
  const stats = useMemo(() => computeStats(tasks), [tasks])

  // Done row: "5 (42%)" when there are tasks, "0 (—)" when total = 0.
  const doneLabel =
    stats.completionPct === null
      ? `${stats.done} (—)`
      : `${stats.done} (${stats.completionPct}%)`

  return (
    <div className="space-y-5">
      <div>
        <GroupHeader>Overview</GroupHeader>
        <div className="space-y-1.5">
          <StatRow label="Total" value={stats.total} />
          <StatRow label="Done" value={doneLabel} />
          <StatRow label="Overdue" value={stats.overdue} highlight />
          <StatRow label="In progress" value={stats.inProgress} />
        </div>
      </div>

      <div>
        <GroupHeader subtitle="Active tasks only">Priority</GroupHeader>
        <div className="space-y-1.5">
          <StatRow
            label={
              <>
                <span className="mr-1">🔥</span>High
              </>
            }
            value={stats.highPriority}
          />
          <StatRow label="Normal" value={stats.normalPriority} />
          <StatRow
            label={
              <>
                <span className="mr-1">💤</span>Low
              </>
            }
            value={stats.lowPriority}
          />
        </div>
      </div>

      <div>
        <GroupHeader subtitle="Active tasks only">Due date</GroupHeader>
        <div className="space-y-1.5">
          <StatRow label="This week" value={stats.dueThisWeek} />
          <StatRow label="This month" value={stats.dueThisMonth} />
        </div>
      </div>
    </div>
  )
}

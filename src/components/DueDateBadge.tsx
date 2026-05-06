import { Calendar } from 'lucide-react'
import { cn } from '../lib/cn'

interface Props {
  dueDate: string // ISO YYYY-MM-DD; caller should not pass null (gate above)
  className?: string
}

type Severity = 'overdue' | 'today' | 'soon' | 'normal'

// Tailwind defaults only — no hardcoded hex per CLAUDE.md hard rule.
// `text-X-700 bg-X-50` is the canonical "soft severity" pattern.
const SEVERITY_CLASSES: Record<Severity, string> = {
  overdue: 'bg-red-50 text-red-700',
  today:   'bg-red-50 text-red-700',
  soon:    'bg-amber-50 text-amber-700',
  normal:  'bg-slate-100 text-slate-600',
}

// Calendar-day arithmetic in the user's LOCAL timezone. Postgres `date`
// columns are timezone-naive (just YYYY-MM-DD), so comparing in local
// time matches the user's mental model of "today" rather than UTC —
// avoids "in 1 day" suddenly becoming "today" at midnight UTC.
function daysUntil(dueIso: string): number {
  // Manual parse: `new Date('2026-05-06')` parses as UTC midnight, which
  // shifts by the local tz offset. Splitting and using new Date(y,m,d)
  // creates a local-midnight Date instead.
  const [y, m, d] = dueIso.slice(0, 10).split('-').map(Number)
  const due = new Date(y, m - 1, d).getTime()

  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()

  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

function classify(diff: number): Severity {
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'         // escalated red — same-day deadlines feel like overdue
  if (diff <= 2) return 'soon'           // 1-2 days = amber warning band
  return 'normal'                         // >2 days = neutral
}

// Cached formatter — avoid recreating Intl.DateTimeFormat on every render.
// Locale = undefined → use the browser's default locale ("Mar 15" / "15 mars" etc).
const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

function formatLabel(dueIso: string, diff: number): string {
  if (diff < 0) {
    const days = Math.abs(diff)
    return `${days} day${days === 1 ? '' : 's'} overdue`
  }
  if (diff === 0) return 'Due today'
  if (diff <= 7) return `in ${diff} day${diff === 1 ? '' : 's'}`
  // > 7 days out → absolute date is more useful than "in 14 days" for
  // calendar-marking. Format using the cached Intl formatter.
  const [y, m, d] = dueIso.slice(0, 10).split('-').map(Number)
  return ABSOLUTE_FORMATTER.format(new Date(y, m - 1, d))
}

// Due-date badge with severity-coded color + leading calendar icon.
// 4 severity levels: overdue (red), due today (red, escalated wording),
// due in ≤2 days (amber), else neutral. Threshold matches PLAN.md §4.
export function DueDateBadge({ dueDate, className }: Props) {
  const diff = daysUntil(dueDate)
  const severity = classify(diff)
  const label = formatLabel(dueDate, diff)

  return (
    <span
      className={cn(
        // 紧凑 inline-flex + 小号 + 圆角药丸 + leading icon 增加视觉锚点
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        SEVERITY_CLASSES[severity],
        className
      )}
    >
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}

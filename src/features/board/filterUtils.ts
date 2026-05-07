import type { Priority, Task } from '../../types'

export type DueRange = 'all' | 'overdue' | 'week' | 'month'

export interface Filters {
  priorities: Priority[]    // multi-select
  labelIds: string[]        // multi-select
  dueRange: DueRange        // single-select
}

export const EMPTY_FILTERS: Filters = {
  priorities: [],
  labelIds: [],
  dueRange: 'all',
}

// Local-timezone day arithmetic, same convention as DueDateBadge and
// StatsWidget. Postgres `date` columns are timezone-naive, so comparing
// in local time matches the user's mental model of "today".
function matchesDueRange(
  task: Task,
  range: Exclude<DueRange, 'all'>
): boolean {
  if (!task.due_date) return false
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const [y, m, d] = task.due_date.slice(0, 10).split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (range === 'overdue') return diffDays < 0
  // 'week' / 'month' include overdue (a card past its due date still
  // needs attention "this week" — same rule as Stats counting).
  if (range === 'week') return diffDays <= 7
  if (range === 'month') return diffDays <= 30
  return false
}

// Pure filter + search composition. Search and the three filter
// dimensions are AND'd together; within `priorities` or `labelIds`,
// any match passes (OR within a dimension).
export function applyFiltersAndSearch(
  tasks: Task[],
  search: string,
  filters: Filters
): Task[] {
  let result = tasks

  if (search.trim()) {
    // Search matches title + description + label name (case-insensitive).
    // Leading "#" is stripped so users can type either "#design" or
    // "design" — both should find tasks tagged with the "design" label.
    const q = search.trim().toLowerCase().replace(/^#/, '')
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        t.labels.some((l) => l.name.toLowerCase().includes(q))
    )
  }

  if (filters.priorities.length > 0) {
    result = result.filter((t) => filters.priorities.includes(t.priority))
  }

  if (filters.labelIds.length > 0) {
    const wantedSet = new Set(filters.labelIds)
    result = result.filter((t) => t.labels.some((l) => wantedSet.has(l.id)))
  }

  if (filters.dueRange !== 'all') {
    // Hoist the narrowed value to a const — TS doesn't carry property
    // narrowing (`filters.dueRange !== 'all'`) into closures, since the
    // object could in theory be mutated before the callback runs.
    const range = filters.dueRange
    result = result.filter((t) => matchesDueRange(t, range))
  }

  return result
}

// Numeric badge for the Filter button — counts only filter dimensions
// (NOT search). Search activity is signaled by the input itself; the
// Filter button counter advertises how many filter facets are set.
export function activeFilterCount(filters: Filters): number {
  return (
    filters.priorities.length +
    filters.labelIds.length +
    (filters.dueRange !== 'all' ? 1 : 0)
  )
}

import type { ReactNode } from 'react'
import { TagPill } from '../../components/TagPill'
import { useTasks } from '../tasks/hooks/useTasks'
import { cn } from '../../lib/cn'
import { PRIORITIES } from '../../types'
import type { Priority } from '../../types'
import type { DueRange, Filters } from './filterUtils'

interface Props {
  filters: Filters
  onChange: (next: Filters) => void
}

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

const DUE_OPTIONS: Array<{ value: DueRange; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Due in 7 days' },
  { value: 'month', label: 'Due in 30 days' },
]

// Toggle/radio chip — single styling source for Priority + Due date sections.
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      )}
    >
      {children}
    </button>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </p>
  )
}

// Filter popover — uses native HTML5 popover API. The button
// (in App's header) uses popoverTarget="filter-popover" to toggle this
// element. Browser handles:
//   - light dismiss (click outside closes)
//   - ESC to close
//   - focus management (focus enters popover, returns to opener)
//   - top-layer rendering (escapes any overflow:hidden ancestor)
//
// Positioning: native popover defaults to viewport-centered via
// inset:0 + margin:auto, but Tailwind preflight zeroes margin so we
// override with explicit fixed positioning at top-right of viewport
// (approximating the Filter button location in the header). True
// anchor-to-button positioning would need CSS Anchor Positioning
// (Chrome 125+ / Safari 17.4+, Firefox shipping later) — adopt that
// when support is universal.
//
// The inner JSX is decoupled from the outer popover element: if the
// native popover API needs to be replaced (compatibility, animation,
// etc.) the section components inside don't change.
export function FilterPopover({ filters, onChange }: Props) {
  const { labels } = useTasks()
  const hasActive =
    filters.priorities.length > 0 ||
    filters.labelIds.length > 0 ||
    filters.dueRange !== 'all'

  const togglePriority = (p: Priority) =>
    onChange({
      ...filters,
      priorities: filters.priorities.includes(p)
        ? filters.priorities.filter((x) => x !== p)
        : [...filters.priorities, p],
    })

  const toggleLabel = (id: string) =>
    onChange({
      ...filters,
      labelIds: filters.labelIds.includes(id)
        ? filters.labelIds.filter((x) => x !== id)
        : [...filters.labelIds, id],
    })

  const setDueRange = (range: DueRange) =>
    onChange({ ...filters, dueRange: range })

  const clearAll = () =>
    onChange({ priorities: [], labelIds: [], dueRange: 'all' })

  return (
    <div
      id="filter-popover"
      popover="auto"
      // top-[4.5rem] approximates the header height (px-6 py-4 + content);
      // right-6 matches the header's px-6 alignment so the popover sits
      // under the Filter button. inset-auto resets UA defaults so our
      // top/right take effect; m-0 overrides Tailwind preflight margin.
      className="fixed inset-auto top-[4.5rem] right-6 m-0 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div className="space-y-4">
        <div>
          <SectionHeader>Priority</SectionHeader>
          <div className="flex gap-2">
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                active={filters.priorities.includes(p)}
                onClick={() => togglePriority(p)}
              >
                {PRIORITY_LABELS[p]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader>Labels</SectionHeader>
          {labels.length === 0 ? (
            <p className="text-xs text-slate-400">No labels yet</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {labels.map((label) => {
                const isSelected = filters.labelIds.includes(label.id)
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => toggleLabel(label.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'rounded-full transition-opacity',
                      isSelected
                        ? 'opacity-100'
                        : 'opacity-40 hover:opacity-70'
                    )}
                  >
                    <TagPill color={label.color}>#{label.name}</TagPill>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <SectionHeader>Due date</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {DUE_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                active={filters.dueRange === opt.value}
                onClick={() => setDueRange(opt.value)}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>

        {hasActive && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-slate-500 transition-colors hover:text-slate-700"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

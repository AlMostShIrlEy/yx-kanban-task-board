import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { SortableTaskCard } from './SortableTaskCard'
import { TaskCardSkeleton } from '../tasks/TaskCardSkeleton'
import { EmptyState } from './EmptyState'
import { cn } from '../../lib/cn'
import type { Status, Task } from '../../types'

interface Props {
  status: Status
  tasks: Task[]                            // already filtered to this status by parent
  loading?: boolean
  hasActiveFilters?: boolean               // search OR filter is active → EmptyState differentiates copy
  onAddTask?: (status: Status) => void     // omit → no + button (Step 5 wires this)
  onEditClick?: (taskId: string) => void   // pass-through to SortableTaskCard → TaskCard
}

// Display labels for the 4 statuses. Centralised so renaming a column
// only touches this file, not every caller.
const STATUS_LABELS: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

// 3 skeletons per column during initial load — looks "populated, almost
// ready" without being so dense that brief loads (< 500ms) flicker.
const SKELETON_COUNT = 3

// Single Kanban column: header (title + count + optional add button)
// + body (skeletons / EmptyState / SortableTaskCards by position).
//
// dnd-kit roles:
//   - Column itself = useDroppable (id `column-{status}`) — handles
//     drops onto empty columns OR column blank space below cards
//   - SortableContext wraps the card list — handles within-column
//     reorder visuals (gap-closing animation while dragging)
// EmptyState is purely visual; the Column's droppable is what actually
// receives drops to empty columns.
export function Column({
  status,
  tasks,
  loading,
  hasActiveFilters,
  onAddTask,
  onEditClick,
}: Props) {
  // Sort by position ASC (LexoRank-lite). Don't mutate the input —
  // it's parent state, mutating would break React change detection.
  const sorted = [...tasks].sort((a, b) => a.position - b.position)
  const taskIds = sorted.map((t) => t.id)

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl transition-all duration-150',
        // bg + ring combo (per Step 6 #7 align): area feel (soft bg) +
        // boundary feel (subtle ring), the standard Linear pattern when
        // dragging an issue to a different project. ring uses box-shadow
        // under the hood → doesn't affect layout, doesn't conflict with
        // cards.
        isOver && 'bg-slate-100/50 ring-2 ring-slate-300/50'
      )}
    >
      {/* Header — px-1 inset visually aligns with card p-4; mb-3 matches
          the gap-3 between cards in the body */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {STATUS_LABELS[status]}
          </h2>
          {/* Count is only shown when data is ready; showing "0" during
              loading would mislead. */}
          {!loading && (
            <span className="text-sm text-slate-400">{tasks.length}</span>
          )}
        </div>
        {/* + button: only rendered when onAddTask is passed. Step 4 doesn't
            pass it → button hidden, avoiding a "broken affordance". Step 5
            wires it up via TaskModal. */}
        {onAddTask && (
          <button
            type="button"
            onClick={() => onAddTask(status)}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Add task to ${STATUS_LABELS[status]}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body — three states: loading → skeletons / empty → EmptyState /
          has data → sortable cards */}
      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <TaskCardSkeleton key={i} />
          ))
        ) : sorted.length === 0 ? (
          <EmptyState filtered={hasActiveFilters} />
        ) : (
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {sorted.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onEditClick={onEditClick}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
}

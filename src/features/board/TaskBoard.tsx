import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTasks } from '../tasks/hooks/useTasks'
import { TaskCard } from '../tasks/TaskCard'
import { Column } from './Column'
import { resolveDropTarget } from './dragHelpers'
import { STATUSES } from '../../types'
import type { Status, Task } from '../../types'

interface Props {
  onAddTask?: (status: Status) => void
  onEditClick?: (taskId: string) => void
}

// Fallback UI when the initial fetch fails. useTasks doesn't expose a
// `refetch()` callback yet; full page reload is the simplest escape hatch.
function BoardError({ error }: { error: Error }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        Couldn&apos;t load your board
      </h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{error.message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
      >
        Reload
      </button>
    </div>
  )
}

// 4-column Kanban board with dnd-kit. Each Column is a droppable AND
// wraps its cards in a SortableContext (within-column reorder visuals).
// SortableTaskCard wraps TaskCard with dnd listeners. DragOverlay
// portal-renders the "ghost" card following the cursor.
//
// Persistence:
//   - During drag: dnd-kit handles all visual state (transforms on
//     non-dragged cards in the source SortableContext + DragOverlay).
//     Tasks state untouched.
//   - On drop: onDragEnd computes (toStatus, toPosition) via
//     resolveDropTarget + computeNewPosition (LexoRank-lite midpoint),
//     then calls useTasks.moveTask once. The optimistic helper inside
//     useTasks reverts + toasts on failure — DnD layer needs no extra
//     error handling.
export function TaskBoard({ onAddTask, onEditClick }: Props) {
  const { tasks, loading, error, moveTask } = useTasks()
  // activeTask drives the DragOverlay rendering. null = no drag in progress.
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  // PointerSensor distance:8 — clicks (no movement) don't trigger drag,
  // letting TaskCard's ⋯ button + future inline edits stay clickable.
  // (We also stop pointerdown on those elements as defense in depth.)
  // KeyboardSensor: Tab + Space + Arrow keys = a11y for keyboard users.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  if (error) return <BoardError error={error} />

  // Group tasks by status. O(N × 4); pre-init each bucket so STATUSES.map
  // below never hits undefined.
  const tasksByStatus: Record<Status, Task[]> = {
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  }
  for (const task of tasks) {
    tasksByStatus[task.status].push(task)
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return // dropped outside any droppable

    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask) return

    // dnd-kit attaches sortable metadata on `over.data.current.sortable`
    // when the over target is a sortable item. `index` reflects the
    // OVER item's position in its SortableContext.items array — which
    // already accounts for the in-progress visual reorder dnd-kit
    // applies during drag. Using this index keeps drop position
    // matching the visual placeholder the user sees.
    //
    // Earlier attempt: derive direction from rect centers ourselves.
    // That was a second independent algorithm fighting dnd-kit's
    // internal one → visual-vs-actual mismatch. Trusting dnd-kit fixes it.
    //
    // Type assertion: dnd-kit types `over.data.current` loosely; we
    // narrow via a known shape.
    const overSortableIndex = (
      over.data.current as { sortable?: { index: number } } | undefined
    )?.sortable?.index

    const resolution = resolveDropTarget({
      overId: String(over.id),
      activeTask,
      allTasks: tasks,
      overSortableIndex,
    })
    if (!resolution) return // no-op (drop on self, unknown target, etc.)

    // Skip if dropping in the same place — avoids a network round-trip
    // and a needless updated_at bump.
    if (
      resolution.toStatus === activeTask.status &&
      resolution.toPosition === activeTask.position
    ) {
      return
    }

    // moveTask is optimistic: local state reflects the change immediately;
    // on failure, the useTasks helper auto-reverts and surfaces a toast.
    // The DnD layer needs no extra error handling.
    void moveTask(activeTask.id, resolution.toStatus, resolution.toPosition)
  }

  function handleDragCancel() {
    setActiveTask(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full gap-6 overflow-x-auto pb-2">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            loading={loading}
            onAddTask={onAddTask}
            onEditClick={onEditClick}
          />
        ))}
      </div>

      {/* DragOverlay — portal-rendered ghost following the cursor.
          Wrapper div carries scale + shadow so TaskCard internals stay
          unchanged. rounded-2xl on wrapper matches TaskCard's corner so
          shadow-xl renders with rounded edges (not square block). */}
      <DragOverlay>
        {activeTask && (
          <div className="scale-105 rounded-2xl shadow-xl">
            <TaskCard task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

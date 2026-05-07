import type { Status, Task } from '../../types'

// LexoRank-lite: insert at index `insertIndex` in `targetTasks` (already
// sorted by position, NOT including the dragged task).
//   - empty column        → 100
//   - head (i ≤ 0)        → first.position - 100
//   - tail (i ≥ length)   → last.position + 100
//   - middle              → midpoint of neighbors
//
// Known boundary: midpoint converges geometrically when inserting
// repeatedly into the same slot (~64 same-slot inserts before float
// precision exhausts). MVP scale safe; periodic rebalance is a Phase 3+
// concern (see PLAN.md §10 backlog).
export function computeNewPosition(
  targetTasks: Task[],
  insertIndex: number
): number {
  if (targetTasks.length === 0) return 100
  if (insertIndex <= 0) return targetTasks[0].position - 100
  if (insertIndex >= targetTasks.length) {
    return targetTasks[targetTasks.length - 1].position + 100
  }
  return (
    (targetTasks[insertIndex - 1].position +
      targetTasks[insertIndex].position) /
    2
  )
}

export interface DropResolution {
  toStatus: Status
  toPosition: number
}

// Resolve dnd-kit's `over.id` into (toStatus, toPosition).
// over.id is one of:
//   - `column-{status}` — Column droppable id; insert at column tail
//   - a task UUID       — insert at that task's slot in its column
//
// `overSortableIndex` (Case 2 only): dnd-kit's visual index of the over
// task within its SortableContext. dnd-kit already applies the in-progress
// sortable reorder visually during drag, and this index reflects where
// active will land. Trusting dnd-kit's algorithm here keeps the drop
// position consistent with the visual placeholder the user sees.
//   - Same-column: index in source items array (which includes active);
//     equivalent to standard `arrayMove(items, oldIdx, newIdx)` logic
//     when paired with a targetColumn that excludes active.
//   - Cross-column: index in target items array (active not present).
//   - Fallback to findIndex if dnd-kit didn't supply (defensive).
//
// Previous attempt computed `isAfter` from rect centers, which was a
// SECOND independent direction algorithm fighting dnd-kit's internal
// one — visual-vs-actual mismatch. Trusting dnd-kit eliminates that.
//
// Returns null for no-op drops (over a missing task, drop on self, etc.).
// The active task is always excluded from the target column's task list
// before computing position, so within-column reorder math is correct
// (active's old position doesn't pollute the neighbor calculation).
export function resolveDropTarget(args: {
  overId: string
  activeTask: Task
  allTasks: Task[]
  overSortableIndex: number | undefined
}): DropResolution | null {
  const { overId, activeTask, allTasks, overSortableIndex } = args

  // Case 1: dropped on a Column droppable
  // (empty column OR column blank space below cards). Always appends
  // at tail — sortable index doesn't apply (column droppable is not
  // sortable, just a drop zone).
  if (overId.startsWith('column-')) {
    const toStatus = overId.slice('column-'.length) as Status
    const targetColumn = allTasks
      .filter((t) => t.status === toStatus && t.id !== activeTask.id)
      .sort((a, b) => a.position - b.position)
    return {
      toStatus,
      toPosition: computeNewPosition(targetColumn, targetColumn.length),
    }
  }

  // Case 2: dropped on another task — use dnd-kit's visual index
  const overTask = allTasks.find((t) => t.id === overId)
  if (!overTask) return null            // Defensive: unknown over.id
  if (overTask.id === activeTask.id) return null  // Drop on self = no-op

  const toStatus = overTask.status
  const targetColumn = allTasks
    .filter((t) => t.status === toStatus && t.id !== activeTask.id)
    .sort((a, b) => a.position - b.position)
  // Trust dnd-kit's index; fallback to findIndex if absent (shouldn't happen).
  const insertIndex =
    overSortableIndex ?? targetColumn.findIndex((t) => t.id === overTask.id)
  return {
    toStatus,
    toPosition: computeNewPosition(targetColumn, insertIndex),
  }
}

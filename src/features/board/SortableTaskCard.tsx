import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskCard } from '../tasks/TaskCard'
import { cn } from '../../lib/cn'
import type { Task } from '../../types'

interface Props {
  task: Task
  onEditClick?: (taskId: string) => void
}

// Wrapper that injects dnd-kit sortable behavior into TaskCard. Keeps
// TaskCard itself dnd-agnostic — TaskCard never imports dnd-kit, so it
// stays trivially mockable / reusable in non-dnd contexts.
//
// Visual contract during drag:
//   - This wrapper (the "original" card in the list) gets opacity-40 →
//     placeholder showing where the card was
//   - TaskBoard renders <DragOverlay> with a 1:1 TaskCard copy that
//     follows the cursor
//   - dnd-kit auto-sets transform=null for the dragged item when
//     DragOverlay is in use, so the placeholder stays in slot. Other
//     cards in the same SortableContext get transformed to animate
//     the gap-closing visual.
export function SortableTaskCard({ task, onEditClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    // data: lets onDragEnd identify that the dragged item is a task
    // (vs a Column droppable).
    data: { type: 'task', status: task.status },
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // cursor-grab signals "draggable", grabbing on active. touch-none
      // prevents touch browsers from treating touch-start as scroll
      // (also helps touch-screen laptops). When isDragging, opacity-40
      // turns the original card into a "this is being moved" placeholder
      // — the actual drag visual is rendered by DragOverlay.
      className={cn(
        'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <TaskCard task={task} onEditClick={onEditClick} />
    </div>
  )
}

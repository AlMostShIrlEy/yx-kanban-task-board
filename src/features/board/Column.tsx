import { Plus } from 'lucide-react'
import { TaskCard } from '../tasks/TaskCard'
import { TaskCardSkeleton } from '../tasks/TaskCardSkeleton'
import { EmptyState } from './EmptyState'
import type { Status, Task } from '../../types'

interface Props {
  status: Status
  tasks: Task[]                            // already filtered to this status by parent
  loading?: boolean
  onAddTask?: (status: Status) => void     // omit → no + button (Step 5 wires this)
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
// + body (skeletons / EmptyState / TaskCards by position).
//
// Container has NO bg / border — visual grouping comes from header
// + card stack alone, matching the reference design's flat column style.
// EmptyState's dashed box is local decoration, not column container chrome.
export function Column({ status, tasks, loading, onAddTask }: Props) {
  // Sort by position ASC (LexoRank-lite). Don't mutate the input array
  // — it's parent state, mutating would break React change detection.
  const sorted = [...tasks].sort((a, b) => a.position - b.position)

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Header — px-1 内缩跟卡片 p-4 视觉对齐;mb-3 跟列内卡片 gap-3 一致 */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {STATUS_LABELS[status]}
          </h2>
          {/* Count 只在数据 ready 时显示;loading 时显示 "0" 会误导 */}
          {!loading && (
            <span className="text-sm text-slate-400">{tasks.length}</span>
          )}
        </div>
        {/* + 按钮:仅在 onAddTask 传入时渲染。Step 4 不传 → 按钮不出现,
            避免 "broken affordance"。Step 5 接 TaskModal 时启用。 */}
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

      {/* Body — 三态:loading → skeletons / 空 → EmptyState / 有数据 → cards */}
      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <TaskCardSkeleton key={i} />
          ))
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          sorted.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  )
}

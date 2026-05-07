import { useTasks } from '../tasks/hooks/useTasks'
import { STATUSES } from '../../types'
import type { Status, Task } from '../../types'
import { Column } from './Column'

interface Props {
  // Optional callbacks; when omitted, columns/cards omit their respective
  // affordances (Step 4 didn't pass these; Step 5 wires them via App).
  onAddTask?: (status: Status) => void
  onEditClick?: (taskId: string) => void
}

// Fallback UI when the initial fetch fails. useTasks doesn't currently
// expose a `refetch()` callback — the simplest escape hatch is a full
// page reload. If granular retry becomes important later, expose
// `refetch()` from TasksContextValue and call it here instead of reload.
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

// 4-column Kanban board. Columns render in fixed STATUSES order
// (todo → in_progress → in_review → done). Each column gets its own
// pre-filtered tasks slice; sorting by position happens inside Column.
//
// onAddTask / onEditClick are pass-through to Column / TaskCard. Both
// optional so TaskBoard can be rendered without the modal infrastructure
// (Step 4 did this).
export function TaskBoard({ onAddTask, onEditClick }: Props) {
  const { tasks, loading, error } = useTasks()

  // Error short-circuits the board. useTasks only sets `error` on initial
  // fetch failure (mutations toast separately), so error → no data to show.
  if (error) {
    return <BoardError error={error} />
  }

  // Group tasks by status. O(N × 4) at our scale (~few hundred max);
  // pre-init each bucket so STATUSES.map below never hits undefined.
  const tasksByStatus: Record<Status, Task[]> = {
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  }
  for (const task of tasks) {
    tasksByStatus[task.status].push(task)
  }

  return (
    // overflow-x-auto + shrink-0 列 → 宽屏一行排满,窄屏横向滚动(标准 Kanban 范式)。
    // pb-2 给底部留一点余量,避免 hover lift (-translate-y-0.5) 把卡顶到 main 边沿。
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
  )
}

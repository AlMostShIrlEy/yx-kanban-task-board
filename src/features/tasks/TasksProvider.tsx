import { createContext } from 'react'
import type { ReactNode } from 'react'
import type {
  Label,
  NewLabel,
  NewTask,
  Status,
  Task,
  TaskPatch,
} from '../../types'

// TasksContextValue — full final shape, even though Step 0.5 stubs the
// implementation. Exposing the real interface now lets components type
// against it from the start; Step 1 just swaps the inner `value` object
// for a useMemo'd one without changing any consumer.
//
// Mutation contract (Step 1 onwards):
//   - Success: createTask / createLabel return the new entity; the others
//     return void.
//   - Failure: the optimistic() helper surfaces a sonner toast and re-
//     throws. Callers don't need to null-check; the rare consumer that
//     truly needs to react to a failure wraps the call in try/catch.
export interface TasksContextValue {
  // Read state
  tasks: Task[]
  labels: Label[]
  loading: boolean
  error: Error | null

  // Task mutations
  createTask: (input: NewTask) => Promise<Task>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  // moveTask is split from updateTask because the drag path has different
  // error UX (silent rollback + position recompute) than a generic edit.
  moveTask: (id: string, toStatus: Status, toPosition: number) => Promise<void>

  // Label mutations
  createLabel: (input: NewLabel) => Promise<Label>
  deleteLabel: (id: string) => Promise<void>

  // Link mutations (operate on task_labels join rows)
  attachLabel: (taskId: string, labelId: string) => Promise<void>
  detachLabel: (taskId: string, labelId: string) => Promise<void>
}

// Default null lets useTasks detect "not in Provider" and throw cleanly.
export const TasksContext = createContext<TasksContextValue | null>(null)

interface Props {
  children: ReactNode
}

export function TasksProvider({ children }: Props) {
  // STUB only — Step 1 replaces this with a useMemo'd value built from
  // useState + useEffect + supabase fetch + useCallback mutations. The
  // value MUST live inside the component because the real impl closes over
  // component state (tasks/labels arrays, loading/error setters, latest
  // user_id from useAuth, etc.); keeping the stub here too means Step 1
  // is a single-spot replace, no module-level cleanup needed.
  //
  // Stubs throw (rather than no-op return) so any accidental call during
  // Step 0.5 is loud — silent stubs would let bugs hide.
  const value: TasksContextValue = {
    tasks: [],
    labels: [],
    loading: false,
    error: null,
    createTask: async () => {
      throw new Error('createTask not implemented (stub)')
    },
    updateTask: async () => {
      throw new Error('updateTask not implemented (stub)')
    },
    deleteTask: async () => {
      throw new Error('deleteTask not implemented (stub)')
    },
    moveTask: async () => {
      throw new Error('moveTask not implemented (stub)')
    },
    createLabel: async () => {
      throw new Error('createLabel not implemented (stub)')
    },
    deleteLabel: async () => {
      throw new Error('deleteLabel not implemented (stub)')
    },
    attachLabel: async () => {
      throw new Error('attachLabel not implemented (stub)')
    },
    detachLabel: async () => {
      throw new Error('detachLabel not implemented (stub)')
    },
  }

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  )
}

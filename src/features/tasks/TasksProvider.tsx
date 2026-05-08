import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/hooks/useAuth'
import { useRealtime } from './hooks/useRealtime'
import type { ConnectionStatus } from './hooks/useRealtime'
import type {
  Label,
  NewLabel,
  NewTask,
  Status,
  Task,
  TaskPatch,
} from '../../types'

// ─── Module-level helpers ─────────────────────────────────────────────

// Coerce any thrown value into a human-readable string for the toast
// `description` slot. PostgREST errors come through as plain objects with
// a `.message`; native Errors have `.message`; anything else falls back
// to String() so we never render "[object Object]" to the user.
function errorDescription(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return String(err)
}

// Central optimistic-mutation helper. The contract:
//   apply  — synchronous local-state update (writes via functional setState)
//   remote — async work; caller unwraps supabase {data, error} and throws
//   revert — synchronous undo of `apply` if remote rejects
//   errorMessage — toast title surfaced to the user on failure
// On success: returns whatever `remote` resolves to. On failure: revert
// runs, an error toast fires, and the error re-throws so rare consumers
// can react via try/catch (most callers ignore the throw).
//
// Phase 5 TODO (PLAN.md §5): stamp each call with a client-generated
// mutation_id here so realtime echo events can be de-duplicated. Doing
// it in one place means none of the 8 mutation sites need to change.
async function optimistic<T>({
  apply,
  remote,
  revert,
  errorMessage,
}: {
  apply: () => void
  remote: () => Promise<T>
  revert: () => void
  errorMessage: string
}): Promise<T> {
  apply()
  try {
    return await remote()
  } catch (err) {
    revert()
    toast.error(errorMessage, { description: errorDescription(err) })
    throw err
  }
}

// LexoRank-lite: max(position) in the target column + 100, or 100 if
// the column is empty. The +100 spacing leaves room to insert between
// two cards later without renumbering.
function computeNextPosition(tasks: Task[], status: Status): number {
  const inColumn = tasks.filter((t) => t.status === status)
  if (inColumn.length === 0) return 100
  return Math.max(...inColumn.map((t) => t.position)) + 100
}

// ─── Context shape ────────────────────────────────────────────────────

// TasksContextValue — full final shape, exposed so components type
// against it directly. Mutation contract:
//   - Success: createTask / createLabel return the new entity; the
//     others return void.
//   - Failure: the optimistic() helper surfaces a sonner toast and
//     re-throws. Callers don't need to null-check; rare consumers that
//     truly need to react wrap the call in try/catch.
export interface TasksContextValue {
  tasks: Task[]
  labels: Label[]
  loading: boolean
  error: Error | null

  // Realtime: ids of tasks that were just touched by a remote event.
  // Read by TaskCard to render a brief emerald ring (echo flash).
  // ReadonlySet so consumers can't accidentally mutate the source set.
  highlightedTaskIds: ReadonlySet<string>
  // Realtime channel state, surfaced by <RealtimeStatus> in the sidebar.
  connectionStatus: ConnectionStatus

  createTask: (input: NewTask) => Promise<Task>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  // moveTask is split from updateTask because the drag path has different
  // error UX (silent rollback + position recompute) than a generic edit.
  moveTask: (id: string, toStatus: Status, toPosition: number) => Promise<void>

  createLabel: (input: NewLabel) => Promise<Label>
  deleteLabel: (id: string) => Promise<void>

  attachLabel: (taskId: string, labelId: string) => Promise<void>
  detachLabel: (taskId: string, labelId: string) => Promise<void>
}

// Default null lets useTasks detect "not in Provider" and throw cleanly.
export const TasksContext = createContext<TasksContextValue | null>(null)

interface Props {
  children: ReactNode
}

// ─── Provider ─────────────────────────────────────────────────────────

export function TasksProvider({ children }: Props) {
  const { user } = useAuth()
  // AuthProvider's contract: it doesn't render children until user is
  // non-null. TS can't infer that contract, so narrow explicitly here
  // and throw on violation — catches future mis-nesting loudly instead
  // of letting downstream code fail with confusing null derefs.
  if (!user) {
    throw new Error(
      'TasksProvider must be rendered inside an authenticated <AuthProvider>'
    )
  }

  const [tasks, setTasks] = useState<Task[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Echo flash: ids of tasks touched by a remote event in the last
  // ~350ms. New Set on each change so React detects identity change
  // and re-renders TaskCards.
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<Set<string>>(
    () => new Set()
  )

  // Refs hold latest committed state for callback-time reads. Mutations
  // read via these refs so their useCallback deps stay minimal (basically
  // [user.id]), which keeps mutation references stable, which keeps the
  // useMemo'd `value` stable when state hasn't changed.
  //
  // Heads-up on timing: this useEffect-driven sync runs AFTER commit, so
  // refs lag by one tick. If two mutations fire synchronously back-to-back
  // (no await between them), the second reads stale ref data. Every
  // mutation here starts with an `await` (network call), so by the time
  // the next mutation runs the ref is current. If you ever add a code
  // path that issues two mutations synchronously, hoist the read to one
  // place or use functional setState for both.
  const tasksRef = useRef<Task[]>([])
  const labelsRef = useRef<Label[]>([])
  useEffect(() => {
    tasksRef.current = tasks
    labelsRef.current = labels
  }, [tasks, labels])

  // ─── fetchAll: shared by initial load + realtime reconnect ─────────
  // Extracted as a useCallback so useRealtime can call it on reconnect.
  // The optional `signal` lets the initial-fetch effect skip writing
  // state if the component unmounts mid-flight (StrictMode / user
  // change). Realtime callers pass nothing — last-write-wins is fine
  // for that path.
  const fetchAll = useCallback(
    async (signal?: { aborted: boolean }): Promise<void> => {
      // PostgREST m2m hint: passing `labels(*)` as the embedded resource
      // resolves THROUGH the task_labels join table automatically (FK
      // detection on the join table's two columns). Returned shape is
      // exactly Task & { labels: Label[] }, no client-side flatten.
      const [tasksRes, labelsRes] = await Promise.all([
        supabase.from('tasks').select('*, labels(*)').order('position'),
        supabase.from('labels').select('*').order('name'),
      ])
      if (signal?.aborted) return
      if (tasksRes.error) throw tasksRes.error
      if (labelsRes.error) throw labelsRes.error
      setTasks((tasksRes.data ?? []) as Task[])
      setLabels((labelsRes.data ?? []) as Label[])
    },
    [user.id]
  )

  // ─── Initial fetch ─────────────────────────────────────────────────
  useEffect(() => {
    const signal = { aborted: false }
    setLoading(true)
    setError(null)

    fetchAll(signal)
      .catch((err: unknown) => {
        if (signal.aborted) return
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        toast.error('Failed to load board', {
          description: errorDescription(err),
        })
      })
      .finally(() => {
        if (signal.aborted) return
        setLoading(false)
      })

    return () => {
      signal.aborted = true
    }
  }, [fetchAll])

  // ─── Echo flash: mark a task as recently touched by realtime ───────
  const markEchoed = useCallback((taskId: string) => {
    // Skip if the task is no longer in state. Cascade scenario: a
    // task_labels DELETE event fires onEcho(task_id) at the same time
    // the task's own DELETE event has already removed the row from
    // state. Flashing a non-existent card has no visible effect — and
    // would just churn highlightedTaskIds for 350ms. tasksRef is sync'd
    // post-commit (see the sync useEffect above); a microsecond-window
    // race where both DELETEs land in the same microtask could let one
    // through, which is harmless and not worth chasing.
    if (!tasksRef.current.some((t) => t.id === taskId)) return

    setHighlightedTaskIds((prev) => {
      if (prev.has(taskId)) return prev
      const next = new Set(prev)
      next.add(taskId)
      return next
    })
    // Schedule removal after the flash window. Multiple echoes for the
    // same id within the window each schedule a removal — the second
    // hits an already-clean set and short-circuits via the `has` guard,
    // so over-scheduling is harmless.
    setTimeout(() => {
      setHighlightedTaskIds((prev) => {
        if (!prev.has(taskId)) return prev
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }, 350)
  }, [])

  // ─── Realtime subscription ─────────────────────────────────────────
  const { connectionStatus } = useRealtime({
    userId: user.id,
    setTasks,
    setLabels,
    tasksRef,
    labelsRef,
    refetchAll: fetchAll,
    onEcho: markEchoed,
  })

  // ─── Mutations ─────────────────────────────────────────────────────
  // All useCallbacks have minimal deps. State reads go through tasksRef /
  // labelsRef; state writes go through setTasks / setLabels with
  // functional updaters. Reverts are TARGETED (per-row), not "restore
  // entire previous array" — concurrent mutations don't trample each other.

  const createTask = useCallback(
    async (input: NewTask): Promise<Task> => {
      const tempId = `temp-${crypto.randomUUID()}`
      const targetStatus = input.status ?? 'todo'
      const targetPriority = input.priority ?? 'normal'
      const labelIds = input.labels ?? []

      // Read latest state via refs (no closure dep on tasks/labels arrays).
      const nextPosition =
        input.position ??
        computeNextPosition(tasksRef.current, targetStatus)
      const attachedLabels = labelIds
        .map((id) => labelsRef.current.find((l) => l.id === id))
        .filter((l): l is Label => l !== undefined)

      const now = new Date().toISOString()
      const optimisticTask: Task = {
        id: tempId,
        user_id: user.id,
        title: input.title,
        description: input.description ?? null,
        status: targetStatus,
        priority: targetPriority,
        color: input.color ?? null,
        due_date: input.due_date ?? null,
        position: nextPosition,
        created_at: now,
        updated_at: now,
        labels: attachedLabels,
      }

      const realTask = await optimistic<Task>({
        apply: () => setTasks((prev) => [...prev, optimisticTask]),
        remote: async () => {
          // Step 1: insert task row
          const { data: row, error: insertErr } = await supabase
            .from('tasks')
            .insert({
              user_id: user.id,
              title: input.title,
              description: input.description ?? null,
              status: targetStatus,
              priority: targetPriority,
              color: input.color ?? null,
              due_date: input.due_date ?? null,
              position: nextPosition,
            })
            .select('*')
            .single()
          if (insertErr) throw insertErr
          if (!row) throw new Error('Insert returned no data')

          // Step 2: insert task_labels join rows (if any). On failure,
          // best-effort rollback the task INSERT to avoid an orphan task
          // sitting in the DB without its labels. The rollback DELETE
          // could itself fail (network), in which case we accept the
          // orphan — rare enough not to worth a full Postgres function.
          if (labelIds.length > 0) {
            const { error: linkErr } = await supabase
              .from('task_labels')
              .insert(
                labelIds.map((label_id) => ({
                  task_id: row.id,
                  label_id,
                }))
              )
            if (linkErr) {
              await supabase.from('tasks').delete().eq('id', row.id)
              throw linkErr
            }
          }

          // Step 3: build the real Task from the server row + locally
          // resolved labels. No refetch — Phase 5 realtime would otherwise
          // see an extra echo per row.
          return {
            ...(row as Omit<Task, 'labels'>),
            labels: attachedLabels,
          }
        },
        revert: () => setTasks((prev) => prev.filter((t) => t.id !== tempId)),
        errorMessage: 'Failed to create task',
      })

      // Swap the temp-id optimistic task for the real one (real id,
      // server timestamps, server-confirmed position).
      //
      // Race-aware: a realtime echo for our own INSERT can beat the
      // INSERT response (the channel is a separate connection). If the
      // echo handler already appended realTask, we just clean up the
      // temp instead of duplicating the row.
      setTasks((prev) => {
        if (prev.some((t) => t.id === realTask.id)) {
          return prev.filter((t) => t.id !== tempId)
        }
        return prev.map((t) => (t.id === tempId ? realTask : t))
      })
      return realTask
    },
    [user.id]
  )

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch): Promise<void> => {
      // Snapshot pre-patch state for revert.
      const snapshot = tasksRef.current.find((t) => t.id === id)
      if (!snapshot) return // task not in local state; nothing to do

      const now = new Date().toISOString()
      await optimistic({
        apply: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, ...patch, updated_at: now } : t
            )
          ),
        remote: async () => {
          const { error: e } = await supabase
            .from('tasks')
            .update(patch)
            .eq('id', id)
          if (e) throw e
        },
        revert: () =>
          setTasks((prev) => prev.map((t) => (t.id === id ? snapshot : t))),
        errorMessage: 'Failed to update task',
      })
    },
    []
  )

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    const snapshot = tasksRef.current.find((t) => t.id === id)
    if (!snapshot) return

    await optimistic({
      apply: () => setTasks((prev) => prev.filter((t) => t.id !== id)),
      remote: async () => {
        const { error: e } = await supabase.from('tasks').delete().eq('id', id)
        if (e) throw e
      },
      // Re-add at end. The row itself carries position, so column
      // components sort it back into its original slot.
      revert: () => setTasks((prev) => [...prev, snapshot]),
      errorMessage: 'Failed to delete task',
    })
  }, [])

  const moveTask = useCallback(
    async (
      id: string,
      toStatus: Status,
      toPosition: number
    ): Promise<void> => {
      const snapshot = tasksRef.current.find((t) => t.id === id)
      if (!snapshot) return

      const now = new Date().toISOString()
      await optimistic({
        apply: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: toStatus, position: toPosition, updated_at: now }
                : t
            )
          ),
        remote: async () => {
          const { error: e } = await supabase
            .from('tasks')
            .update({ status: toStatus, position: toPosition })
            .eq('id', id)
          if (e) throw e
        },
        revert: () =>
          setTasks((prev) => prev.map((t) => (t.id === id ? snapshot : t))),
        errorMessage: 'Failed to move task',
      })
    },
    []
  )

  const createLabel = useCallback(
    async (input: NewLabel): Promise<Label> => {
      const tempId = `temp-${crypto.randomUUID()}`
      const optimisticLabel: Label = {
        id: tempId,
        user_id: user.id,
        name: input.name,
        color: input.color,
        created_at: new Date().toISOString(),
      }

      const realLabel = await optimistic<Label>({
        apply: () => setLabels((prev) => [...prev, optimisticLabel]),
        remote: async () => {
          const { data, error: e } = await supabase
            .from('labels')
            .insert({
              user_id: user.id,
              name: input.name,
              color: input.color,
            })
            .select('*')
            .single()
          if (e) throw e
          if (!data) throw new Error('Insert returned no data')
          return data as Label
        },
        revert: () =>
          setLabels((prev) => prev.filter((l) => l.id !== tempId)),
        errorMessage: 'Failed to create label',
      })

      // Race-aware swap: realtime echo for our own label INSERT may
      // have appended realLabel before this swap runs. Same pattern
      // as createTask above.
      setLabels((prev) => {
        if (prev.some((l) => l.id === realLabel.id)) {
          return prev.filter((l) => l.id !== tempId)
        }
        return prev.map((l) => (l.id === tempId ? realLabel : l))
      })
      return realLabel
    },
    [user.id]
  )

  const deleteLabel = useCallback(async (id: string): Promise<void> => {
    // Snapshot the label itself AND remember which tasks had it
    // attached. We need both for full revert: re-insert the label into
    // `labels`, AND re-attach it to each task it was on. Captured BEFORE
    // apply because apply mutates both slices.
    const labelSnapshot = labelsRef.current.find((l) => l.id === id)
    if (!labelSnapshot) return
    const affectedTaskIds = tasksRef.current
      .filter((t) => t.labels.some((l) => l.id === id))
      .map((t) => t.id)

    await optimistic({
      apply: () => {
        setLabels((prev) => prev.filter((l) => l.id !== id))
        // SQL ON DELETE CASCADE on task_labels handles the join rows
        // server-side; we mirror that locally so the UI matches.
        setTasks((prev) =>
          prev.map((t) =>
            t.labels.some((l) => l.id === id)
              ? { ...t, labels: t.labels.filter((l) => l.id !== id) }
              : t
          )
        )
      },
      remote: async () => {
        const { error: e } = await supabase.from('labels').delete().eq('id', id)
        if (e) throw e
      },
      revert: () => {
        setLabels((prev) => [...prev, labelSnapshot])
        setTasks((prev) =>
          prev.map((t) =>
            affectedTaskIds.includes(t.id)
              ? { ...t, labels: [...t.labels, labelSnapshot] }
              : t
          )
        )
      },
      errorMessage: 'Failed to delete label',
    })
  }, [])

  const attachLabel = useCallback(
    async (taskId: string, labelId: string): Promise<void> => {
      const label = labelsRef.current.find((l) => l.id === labelId)
      if (!label) {
        toast.error('Failed to attach label', { description: 'Label not found' })
        throw new Error(`Label ${labelId} not found`)
      }
      // No-op if already attached (avoid 23505 unique violation on PK).
      const alreadyAttached =
        tasksRef.current
          .find((t) => t.id === taskId)
          ?.labels.some((l) => l.id === labelId) ?? false
      if (alreadyAttached) return

      await optimistic({
        apply: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, labels: [...t.labels, label] } : t
            )
          ),
        remote: async () => {
          const { error: e } = await supabase
            .from('task_labels')
            .insert({ task_id: taskId, label_id: labelId })
          if (e) throw e
        },
        revert: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, labels: t.labels.filter((l) => l.id !== labelId) }
                : t
            )
          ),
        errorMessage: 'Failed to attach label',
      })
    },
    []
  )

  const detachLabel = useCallback(
    async (taskId: string, labelId: string): Promise<void> => {
      // Snapshot the label for revert (need the full object to re-attach).
      const label = labelsRef.current.find((l) => l.id === labelId)
      if (!label) return

      await optimistic({
        apply: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, labels: t.labels.filter((l) => l.id !== labelId) }
                : t
            )
          ),
        remote: async () => {
          const { error: e } = await supabase
            .from('task_labels')
            .delete()
            .eq('task_id', taskId)
            .eq('label_id', labelId)
          if (e) throw e
        },
        revert: () =>
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, labels: [...t.labels, label] } : t
            )
          ),
        errorMessage: 'Failed to detach label',
      })
    },
    []
  )

  // useMemo'd value: identity stable when state + mutation refs unchanged.
  // Mutations are useCallback'd with minimal deps so their refs only churn
  // when user.id changes, which means `value` only churns on actual state
  // changes — consumers don't re-render on every provider render.
  const value = useMemo<TasksContextValue>(
    () => ({
      tasks,
      labels,
      loading,
      error,
      highlightedTaskIds,
      connectionStatus,
      createTask,
      updateTask,
      deleteTask,
      moveTask,
      createLabel,
      deleteLabel,
      attachLabel,
      detachLabel,
    }),
    [
      tasks,
      labels,
      loading,
      error,
      highlightedTaskIds,
      connectionStatus,
      createTask,
      updateTask,
      deleteTask,
      moveTask,
      createLabel,
      deleteLabel,
      attachLabel,
      detachLabel,
    ]
  )

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabase'
import type { Label, Task } from '../../../types'

// ─── Connection status state machine ──────────────────────────────────
//
// 'connecting'    — first-ever subscribe attempt; no SUBSCRIBED yet
// 'live'          — channel is SUBSCRIBED and receiving events
// 'reconnecting'  — was 'live', then lost connection (CHANNEL_ERROR / TIMED_OUT)
// 'disconnected'  — was 'live', channel CLOSED (e.g. after exhausting retries)
//
// The 'connecting' vs 'reconnecting' split lets the indicator
// communicate whether the user has ever had a working sync session.
// First-time slow connect feels different from "your live data is now
// stale" — the latter is more urgent.
export type ConnectionStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'disconnected'

// SQL row shapes — what arrives in realtime payloads. Distinct from the
// domain Task (which has joined `labels`); the payload only carries the
// row's own columns, never the PostgREST-side join.
type TaskRow = Omit<Task, 'labels'>
type LabelRow = Label
type TaskLabelRow = { task_id: string; label_id: string }

// Read-only ref shape: lets the hook *read* tasksRef.current without
// risking accidental writes (the source of truth is TasksProvider's
// useState). Compatible with React's MutableRefObject by structural typing.
type ReadRef<T> = { readonly current: T }

interface UseRealtimeArgs {
  userId: string
  setTasks: Dispatch<SetStateAction<Task[]>>
  setLabels: Dispatch<SetStateAction<Label[]>>
  // Refs are read inside event-handler closures. Using refs (instead of
  // state-via-deps) keeps the channel from re-subscribing every time
  // tasks/labels change.
  tasksRef: ReadRef<Task[]>
  labelsRef: ReadRef<Label[]>
  // Called on RECONNECT (not initial connect) to heal events that may
  // have been missed during a disconnect window.
  refetchAll: () => Promise<void>
  // Called for any task whose visible state was touched by a remote
  // event. Triggers a brief UI highlight. Self-originated optimistic
  // mutations don't go through here, so they don't flash.
  onEcho: (taskId: string) => void
}

export function useRealtime({
  userId,
  setTasks,
  setLabels,
  tasksRef,
  labelsRef,
  refetchAll,
  onEcho,
}: UseRealtimeArgs): { connectionStatus: ConnectionStatus } {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting')

  // hasEverConnectedRef persists across this hook's lifetime (i.e. the
  // browser session). Once any subscription has succeeded, all later
  // failures are framed as "reconnecting" rather than first-time
  // "connecting". Refs persist across StrictMode double-mounts.
  const hasEverConnectedRef = useRef(false)

  useEffect(() => {
    // Per-channel-instance flag, kept in the effect closure so it
    // resets naturally on each (re)subscribe. The FIRST SUBSCRIBED on
    // a fresh channel must NOT trigger refetch (initial fetch in
    // TasksProvider already covers it). The SECOND+ SUBSCRIBED on the
    // same channel means supabase-js auto-reconnected → refetch to
    // heal any events that fired during the gap.
    //
    // CRITICAL for StrictMode: if this flag were a useRef, it would
    // persist across the mount/cleanup/mount cycle and the second
    // mount's first SUBSCRIBED would be misread as a reconnect. Effect
    // closure scope avoids that — each effect run gets a fresh `false`.
    let hasSubscribedOnce = false

    const channel = supabase
      .channel(`tasks-realtime:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<TaskRow>) => {
          handleTaskChange(payload, setTasks, onEcho)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'labels',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<LabelRow>) => {
          handleLabelChange(payload, setLabels, setTasks)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          // No user_id column on task_labels (pure association table);
          // RLS policies gate which rows we receive.
        },
        (payload: RealtimePostgresChangesPayload<TaskLabelRow>) => {
          handleTaskLabelChange(payload, setTasks, labelsRef, onEcho)
        }
      )
      .subscribe((status, err) => {
        switch (status) {
          case 'SUBSCRIBED':
            setConnectionStatus('live')
            if (hasSubscribedOnce) {
              // Reconnect path: refetch to heal anything we missed.
              void refetchAll()
            } else {
              hasSubscribedOnce = true
            }
            hasEverConnectedRef.current = true
            break
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            if (err) console.error('[realtime] channel error', err)
            setConnectionStatus(
              hasEverConnectedRef.current ? 'reconnecting' : 'connecting'
            )
            break
          case 'CLOSED':
            setConnectionStatus(
              hasEverConnectedRef.current ? 'disconnected' : 'connecting'
            )
            break
        }
      })

    return () => {
      // removeChannel both unsubscribes AND drops the channel from the
      // supabase client's internal registry. Plain channel.unsubscribe()
      // would leave a dangling reference that leaks across StrictMode
      // double-mounts.
      void supabase.removeChannel(channel)
    }
  }, [userId, setTasks, setLabels, tasksRef, labelsRef, refetchAll, onEcho])

  return { connectionStatus }
}

// ─── Per-table reducers ───────────────────────────────────────────────
//
// Each handler is id-keyed and idempotent. Server payload always wins
// for state reconciliation. The echo flash, however, is conditional:
// onEcho fires only when the event represents a real change relative
// to current state. This suppresses self-flash on our own optimistic
// mutations (which already updated state synchronously, so the echo
// is a no-op).

// Compares user-visible task fields between local state and the
// realtime payload. updated_at is intentionally excluded — the server
// bumps it on every UPDATE, even echoes of our own writes, so it
// always differs and would defeat the purpose. Labels are compared
// separately via the task_labels handlers.
function hasMeaningfulDiff(prev: Task, next: TaskRow): boolean {
  return (
    prev.title !== next.title ||
    prev.description !== next.description ||
    prev.status !== next.status ||
    prev.priority !== next.priority ||
    prev.due_date !== next.due_date ||
    prev.position !== next.position ||
    prev.color !== next.color
  )
}

function handleTaskChange(
  payload: RealtimePostgresChangesPayload<TaskRow>,
  setTasks: Dispatch<SetStateAction<Task[]>>,
  onEcho: (taskId: string) => void
) {
  switch (payload.eventType) {
    case 'INSERT': {
      const row = payload.new
      // Flag set inside the setState callback. Echo only when this is
      // actually a NEW row to local state — a found `existing` means
      // our own optimistic swap (or a previous echo) already added
      // realTask, so re-flashing would be a self-flash.
      let wasNew = false
      setTasks((prev) => {
        const existing = prev.find((t) => t.id === row.id)
        if (existing) {
          // Already in state (typically: our own optimistic create
          // already swapped temp→real before this echo arrived). Merge
          // server payload over local row but KEEP the embedded labels
          // — payload doesn't carry the join.
          return prev.map((t) =>
            t.id === row.id ? { ...row, labels: existing.labels } : t
          )
        }
        // Foreign INSERT (or our own that beat the optimistic swap):
        // append with empty labels. task_labels INSERT events arrive
        // separately and will fill them in.
        wasNew = true
        return [...prev, { ...row, labels: [] }]
      })
      if (wasNew) onEcho(row.id)
      break
    }
    case 'UPDATE': {
      const row = payload.new
      // CRITICAL: the realtime payload only carries the tasks-table
      // columns. Spreading row last would erase the embedded labels
      // array (which is a PostgREST-side join, not a Postgres column).
      // Order matters — `labels: t.labels` MUST come after `...row`.
      //
      // Echo only fires when the row's user-visible fields actually
      // changed vs current state. Suppresses self-flash for echoes of
      // our own optimistic updates (state already reflects the change,
      // so payload diff is empty).
      let shouldEcho = false
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== row.id) return t
          if (hasMeaningfulDiff(t, row)) shouldEcho = true
          return { ...t, ...row, labels: t.labels }
        })
      )
      if (shouldEcho) onEcho(row.id)
      break
    }
    case 'DELETE': {
      const id = (payload.old as Partial<TaskRow>).id
      if (!id) return
      setTasks((prev) => prev.filter((t) => t.id !== id))
      // No echo highlight — there's no card left to flash.
      break
    }
  }
}

function handleLabelChange(
  payload: RealtimePostgresChangesPayload<LabelRow>,
  setLabels: Dispatch<SetStateAction<Label[]>>,
  setTasks: Dispatch<SetStateAction<Task[]>>
) {
  switch (payload.eventType) {
    case 'INSERT': {
      const row = payload.new
      setLabels((prev) => {
        if (prev.some((l) => l.id === row.id)) {
          return prev.map((l) => (l.id === row.id ? row : l))
        }
        return [...prev, row]
      })
      break
    }
    case 'UPDATE': {
      const row = payload.new
      setLabels((prev) => prev.map((l) => (l.id === row.id ? row : l)))
      // Mirror the update into embedded task.labels so cards reflect
      // the new name/color without waiting for a refetch.
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          labels: t.labels.map((l) => (l.id === row.id ? row : l)),
        }))
      )
      break
    }
    case 'DELETE': {
      const id = (payload.old as Partial<LabelRow>).id
      if (!id) return
      setLabels((prev) => prev.filter((l) => l.id !== id))
      // Mirror SQL ON DELETE CASCADE on task_labels: drop this label
      // from every task that has it. Cascaded task_labels DELETE
      // events also arrive (in any order) and find nothing to remove
      // — handlers are idempotent so order doesn't matter.
      setTasks((prev) =>
        prev.map((t) =>
          t.labels.some((l) => l.id === id)
            ? { ...t, labels: t.labels.filter((l) => l.id !== id) }
            : t
        )
      )
      break
    }
  }
}

function handleTaskLabelChange(
  payload: RealtimePostgresChangesPayload<TaskLabelRow>,
  setTasks: Dispatch<SetStateAction<Task[]>>,
  labelsRef: ReadRef<Label[]>,
  onEcho: (taskId: string) => void
) {
  switch (payload.eventType) {
    case 'INSERT': {
      const { task_id, label_id } = payload.new
      const label = labelsRef.current.find((l) => l.id === label_id)
      if (!label) {
        // Race: cross-table event ordering isn't guaranteed. The label
        // INSERT may not have arrived yet on this channel. Skip; the
        // next reconnect refetch (or a manual reload) will heal. The
        // window is microseconds in practice (single client, sequential
        // inserts), so this very rarely fires.
        console.warn(
          '[realtime] task_labels INSERT for unknown label_id; skipping',
          { task_id, label_id }
        )
        return
      }
      // Echo only when we actually appended. If the label was already
      // attached locally (our own optimistic attach echoing back),
      // skip the flash.
      let appended = false
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== task_id) return t
          if (t.labels.some((l) => l.id === label_id)) return t
          appended = true
          return { ...t, labels: [...t.labels, label] }
        })
      )
      if (appended) onEcho(task_id)
      break
    }
    case 'DELETE': {
      const old = payload.old as Partial<TaskLabelRow>
      const task_id = old.task_id
      const label_id = old.label_id
      if (!task_id || !label_id) return
      // Echo only when we actually removed the label. If it was
      // already gone locally (our own optimistic detach echoing back),
      // skip the flash.
      let removed = false
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== task_id) return t
          if (!t.labels.some((l) => l.id === label_id)) return t
          removed = true
          return { ...t, labels: t.labels.filter((l) => l.id !== label_id) }
        })
      )
      if (removed) onEcho(task_id)
      break
    }
    // No UPDATE on task_labels — it's a pure association table.
  }
}

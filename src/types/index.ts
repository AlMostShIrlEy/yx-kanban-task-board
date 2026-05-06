// Domain model types shared across the app.
//
// The string-literal unions below MUST match the SQL CHECK constraints in
// supabase/migrations/0001_initial_schema.sql. If you change one, update the
// other in the same commit.

// ─── Enums (literal unions + iterable arrays) ─────────────────────
//
// Pattern: define a `const` array, then derive the union type from it.
// This keeps the type and the iterable list in sync — adding a value
// updates both with no second place to forget.
//
// TS trick: `(typeof X)[number]` takes an array's element type. With
// `as const`, the array's element type is the union of literal values
// (not the widened `string`). So Status = 'todo' | 'in_progress' | ...

// STATUSES order also drives default board column display order in
// <TaskBoard>. If you ever want to decouple display from SQL contract,
// introduce a separate COLUMN_ORDER constant.
export const STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['low', 'normal', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export const CARD_COLORS = [
  'blue',
  'purple',
  'pink',
  'orange',
  'green',
  'yellow',
] as const
export type CardColor = (typeof CARD_COLORS)[number]

// ─── Domain models (what components consume) ──────────────────────
//
// IMPORTANT: When rendering Task.color, always provide a fallback.
// task.color may be null (user didn't pick one). UI uses
// `task.color ?? hashColor(task.id)` to derive a stable visual color.
// This keeps Phase 2 components consistent — without this fallback,
// colorless tasks would render with no card color.

// Label.color is required (SQL NOT NULL); a colorless label has no
// visual meaning. Compare to Task.color which is nullable — colorless
// tasks fall back to a hashed color (see Task.color note above).
export interface Label {
  id: string
  user_id: string
  name: string
  color: CardColor
  created_at: string // ISO 8601 timestamp
}

// A task as the UI sees it: the SQL row + its joined labels.
// useTasks will fetch with `.select('*, labels(*)')`, so this shape is
// what supabase-js returns directly — no client-side stitching needed.
export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  status: Status
  priority: Priority
  color: CardColor | null
  due_date: string | null // ISO YYYY-MM-DD ('date' column); null = unset
  position: number        // double precision; in-column order (LexoRank-lite)
  created_at: string      // ISO 8601 timestamp
  updated_at: string      // ISO 8601 timestamp
  labels: Label[]         // joined via task_labels
}

// ─── Mutation inputs (what callers pass to useTasks) ──────────────

// Fields a user can set when creating a task. user_id is injected by
// useTasks from the auth context — components don't think about it.
// status / priority default to the SQL DEFAULTs ('todo' / 'normal')
// when omitted. position is auto-assigned by createTask if omitted
// (max(position) + 100 within the target column).
//
// Optional fields use plain `?` (not `| null`) because creation has no
// "clear existing value" semantics — just omit the key. Compare to
// TaskPatch below, which keeps `| null` so updates can clear fields.
export interface NewTask {
  title: string
  description?: string
  status?: Status
  priority?: Priority
  color?: CardColor
  due_date?: string
  position?: number
  // Label IDs to attach on creation. createTask handles the join-table
  // inserts atomically. For incremental edits later, use
  // attachLabel / detachLabel instead.
  labels?: string[]
}

// Patch type for updateTask. All fields optional. user_id and timestamps
// are excluded — RLS blocks user_id changes, and the DB owns timestamps.
// Labels are managed via attachLabel / detachLabel, not via this patch.
//
// TS trick: `Partial<Omit<Task, K>>` = "Task with K fields removed and
// everything else made optional".
export type TaskPatch = Partial<
  Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'labels'>
>

export interface NewLabel {
  name: string
  color: CardColor
}

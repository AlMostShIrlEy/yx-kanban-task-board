import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

// ─── Seed payload (PLAN.md §3 + Phase 1.6 spec) ──────────────────────

const LABELS = [
  { name: 'Design',   color: 'pink'   },
  { name: 'Frontend', color: 'green'  },
  { name: 'Backend',  color: 'blue'   },
  { name: 'Auth',     color: 'purple' },
  { name: 'Bug',      color: 'orange' },
] as const

// SeedTask field mapping:
//   dueOffset = null          → due_date NULL
//   dueOffset = integer (±)   → CURRENT_DATE + N days
type SeedTask = {
  title: string
  status: 'todo' | 'in_progress' | 'in_review' | 'done'
  priority: 'low' | 'normal' | 'high'
  color: 'blue' | 'purple' | 'pink' | 'orange' | 'green' | 'yellow'
  description: string | null
  dueOffset: number | null
  position: number
  labels: string[]
}

const TASKS: SeedTask[] = [
  {
    title: 'Sketch onboarding flow wireframes',
    status: 'done', priority: 'normal', color: 'purple',
    description: 'Initial pass approved by design lead.',
    dueOffset: -8, position: 100, labels: ['Design'],
  },
  {
    title: 'Migrate auth from sessions to JWT',
    status: 'in_progress', priority: 'high', color: 'blue',
    description: 'Refresh flow still flaky on Safari — needs fix today.',
    dueOffset: -2, position: 100, labels: ['Backend', 'Auth'],
  },
  {
    title: 'Refactor task card hover states',
    status: 'in_review', priority: 'normal', color: 'pink',
    description: null,
    dueOffset: 7, position: 100, labels: ['Design', 'Frontend'],
  },
  {
    title: 'Draft Q2 board review notes',
    status: 'todo', priority: 'low', color: 'yellow',
    description: null,
    dueOffset: null, position: 100, labels: ['Design'],
  },
  {
    title: 'Optimize dashboard image loading',
    status: 'todo', priority: 'normal', color: 'green',
    description: 'Hero images blocking LCP — try AVIF + lazy boundaries.',
    dueOffset: 7, position: 200, labels: ['Frontend'],
  },
  {
    title: 'Plan team offsite — agenda & venue',
    status: 'todo', priority: 'low', color: 'orange',
    description: null,
    dueOffset: 15, position: 300, labels: [],
  },
  {
    title: 'Investigate slow query on /reports',
    status: 'in_progress', priority: 'high', color: 'blue',
    description: 'Customer reported 8s load. Check missing index on events.event_at.',
    dueOffset: null, position: 200, labels: ['Backend', 'Bug'],
  },
]

// Compute "today + N days" in the user's LOCAL timezone, formatted as
// YYYY-MM-DD. Avoids toISOString().slice(0,10) because that converts to
// UTC first, so timezones far from UTC would shift "yesterday/tomorrow"
// to "today". Postgres `date` columns store calendar days, so local time
// is the right reference frame.
function relativeDate(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// readonly form means the seed function can only READ the mount flag,
// never accidentally flip it.
interface MountRef {
  readonly current: boolean
}

// ─── Seed function ────────────────────────────────────────────────────
//
// Writes demo data into the current anonymous user's board.
//
// Idempotency:
//   • First check: user.user_metadata.has_seeded === true → return
//     immediately, saving a round-trip.
//   • Second check: labels use ON CONFLICT (user_id, name) DO NOTHING
//     (supabase-js's upsert + ignoreDuplicates); task_labels use
//     ON CONFLICT (task_id, label_id) DO NOTHING. Retries don't produce
//     duplicates.
//   • ⚠️ The tasks table has no unique constraint beyond id → no
//     ON CONFLICT possible. A partial-failure retry could produce
//     duplicate tasks. Acceptable at MVP scale; before Phase 4 launch
//     consider adding a (user_id, title) partial unique constraint.
//
// Self-heal:
//   • has_seeded is written LAST → if any earlier step fails, the flag
//     stays unset and the next page-reload-triggered INITIAL_SESSION
//     re-enters the seed flow.
//
// Error policy:
//   • catch everything, log via console.error, **do NOT throw** —
//     never block the app.
//
// MountRef checks:
//   • Re-check isMounted.current before each await so the function
//     stops issuing requests after the component unmounts.
//
export async function seedDemoData(
  user: User,
  isMounted: MountRef = { current: true }
): Promise<void> {
  // First check: skip if metadata already marked
  if (user.user_metadata?.has_seeded === true) return

  try {
    // ─── Step 1: ensure the 5 labels exist (idempotent upsert)
    const labelRows = LABELS.map((l) => ({
      user_id: user.id,
      name: l.name,
      color: l.color,
    }))
    if (!isMounted.current) return
    const { error: labelErr } = await supabase
      .from('labels')
      .upsert(labelRows, { onConflict: 'user_id,name', ignoreDuplicates: true })
    if (labelErr) throw labelErr

    // ─── Step 2: read the 5 labels back to grab IDs (whether new or pre-existing)
    if (!isMounted.current) return
    const { data: labels, error: selErr } = await supabase
      .from('labels')
      .select('id, name')
      .eq('user_id', user.id)
      .in(
        'name',
        LABELS.map((l) => l.name)
      )
    if (selErr) throw selErr
    if (!labels || labels.length !== LABELS.length) {
      throw new Error(
        `Expected ${LABELS.length} labels after upsert, got ${labels?.length ?? 0}`
      )
    }
    // labelByName: 'Design' → '<uuid>'
    const labelByName: Record<string, string> = Object.fromEntries(
      labels.map((l) => [l.name, l.id])
    )

    // ─── Step 3: insert the 7 tasks (no ON CONFLICT — see ⚠️ at top of fn)
    const taskRows = TASKS.map((t) => ({
      user_id: user.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      color: t.color,
      due_date: t.dueOffset === null ? null : relativeDate(t.dueOffset),
      position: t.position,
    }))
    if (!isMounted.current) return
    const { data: tasks, error: taskErr } = await supabase
      .from('tasks')
      .insert(taskRows)
      .select('id, title')
    if (taskErr) throw taskErr
    if (!tasks || tasks.length !== TASKS.length) {
      throw new Error(
        `Expected ${TASKS.length} tasks after insert, got ${tasks?.length ?? 0}`
      )
    }
    const taskByTitle: Record<string, string> = Object.fromEntries(
      tasks.map((t) => [t.title, t.id])
    )

    // ─── Step 4: insert task_labels join rows (idempotent upsert)
    const taskLabelRows = TASKS.flatMap((t) =>
      t.labels.map((labelName) => ({
        task_id: taskByTitle[t.title],
        label_id: labelByName[labelName],
      }))
    )
    if (taskLabelRows.length > 0) {
      if (!isMounted.current) return
      const { error: tlErr } = await supabase
        .from('task_labels')
        .upsert(taskLabelRows, {
          onConflict: 'task_id,label_id',
          ignoreDuplicates: true,
        })
      if (tlErr) throw tlErr
    }

    // ─── Step 5: write has_seeded (LAST — if anything before fails, flag
    // stays unset and the next sign-in self-heals)
    if (!isMounted.current) return
    const { error: updateErr } = await supabase.auth.updateUser({
      data: { has_seeded: true },
    })
    if (updateErr) throw updateErr

    if (import.meta.env.DEV) {
      console.info(
        `[seedDemoData] Seeded ${tasks.length} tasks and ${labels.length} labels for guest user ${user.id.slice(0, 8)}`
      )
    }
  } catch (err) {
    console.error('[seedDemoData] failed:', err)
  }
}

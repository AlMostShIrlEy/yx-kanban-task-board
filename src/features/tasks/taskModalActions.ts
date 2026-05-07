import { toast } from 'sonner'
import type {
  CardColor,
  NewTask,
  Priority,
  Status,
  Task,
  TaskPatch,
} from '../../types'
import type { TasksContextValue } from './TasksProvider'

// ─── Shared types(both used by TaskModal + TaskFormFields)───

export interface FormState {
  title: string
  description: string
  status: Status
  priority: Priority
  due_date: string  // '' = none; '<YYYY-MM-DD>' = set
  color: CardColor | null
  selectedLabelIds: string[]
}

// ModalState — controlled by parent (App). null = closed.
// Re-exported from TaskModal.tsx so App's import path stays stable.
export type ModalState =
  | { mode: 'create'; defaultStatus?: Status }
  | { mode: 'edit'; task: Task }

// ─── Pure form builders / submitters ───

export function buildInitialForm(state: ModalState): FormState {
  if (state.mode === 'edit') {
    const t = state.task
    return {
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      due_date: t.due_date ?? '',
      color: t.color,
      selectedLabelIds: t.labels.map((l) => l.id),
    }
  }
  return {
    title: '',
    description: '',
    status: state.defaultStatus ?? 'todo',
    priority: 'normal',
    due_date: '',
    color: null,
    selectedLabelIds: [],
  }
}

type SubmitMutations = Pick<
  TasksContextValue,
  'createTask' | 'updateTask' | 'attachLabel' | 'detachLabel'
>

// Submit form → either createTask (one call) or updateTask + label
// diffs (parallel). Throws on failure (caller catches; useTasks helper
// already surfaced the toast via optimistic()).
export async function submitTaskForm(args: {
  state: ModalState
  form: FormState
  mutations: SubmitMutations
}): Promise<void> {
  const { state, form, mutations } = args

  if (state.mode === 'create') {
    const input: NewTask = {
      title: form.title.trim(),
      status: form.status,
      priority: form.priority,
    }
    if (form.description.trim()) input.description = form.description.trim()
    if (form.color !== null) input.color = form.color
    if (form.due_date) input.due_date = form.due_date
    if (form.selectedLabelIds.length > 0) input.labels = form.selectedLabelIds
    await mutations.createTask(input)
    return
  }

  // Edit mode: minimal field-level patch + label set diff
  const task = state.task
  const trimmedDesc = form.description.trim() || null
  const newDueDate = form.due_date || null

  const patch: TaskPatch = {}
  if (form.title.trim() !== task.title) patch.title = form.title.trim()
  if (trimmedDesc !== (task.description ?? null)) patch.description = trimmedDesc
  if (form.status !== task.status) patch.status = form.status
  if (form.priority !== task.priority) patch.priority = form.priority
  if (form.color !== task.color) patch.color = form.color
  if (newDueDate !== (task.due_date ?? null)) patch.due_date = newDueDate

  const initialIds = new Set(task.labels.map((l) => l.id))
  const currentIds = new Set(form.selectedLabelIds)
  const toDetach = [...initialIds].filter((id) => !currentIds.has(id))
  const toAttach = [...currentIds].filter((id) => !initialIds.has(id))

  // Parallel — useTasks helper toasts + reverts each independently,
  // so partial failures show partial state (acceptable trade-off).
  const ops: Promise<unknown>[] = []
  if (Object.keys(patch).length > 0) ops.push(mutations.updateTask(task.id, patch))
  for (const id of toDetach) ops.push(mutations.detachLabel(task.id, id))
  for (const id of toAttach) ops.push(mutations.attachLabel(task.id, id))
  await Promise.all(ops)
}

type DeleteMutations = Pick<TasksContextValue, 'createTask' | 'deleteTask'>

// Delete + show sonner Undo toast (5s window). Undo creates a NEW task
// (new id, new timestamps) since useTasks doesn't support delayed/soft
// delete. Acceptable for our scope — no external refs by id.
export async function deleteWithUndo(args: {
  task: Task
  mutations: DeleteMutations
}): Promise<void> {
  const { task, mutations } = args

  const restored: NewTask = {
    title: task.title,
    status: task.status,
    priority: task.priority,
    position: task.position,
  }
  if (task.description) restored.description = task.description
  if (task.color) restored.color = task.color
  if (task.due_date) restored.due_date = task.due_date
  if (task.labels.length > 0) restored.labels = task.labels.map((l) => l.id)

  await mutations.deleteTask(task.id)
  toast.success('Task deleted', {
    action: {
      label: 'Undo',
      onClick: () => {
        // Errors already surface via useTasks helper; swallow here.
        mutations.createTask(restored).catch(() => {})
      },
    },
    duration: 5000,
  })
}

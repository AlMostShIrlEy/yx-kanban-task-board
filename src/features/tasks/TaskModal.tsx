import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { TaskFormFields } from './TaskFormFields'
import { useTasks } from './hooks/useTasks'
import {
  buildInitialForm,
  deleteWithUndo,
  submitTaskForm,
} from './taskModalActions'
import type { FormState, ModalState } from './taskModalActions'

// Re-export so App's import path stays `from './features/tasks/TaskModal'`
export type { ModalState } from './taskModalActions'

interface Props {
  state: ModalState | null
  onClose: () => void
}

// Outer wrapper: mounts/unmounts based on state. Inner component uses a
// `key` so opening a different task forces a fresh mount (clean form,
// fresh dialog ref) — simpler than syncing state via useEffect.
export function TaskModal({ state, onClose }: Props) {
  if (!state) return null
  const key = state.mode === 'edit' ? `edit-${state.task.id}` : 'create'
  return <TaskModalContent key={key} state={state} onClose={onClose} />
}

function TaskModalContent({
  state,
  onClose,
}: {
  state: ModalState
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { labels, createTask, updateTask, deleteTask, attachLabel, detachLabel } =
    useTasks()

  // useState lazy init: only runs once at mount. The outer TaskModal uses
  // `key` to force a remount when switching to a different task, so lazy
  // init is safe (each mount = fresh initial form).
  // useMemo here would be a bug: if `state.task` reference changes mid-edit
  // (e.g., a sibling mutation re-fetches and bumps the task object), the
  // memo would re-run and silently reset the dirty-check baseline while
  // the user is mid-edit.
  const [initialForm] = useState<FormState>(() => buildInitialForm(state))
  const [form, setForm] = useState<FormState>(initialForm)
  const [submitting, setSubmitting] = useState(false)

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Open dialog on mount + lock body scroll. <dialog> showModal() handles
  // focus trap + ESC + inert background; we only add scroll lock.
  useEffect(() => {
    dialogRef.current?.showModal()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // <dialog> emits a `close` event for ESC, programmatic .close(), or
  // backdrop click via .close(). One handler covers all close paths.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  // Backdrop click — when target is the dialog element itself (vs the
  // inner content), user clicked outside the panel area.
  function handleDialogClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      dialogRef.current?.close()
    }
  }
  const close = () => dialogRef.current?.close()

  // Dirty check via JSON serialization — all FormState fields are
  // primitives or string arrays, so JSON output is deterministic.
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm]
  )
  const canSave =
    form.title.trim().length > 0 && (state.mode === 'create' || isDirty)

  const toggleLabel = (labelId: string) =>
    updateField(
      'selectedLabelIds',
      form.selectedLabelIds.includes(labelId)
        ? form.selectedLabelIds.filter((id) => id !== labelId)
        : [...form.selectedLabelIds, labelId]
    )

  async function handleSave() {
    if (!canSave || submitting) return
    setSubmitting(true)
    try {
      await submitTaskForm({
        state,
        form,
        mutations: { createTask, updateTask, attachLabel, detachLabel },
      })
      close()
    } catch {
      // useTasks already surfaced toasts; keep modal open for retry.
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (state.mode !== 'edit' || submitting) return
    close()
    await deleteWithUndo({
      task: state.task,
      mutations: { createTask, deleteTask },
    }).catch(() => {
      // useTasks already toasted
    })
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      aria-labelledby="task-modal-title"
      // p-0 重置浏览器默认 padding;backdrop:* 是 Tailwind v4 的 ::backdrop
      // pseudo 修饰符。dialog 自身保持 block display:UA 的 fixed/inset/
      // margin:auto 居中算法依赖 block 才能可靠生效。flex 容器下放到内层
      // div,避免 display:flex 干扰 dialog 自身的居中定位。
      // m-auto 显式恢复 margin:auto — Tailwind v4 preflight 把所有元素 margin
      // 重置为 0,覆盖了 UA <dialog> 的 margin:auto 居中行为(详见 PLAN.md §10
      // backlog)。inset:0 + margin:auto 才能让 dialog 在视口中心。
      className="m-auto w-full max-w-lg rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
    >
      {/* 内层 flex 容器:max-h + flex-col 让 body 区域内滚,header/footer
          固定上下,而不是整个 dialog 一起滚。 */}
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2
            id="task-modal-title"
            className="text-lg font-semibold text-slate-900"
          >
            {state.mode === 'create' ? 'Create task' : 'Edit task'}
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <TaskFormFields
            form={form}
            updateField={updateField}
            toggleLabel={toggleLabel}
            availableLabels={labels}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          {state.mode === 'edit' ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="text-sm font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || submitting}
              className="rounded-xl bg-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { TagPill } from '../../components/TagPill'
import { cn } from '../../lib/cn'
import { LABEL_COLORS } from '../../types'
import type { Label, LabelColor, NewLabel, Task } from '../../types'

interface Props {
  availableLabels: Label[]
  selectedIds: string[]
  tasks: Task[]
  onToggle: (labelId: string) => void
  onCreate: (input: NewLabel) => Promise<Label>
  onLabelCreated: (labelId: string) => void
  onUpdate: (
    id: string,
    patch: Partial<Pick<NewLabel, 'name' | 'color'>>
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

// Static lookup so Tailwind v4 JIT can scan the literal class names —
// dynamic `bg-label-${color}-bg` strings would NOT be picked up.
const SWATCH_BG: Record<LabelColor, string> = {
  blue:    'bg-label-blue-bg',
  purple:  'bg-label-purple-bg',
  pink:    'bg-label-pink-bg',
  orange:  'bg-label-orange-bg',
  green:   'bg-label-green-bg',
  yellow:  'bg-label-yellow-bg',
  teal:    'bg-label-teal-bg',
  cyan:    'bg-label-cyan-bg',
  red:     'bg-label-red-bg',
  lime:    'bg-label-lime-bg',
  slate:   'bg-label-slate-bg',
  fuchsia: 'bg-label-fuchsia-bg',
}

function randomLabelColor(): LabelColor {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)]!
}

// Form mode is a discriminated union so `closed` carries no payload,
// `edit` carries the snapshot needed for the dirty check, and `delete`
// carries the affected-count computed at click time (frozen so the
// panel message stays accurate even if `tasks` mutates while open).
//
// Inline panel (vs sonner toast) because TaskModal is a <dialog> in the
// browser top layer; toast portals at App root sit behind the dialog
// and are visually obscured. Same-region inline confirm side-steps the
// stacking-context problem entirely.
type FormMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | {
      kind: 'edit'
      labelId: string
      initialName: string
      initialColor: LabelColor
    }
  | {
      kind: 'delete'
      labelId: string
      labelName: string
      affectedCount: number
    }

// Inline chip list + create/edit form for label management within
// TaskModal. Click an existing chip to toggle attach/detach. Hover
// reveals edit / delete icons. Click "+ New label" to open the create
// form; click pencil on a chip to enter rename mode in the same form.
// Empty list opens the create form by default.
export function LabelMultiSelect({
  availableLabels,
  selectedIds,
  tasks,
  onToggle,
  onCreate,
  onLabelCreated,
  onUpdate,
  onDelete,
}: Props) {
  const [formMode, setFormMode] = useState<FormMode>(() =>
    availableLabels.length === 0 ? { kind: 'create' } : { kind: 'closed' }
  )
  const [name, setName] = useState('')
  const [color, setColor] = useState<LabelColor>(() => randomLabelColor())
  const [submitting, setSubmitting] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the name input each time the form opens (or switches
  // between create / edit / a different edit). Edit mode also selects
  // the current name so the user can type to replace immediately.
  useEffect(() => {
    if (formMode.kind === 'closed') return
    inputRef.current?.focus()
    if (formMode.kind === 'edit') inputRef.current?.select()
  }, [formMode])

  // Cross-tab safety: if another tab deletes the label this user is
  // editing OR confirming-delete on, close the form/panel so the user
  // isn't staring at a stale snapshot of a label that no longer exists.
  useEffect(() => {
    if (formMode.kind !== 'edit' && formMode.kind !== 'delete') return
    const stillExists = availableLabels.some((l) => l.id === formMode.labelId)
    if (!stillExists) {
      setFormMode({ kind: 'closed' })
      setName('')
    }
  }, [formMode, availableLabels])

  // Intercept ESC while any form is open so it closes the form instead
  // of the parent <dialog>. Capture phase + stopPropagation +
  // preventDefault are all needed: the dialog responds to the native
  // ESC keydown action, which fires before bubbling.
  useEffect(() => {
    if (formMode.kind === 'closed') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setFormMode({ kind: 'closed' })
      setName('')
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () =>
      window.removeEventListener('keydown', handler, { capture: true })
  }, [formMode.kind])

  function openCreateForm() {
    setFormMode({ kind: 'create' })
    setName('')
    setColor(randomLabelColor())
  }

  function openEditForm(label: Label) {
    setFormMode({
      kind: 'edit',
      labelId: label.id,
      initialName: label.name,
      initialColor: label.color,
    })
    setName(label.name)
    setColor(label.color)
  }

  function cancelForm() {
    setFormMode({ kind: 'closed' })
    setName('')
  }

  function confirmDelete(label: Label) {
    // Snapshot the affected count at click time so the panel copy
    // stays stable while the user reads it (other tabs / mutations
    // could otherwise mutate `tasks` underneath).
    const affectedCount = tasks.filter((t) =>
      t.labels.some((l) => l.id === label.id)
    ).length
    setFormMode({
      kind: 'delete',
      labelId: label.id,
      labelName: label.name,
      affectedCount,
    })
  }

  function handleDelete() {
    if (formMode.kind !== 'delete') return
    // Fire-and-forget: deleteLabel applies an optimistic local cascade
    // synchronously, so closing the panel right away is correct — the
    // user sees the chip + every embedded pill disappear. On server
    // failure the optimistic apply reverts and a toast surfaces; the
    // panel does not need to stay open to communicate that.
    onDelete(formMode.labelId).catch(() => {})
    setFormMode({ kind: 'closed' })
    setName('')
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || submitting) return

    if (formMode.kind === 'create') {
      setSubmitting(true)
      try {
        const newLabel = await onCreate({ name: trimmed, color })
        onLabelCreated(newLabel.id)
        setFormMode({ kind: 'closed' })
        setName('')
      } catch {
        // toast already surfaced; keep form open + values for retry
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (formMode.kind === 'edit') {
      const { labelId, initialName, initialColor } = formMode
      const patch: Partial<Pick<NewLabel, 'name' | 'color'>> = {}
      if (trimmed !== initialName) patch.name = trimmed
      if (color !== initialColor) patch.color = color
      // canSubmit guards against empty patch; defensive check anyway.
      if (Object.keys(patch).length === 0) return

      setSubmitting(true)
      try {
        await onUpdate(labelId, patch)
        setFormMode({ kind: 'closed' })
        setName('')
      } catch {
        // toast already surfaced; keep form open + values for retry
      } finally {
        setSubmitting(false)
      }
    }
  }

  // Dirty check varies by mode:
  // - create: any non-empty name is enough
  // - edit:   non-empty AND different from initial name OR color
  const trimmedName = name.trim()
  let canSubmit = false
  if (formMode.kind === 'create') {
    canSubmit = trimmedName.length > 0 && !submitting
  } else if (formMode.kind === 'edit') {
    const dirty =
      trimmedName !== formMode.initialName || color !== formMode.initialColor
    canSubmit = trimmedName.length > 0 && !submitting && dirty
  }

  const selectedSet = new Set(selectedIds)

  return (
    <div className="space-y-2">
      {availableLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableLabels.map((label) => {
            const isSelected = selectedSet.has(label.id)
            return (
              <div
                key={label.id}
                className="group inline-flex items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => onToggle(label.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'rounded-full transition-opacity',
                    !isSelected &&
                      'opacity-40 hover:opacity-70 group-hover:opacity-70'
                  )}
                >
                  <TagPill color={label.color}>#{label.name}</TagPill>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditForm(label)
                  }}
                  aria-label={`Edit label ${label.name}`}
                  className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-slate-700 group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    confirmDelete(label)
                  }}
                  aria-label={`Delete label ${label.name}`}
                  className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {formMode.kind === 'delete' ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Delete label "{formMode.labelName}"?
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {formMode.affectedCount === 0
                ? 'This label is not attached to any task.'
                : `This will detach it from ${formMode.affectedCount} task${formMode.affectedCount === 1 ? '' : 's'}.`}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100"
            >
              Delete
            </button>
          </div>
        </div>
      ) : formMode.kind !== 'closed' ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Label name"
            maxLength={30}
            aria-label="Label name"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />

          <div
            role="radiogroup"
            aria-label="Label color"
            className="grid grid-cols-6 gap-2"
          >
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-full transition-shadow',
                  SWATCH_BG[c],
                  color === c
                    ? 'ring-2 ring-offset-2 ring-slate-900'
                    : 'hover:ring-2 hover:ring-slate-300'
                )}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelForm}
              disabled={submitting}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-lg bg-action px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {formMode.kind === 'create'
                ? submitting
                  ? 'Creating…'
                  : 'Create'
                : submitting
                  ? 'Saving…'
                  : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCreateForm}
          aria-expanded={false}
          className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          + New label
        </button>
      )}
    </div>
  )
}

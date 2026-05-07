import type { ReactNode } from 'react'
import { ColorPicker } from './ColorPicker'
import { LabelMultiSelect } from './LabelMultiSelect'
import { cn } from '../../lib/cn'
import { PRIORITIES, STATUSES } from '../../types'
import type { CardColor, Label, Priority, Status } from '../../types'
import type { FormState } from './taskModalActions'

const STATUS_LABELS: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

// 共享 input/select/textarea 类:slate 边框 + focus ring
const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200'

interface Props {
  form: FormState
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  toggleLabel: (labelId: string) => void
  availableLabels: Label[]
}

// All form-field JSX for TaskModal — extracted to keep TaskModal under
// the 200-line limit. Pure presentational; modal owns state + handlers.
export function TaskFormFields({
  form,
  updateField,
  toggleLabel,
  availableLabels,
}: Props) {
  return (
    <>
      <Field label="Title" htmlFor="task-title" required>
        <input
          id="task-title"
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="What needs doing?"
          maxLength={200}
          required
          className={inputClass}
        />
      </Field>

      <Field label="Description" htmlFor="task-description">
        <textarea
          id="task-description"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
          placeholder="Optional notes…"
          className={cn(inputClass, 'resize-none')}
        />
      </Field>

      {/* Status / Priority / Due date — 3-col flex */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status" htmlFor="task-status">
          <select
            id="task-status"
            value={form.status}
            onChange={(e) => updateField('status', e.target.value as Status)}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="task-priority">
          <select
            id="task-priority"
            value={form.priority}
            onChange={(e) =>
              updateField('priority', e.target.value as Priority)
            }
            className={inputClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date" htmlFor="task-due-date">
          <input
            id="task-due-date"
            type="date"
            value={form.due_date}
            onChange={(e) => updateField('due_date', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Color">
        <ColorPicker
          value={form.color}
          onChange={(color: CardColor | null) => updateField('color', color)}
        />
      </Field>

      <Field label="Labels">
        <LabelMultiSelect
          availableLabels={availableLabels}
          selectedIds={form.selectedLabelIds}
          onToggle={toggleLabel}
        />
      </Field>
    </>
  )
}

// Field wrapper — label + a11y htmlFor 配对 + required asterisk。
function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-slate-700"
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

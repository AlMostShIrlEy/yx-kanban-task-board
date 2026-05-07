import { TagPill } from '../../components/TagPill'
import { cn } from '../../lib/cn'
import type { Label } from '../../types'

interface Props {
  availableLabels: Label[]
  selectedIds: string[]
  onToggle: (labelId: string) => void
}

// Inline chip list for label multi-select. Click toggles attached/detached.
// Detached chips use opacity-40 to communicate "available but not on this
// task" without hiding them — keeps all options visible at a glance.
// Reuses TagPill so the visual matches what the card renders.
//
// Step 5 doesn't include label creation — Phase 4 sidebar (LabelManager)
// owns label CRUD. Empty list shows a hint pointing there.
export function LabelMultiSelect({
  availableLabels,
  selectedIds,
  onToggle,
}: Props) {
  if (availableLabels.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No labels yet — create labels from the sidebar (coming in Phase 4).
      </p>
    )
  }

  const selectedSet = new Set(selectedIds)

  return (
    <div className="flex flex-wrap gap-1.5">
      {availableLabels.map((label) => {
        const isSelected = selectedSet.has(label.id)
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => onToggle(label.id)}
            aria-pressed={isSelected}
            // 整个 button 包 TagPill;未选中 opacity-40 让"可点"
            // 未选中也保持可见,hover 升到 0.7 预览选中感
            className={cn(
              'rounded-full transition-opacity',
              !isSelected && 'opacity-40 hover:opacity-70'
            )}
          >
            <TagPill color={label.color}>#{label.name}</TagPill>
          </button>
        )
      })}
    </div>
  )
}

import { MoreHorizontal, Tag } from 'lucide-react'
import { AvatarBubble } from '../../components/AvatarBubble'
import { DueDateBadge } from '../../components/DueDateBadge'
import { TagPill } from '../../components/TagPill'
import { cn } from '../../lib/cn'
import type { CardColor, Priority, Task } from '../../types'
import { CARD_COLORS } from '../../types'

interface Props {
  task: Task
  className?: string
  onEditClick?: (taskId: string) => void  // omit → no edit button (Step 5 wires this)
}

// Static class lookup so Tailwind v4 JIT can scan the literals.
// Mirrors TagPill's COLOR_CLASSES — both reference the same @theme tokens.
// Slight duplication accepted (6 lines × 2 sites) vs introducing a
// shared cardColors module for so few entries.
const CARD_COLOR_CLASSES: Record<CardColor, string> = {
  blue:   'bg-card-blue-bg text-card-blue-fg',
  purple: 'bg-card-purple-bg text-card-purple-fg',
  pink:   'bg-card-pink-bg text-card-pink-fg',
  orange: 'bg-card-orange-bg text-card-orange-fg',
  green:  'bg-card-green-bg text-card-green-fg',
  yellow: 'bg-card-yellow-bg text-card-yellow-fg',
}

// Priority emoji indicator — only rendered for non-normal priority.
// Most tasks are normal, so most cards stay visually quiet (no emoji noise).
// aria-label gives screen readers the semantic word; emoji glyphs read poorly.
const PRIORITY_EMOJI: Record<Priority, string | null> = {
  high: '🔥',
  normal: null,
  low: '💤',
}

// Hash task.id to a stable color when task.color is null. Same pattern
// as AvatarBubble (first 2 hex chars mod palette length); UUIDs are
// random so this distributes evenly. Per types/index.ts contract:
// "UI must always provide this fallback".
function hashColor(taskId: string): CardColor {
  const byte = parseInt(taskId.slice(0, 2), 16)
  const idx = Number.isNaN(byte) ? 0 : byte % CARD_COLORS.length
  return CARD_COLORS[idx]
}

// TaskCard — pure presentational. dnd-agnostic (Step 6 wraps it in a
// SortableTaskCard HOC). Optional onEditClick prop reserves the visual
// position for the edit-button (Step 5 wires this to TaskModal);
// currently TaskBoard doesn't pass it so the button stays hidden.
// Rendering matches CLAUDE.md card anatomy: pills row → title →
// optional note → footer (avatar + due-date + label-count).
//
// DotProgress intentionally NOT rendered — no real progress source
// (decided in Step 2 Q1; status-derived would have made every card in
// the same column visually identical).
export function TaskCard({ task, className, onEditClick }: Props) {
  const colorKey = task.color ?? hashColor(task.id)
  const colorClass = CARD_COLOR_CLASSES[colorKey]
  const labelCount = task.labels.length

  return (
    <article
      className={cn(
        // Soft rounded corners + subtle shadow + inner padding; on hover
        // the shadow deepens and the card lifts 2px (per CLAUDE.md spec).
        'rounded-2xl p-4 shadow-sm transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md',
        colorClass,
        className
      )}
    >
      {/* Pills + edit-button row — rendered when there's at least one
          label OR an onEditClick handler is passed. ml-auto keeps the
          button pinned right even when the pills section isn't rendered
          (avoids an empty placeholder div); items-start keeps the button
          aligned to the top edge when pills wrap onto multiple lines. */}
      {(labelCount > 0 || onEditClick) && (
        <div className="mb-3 flex items-start gap-2">
          {labelCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((label) => (
                <TagPill key={label.id} color={label.color}>
                  #{label.name}
                </TagPill>
              ))}
            </div>
          )}
          {onEditClick && (
            <button
              type="button"
              // onPointerDown stops dnd-kit's PointerSensor from seeing
              // the pointerdown event (the sensor is on the
              // SortableTaskCard ancestor); onClick stops the click from
              // bubbling. Defense in depth — the distance:8 sensor
              // constraint already filters out most accidental drags;
              // this is an extra layer for cases where the user moves
              // 8px+ while clicking.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onEditClick(task.id)
              }}
              className="ml-auto rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Edit task"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Title — color inherits from the card fg; leading-tight keeps
          multi-line titles compact. high/low priority tasks get an
          emoji prefix (normal renders none). flex + items-baseline +
          shrink-0 is more cross-browser stable than inline span margins;
          baseline aligns the emoji with the title text baseline (rather
          than top-aligned). */}
      <div className="flex items-baseline gap-1.5">
        {PRIORITY_EMOJI[task.priority] && (
          <span
            aria-label={`${task.priority} priority`}
            className="shrink-0"
          >
            {PRIORITY_EMOJI[task.priority]}
          </span>
        )}
        <h3 className="text-base font-semibold leading-tight">{task.title}</h3>
      </div>

      {/* Note — text-slate-500 explicitly overrides the card's fg so the
          note sits at a lower visual hierarchy than the title;
          line-clamp-3 prevents an over-long note from making the card
          too tall (Tailwind v4 supports this natively). */}
      {task.description && (
        <p className="mt-2 text-sm text-slate-500 line-clamp-3">
          Note: {task.description}
        </p>
      )}

      {/* Footer row: avatar on the left, [due-date?, label-count?] on the right */}
      <div className="mt-4 flex items-center justify-between">
        <AvatarBubble userId={task.user_id} size="sm" />
        <div className="flex items-center gap-2">
          {/* Done column doesn't show due-date — "X days overdue" is
              meaningless on a completed task. */}
          {task.due_date && task.status !== 'done' && (
            <DueDateBadge dueDate={task.due_date} />
          )}
          {labelCount > 0 && (
            // Same pill shape as DueDateBadge for visual rhythm; neutral
            // slate avoids competing with severity colors for attention.
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              <Tag className="h-3 w-3" aria-hidden="true" />
              {labelCount}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

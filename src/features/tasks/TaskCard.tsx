import { Tag } from 'lucide-react'
import { AvatarBubble } from '../../components/AvatarBubble'
import { DueDateBadge } from '../../components/DueDateBadge'
import { TagPill } from '../../components/TagPill'
import { cn } from '../../lib/cn'
import type { CardColor, Task } from '../../types'
import { CARD_COLORS } from '../../types'

interface Props {
  task: Task
  className?: string
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
// SortableTaskCard HOC). No onClick yet (Step 5 modal integration adds
// it). Rendering matches CLAUDE.md card anatomy: pills row → title →
// optional note → footer (avatar + due-date + label-count).
//
// DotProgress intentionally NOT rendered — no real progress source
// (decided in Step 2 Q1; status-derived would have made every card in
// the same column visually identical).
export function TaskCard({ task, className }: Props) {
  const colorKey = task.color ?? hashColor(task.id)
  const colorClass = CARD_COLOR_CLASSES[colorKey]
  const labelCount = task.labels.length

  return (
    <article
      className={cn(
        // 软圆角 + 微阴影 + 内 padding;hover 时阴影加深 + 上抬 2px(CLAUDE.md spec)
        'rounded-2xl p-4 shadow-sm transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md',
        colorClass,
        className
      )}
    >
      {/* Pills 行 — 仅在有 label 时渲染;flex-wrap 让多 label 自然换行,卡变高 */}
      {labelCount > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <TagPill key={label.id} color={label.color}>
              #{label.name}
            </TagPill>
          ))}
        </div>
      )}

      {/* Title — color 继承自卡 fg;leading-tight 让多行 title 也紧凑 */}
      <h3 className="text-base font-semibold leading-tight">{task.title}</h3>

      {/* Note — text-slate-500 显式 override 卡 fg,跟 title 形成层级;
          line-clamp-3 防止过长 note 把卡撑得过高(Tailwind v4 原生支持) */}
      {task.description && (
        <p className="mt-2 text-sm text-slate-500 line-clamp-3">
          Note: {task.description}
        </p>
      )}

      {/* Footer 行:左 avatar,右 [due-date?, label-count?] */}
      <div className="mt-4 flex items-center justify-between">
        <AvatarBubble userId={task.user_id} size="sm" />
        <div className="flex items-center gap-2">
          {task.due_date && <DueDateBadge dueDate={task.due_date} />}
          {labelCount > 0 && (
            // 跟 DueDateBadge 同款 pill 形状,视觉节奏一致;
            // slate 中性色不跟 severity 色抢权重
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

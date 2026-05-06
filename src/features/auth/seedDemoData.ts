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

// SeedTask 的字段映射:
//   dueOffset = null            → due_date NULL
//   dueOffset = 整数(可正可负) → CURRENT_DATE + N days
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

// 用本地时区算"今天 + N 天",输出 YYYY-MM-DD 字符串。
// 不用 toISOString().slice(0,10) 是因为后者按 UTC 切日期,远离 UTC 的时区
// 会把"昨天/明天"算成"今天"。Postgres date 列存的是日历日,本地时区更合理。
function relativeDate(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// readonly 形式让 seed 函数无法误改 mount 标志,只能读取。
interface MountRef {
  readonly current: boolean
}

// ─── Seed function ────────────────────────────────────────────────────
//
// 给当前匿名用户的看板写入 demo 数据。
//
// 幂等性:
//   • 首检:user.user_metadata.has_seeded === true 时直接 return,免一次往返
//   • 二检:labels 用 ON CONFLICT (user_id, name) DO NOTHING(supabase-js 的
//     upsert + ignoreDuplicates),task_labels 用 ON CONFLICT (task_id, label_id)
//     DO NOTHING。重试不会产生重复
//   • ⚠️ tasks 表没有除 id 外的 unique 约束 → 无法 ON CONFLICT。一旦 partial
//     fail 后重试,可能产生重复 task。MVP 规模可接受;Phase 4 真上线前可以加
//     一个 (user_id, title) 的 partial unique constraint 收紧
//
// 自愈:
//   • has_seeded 标志在最后一步才写入 → 中间任何一步失败,标志不会被设,
//     下次 page reload 触发的 INITIAL_SESSION 会再次进入 seed 流程
//
// 错误策略:
//   • 全部 catch,console.error 打日志,**不 throw** —— 不阻塞应用
//
// MountRef 检查:
//   • 每个 await 之前过一遍 isMounted.current,组件卸载后停止后续请求
//
export async function seedDemoData(
  user: User,
  isMounted: MountRef = { current: true }
): Promise<void> {
  // 首检:metadata 已标记过就跳过
  if (user.user_metadata?.has_seeded === true) return

  try {
    // ─── Step 1: 确保 5 个 labels 存在(幂等 upsert)
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

    // ─── Step 2: 把 5 个 labels 读回来拿 ID(无论是否新插)
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

    // ─── Step 3: 插入 7 个 tasks(无 ON CONFLICT,见函数顶注释 ⚠️)
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

    // ─── Step 4: 插入 task_labels join 行(幂等 upsert)
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

    // ─── Step 5: 写 has_seeded(LAST — 中途失败不会标记,下次自愈)
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

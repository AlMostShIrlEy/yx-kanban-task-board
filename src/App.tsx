import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/hooks/useAuth'
import { TasksProvider } from './features/tasks/TasksProvider'
import { useTasks } from './features/tasks/hooks/useTasks'
import { TaskBoard } from './features/board/TaskBoard'
import { TaskModal } from './features/tasks/TaskModal'
import type { ModalState } from './features/tasks/TaskModal'
import type { Status } from './types'

function HelloUser() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="text-2xl font-semibold text-slate-900">
      Hello, Guest{' '}
      <span className="font-mono text-brand">{user.id.slice(0, 8)}</span>
    </div>
  )
}

// AppContent — needs useTasks (for openEdit task lookup) so it lives
// inside <TasksProvider>. Owns modalState + threads callbacks down to
// header button (Create task) and TaskBoard (per-column add + per-card
// edit).
function AppContent() {
  const { tasks } = useTasks()
  const [modalState, setModalState] = useState<ModalState | null>(null)

  const openCreate = (defaultStatus?: Status) =>
    setModalState({ mode: 'create', defaultStatus })

  const openEdit = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) setModalState({ mode: 'edit', task })
    // Silently no-op if task missing (e.g., realtime delete races a click)
  }

  const closeModal = () => setModalState(null)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header — flex justify-between: 左 HelloUser, 右 + Create task button */}
      <header className="flex items-center justify-between px-6 py-4">
        <HelloUser />
        <button
          type="button"
          onClick={() => openCreate()}
          // bg-action = #0F172A (slate-900) per @theme;rounded-xl 跟设计 spec 一致
          className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          <Plus className="h-4 w-4" />
          Create task
        </button>
      </header>

      {/* main 占剩余高度;父级不限制 overflow,让 TaskBoard 内部
          的 overflow-x-auto 单独负责列横滚。pb-6 留底部呼吸。 */}
      <main className="flex-1 px-6 pb-6">
        <TaskBoard onAddTask={openCreate} onEditClick={openEdit} />
      </main>

      <TaskModal state={modalState} onClose={closeModal} />
    </div>
  )
}

function App() {
  return (
    <>
      {/* Toaster lives OUTSIDE AuthProvider so toasts can fire during auth
          loading / error states. AuthProvider doesn't render its children
          until auth is ready (it shows its own loading / error UI in the
          meantime), so a Toaster nested inside would only mount after auth
          is ready — too late for any pre-auth toast to surface.
          sonner portals to <body>, so root-level mounting is conventional. */}
      <Toaster position="bottom-right" richColors closeButton />
      <AuthProvider>
        <TasksProvider>
          <AppContent />
        </TasksProvider>
      </AuthProvider>
    </>
  )
}

export default App

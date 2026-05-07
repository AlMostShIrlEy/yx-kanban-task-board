import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/hooks/useAuth'
import { TasksProvider } from './features/tasks/TasksProvider'
import { useTasks } from './features/tasks/hooks/useTasks'
import { TaskBoard } from './features/board/TaskBoard'
import { Sidebar } from './features/board/Sidebar'
import { StatsWidget } from './features/board/StatsWidget'
import { TaskModal } from './features/tasks/TaskModal'
import type { ModalState } from './features/tasks/TaskModal'
import type { Status } from './types'

// AppContent — needs useTasks (for openEdit task lookup, taskCount,
// stats) and useAuth (for sidebar user card), so it lives inside both
// providers. Owns modalState + threads callbacks down to header button
// (Create task) and TaskBoard (per-column add + per-card edit).
function AppContent() {
  const { user } = useAuth()
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

  // AuthProvider's contract: it doesn't render children until user is
  // non-null. TS can't infer the contract; defensive narrow.
  if (!user) return null

  // Header date label. Locale hard-coded to 'en-US' so the header reads
  // consistently regardless of the browser's preferred language —
  // matches the project's English-only convention.
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar taskCount={tasks.length} user={user}>
        <StatsWidget />
      </Sidebar>

      {/* Main column — flex-1 fills remaining width; flex-col stacks
          header above main; overflow-hidden delegates horizontal scroll
          to TaskBoard's own overflow-x-auto. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium text-slate-400">Today</p>
            <p className="text-base font-medium text-slate-900">{todayLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" />
            Create task
          </button>
        </header>

        <main className="flex-1 overflow-hidden p-6">
          <TaskBoard onAddTask={openCreate} onEditClick={openEdit} />
        </main>
      </div>

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

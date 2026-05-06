import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/hooks/useAuth'
import { TasksProvider } from './features/tasks/TasksProvider'
import { TaskBoard } from './features/board/TaskBoard'

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
          <div className="min-h-screen flex flex-col">
            <header className="px-6 py-4">
              <HelloUser />
            </header>
            {/* main 占剩余高度;父级不限制 overflow,让 TaskBoard 内部
                的 overflow-x-auto 单独负责列横滚。pb-6 留底部呼吸。 */}
            <main className="flex-1 px-6 pb-6">
              <TaskBoard />
            </main>
          </div>
        </TasksProvider>
      </AuthProvider>
    </>
  )
}

export default App

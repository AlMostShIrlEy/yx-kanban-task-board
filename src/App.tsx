import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/hooks/useAuth'
import { TasksProvider } from './features/tasks/TasksProvider'

// Phase 1 smoke test: prove anonymous auth works end-to-end.
// Phase 2 will replace this with the real <Layout> + <TaskBoard>.
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
          <div className="min-h-screen flex items-center justify-center">
            <HelloUser />
          </div>
        </TasksProvider>
      </AuthProvider>
    </>
  )
}

export default App

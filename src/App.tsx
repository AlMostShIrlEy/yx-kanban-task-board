import { useMemo, useState } from 'react'
import { Filter, Plus, Search } from 'lucide-react'
import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/hooks/useAuth'
import { TasksProvider } from './features/tasks/TasksProvider'
import { useTasks } from './features/tasks/hooks/useTasks'
import { TaskBoard } from './features/board/TaskBoard'
import { Sidebar } from './features/board/Sidebar'
import { StatsWidget } from './features/board/StatsWidget'
import { FilterPopover } from './features/board/FilterPopover'
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyFiltersAndSearch,
} from './features/board/filterUtils'
import type { Filters } from './features/board/filterUtils'
import { TaskModal } from './features/tasks/TaskModal'
import type { ModalState } from './features/tasks/TaskModal'
import { cn } from './lib/cn'
import type { Status } from './types'

// AppContent — needs useTasks (for openEdit task lookup, taskCount,
// stats) and useAuth (for sidebar user card), so it lives inside both
// providers. Owns modalState + search/filter state + threads callbacks
// and filtered tasks down to header (search input, filter button) and
// TaskBoard (per-column add + per-card edit).
function AppContent() {
  const { user } = useAuth()
  const { tasks } = useTasks()
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  // Filtered + searched tasks driven to TaskBoard. Pure derivation —
  // no debounce; at MVP scale (<100 tasks) instant filtering feels
  // premium, debouncing would just feel laggy.
  const filteredTasks = useMemo(
    () => applyFiltersAndSearch(tasks, search, filters),
    [tasks, search, filters]
  )

  const filterCount = activeFilterCount(filters)
  const hasActiveFiltersOnly = filterCount > 0
  // EmptyState differentiation needs to know if EITHER search OR a
  // filter is active so its copy can switch from "No tasks yet" to
  // "No matching tasks".
  const isFiltered = hasActiveFiltersOnly || search.trim().length > 0

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

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-slate-100 bg-white px-6 py-4">
          {/* Today date — left, fixed-width via shrink-0 */}
          <div className="shrink-0">
            <p className="text-xs font-medium text-slate-400">Today</p>
            <p className="text-base font-medium text-slate-900">{todayLabel}</p>
          </div>

          {/* Search input — center, expands with max-w cap. Leading icon
              positioned absolutely; pl-9 makes room for it. */}
          <div className="relative max-w-md flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {/* Filter + Create — right cluster */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              popoverTarget="filter-popover"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition-colors',
                hasActiveFiltersOnly
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              <Filter className="h-4 w-4" />
              Filter{filterCount > 0 && ` (${filterCount})`}
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              Create task
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-6">
          <TaskBoard
            tasks={filteredTasks}
            hasActiveFilters={isFiltered}
            onAddTask={openCreate}
            onEditClick={openEdit}
          />
        </main>
      </div>

      <FilterPopover filters={filters} onChange={setFilters} />
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

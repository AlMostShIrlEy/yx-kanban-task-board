import { useContext } from 'react'
import { TasksContext } from '../TasksProvider'
import type { TasksContextValue } from '../TasksProvider'

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (ctx === null) {
    throw new Error(
      'useTasks must be used inside <TasksProvider>. Wrap your component ' +
        'tree with <TasksProvider> from src/features/tasks/TasksProvider.tsx.'
    )
  }
  return ctx
}

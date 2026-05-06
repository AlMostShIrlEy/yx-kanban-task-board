import { useContext } from 'react'
import { AuthContext } from '../AuthContext'
import type { AuthContextValue } from '../AuthContext'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error(
      'useAuth must be used inside <AuthProvider>. Wrap your component tree ' +
        'with <AuthProvider> from src/features/auth/AuthContext.tsx.'
    )
  }
  return ctx
}

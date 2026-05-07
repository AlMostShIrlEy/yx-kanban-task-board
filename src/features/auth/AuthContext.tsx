import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { seedDemoData } from './seedDemoData'

// AuthContextValue — every piece of auth state consumers can read off
// the context. `loading` is true on first mount until either an existing
// session is restored from storage OR an anonymous sign-in succeeds.
export interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  error: Error | null
}

// Default null lets useAuth detect "not in Provider" and throw cleanly.
export const AuthContext = createContext<AuthContextValue | null>(null)

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // initRef guards against React 18 StrictMode double-mount (the effect
  // runs twice in dev). Without it, signInAnonymously() would create two
  // ghost anonymous users on every cold start.
  const initRef = useRef(false)

  // isMountedRef lets background work (seedDemoData) self-check before
  // each await and bail out when the component unmounts, avoiding stray
  // network requests after teardown.
  const isMountedRef = useRef(true)

  // seedAttemptedRef prevents seed from being triggered multiple times
  // within a single component lifecycle by overlapping auth events
  // (INITIAL_SESSION + SIGNED_IN + USER_UPDATED). seedDemoData also
  // checks has_seeded internally as a second idempotency layer —
  // belt and suspenders.
  const seedAttemptedRef = useRef(false)

  // seedInFlightRef: true while a seedDemoData Promise is mid-flight.
  // Used to keep loading=true across StrictMode's double-mount: if the
  // first mount kicked off seed and the second mount's INITIAL_SESSION
  // arrives while seed is still running, we must NOT release loading
  // early — the Promise's .finally will do it when seed completes.
  const seedInFlightRef = useRef(false)

  const initialize = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: getErr } = await supabase.auth.getSession()
      if (getErr) throw getErr
      if (!data.session) {
        const { error: signErr } = await supabase.auth.signInAnonymously()
        if (signErr) throw signErr
        // Don't setLoading(false) here; wait for onAuthStateChange's
        // SIGNED_IN event to deliver the new session along with the
        // state update, avoiding a transient `user=null && loading=false`
        // window.
      }
      // Existing session path: onAuthStateChange's INITIAL_SESSION has
      // already updated state.
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // StrictMode runs the effect twice; the cleanup sets isMountedRef
    // to false. Reset to true at effect entry so seed can still run on
    // the second mount.
    isMountedRef.current = true
    let mounted = true

    // Subscribe to all auth state changes. Subscription creation
    // immediately fires INITIAL_SESSION with the current session
    // (possibly null). SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED etc. fire
    // on subsequent transitions.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession) setError(null)

      // Explicit sign-out → release loading immediately.
      if (event === 'SIGNED_OUT') {
        setLoading(false)
        return
      }

      // INITIAL_SESSION with no session means "no session yet, signing
      // in momentarily" — keep loading=true and wait for SIGNED_IN.
      if (!newSession) return

      // First-time anonymous user: trigger seed BEFORE releasing
      // loading so the board's first fetch sees populated data
      // (otherwise: empty board flashes for ~500ms-1s, requiring a
      // refresh — diagnosed in PLAN.md §10 backlog).
      // For returning anon users, seedDemoData's first-line idempotent
      // check (has_seeded === true) returns immediately → .finally
      // fires in the next microtask → no perceptible delay.
      // seedInFlightRef gates against the StrictMode case where the
      // second mount's INITIAL_SESSION arrives while the first mount's
      // seed is still running — we must NOT release loading early in
      // the else branch.
      if (
        newSession.user.is_anonymous &&
        !seedAttemptedRef.current &&
        isMountedRef.current
      ) {
        seedAttemptedRef.current = true
        seedInFlightRef.current = true
        seedDemoData(newSession.user, isMountedRef)
          .then((ok) => {
            if (!ok && isMountedRef.current) {
              toast.error(
                "Couldn't load demo data. You can still create tasks."
              )
            }
          })
          .finally(() => {
            seedInFlightRef.current = false
            if (isMountedRef.current) setLoading(false)
          })
      } else if (!seedInFlightRef.current) {
        // Not anonymous OR seed already attempted/completed in this
        // lifecycle. If seed is still in flight from a previous mount
        // (StrictMode), the Promise's .finally will release loading.
        setLoading(false)
      }
    })

    if (!initRef.current) {
      initRef.current = true
      initialize()
    }

    return () => {
      mounted = false
      isMountedRef.current = false
      subscription.unsubscribe()
    }
  }, [initialize])

  const retry = useCallback(() => {
    initialize()
  }, [initialize])

  // ─── Loading state ───
  // Centered, soft "Signing you in…" text. No spinner — the wording in
  // Inter feels more on-brand than a generic loader and avoids visual
  // noise.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-slate-500">Signing you in…</div>
      </div>
    )
  }

  // ─── Error state ───
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Couldn&apos;t sign in
          </h1>
          <p className="mt-2 text-sm text-slate-500">{error.message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Defensive: when loading=false, user should be non-null in theory
  // (our app always signs in anonymously). But if a SIGNED_OUT happens
  // and leaves user=null, keep showing the loading copy rather than
  // exposing null to children — saves every downstream component from
  // needing its own null check.
  if (!user || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-slate-500">Signing you in…</div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

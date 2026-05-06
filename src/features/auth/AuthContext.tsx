import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { seedDemoData } from './seedDemoData'

// AuthContextValue — 消费方能从 context 读到的所有状态。
// loading 在首次加载时为 true,直到从 storage 恢复出 session,或者
// 匿名 sign-in 成功之前。
export interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  error: Error | null
}

// 默认值给 null,这样 useAuth 可以检测"组件不在 Provider 内"并抛错。
export const AuthContext = createContext<AuthContextValue | null>(null)

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // initRef 守卫 React 18 StrictMode 的双 mount(dev 下 effect 会跑两次)。
  // 没有它,signInAnonymously() 会在每次冷启动创建两个幽灵匿名用户。
  const initRef = useRef(false)

  // isMountedRef 让后台任务(seedDemoData)能在每个 await 前自检,组件卸载
  // 后跳出循环、不再发请求。
  const isMountedRef = useRef(true)

  // seedAttemptedRef 防止 seed 在同一组件生命周期里被多个 auth 事件
  // (INITIAL_SESSION + SIGNED_IN + USER_UPDATED) 重复触发。seedDemoData
  // 内部还有 has_seeded 二次幂等,这是双保险。
  const seedAttemptedRef = useRef(false)

  const initialize = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: getErr } = await supabase.auth.getSession()
      if (getErr) throw getErr
      if (!data.session) {
        const { error: signErr } = await supabase.auth.signInAnonymously()
        if (signErr) throw signErr
        // 不在这里 setLoading(false);等 onAuthStateChange 的 SIGNED_IN
        // 事件携带新 session 一起把状态更新完整,避免出现 user=null 但 loading=false
        // 的中间态。
      }
      // 已有 session 的情况:onAuthStateChange 的 INITIAL_SESSION 已经更新过 state。
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // StrictMode 下 effect 会跑两次,cleanup 把 isMountedRef 置 false。
    // 在 effect 入口重新置 true,确保第二次 mount 后 seed 还能跑。
    isMountedRef.current = true
    let mounted = true

    // 订阅所有 auth 状态变化。订阅创建时会立即触发 INITIAL_SESSION 事件
    // 携带当前 session(可能为 null)。SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED
    // 等会在后续状态切换时触发。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      // 只在拿到真实 session 或者明确登出时才停止 loading。
      // INITIAL_SESSION + null session 表示"我们正要给你登录",此刻还在加载。
      if (newSession || event === 'SIGNED_OUT') {
        setLoading(false)
      }
      if (newSession) setError(null)

      // 后台触发 demo seed —— 同时覆盖 SIGNED_IN(首次签入)和
      // INITIAL_SESSION(已有 session 的 page reload)两种情形。
      // 后者支持"上次 seed 失败时下次登录自愈"。
      // 不阻塞 setLoading,UI 已在主流程里转入 ready 态。
      if (
        newSession?.user?.is_anonymous &&
        !seedAttemptedRef.current &&
        isMountedRef.current
      ) {
        seedAttemptedRef.current = true
        void seedDemoData(newSession.user, isMountedRef)
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
  // 居中柔和的"正在登录"。不放 spinner —— 文字 "Signing you in…" 配 Inter
  // 比通用 loader 更贴合设计语言,避免视觉噪声。
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

  // 防御:理论上 loading=false 时 user 应该非空(我们的应用始终匿名登录),
  // 但若发生 SIGNED_OUT 后 user=null,继续显示 loading 文案而不是把 null
  // 暴露给 children,免得下游每个组件都得自己判空。
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

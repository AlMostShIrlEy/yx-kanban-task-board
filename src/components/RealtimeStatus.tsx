import { useTasks } from '../features/tasks/hooks/useTasks'
import { cn } from '../lib/cn'
import type { ConnectionStatus } from '../features/tasks/hooks/useRealtime'

// Map each connection state to the indicator's color, copy, and whether
// the dot pulses. Pulse on transient states ('connecting',
// 'reconnecting') signals "we're working on it"; steady dot on terminal
// states ('live', 'disconnected') signals "this is the current outcome".
const STATUS_CONFIG: Record<
  ConnectionStatus,
  { dot: string; label: string; pulse: boolean }
> = {
  connecting:   { dot: 'bg-slate-300',   label: 'Connecting…',   pulse: true  },
  live:         { dot: 'bg-emerald-500', label: 'Live',          pulse: false },
  reconnecting: { dot: 'bg-amber-500',   label: 'Reconnecting…', pulse: true  },
  disconnected: { dot: 'bg-rose-500',    label: 'Disconnected',  pulse: false },
}

// Realtime connection indicator. Mounted in <Sidebar> between the Stats
// slot and the User card — small, quiet, persistent. role="status" +
// aria-live="polite" announces state changes to screen readers without
// interrupting them.
export function RealtimeStatus() {
  const { connectionStatus } = useTasks()
  const cfg = STATUS_CONFIG[connectionStatus]

  return (
    <div
      className="flex items-center gap-2 border-t border-slate-100 px-4 py-1.5"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          cfg.dot,
          cfg.pulse && 'animate-pulse'
        )}
        aria-hidden="true"
      />
      <span className="text-xs text-slate-500">{cfg.label}</span>
    </div>
  )
}

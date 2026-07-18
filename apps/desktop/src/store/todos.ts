import { atom } from 'nanostores'

import type { TodoItem } from '@/lib/todos'

/**
 * Live todo list per runtime session, rendered by the composer status stack
 * (the inline transcript panel is gone). Fed from two places:
 *
 * - live `todo` tool events (use-message-stream)
 * - stored-session hydration (desktop-controller)
 */
export const $todosBySession = atom<Record<string, TodoItem[]>>({})
export type TodoBehavior = 'current-turn' | 'persistent'
export type TodoBehaviorRequester = (method: string, params?: Record<string, unknown>) => Promise<unknown>

export const $todoBehaviorByProfile = atom<Record<string, TodoBehavior>>({})
export const $todoPanelOpenBySession = atom<Record<string, boolean>>({})

const profileKey = (profile: string) => profile.trim() || 'default'
const behaviorRevisions = new Map<string, number>()
const confirmedBehaviors = new Map<string, TodoBehavior>()

const normalizeTodoBehavior = (value: unknown): TodoBehavior =>
  String(value ?? '').trim() === 'current-turn' ? 'current-turn' : 'persistent'

function nextBehaviorRevision(profile: string): number {
  const revision = (behaviorRevisions.get(profile) ?? 0) + 1
  behaviorRevisions.set(profile, revision)

  return revision
}

export function todoBehaviorForProfile(profile: string): TodoBehavior {
  return $todoBehaviorByProfile.get()[profileKey(profile)] ?? 'persistent'
}

export function setTodoBehaviorForProfile(profile: string, behavior: TodoBehavior) {
  const key = profileKey(profile)
  $todoBehaviorByProfile.set({ ...$todoBehaviorByProfile.get(), [key]: behavior })
}

export async function syncTodoBehaviorForProfile(request: TodoBehaviorRequester, profile: string) {
  const key = profileKey(profile)
  const revision = nextBehaviorRevision(key)
  const result = (await request('config.get', { key: 'desktop.task_list_behavior' })) as { value?: unknown }
  const behavior = normalizeTodoBehavior(result?.value)

  if (behaviorRevisions.get(key) === revision) {
    confirmedBehaviors.set(key, behavior)
    setTodoBehaviorForProfile(key, behavior)
  }

  return behavior
}

export async function saveTodoBehaviorForProfile(
  request: TodoBehaviorRequester,
  profile: string,
  behavior: TodoBehavior
) {
  const key = profileKey(profile)
  const revision = nextBehaviorRevision(key)
  setTodoBehaviorForProfile(key, behavior)

  try {
    const result = (await request('config.set', {
      key: 'desktop.task_list_behavior',
      value: behavior
    })) as { value?: unknown }

    const saved = normalizeTodoBehavior(result?.value)

    if (behaviorRevisions.get(key) === revision) {
      confirmedBehaviors.set(key, saved)
      setTodoBehaviorForProfile(key, saved)
    }

    return saved
  } catch (error) {
    if (behaviorRevisions.get(key) === revision) {
      setTodoBehaviorForProfile(key, confirmedBehaviors.get(key) ?? 'persistent')
    }

    throw error
  }
}

export function setTodoPanelOpen(sid: string, open: boolean) {
  if (!sid) {
    return
  }

  $todoPanelOpenBySession.set({ ...$todoPanelOpenBySession.get(), [sid]: open })
}

export const todoListActive = (todos: readonly TodoItem[]) =>
  todos.some(t => t.status === 'pending' || t.status === 'in_progress')

// Session history is authoritative across renderer restarts only in persistent
// mode. Finished lists still use the normal short linger below after hydration.
export function todosForHydration(
  todos: readonly TodoItem[] | null,
  behavior: TodoBehavior = 'persistent'
): TodoItem[] | null {
  return todos && behavior === 'persistent' ? [...todos] : null
}

// Once a list finishes (every item completed/cancelled), the final state
// lingers just long enough to see the last checkmark land, then the group
// drops out of the stack on its own.
const FINISHED_LINGER_MS = 4_000
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()

function cancelScheduledClear(sid: string) {
  const timer = clearTimers.get(sid)

  if (timer !== undefined) {
    clearTimeout(timer)
    clearTimers.delete(sid)
  }
}

export function setSessionTodos(sid: string, todos: TodoItem[]) {
  if (!sid) {
    return
  }

  cancelScheduledClear(sid)
  $todosBySession.set({ ...$todosBySession.get(), [sid]: todos })

  if (!todoListActive(todos)) {
    clearTimers.set(
      sid,
      setTimeout(() => {
        clearTimers.delete(sid)
        clearSessionTodos(sid)
      }, FINISHED_LINGER_MS)
    )
  }
}

export function clearSessionTodos(sid: string) {
  cancelScheduledClear(sid)

  const map = $todosBySession.get()

  if (!(sid in map)) {
    return
  }

  const { [sid]: _drop, ...rest } = map
  $todosBySession.set(rest)
  const { [sid]: _open, ...remainingPanelState } = $todoPanelOpenBySession.get()
  $todoPanelOpenBySession.set(remainingPanelState)
}

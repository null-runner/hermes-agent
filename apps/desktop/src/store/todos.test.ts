import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TodoItem } from '@/lib/todos'

import {
  $todoBehaviorByProfile,
  $todoPanelOpenBySession,
  $todosBySession,
  clearSessionTodos,
  saveTodoBehaviorForProfile,
  setSessionTodos,
  setTodoBehaviorForProfile,
  setTodoPanelOpen,
  syncTodoBehaviorForProfile,
  todoBehaviorForProfile,
  todosForHydration
} from './todos'

const todo = (id: string, status: TodoItem['status']): TodoItem => ({ content: `task ${id}`, id, status })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, reject, resolve }
}

describe('setSessionTodos finished-list auto-clear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearSessionTodos('s1')
    vi.useRealTimers()
  })

  it('keeps an in-flight list indefinitely', () => {
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'in_progress')])

    vi.advanceTimersByTime(60_000)

    expect($todosBySession.get().s1).toHaveLength(2)
  })

  it('drops the list shortly after every item completes', () => {
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'cancelled')])

    expect($todosBySession.get().s1).toHaveLength(2)

    vi.advanceTimersByTime(5_000)

    expect($todosBySession.get().s1).toBeUndefined()
  })

  it('cancels the pending clear when a new active list arrives', () => {
    setSessionTodos('s1', [todo('a', 'completed')])
    vi.advanceTimersByTime(2_000)

    // The next turn starts a fresh plan before the linger expires.
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'pending')])
    vi.advanceTimersByTime(60_000)

    expect($todosBySession.get().s1).toHaveLength(2)
  })
})

describe('todosForHydration', () => {
  it('restores an active list from session history', () => {
    const active = [todo('a', 'completed'), todo('b', 'in_progress')]

    expect(todosForHydration(active)).toEqual(active)
    expect(todosForHydration([todo('a', 'pending')])).toEqual([todo('a', 'pending')])
  })

  it('restores a finished list so its linger shows the final checkmarks', () => {
    const finished = [todo('a', 'completed'), todo('b', 'cancelled')]

    expect(todosForHydration(finished)).toEqual(finished)
  })

  it('returns null when there is nothing stored', () => {
    expect(todosForHydration(null)).toBeNull()
  })

  it('does not restore stale active work in current-turn mode', () => {
    expect(todosForHydration([todo('a', 'in_progress')], 'current-turn')).toBeNull()
  })
})

describe('todo behavior preference', () => {
  beforeEach(() => $todoBehaviorByProfile.set({}))

  it('defaults to persistent and keeps profile values isolated', () => {
    expect(todoBehaviorForProfile('default')).toBe('persistent')
    setTodoBehaviorForProfile('work', 'current-turn')
    expect(todoBehaviorForProfile('work')).toBe('current-turn')
    expect(todoBehaviorForProfile('personal')).toBe('persistent')
  })

  it('loads the profile-scoped setting from the gateway', async () => {
    const request = vi.fn(async () => ({ value: 'current-turn' }))
    await syncTodoBehaviorForProfile(request, 'work')
    expect(request).toHaveBeenCalledWith('config.get', { key: 'desktop.task_list_behavior' })
    expect(todoBehaviorForProfile('work')).toBe('current-turn')
  })

  it('ignores a stale initial read after a newer write succeeds', async () => {
    const read = deferred<{ value: string }>()

    const request = vi
      .fn()
      .mockImplementationOnce(() => read.promise)
      .mockResolvedValueOnce({ value: 'current-turn' })

    const staleRead = syncTodoBehaviorForProfile(request, 'work')
    await saveTodoBehaviorForProfile(request, 'work', 'current-turn')
    read.resolve({ value: 'persistent' })
    await staleRead

    expect(request).toHaveBeenNthCalledWith(2, 'config.set', {
      key: 'desktop.task_list_behavior',
      value: 'current-turn'
    })
    expect(todoBehaviorForProfile('work')).toBe('current-turn')
  })

  it('keeps the compatible default when an older gateway lacks the setting', async () => {
    const request = vi.fn(async () => {
      throw new Error('method not found')
    })

    await expect(syncTodoBehaviorForProfile(request, 'legacy')).rejects.toThrow('method not found')
    expect(todoBehaviorForProfile('legacy')).toBe('persistent')
  })

  it('rolls the latest failed write back without letting an older failure win', async () => {
    await syncTodoBehaviorForProfile(
      vi.fn(async () => ({ value: 'persistent' })),
      'work'
    )
    const first = deferred<{ value: string }>()
    const second = deferred<{ value: string }>()

    const request = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleWrite = saveTodoBehaviorForProfile(request, 'work', 'current-turn')
    const currentWrite = saveTodoBehaviorForProfile(request, 'work', 'persistent')

    first.reject(new Error('old failure'))
    await expect(staleWrite).rejects.toThrow('old failure')
    expect(todoBehaviorForProfile('work')).toBe('persistent')

    second.reject(new Error('current failure'))
    await expect(currentWrite).rejects.toThrow('current failure')
    expect(todoBehaviorForProfile('work')).toBe('persistent')
  })
})

describe('todo panel presentation state', () => {
  beforeEach(() => $todoPanelOpenBySession.set({}))

  it('is scoped by runtime session', () => {
    setTodoPanelOpen('s1', true)
    expect($todoPanelOpenBySession.get()).toEqual({ s1: true })
    expect($todoPanelOpenBySession.get().s2).toBeUndefined()
  })
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $todoPanelOpenBySession, $todosBySession, setSessionTodos } from '@/store/todos'

import { ComposerStatusStack } from './status-stack'
import { TodoButton } from './todo-button'

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', TestResizeObserver)

describe('TodoButton', () => {
  beforeEach(() => {
    $todosBySession.set({})
    $todoPanelOpenBySession.set({})
  })
  afterEach(cleanup)

  it('renders nothing when the active session has no task list', () => {
    render(<TodoButton sessionId="s1" />)
    expect(screen.queryByRole('button', { name: /tasks/i })).toBeNull()
  })

  it('opens and closes the existing session task panel', () => {
    setSessionTodos('s1', [
      { content: 'Finished', id: 'done', status: 'completed' },
      { content: 'Keep working', id: 'open', status: 'in_progress' }
    ])
    render(
      <MemoryRouter>
        <TodoButton sessionId="s1" />
        <ComposerStatusStack queue={null} sessionId="s1" />
      </MemoryRouter>
    )
    const button = screen.getByRole('button', { name: 'Tasks 1/2' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(globalThis.document.getElementById('session-tasks-s1')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect($todoPanelOpenBySession.get().s1).toBe(true)
    expect(globalThis.document.getElementById('session-tasks-s1')).not.toBeNull()
    expect(screen.getByText('Keep working')).not.toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(globalThis.document.getElementById('session-tasks-s1')).toBeNull()
  })

  it('does not leak panel state when the active session changes', () => {
    setSessionTodos('s1', [{ content: 'One', id: 'one', status: 'pending' }])
    setSessionTodos('s2', [{ content: 'Two', id: 'two', status: 'pending' }])
    const view = render(<TodoButton sessionId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tasks 0/1' }))
    view.rerender(<TodoButton sessionId="s2" />)
    expect(screen.getByRole('button', { name: 'Tasks 0/1' }).getAttribute('aria-expanded')).toBe('false')
  })
})

import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { $todoPanelOpenBySession, $todosBySession, setTodoPanelOpen } from '@/store/todos'

interface TodoButtonProps {
  sessionId: null | string
}

export const todoPanelId = (sessionId: string) => `session-tasks-${encodeURIComponent(sessionId)}`

/** Compact composer-status affordance; the panel itself remains the existing
 * status-stack card, so todo content has one store and one renderer. */
export function TodoButton({ sessionId }: TodoButtonProps) {
  const { t } = useI18n()
  const todosBySession = useStore($todosBySession)
  const openBySession = useStore($todoPanelOpenBySession)
  const todos = sessionId ? (todosBySession[sessionId] ?? []) : []

  if (!sessionId || todos.length === 0) {
    return null
  }

  const open = openBySession[sessionId] ?? false
  const label = t.statusStack.todos(todos.filter(todo => todo.status === 'completed').length, todos.length)

  return (
    <Button
      aria-controls={todoPanelId(sessionId)}
      aria-expanded={open}
      aria-label={label}
      onClick={() => setTodoPanelOpen(sessionId, !open)}
      size="micro"
      type="button"
      variant="text"
    >
      <Codicon name="checklist" size="0.8rem" />
      {label}
    </Button>
  )
}

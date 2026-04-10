/**
 * @fileoverview Agent-first unification entry point for chat assistant creation.
 * Renders a subtle link at the bottom of a chat creation dialog to redirect
 * users to the agent canvas with chat-oriented template pre-configured.
 *
 * This implements the CONTEXT.md locked decision: "new chat assistants and
 * search apps created via agent canvas (agent-first)."
 *
 * @module features/chat/components/CreateChatAssistantDialog
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Workflow } from 'lucide-react'
import { ADMIN_AGENT_NEW_ID, buildAdminAgentCanvasPath } from '@/app/adminRoutes'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Subtle link component offering "Create as Agent Workflow (Advanced)" option
 * in chat assistant creation flows. Navigates to the admin agent canvas create route.
 * @returns {JSX.Element} Rendered agent workflow link with icon and description
 */
export function CreateChatAssistantAgentLink() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /**
   * @description Navigate to agent canvas with chat mode pre-configured
   */
  const handleClick = () => {
    // Preserve the dynamic `:id` route contract by treating `new` as the canvas pseudo-id.
    navigate(`${buildAdminAgentCanvasPath(ADMIN_AGENT_NEW_ID)}?mode=chat`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-3 py-2 mt-2 rounded-md text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
    >
      <Workflow size={16} className="shrink-0" />
      <div>
        <span className="font-medium">{t('agents.createAsAgentWorkflow')}</span>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {t('agents.agentWorkflowDescription')}
        </p>
      </div>
    </button>
  )
}

export default CreateChatAssistantAgentLink

/**
 * @description Hook to retrieve a guideline by feature ID.
 * @param featureId - The feature identifier to look up.
 * @returns The matching guideline or null.
 */
import { IFeatureGuideline } from '../data/types'
import { aiChatGuideline } from '../data/ai-chat.guideline'
import { aiSearchGuideline } from '../data/ai-search.guideline'
import { kbConfigGuideline } from '../data/kb-config.guideline'
import { kbPromptsGuideline } from '../data/kb-prompts.guideline'
import { usersGuideline } from '../data/users.guideline'
import { teamsGuideline } from '../data/teams.guideline'
import { auditGuideline } from '../data/audit.guideline'
import { broadcastGuideline } from '../data/broadcast.guideline'
import { globalHistoriesGuideline } from '../data/global-histories.guideline'

// Static lookup map — no memoization needed
const guidelines: Record<string, IFeatureGuideline> = {
  'ai-chat': aiChatGuideline,
  'ai-search': aiSearchGuideline,
  'kb-config': kbConfigGuideline,
  'kb-prompts': kbPromptsGuideline,
  'users': usersGuideline,
  'teams': teamsGuideline,
  'audit': auditGuideline,
  'broadcast': broadcastGuideline,
  'global-histories': globalHistoriesGuideline,
}

export function useGuideline(featureId: string) {
  // Simple lookup — React Compiler handles memoization
  const guideline = guidelines[featureId] || null

  return { guideline }
}

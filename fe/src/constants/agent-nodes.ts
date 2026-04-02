/**
 * @description Agent workflow node type constants for canvas rendering
 */

export const AgentNodeType = {
  BEGIN: 'begin',
  ANSWER: 'answer',
  MESSAGE: 'message',
  SWITCH: 'switch',
  CONDITION: 'condition',
  CATEGORIZE: 'categorize',
  MERGE: 'merge',
  CONCENTRATOR: 'concentrator',
  NOTE: 'note',
  TEMPLATE: 'template',
  KEYWORD_EXTRACT: 'keyword_extract',
  LOOP: 'loop',
} as const

export type AgentNodeTypeValue = (typeof AgentNodeType)[keyof typeof AgentNodeType]

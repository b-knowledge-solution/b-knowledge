/**
 * @description Agent workflow node type constants for the canvas executor
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
  GENERATE: 'generate',
  REWRITE: 'rewrite',
  RELEVANT: 'relevant',
  RETRIEVAL: 'retrieval',
  YAHOO_FINANCE: 'yahoofinance',
  JIN10: 'jin10',
  TUSHARE: 'tushare',
  WENCAI: 'wencai',
} as const

export type AgentNodeTypeValue = (typeof AgentNodeType)[keyof typeof AgentNodeType]

/** Edge handle identifiers for agent graph */
export const EdgeHandle = {
  LOOP_BACK: 'loop_back',
} as const

/** Comparison operators used in switch/condition nodes */
export const ConditionOperator = {
  CONTAINS: 'contains',
  EQUALS: 'equals',
  STARTS_WITH: 'startsWith',
} as const

export type ConditionOperatorType = (typeof ConditionOperator)[keyof typeof ConditionOperator]

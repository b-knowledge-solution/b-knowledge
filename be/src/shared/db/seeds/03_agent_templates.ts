/**
 * @fileoverview Seed script for 24 pre-built agent workflow templates.
 *
 * Populates the agent_templates table with system-level templates across
 * 6 categories: customer-support, data-processing, research, content, code, general.
 * Each template has a minimal but functional DSL graph (Begin -> Generate -> Answer).
 *
 * Idempotent: uses ON CONFLICT DO NOTHING to skip existing templates.
 *
 * @example
 * Run seed: npm run db:seed
 */

import { Knex } from 'knex'
import { getUuid } from '@/shared/utils/uuid.js'

// ============================================================================
// Helper: Build minimal DSL graph
// ============================================================================

/**
 * @description Build a minimal agent DSL graph with Begin -> nodes -> Answer.
 *   Each template gets at minimum: begin node, one generate node, and an answer node.
 * @param {object} options - Graph configuration
 * @param {string} options.systemPrompt - System prompt for the generate node
 * @param {boolean} [options.withRetrieval] - Include a retrieval node before generate
 * @returns {Record<string, unknown>} JSONB-serializable DSL object
 */
function buildDSL(options: {
  systemPrompt: string
  withRetrieval?: boolean
}): Record<string, unknown> {
  const beginId = 'begin_0'
  const generateId = 'generate_0'
  const answerId = 'answer_0'
  const retrievalId = 'retrieval_0'

  const nodes: Record<string, unknown> = {
    [beginId]: {
      id: beginId,
      type: 'begin',
      position: { x: 100, y: 200 },
      config: {},
      label: 'Start',
    },
    [generateId]: {
      id: generateId,
      type: 'generate',
      position: { x: options.withRetrieval ? 600 : 400, y: 200 },
      config: {
        system_prompt: options.systemPrompt,
        temperature: 0.7,
        max_tokens: 2048,
      },
      label: 'Generate',
    },
    [answerId]: {
      id: answerId,
      type: 'answer',
      position: { x: options.withRetrieval ? 900 : 700, y: 200 },
      config: {},
      label: 'Answer',
    },
  }

  const edges: Array<Record<string, string>> = []

  // Optionally add a retrieval node between begin and generate
  if (options.withRetrieval) {
    nodes[retrievalId] = {
      id: retrievalId,
      type: 'retrieval',
      position: { x: 350, y: 200 },
      config: { top_k: 5, similarity_threshold: 0.5 },
      label: 'Retrieval',
    }
    edges.push(
      { source: beginId, target: retrievalId },
      { source: retrievalId, target: generateId },
    )
  } else {
    edges.push({ source: beginId, target: generateId })
  }

  edges.push({ source: generateId, target: answerId })

  return {
    nodes,
    edges,
    variables: {},
    settings: {
      mode: 'agent',
      max_execution_time: 300,
      retry_on_failure: false,
    },
  }
}

// ============================================================================
// Template definitions
// ============================================================================

/**
 * @description Build the complete array of 24 agent templates grouped into 6 categories.
 * @returns {Array<Record<string, unknown>>} Array of template row objects ready for insertion
 */
function buildTemplates(): Array<Record<string, unknown>> {
  const now = new Date()

  const templates: Array<{
    name: string
    description: string
    category: string
    mode: 'agent' | 'pipeline'
    systemPrompt: string
    withRetrieval?: boolean
  }> = [
    // -----------------------------------------------------------------------
    // Customer Support (4)
    // -----------------------------------------------------------------------
    {
      name: 'FAQ Bot',
      description: 'Answer frequently asked questions using your knowledge base documents.',
      category: 'customer-support',
      mode: 'agent',
      systemPrompt: 'You are a helpful FAQ assistant. Answer user questions based on the provided knowledge base context. If you cannot find the answer in the context, say so honestly.',
      withRetrieval: true,
    },
    {
      name: 'Complaint Handler',
      description: 'Empathetically address customer complaints and suggest resolutions.',
      category: 'customer-support',
      mode: 'agent',
      systemPrompt: 'You are a customer service specialist. Acknowledge the customer complaint with empathy, analyze the issue, and suggest a fair resolution. Always maintain a professional and caring tone.',
    },
    {
      name: 'Ticket Router',
      description: 'Classify support tickets and route them to the appropriate department.',
      category: 'customer-support',
      mode: 'pipeline',
      systemPrompt: 'Classify the following support ticket into one of these categories: billing, technical, account, shipping, general. Return only the category name and a brief reason for the classification.',
    },
    {
      name: 'Satisfaction Survey',
      description: 'Conduct post-interaction satisfaction surveys with users.',
      category: 'customer-support',
      mode: 'agent',
      systemPrompt: 'You are conducting a customer satisfaction survey. Ask about the user experience, rate satisfaction on a 1-5 scale, collect feedback, and thank the customer. Be brief and professional.',
    },

    // -----------------------------------------------------------------------
    // Data Processing (4)
    // -----------------------------------------------------------------------
    {
      name: 'Document Summarizer',
      description: 'Generate concise summaries of long documents or articles.',
      category: 'data-processing',
      mode: 'pipeline',
      systemPrompt: 'Summarize the following text in 3-5 concise bullet points. Focus on the key findings, conclusions, and actionable insights. Maintain factual accuracy.',
    },
    {
      name: 'Data Extractor',
      description: 'Extract structured data (names, dates, amounts) from unstructured text.',
      category: 'data-processing',
      mode: 'pipeline',
      systemPrompt: 'Extract structured data from the following text. Return a JSON object with fields: entities (names, organizations), dates, amounts, locations, and any other key data points found.',
    },
    {
      name: 'Report Generator',
      description: 'Generate formatted reports from raw data or analysis results.',
      category: 'data-processing',
      mode: 'pipeline',
      systemPrompt: 'Generate a well-structured report from the provided data. Include: executive summary, key findings, detailed analysis, and recommendations. Use markdown formatting.',
    },
    {
      name: 'CSV Analyzer',
      description: 'Analyze CSV data and provide statistical insights and visualizations.',
      category: 'data-processing',
      mode: 'pipeline',
      systemPrompt: 'Analyze the provided CSV/tabular data. Compute basic statistics (mean, median, min, max), identify trends, outliers, and patterns. Present findings in a clear summary.',
    },

    // -----------------------------------------------------------------------
    // Research (4)
    // -----------------------------------------------------------------------
    {
      name: 'Research Assistant',
      description: 'Help conduct research by finding and synthesizing information.',
      category: 'research',
      mode: 'agent',
      systemPrompt: 'You are a research assistant. Help the user explore topics by providing well-sourced information, identifying key papers and findings, and synthesizing knowledge across sources.',
      withRetrieval: true,
    },
    {
      name: 'Literature Review',
      description: 'Analyze and summarize academic papers and research literature.',
      category: 'research',
      mode: 'pipeline',
      systemPrompt: 'Conduct a literature review of the provided text. Identify: research methodology, key findings, limitations, and how it relates to the broader field. Use academic language.',
    },
    {
      name: 'Fact Checker',
      description: 'Verify claims and statements against available evidence.',
      category: 'research',
      mode: 'agent',
      systemPrompt: 'You are a fact-checker. Analyze the given claim, evaluate the available evidence, and provide a verdict: Confirmed, Likely True, Unverified, Likely False, or False. Explain your reasoning.',
      withRetrieval: true,
    },
    {
      name: 'Trend Analyzer',
      description: 'Identify and analyze trends from data or text collections.',
      category: 'research',
      mode: 'pipeline',
      systemPrompt: 'Analyze the provided data for trends and patterns. Identify: emerging themes, growth/decline patterns, seasonal variations, and notable anomalies. Provide actionable insights.',
    },

    // -----------------------------------------------------------------------
    // Content (4)
    // -----------------------------------------------------------------------
    {
      name: 'Blog Writer',
      description: 'Write engaging blog posts on any topic with SEO optimization.',
      category: 'content',
      mode: 'pipeline',
      systemPrompt: 'Write an engaging blog post on the given topic. Include: compelling headline, introduction hook, structured body with subheadings, practical examples, and a call-to-action conclusion. Optimize for readability.',
    },
    {
      name: 'Social Media Post',
      description: 'Create platform-optimized social media content.',
      category: 'content',
      mode: 'pipeline',
      systemPrompt: 'Create a social media post for the given topic. Be concise, engaging, and include relevant hashtags. Adapt tone and length for professional platforms. Include a call to action.',
    },
    {
      name: 'Email Drafter',
      description: 'Draft professional emails for various business contexts.',
      category: 'content',
      mode: 'pipeline',
      systemPrompt: 'Draft a professional email based on the user requirements. Include appropriate greeting, clear purpose, organized body, and professional closing. Match the formality level to the context.',
    },
    {
      name: 'Translation Helper',
      description: 'Translate and localize content between languages.',
      category: 'content',
      mode: 'agent',
      systemPrompt: 'You are a translation specialist. Translate the provided text accurately while preserving tone, idioms, and cultural nuances. If the target language is not specified, ask the user.',
    },

    // -----------------------------------------------------------------------
    // Code (4)
    // -----------------------------------------------------------------------
    {
      name: 'Code Reviewer',
      description: 'Review code for bugs, best practices, and improvements.',
      category: 'code',
      mode: 'pipeline',
      systemPrompt: 'Review the following code. Check for: bugs, security vulnerabilities, performance issues, code style, and adherence to best practices. Provide specific, actionable feedback with line references.',
    },
    {
      name: 'Bug Reporter',
      description: 'Help create detailed bug reports from issue descriptions.',
      category: 'code',
      mode: 'pipeline',
      systemPrompt: 'Create a structured bug report from the provided description. Include: title, environment, steps to reproduce, expected behavior, actual behavior, severity, and suggested fix if apparent.',
    },
    {
      name: 'Documentation Generator',
      description: 'Generate API documentation, README files, or code comments.',
      category: 'code',
      mode: 'pipeline',
      systemPrompt: 'Generate comprehensive documentation for the provided code. Include: overview, function/method signatures, parameters, return types, examples, and any important notes or caveats.',
    },
    {
      name: 'API Tester',
      description: 'Generate test cases and curl commands for API endpoints.',
      category: 'code',
      mode: 'pipeline',
      systemPrompt: 'Generate comprehensive test cases for the described API endpoint. Include: happy path, edge cases, error cases, and provide curl commands for each test. Cover authentication, validation, and boundary conditions.',
    },

    // -----------------------------------------------------------------------
    // General (4)
    // -----------------------------------------------------------------------
    {
      name: 'Simple Chat',
      description: 'A general-purpose conversational AI assistant.',
      category: 'general',
      mode: 'agent',
      systemPrompt: 'You are a helpful, friendly AI assistant. Answer questions clearly and concisely. Ask for clarification when the request is ambiguous.',
    },
    {
      name: 'Multi-Step Reasoning',
      description: 'Break down complex problems into step-by-step analysis.',
      category: 'general',
      mode: 'agent',
      systemPrompt: 'You are a reasoning assistant. Break down complex problems into clear steps. For each step: state the sub-problem, analyze it, and explain your conclusion before moving to the next step.',
    },
    {
      name: 'Task Planner',
      description: 'Help plan and organize tasks with priorities and deadlines.',
      category: 'general',
      mode: 'pipeline',
      systemPrompt: 'Create a structured task plan from the user description. Break it into actionable tasks with: priority (P0-P3), estimated duration, dependencies, and suggested deadlines. Present as a checklist.',
    },
    {
      name: 'Decision Tree',
      description: 'Guide users through decision-making with structured questions.',
      category: 'general',
      mode: 'agent',
      systemPrompt: 'You are a decision-making assistant. Help the user evaluate their options by asking structured questions, identifying pros/cons for each option, and guiding toward an informed decision. Never decide for them.',
    },
  ]

  return templates.map((t) => ({
    id: getUuid(),
    name: t.name,
    description: t.description,
    avatar: null,
    category: t.category,
    mode: t.mode,
    // Use spread pattern for optional withRetrieval to satisfy exactOptionalPropertyTypes
    dsl: JSON.stringify(buildDSL({
      systemPrompt: t.systemPrompt,
      ...(t.withRetrieval !== undefined ? { withRetrieval: t.withRetrieval } : {}),
    })),
    dsl_version: 1,
    is_system: true,
    tenant_id: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  }))
}

// ============================================================================
// Seed function
// ============================================================================

/**
 * @description Seed the agent_templates table with 24 pre-built workflow templates.
 *   Uses ON CONFLICT(id) IGNORE for idempotent re-runs.
 * @param {Knex} knex - Knex connection instance
 * @returns {Promise<void>}
 */
export async function seed(knex: Knex): Promise<void> {
  const templates = buildTemplates()

  // Insert templates idempotently — skip any that already exist
  await knex('agent_templates')
    .insert(templates)
    .onConflict('id')
    .ignore()
}

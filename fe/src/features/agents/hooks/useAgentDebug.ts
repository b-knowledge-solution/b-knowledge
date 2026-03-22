/**
 * @fileoverview Socket.IO debug events hook for agent step-by-step execution.
 *
 * Subscribes to `agent:debug:step` events and manages debug run state
 * including step statuses, breakpoints, and debug control actions.
 * Uses the existing useSocketEvent pattern from hooks/useSocket.ts.
 *
 * @module features/agents/hooks/useAgentDebug
 */

import { useState, useRef } from 'react'
import { useSocketEvent } from '@/hooks/useSocket'
import { api } from '@/lib/api'
import type { AgentStepStatus } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Step state tracked per node during debug execution
 */
export interface DebugStepState {
  status: AgentStepStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  duration_ms?: number
  error?: string
}

/**
 * @description Socket.IO event payload for agent:debug:step events
 */
interface DebugStepEvent {
  run_id: string
  node_id: string
  status: AgentStepStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  duration_ms?: number
  error?: string
}

/**
 * @description Return type for the useAgentDebug hook
 */
export interface UseAgentDebugReturn {
  /** Map of nodeId to step state (status, input, output, timing, error) */
  steps: Map<string, DebugStepState>
  /** Whether debug mode is currently active */
  isDebugActive: boolean
  /** Current debug run ID, or null if no debug run */
  currentRunId: string | null
  /** Start a debug run for the given agent */
  startDebug: (agentId: string, input: string) => Promise<void>
  /** Execute the next pending node */
  stepNext: () => Promise<void>
  /** Continue executing all remaining nodes (stops at breakpoints) */
  continueRun: () => Promise<void>
  /** Toggle a breakpoint on/off for a node */
  toggleBreakpoint: (nodeId: string) => Promise<void>
  /** Stop the debug session */
  stopDebug: () => void
  /** Set of node IDs with active breakpoints */
  breakpoints: Set<string>
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for managing agent debug mode via Socket.IO events and REST API calls.
 *   Subscribes to `agent:debug:step` events for real-time step status updates
 *   and provides control methods for stepping, continuing, and breakpoint management.
 * @returns {UseAgentDebugReturn} Debug state and control functions
 */
export function useAgentDebug(): UseAgentDebugReturn {
  const [steps, setSteps] = useState<Map<string, DebugStepState>>(new Map())
  const [isDebugActive, setIsDebugActive] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set())

  // Refs for accessing latest state in socket callbacks
  const currentAgentIdRef = useRef<string | null>(null)
  const currentRunIdRef = useRef<string | null>(null)

  // Subscribe to agent:debug:step Socket.IO events
  useSocketEvent<DebugStepEvent>('agent:debug:step', (event) => {
    // Only process events for the current debug run
    if (event.run_id !== currentRunIdRef.current) return

    // Update the step state map with the new status
    setSteps((prev) => {
      const updated = new Map(prev)
      updated.set(event.node_id, {
        status: event.status,
        ...(event.input !== undefined ? { input: event.input } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(event.duration_ms !== undefined ? { duration_ms: event.duration_ms } : {}),
        ...(event.error !== undefined ? { error: event.error } : {}),
      })
      return updated
    })
  })

  /**
   * @description Start a debug run for the given agent. Posts to the debug endpoint
   *   and initializes local debug state.
   * @param {string} agentId - Agent UUID to debug
   * @param {string} input - User input for the debug run
   */
  const startDebug = async (agentId: string, input: string) => {
    const result = await api.post<{ run_id: string }>(`/api/agents/${agentId}/debug`, { input })

    // Store agent and run IDs for subsequent calls
    currentAgentIdRef.current = agentId
    currentRunIdRef.current = result.run_id
    setCurrentRunId(result.run_id)
    setIsDebugActive(true)
    setSteps(new Map())
    setBreakpoints(new Set())
  }

  /**
   * @description Execute the next pending node in the debug run.
   */
  const stepNext = async () => {
    const agentId = currentAgentIdRef.current
    const runId = currentRunIdRef.current
    if (!agentId || !runId) return

    await api.post(`/api/agents/${agentId}/debug/${runId}/step`)
  }

  /**
   * @description Continue executing all remaining nodes, stopping at breakpoints.
   */
  const continueRun = async () => {
    const agentId = currentAgentIdRef.current
    const runId = currentRunIdRef.current
    if (!agentId || !runId) return

    await api.post(`/api/agents/${agentId}/debug/${runId}/continue`)
  }

  /**
   * @description Toggle a breakpoint on or off for a given node.
   *   If the node already has a breakpoint, removes it; otherwise adds one.
   * @param {string} nodeId - Node ID to toggle breakpoint on
   */
  const toggleBreakpoint = async (nodeId: string) => {
    const agentId = currentAgentIdRef.current
    const runId = currentRunIdRef.current
    if (!agentId || !runId) return

    const hasBreakpoint = breakpoints.has(nodeId)

    if (hasBreakpoint) {
      // Remove breakpoint
      await api.delete(`/api/agents/${agentId}/debug/${runId}/breakpoint/${nodeId}`)
      setBreakpoints((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    } else {
      // Add breakpoint
      await api.post(`/api/agents/${agentId}/debug/${runId}/breakpoint`, { node_id: nodeId })
      setBreakpoints((prev) => {
        const next = new Set(prev)
        next.add(nodeId)
        return next
      })
    }
  }

  /**
   * @description Stop the debug session and reset all debug state.
   */
  const stopDebug = () => {
    currentAgentIdRef.current = null
    currentRunIdRef.current = null
    setCurrentRunId(null)
    setIsDebugActive(false)
    setSteps(new Map())
    setBreakpoints(new Set())
  }

  return {
    steps,
    isDebugActive,
    currentRunId,
    startDebug,
    stepNext,
    continueRun,
    toggleBreakpoint,
    stopDebug,
    breakpoints,
  }
}

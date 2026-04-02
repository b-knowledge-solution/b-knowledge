/**
 * @fileoverview Custom animated edge component for the agent canvas.
 * Uses Bezier curves with optional dash animation for running state
 * and label support for conditional branches.
 *
 * @module features/agents/components/canvas/edges/SmartEdge
 */

import { getBezierPath, type EdgeProps, BaseEdge, EdgeLabelRenderer } from '@xyflow/react'

/**
 * @description Custom edge renderer with Bezier curves, animated dash pattern
 * for debug/running state, and label support for conditional edges.
 *
 * @param {EdgeProps} props - ReactFlow edge props including positions, label, and selected state
 * @returns {JSX.Element} SVG Bezier path edge with optional label and animation
 */
export function SmartEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Check if edge is in "running" state for dash animation (used during debug mode)
  const isRunning = (data as Record<string, unknown> | undefined)?.running === true

  // Determine stroke color based on selection state
  const strokeColor = selected
    ? 'var(--accent-border, #0D26CF)'
    : 'var(--border, hsl(var(--border)))'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2 : 1.5,
          // Animated dash for running edges
          ...(isRunning
            ? {
                strokeDasharray: '5 5',
                animation: 'smart-edge-dash 0.5s linear infinite',
              }
            : {}),
        }}
      />

      {/* Render label if present (for conditional edges like switch/categorize outputs) */}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-background border rounded px-1.5 py-0.5 text-xs text-muted-foreground pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* CSS animation keyframes for running edge dash pattern */}
      {isRunning && (
        <style>{`
          @keyframes smart-edge-dash {
            to { stroke-dashoffset: -10; }
          }
        `}</style>
      )}
    </>
  )
}

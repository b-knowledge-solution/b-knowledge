/**
 * @fileoverview Canvas-based force-directed graph visualization.
 * @description Renders nodes and links on HTML5 Canvas with zoom/pan,
 * node coloring by label, click-to-select, and highlighted node support.
 * No external dependencies -- pure Canvas 2D + simple force simulation.
 * Supports dark mode by reading CSS custom properties for background.
 */
import { useRef, useEffect, useState } from 'react'
import type { CodeGraphNode, CodeGraphLink } from '../types/code-graph.types'

/** Color palette for node labels */
const LABEL_COLORS: Record<string, string> = {
  Function: '#3b82f6',   // blue
  Method: '#8b5cf6',     // purple
  Class: '#f59e0b',      // amber
  Module: '#10b981',     // emerald
  Package: '#06b6d4',    // cyan
  Folder: '#6b7280',     // gray
  Project: '#ef4444',    // red
  Interface: '#ec4899',  // pink
  Enum: '#f97316',       // orange
  Struct: '#14b8a6',     // teal
  Trait: '#a855f7',      // violet
  Union: '#84cc16',      // lime
  Type: '#64748b',       // slate
}

/** Relationship type colors */
const REL_COLORS: Record<string, string> = {
  CALLS: '#3b82f6',
  IMPORTS: '#10b981',
  DEFINES: '#6b7280',
  INHERITS: '#f59e0b',
  CONTAINS: '#94a3b8',
  CONTAINS_MODULE: '#94a3b8',
  CONTAINS_PACKAGE: '#94a3b8',
}

/** Simulated node with position and velocity */
interface SimNode extends CodeGraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

/**
 * @description Props for the ForceGraph component
 */
interface ForceGraphProps {
  /** Graph nodes to render */
  nodes: CodeGraphNode[]
  /** Graph links/edges to render */
  links: CodeGraphLink[]
  /** Callback when a node is clicked */
  onNodeClick?: (node: CodeGraphNode) => void
  /** Optional width override (defaults to container width) */
  width?: number
  /** Optional height override (defaults to container height) */
  height?: number
  /** Set of node IDs to highlight (e.g., from NL query results) */
  highlightedNodeIds?: Set<number>
}

/**
 * @description Canvas-based force-directed graph visualization with zoom, pan, and node interaction.
 * Renders nodes color-coded by label type, directed edges, and supports highlighted node overlays.
 * @param {ForceGraphProps} props - Component props
 * @returns {JSX.Element} Canvas element with interactive graph
 */
const ForceGraph = ({ nodes, links, onNodeClick, width, height, highlightedNodeIds }: ForceGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: width || 800, h: height || 600 })

  // Simulation state stored in refs to avoid re-renders
  const simNodes = useRef<SimNode[]>([])
  const animFrame = useRef<number>(0)
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const dragging = useRef<{ node: SimNode | null; startX: number; startY: number }>({
    node: null, startX: 0, startY: 0,
  })

  // Resize observer for responsive canvas
  useEffect(() => {
    // Skip resize observer if explicit dimensions are provided
    if (width && height) {
      setCanvasSize({ w: width, h: height })
      return
    }

    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect
        if (cw > 0 && ch > 0) {
          setCanvasSize({ w: cw, h: ch })
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [width, height])

  // Initialize and run force simulation when data or canvas size changes
  useEffect(() => {
    if (!nodes.length) return

    const w = canvasSize.w
    const h = canvasSize.h

    // Initialize positions in a circular layout centered on the canvas
    simNodes.current = nodes.map((n, i) => ({
      ...n,
      x: Math.cos((2 * Math.PI * i) / nodes.length) * 200 + w / 2,
      y: Math.sin((2 * Math.PI * i) / nodes.length) * 200 + h / 2,
      vx: 0,
      vy: 0,
    }))

    // Reset view transform
    transform.current = { x: 0, y: 0, scale: 1 }

    // Force simulation loop
    let iterations = 0
    const maxIterations = 300

    const tick = () => {
      if (iterations >= maxIterations) {
        draw()
        return
      }

      const alpha = 1 - iterations / maxIterations
      applyForces(alpha, w, h)
      draw()
      iterations++
      animFrame.current = requestAnimationFrame(tick)
    }

    tick()

    return () => cancelAnimationFrame(animFrame.current)
  }, [nodes, links, canvasSize])

  // Redraw when highlighted nodes change
  useEffect(() => {
    draw()
  }, [highlightedNodeIds, selectedNode])

  /**
   * @description Apply repulsion, link attraction, and center gravity forces
   * @param {number} alpha - Cooling factor (1 = hot, 0 = frozen)
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  const applyForces = (alpha: number, w: number, h: number) => {
    const snodes = simNodes.current
    const nodeMap = new Map(snodes.map((n) => [n.id, n]))
    const centerX = w / 2
    const centerY = h / 2

    // Repulsion between all node pairs (O(n^2) -- acceptable for <2000 nodes)
    for (let i = 0; i < snodes.length; i++) {
      for (let j = i + 1; j < snodes.length; j++) {
        const a = snodes[i]!
        const b = snodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (300 * alpha) / (dist * dist)
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        a.vx -= dx
        a.vy -= dy
        b.vx += dx
        b.vy += dy
      }
    }

    // Spring attraction along links
    for (const link of links) {
      const source = nodeMap.get(link.source)
      const target = nodeMap.get(link.target)
      if (!source || !target) continue
      let dx = target.x - source.x
      let dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - 80) * 0.01 * alpha
      dx = (dx / dist) * force
      dy = (dy / dist) * force
      source.vx += dx
      source.vy += dy
      target.vx -= dx
      target.vy -= dy
    }

    // Center gravity and velocity damping
    for (const node of snodes) {
      node.vx += (centerX - node.x) * 0.001 * alpha
      node.vy += (centerY - node.y) * 0.001 * alpha
      node.x += node.vx * 0.8
      node.y += node.vy * 0.8
      node.vx *= 0.9
      node.vy *= 0.9
    }
  }

  /**
   * @description Render all nodes, links, labels, and highlights on the canvas
   */
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x: tx, y: ty, scale } = transform.current
    const snodes = simNodes.current
    const nodeMap = new Map(snodes.map((n) => [n.id, n]))
    const w = canvasSize.w
    const h = canvasSize.h
    const hasHighlights = highlightedNodeIds && highlightedNodeIds.size > 0

    // Clear canvas
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    // Draw links
    for (const link of links) {
      const source = nodeMap.get(link.source)
      const target = nodeMap.get(link.target)
      if (!source || !target) continue

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.strokeStyle = REL_COLORS[link.type] || '#94a3b8'
      ctx.lineWidth = 0.5

      // Dim non-highlighted links when highlights are active
      ctx.globalAlpha = hasHighlights
        ? (highlightedNodeIds!.has(link.source) && highlightedNodeIds!.has(link.target) ? 0.6 : 0.1)
        : 0.4
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Draw nodes
    for (const node of snodes) {
      const label = node.labels?.[0] || 'Module'
      const color = LABEL_COLORS[label] || '#6b7280'
      const radius = label === 'Class' || label === 'Module' ? 6 : 4
      const isSelected = node.id === selectedNode
      const isHighlighted = highlightedNodeIds?.has(node.id)

      // Dim non-highlighted nodes when highlights are active
      if (hasHighlights && !isHighlighted && !isSelected) {
        ctx.globalAlpha = 0.15
      }

      ctx.beginPath()
      ctx.arc(node.x, node.y, isSelected ? radius + 2 : isHighlighted ? radius + 1 : radius, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Highlight ring (golden glow)
      if (isHighlighted && !isSelected) {
        ctx.strokeStyle = '#facc15'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Draw label text for larger nodes, selected, or highlighted
      if (scale > 0.8 || isSelected || isHighlighted) {
        ctx.fillStyle = '#e2e8f0'
        ctx.font = `${isSelected || isHighlighted ? 11 : 9}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(node.name || '', node.x, node.y - radius - 4)
      }

      ctx.globalAlpha = 1
    }

    ctx.restore()
  }

  /**
   * @description Handle mouse wheel for zoom in/out centered on cursor
   */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const t = transform.current
    t.scale = Math.max(0.1, Math.min(5, t.scale * delta))
    draw()
  }

  /**
   * @description Handle mouse down for pan start or node selection/drag
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - transform.current.x) / transform.current.scale
    const my = (e.clientY - rect.top - transform.current.y) / transform.current.scale

    // Check if clicking on a node (hit test with 10px radius)
    for (const node of simNodes.current) {
      const dx = mx - node.x
      const dy = my - node.y
      if (dx * dx + dy * dy < 100) {
        dragging.current = { node, startX: e.clientX, startY: e.clientY }
        setSelectedNode(node.id)
        onNodeClick?.(node)
        draw()
        return
      }
    }

    // No node hit -- start canvas pan
    dragging.current = { node: null, startX: e.clientX, startY: e.clientY }
  }

  /**
   * @description Handle mouse move for node dragging or canvas panning
   */
  const handleMouseMove = (e: React.MouseEvent) => {
    const d = dragging.current
    if (!d.startX && !d.startY) return

    if (d.node) {
      // Drag the selected node
      const dx = (e.clientX - d.startX) / transform.current.scale
      const dy = (e.clientY - d.startY) / transform.current.scale
      d.node.x += dx
      d.node.y += dy
      d.startX = e.clientX
      d.startY = e.clientY
    } else {
      // Pan the canvas
      transform.current.x += e.clientX - d.startX
      transform.current.y += e.clientY - d.startY
      d.startX = e.clientX
      d.startY = e.clientY
    }
    draw()
  }

  /**
   * @description Reset drag state on mouse up or leave
   */
  const handleMouseUp = () => {
    dragging.current = { node: null, startX: 0, startY: 0 }
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="rounded-lg border border-border bg-muted/30 dark:bg-slate-900 cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  )
}

export default ForceGraph

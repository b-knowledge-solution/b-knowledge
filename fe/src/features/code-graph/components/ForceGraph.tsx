/**
 * Canvas-based force-directed graph visualization.
 * @description Renders nodes and links on HTML5 Canvas with zoom/pan,
 * node coloring by label, and click-to-select interaction.
 * No external dependencies — pure Canvas 2D + simple force simulation.
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

/** Simulated node with position */
interface SimNode extends CodeGraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

/** Props for ForceGraph component */
interface ForceGraphProps {
  nodes: CodeGraphNode[]
  links: CodeGraphLink[]
  onNodeClick?: (node: CodeGraphNode) => void
  width?: number
  height?: number
}

/**
 * Canvas-based force-directed graph visualization.
 * @param props - Component props
 */
const ForceGraph = ({ nodes, links, onNodeClick, width = 800, height = 600 }: ForceGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)

  // Simulation state
  const simNodes = useRef<SimNode[]>([])
  const animFrame = useRef<number>(0)
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const dragging = useRef<{ node: SimNode | null; startX: number; startY: number }>({
    node: null, startX: 0, startY: 0,
  })

  // Initialize simulation
  useEffect(() => {
    if (!nodes.length) return

    // Initialize positions in a circular layout
    simNodes.current = nodes.map((n, i) => ({
      ...n,
      x: Math.cos((2 * Math.PI * i) / nodes.length) * 200 + width / 2,
      y: Math.sin((2 * Math.PI * i) / nodes.length) * 200 + height / 2,
      vx: 0,
      vy: 0,
    }))

    // Center the view
    transform.current = { x: 0, y: 0, scale: 1 }

    // Run simulation
    let iterations = 0
    const maxIterations = 300

    const tick = () => {
      if (iterations >= maxIterations) {
        draw()
        return
      }

      const alpha = 1 - iterations / maxIterations
      applyForces(alpha)
      draw()
      iterations++
      animFrame.current = requestAnimationFrame(tick)
    }

    tick()

    return () => cancelAnimationFrame(animFrame.current)
  }, [nodes, links, width, height])

  /** Apply simple force simulation */
  const applyForces = (alpha: number) => {
    const snodes = simNodes.current
    const nodeMap = new Map(snodes.map((n) => [n.id, n]))
    const centerX = width / 2
    const centerY = height / 2

    // Repulsion between all nodes
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

    // Attraction along links
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

    // Center gravity
    for (const node of snodes) {
      node.vx += (centerX - node.x) * 0.001 * alpha
      node.vy += (centerY - node.y) * 0.001 * alpha
      // Apply velocity with damping
      node.x += node.vx * 0.8
      node.y += node.vy * 0.8
      node.vx *= 0.9
      node.vy *= 0.9
    }
  }

  /** Draw the graph on canvas */
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x: tx, y: ty, scale } = transform.current
    const snodes = simNodes.current
    const nodeMap = new Map(snodes.map((n) => [n.id, n]))

    // Clear
    ctx.clearRect(0, 0, width, height)
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
      ctx.globalAlpha = 0.4
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Draw nodes
    for (const node of snodes) {
      const label = node.labels?.[0] || 'Module'
      const color = LABEL_COLORS[label] || '#6b7280'
      const radius = label === 'Class' || label === 'Module' ? 6 : 4
      const isSelected = node.id === selectedNode

      ctx.beginPath()
      ctx.arc(node.x, node.y, isSelected ? radius + 2 : radius, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Draw label for larger nodes or selected
      if (scale > 0.8 || isSelected) {
        ctx.fillStyle = '#e2e8f0'
        ctx.font = `${isSelected ? 11 : 9}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(node.name || '', node.x, node.y - radius - 4)
      }
    }

    ctx.restore()
  }

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const t = transform.current
    t.scale = Math.max(0.1, Math.min(5, t.scale * delta))
    draw()
  }

  // Handle mouse down for pan + node drag
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - transform.current.x) / transform.current.scale
    const my = (e.clientY - rect.top - transform.current.y) / transform.current.scale

    // Check if clicking a node
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

    // Pan start
    dragging.current = { node: null, startX: e.clientX, startY: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const d = dragging.current
    if (!d.startX && !d.startY) return

    if (d.node) {
      // Drag node
      const dx = (e.clientX - d.startX) / transform.current.scale
      const dy = (e.clientY - d.startY) / transform.current.scale
      d.node.x += dx
      d.node.y += dy
      d.startX = e.clientX
      d.startY = e.clientY
    } else {
      // Pan
      transform.current.x += e.clientX - d.startX
      transform.current.y += e.clientY - d.startY
      d.startX = e.clientX
      d.startY = e.clientY
    }
    draw()
  }

  const handleMouseUp = () => {
    dragging.current = { node: null, startX: 0, startY: 0 }
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg border border-slate-700 bg-slate-900 cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}

export default ForceGraph

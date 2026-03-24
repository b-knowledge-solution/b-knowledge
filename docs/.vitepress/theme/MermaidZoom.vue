<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const overlay = ref<HTMLDivElement>()
const isOpen = ref(false)
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const svgContent = ref('')

let isDragging = false
let hasDragged = false
let startX = 0
let startY = 0
let lastTranslateX = 0
let lastTranslateY = 0

// Minimum pixels of movement to count as a drag (not a click)
const DRAG_THRESHOLD = 5

/**
 * @description Open the zoom overlay with the clicked Mermaid SVG
 * @param e - Click event from a Mermaid diagram
 */
function openZoom(e: Event) {
  const target = (e.target as HTMLElement).closest('.mermaid')
  if (!target) return
  const svg = target.querySelector('svg')
  if (!svg) return

  svgContent.value = svg.outerHTML
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

/**
 * @description Close the zoom overlay
 */
function closeZoom() {
  isOpen.value = false
  document.body.style.overflow = ''
}

/**
 * @description Handle click on backdrop — only close if user didn't drag
 * @param e - Click event on the overlay
 */
function onOverlayClick(e: MouseEvent) {
  // Only close if clicking directly on the backdrop (not the SVG content)
  if (e.target !== overlay.value) return
  // Only close if user didn't drag (pan)
  if (hasDragged) return
  closeZoom()
}

/**
 * @description Handle mouse wheel for zoom in/out
 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  scale.value = Math.max(0.2, Math.min(5, scale.value + delta))
}

function onMouseDown(e: MouseEvent) {
  isDragging = true
  hasDragged = false
  startX = e.clientX
  startY = e.clientY
  lastTranslateX = translateX.value
  lastTranslateY = translateY.value
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY

  // Mark as dragged if movement exceeds threshold
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    hasDragged = true
  }

  translateX.value = lastTranslateX + dx
  translateY.value = lastTranslateY + dy
}

function onMouseUp() {
  isDragging = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeZoom()
}

/**
 * @description Attach click listeners to all Mermaid diagrams
 */
function attachListeners() {
  document.querySelectorAll('.mermaid').forEach((el) => {
    el.removeEventListener('click', openZoom)
    el.addEventListener('click', openZoom)
    ;(el as HTMLElement).style.cursor = 'zoom-in'
  })
}

let observer: MutationObserver | null = null

onMounted(() => {
  // Attach to existing diagrams
  setTimeout(attachListeners, 1000)

  // Watch for dynamically rendered mermaid diagrams
  observer = new MutationObserver(() => {
    setTimeout(attachListeners, 500)
  })
  observer.observe(document.body, { childList: true, subtree: true })
})

onUnmounted(() => {
  observer?.disconnect()
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="mermaid-zoom">
      <div
        v-if="isOpen"
        ref="overlay"
        class="mermaid-zoom-overlay"
        @click="onOverlayClick"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @keydown="onKeydown"
        tabindex="0"
      >
        <!-- Toolbar -->
        <div class="mermaid-zoom-toolbar">
          <button @click="scale = Math.min(5, scale + 0.2)" title="Zoom in">＋</button>
          <span class="mermaid-zoom-level">{{ Math.round(scale * 100) }}%</span>
          <button @click="scale = Math.max(0.2, scale - 0.2)" title="Zoom out">－</button>
          <button @click="scale = 1; translateX = 0; translateY = 0" title="Reset">⟲</button>
          <button @click="closeZoom" title="Close (Esc)">✕</button>
        </div>

        <!-- SVG content -->
        <div
          class="mermaid-zoom-content"
          :style="{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          }"
          v-html="svgContent"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mermaid-zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  outline: none;
}

.mermaid-zoom-overlay:active {
  cursor: grabbing;
}

.mermaid-zoom-toolbar {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 4px 8px;
  backdrop-filter: blur(8px);
}

.mermaid-zoom-toolbar button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 18px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.mermaid-zoom-toolbar button:hover {
  background: rgba(255, 255, 255, 0.15);
}

.mermaid-zoom-level {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.mermaid-zoom-content {
  transform-origin: center center;
  transition: none;
  user-select: none;
  pointer-events: none;
}

.mermaid-zoom-content :deep(svg) {
  max-width: none !important;
  max-height: none !important;
  width: auto !important;
  height: auto !important;
  min-height: 400px;
}

/* Transition animation */
.mermaid-zoom-enter-active {
  transition: opacity 0.2s ease;
}
.mermaid-zoom-leave-active {
  transition: opacity 0.15s ease;
}
.mermaid-zoom-enter-from,
.mermaid-zoom-leave-to {
  opacity: 0;
}
</style>

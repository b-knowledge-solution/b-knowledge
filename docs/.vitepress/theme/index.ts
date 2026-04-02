import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import MermaidZoom from './MermaidZoom.vue'
import './custom.css'
import { h } from 'vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(MermaidZoom),
    })
  },
} satisfies Theme

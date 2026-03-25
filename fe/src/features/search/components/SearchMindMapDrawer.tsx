/**
 * @fileoverview Drawer component for displaying a mind map generated from search results.
 * @module features/ai/components/SearchMindMapDrawer
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { searchApi } from '../api/searchApi'
import MindMapTree from './MindMapTree'
import type { MindMapNode } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchMindMapDrawer component */
interface SearchMindMapDrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback to toggle open state */
  onOpenChange: (open: boolean) => void
  /** Search application ID */
  searchAppId: string
  /** The search query to generate a mind map for */
  query: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Sheet drawer that fetches and displays a mind map tree
 * for the given search query. Shows an animated progress bar while loading
 * and an error state with retry.
 * @param props - Drawer props including open state, search app ID, and query
 * @returns The rendered mind map drawer
 */
function SearchMindMapDrawer({ open, onOpenChange, searchAppId, query }: SearchMindMapDrawerProps) {
  const { t } = useTranslation()

  // Mind map data and loading state
  const [data, setData] = useState<MindMapNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // Timer ref for the animated progress bar
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * @description Return a rotating phase label based on progress percentage.
   * @param {number} prog - Current progress value (0-100)
   * @returns {string} Localized phase label
   */
  const getPhaseLabel = (prog: number): string => {
    if (prog < 30) return t('search.analyzingConcepts')
    if (prog < 60) return t('search.buildingRelationships')
    return t('search.organizingHierarchy')
  }

  /**
   * @description Start the progress bar animation that goes from 0 to 90
   * over approximately 30 seconds.
   */
  const startProgressAnimation = () => {
    setProgress(0)
    // Clear any existing timer
    if (timerRef.current) clearInterval(timerRef.current)

    // Increment every 333ms (~90 steps over 30s)
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          // Stop at 90% until data arrives
          if (timerRef.current) clearInterval(timerRef.current)
          return 90
        }
        return prev + 1
      })
    }, 333)
  }

  /**
   * @description Stop the progress timer and jump to 100%.
   */
  const completeProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setProgress(100)
  }

  /**
   * @description Fetch the mind map data from the API.
   */
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    startProgressAnimation()

    try {
      // Call the mind map API
      const response = await searchApi.fetchMindMap(searchAppId, query)
      completeProgress()
      setData(response.mindmap as MindMapNode)
    } catch (err) {
      completeProgress()
      setError(t('search.mindMapError'))
    } finally {
      setLoading(false)
    }
  }

  // Fetch data when drawer opens
  useEffect(() => {
    if (open && query) {
      fetchData()
    }

    // Cleanup timer on close
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('sm:max-w-lg md:max-w-xl lg:max-w-2xl w-full flex flex-col')}
      >
        {/* Header */}
        <SheetHeader>
          <SheetTitle>{t('search.mindMap')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('search.mindMap')}
          </SheetDescription>
        </SheetHeader>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto mt-4">
          {/* Loading state with progress bar and rotating phase labels */}
          {loading && (
            <div className="flex flex-col items-center gap-4 pt-12 px-4">
              <span className="text-4xl" role="img" aria-label="brain">🧠</span>
              <p className="text-sm font-medium text-foreground">
                {t('search.generatingMindMap')}
              </p>
              {/* Gradient progress bar from blue to purple */}
              <Progress
                value={progress}
                className="w-full max-w-sm [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500"
              />
              {/* Rotating phase label based on current progress */}
              <p className="text-xs text-muted-foreground">
                {getPhaseLabel(progress)}
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex flex-col items-center gap-4 pt-12">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('search.retry')}
              </Button>
            </div>
          )}

          {/* Mind map tree */}
          {data && !loading && !error && (
            <MindMapTree data={data} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default SearchMindMapDrawer

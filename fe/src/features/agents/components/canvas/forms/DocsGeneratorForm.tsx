/**
 * @fileoverview Docs Generator node configuration form.
 * Provides controls for generating PDF/DOCX/TXT documents from content,
 * with title, styling, page settings, and logo configuration.
 *
 * @module features/agents/components/canvas/forms/DocsGeneratorForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for DocsGenerator form fields
 */
interface DocsGeneratorConfig {
  output_format: 'pdf' | 'docx' | 'txt'
  content: string
  title: string
  subtitle: string
  header_text: string
  footer_text: string
  font_family: string
  font_size: number
  page_size: 'A4' | 'letter'
  orientation: 'portrait' | 'landscape'
}

/** @description Default configuration for a new DocsGenerator node */
const DEFAULTS: DocsGeneratorConfig = {
  output_format: 'pdf',
  content: '',
  title: '',
  subtitle: '',
  header_text: '',
  footer_text: '',
  font_family: 'Helvetica',
  font_size: 12,
  page_size: 'A4',
  orientation: 'portrait',
}

/**
 * @description Configuration form for the Docs Generator operator node.
 *   Generates documents (PDF, DOCX, TXT) from content with configurable title,
 *   subtitle, headers/footers, font settings, and page layout. Content supports
 *   markdown formatting and {variable} interpolation.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Docs Generator node configuration form
 */
export function DocsGeneratorForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<DocsGeneratorConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<DocsGeneratorConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<DocsGeneratorConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof DocsGeneratorConfig>(field: K, value: DocsGeneratorConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Output format selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.docsGenerator.outputFormat', 'Output Format')}</Label>
        <Select
          value={state.output_format}
          onValueChange={(v: string) => updateField('output_format', v as DocsGeneratorConfig['output_format'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="docx">DOCX</SelectItem>
            <SelectItem value="txt">TXT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Document title */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.docsGenerator.title', 'Title')}</Label>
        <Input
          value={state.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder={t('agents.forms.docsGenerator.titlePlaceholder', 'Document title')}
        />
      </div>

      {/* Document subtitle */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.docsGenerator.subtitle', 'Subtitle')}</Label>
        <Input
          value={state.subtitle}
          onChange={(e) => updateField('subtitle', e.target.value)}
          placeholder={t('agents.forms.docsGenerator.subtitlePlaceholder', 'Optional subtitle')}
        />
      </div>

      {/* Document content with variable interpolation */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.docsGenerator.content', 'Content')}</Label>
        <Textarea
          value={state.content}
          onChange={(e) => updateField('content', e.target.value)}
          placeholder={t('agents.forms.docsGenerator.contentPlaceholder', 'Markdown content with {variable} interpolation...')}
          className="min-h-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.docsGenerator.contentHint', 'Supports markdown formatting and {variable_name} references')}
        </p>
      </div>

      {/* Header and footer text */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>{t('agents.forms.docsGenerator.header', 'Header')}</Label>
          <Input
            value={state.header_text}
            onChange={(e) => updateField('header_text', e.target.value)}
            placeholder={t('agents.forms.docsGenerator.headerPlaceholder', 'Header text')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('agents.forms.docsGenerator.footer', 'Footer')}</Label>
          <Input
            value={state.footer_text}
            onChange={(e) => updateField('footer_text', e.target.value)}
            placeholder={t('agents.forms.docsGenerator.footerPlaceholder', 'Footer text')}
          />
        </div>
      </div>

      {/* Font family selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.docsGenerator.fontFamily', 'Font Family')}</Label>
        <Select
          value={state.font_family}
          onValueChange={(v: string) => updateField('font_family', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Helvetica">Helvetica</SelectItem>
            <SelectItem value="Times-Roman">Times Roman</SelectItem>
            <SelectItem value="Courier">Courier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Font size slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.docsGenerator.fontSize', 'Font Size')}</Label>
          <span className="text-xs text-muted-foreground">{state.font_size}pt</span>
        </div>
        <Slider
          value={[state.font_size]}
          onValueChange={([v]: number[]) => updateField('font_size', v!)}
          min={8}
          max={24}
          step={1}
        />
      </div>

      {/* Page layout options */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>{t('agents.forms.docsGenerator.pageSize', 'Page Size')}</Label>
          <Select
            value={state.page_size}
            onValueChange={(v: string) => updateField('page_size', v as DocsGeneratorConfig['page_size'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('agents.forms.docsGenerator.orientation', 'Orientation')}</Label>
          <Select
            value={state.orientation}
            onValueChange={(v: string) => updateField('orientation', v as DocsGeneratorConfig['orientation'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">{t('agents.forms.docsGenerator.portrait', 'Portrait')}</SelectItem>
              <SelectItem value="landscape">{t('agents.forms.docsGenerator.landscape', 'Landscape')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

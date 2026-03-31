/**
 * @fileoverview Invoke (HTTP request) node configuration form.
 * Provides controls for URL, HTTP method, headers, request variables,
 * timeout, proxy, and response handling options.
 *
 * @module features/agents/components/canvas/forms/InvokeForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Key-value parameter for HTTP request variables
 */
interface InvokeVariable {
  key: string
  value: string
  ref: string
}

/**
 * @description Internal state shape for Invoke form fields
 */
interface InvokeConfig {
  url: string
  method: 'get' | 'post' | 'put'
  headers: string
  variables: InvokeVariable[]
  timeout: number
  proxy: string
  clean_html: boolean
  datatype: 'json' | 'formdata'
}

/** @description Default configuration for a new Invoke node */
const DEFAULTS: InvokeConfig = {
  url: '',
  method: 'get',
  headers: '',
  variables: [],
  timeout: 60,
  proxy: '',
  clean_html: false,
  datatype: 'json',
}

/**
 * @description Configuration form for the Invoke (HTTP request) operator node.
 *   Sends HTTP GET, POST, or PUT requests to external APIs. Supports variable
 *   interpolation in the URL, JSON or form-data body, custom headers, proxy,
 *   timeout, and optional HTML cleaning of the response.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Invoke node configuration form
 */
export function InvokeForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<InvokeConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<InvokeConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<InvokeConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof InvokeConfig>(field: K, value: InvokeConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new request variable entry
   */
  const addVariable = () => {
    updateField('variables', [...state.variables, { key: '', value: '', ref: '' }])
  }

  /**
   * @description Updates a request variable at the given index
   */
  const updateVariable = (index: number, partial: Partial<InvokeVariable>) => {
    const next = state.variables.map((v, i) => (i === index ? { ...v, ...partial } : v))
    updateField('variables', next)
  }

  /**
   * @description Removes a request variable at the given index
   */
  const removeVariable = (index: number) => {
    const next = state.variables.filter((_, i) => i !== index)
    updateField('variables', next)
  }

  return (
    <div className="space-y-4">
      {/* Endpoint URL with variable interpolation */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.invoke.url', 'URL')}</Label>
        <Input
          value={state.url}
          onChange={(e) => updateField('url', e.target.value)}
          placeholder={t('agents.forms.invoke.urlPlaceholder', 'https://api.example.com/endpoint')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.invoke.urlHint', 'Use {variable_name} for dynamic URL segments')}
        </p>
      </div>

      {/* HTTP method selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.invoke.method', 'HTTP Method')}</Label>
        <Select
          value={state.method}
          onValueChange={(v: string) => updateField('method', v as InvokeConfig['method'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="get">GET</SelectItem>
            <SelectItem value="post">POST</SelectItem>
            <SelectItem value="put">PUT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data type for POST/PUT body */}
      {state.method !== 'get' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.invoke.dataType', 'Request Body Type')}</Label>
          <Select
            value={state.datatype}
            onValueChange={(v: string) => updateField('datatype', v as InvokeConfig['datatype'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="formdata">Form Data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Headers (JSON string) */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.invoke.headers', 'Headers (JSON)')}</Label>
        <Textarea
          value={state.headers}
          onChange={(e) => updateField('headers', e.target.value)}
          placeholder='{"Authorization": "Bearer ..."}'
          className="font-mono text-xs min-h-[60px]"
        />
      </div>

      {/* Request variables (key-value or key-ref pairs) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.invoke.variables', 'Request Variables')}</Label>
          <Button variant="ghost" size="sm" onClick={addVariable}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.variables.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.invoke.noVariables', 'No variables. Add key-value pairs for query params or body fields.')}
          </p>
        )}

        {state.variables.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {/* Parameter key */}
            <Input
              value={v.key}
              onChange={(e) => updateVariable(idx, { key: e.target.value })}
              placeholder={t('agents.forms.invoke.key', 'Key')}
              className="flex-1 text-sm"
            />
            {/* Static value or variable reference */}
            <Input
              value={v.value || v.ref}
              onChange={(e) => updateVariable(idx, { value: e.target.value, ref: '' })}
              placeholder={t('agents.forms.invoke.valueOrRef', 'Value or {ref}')}
              className="flex-1 text-sm"
            />
            <Button variant="ghost" size="icon" onClick={() => removeVariable(idx)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Timeout in seconds */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.invoke.timeout', 'Timeout (seconds)')}</Label>
        <Input
          type="number"
          value={state.timeout}
          onChange={(e) => updateField('timeout', Math.max(1, Number(e.target.value) || 60))}
          min={1}
          max={600}
        />
      </div>

      {/* Proxy URL */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.invoke.proxy', 'Proxy')}</Label>
        <Input
          value={state.proxy}
          onChange={(e) => updateField('proxy', e.target.value)}
          placeholder={t('agents.forms.invoke.proxyPlaceholder', 'http://proxy:port (optional)')}
        />
      </div>

      {/* Clean HTML toggle - strips HTML tags from response */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.forms.invoke.cleanHtml', 'Clean HTML Response')}</Label>
        <Switch
          checked={state.clean_html}
          onCheckedChange={(v: boolean) => updateField('clean_html', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('agents.forms.invoke.cleanHtmlHint', 'Strip HTML tags and extract text content from the response')}
      </p>
    </div>
  )
}

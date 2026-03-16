/**
 * @fileoverview Shared embed token manager component.
 * Provides a UI for listing, creating, copying, and revoking embed tokens.
 * Used in admin pages for both chat dialogs and search apps.
 *
 * @module components/EmbedTokenManager
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Trash2, Plus, Key, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

/** Embed token record from the API */
interface EmbedToken {
  /** Token record ID */
  id: string
  /** Masked token string (first 8 + last 4 chars) */
  token: string
  /** Human-readable name */
  name: string
  /** Whether the token is active */
  is_active: boolean
  /** ISO timestamp of creation */
  created_at: string
  /** ISO timestamp of expiration (null = never) */
  expires_at: string | null
}

/** Full token response from create (includes unmasked token) */
interface CreateTokenResponse extends EmbedToken {
  /** Full unmasked token (only returned on create) */
  token: string
}

interface EmbedTokenManagerProps {
  /** ID of the parent entity (dialog or search app) */
  entityId: string
  /** Type of entity for API routing */
  entityType: 'chat_dialog' | 'search_app'
  /** Callback when tokens change (optional) */
  onTokensChange?: (() => void) | undefined
}

// ============================================================================
// API Helpers
// ============================================================================

/** Map entity type to API path prefix */
function getApiPath(entityType: 'chat_dialog' | 'search_app', entityId: string): string {
  if (entityType === 'chat_dialog') {
    return `/api/chat/dialogs/${entityId}/embed-tokens`
  }
  return `/api/search/apps/${entityId}/embed-tokens`
}

/** Map entity type to revoke API path */
function getRevokeApiPath(entityType: 'chat_dialog' | 'search_app', tokenId: string): string {
  if (entityType === 'chat_dialog') {
    return `/api/chat/embed-tokens/${tokenId}`
  }
  return `/api/search/embed-tokens/${tokenId}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Embed token manager with create, list, copy, and revoke functionality.
 * Displays tokens in a list with action buttons and a creation form.
 *
 * @param props - Component props
 * @returns JSX element
 */
export default function EmbedTokenManager({
  entityId,
  entityType,
  onTokensChange,
}: EmbedTokenManagerProps) {
  const { t } = useTranslation()

  // State
  const [tokens, setTokens] = useState<EmbedToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenExpiry, setNewTokenExpiry] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch tokens on mount and when entityId changes
  useEffect(() => {
    fetchTokens()
  }, [entityId])

  /**
   * Fetch all tokens for the entity.
   */
  async function fetchTokens() {
    try {
      setIsLoading(true)
      setError(null)
      const path = getApiPath(entityType, entityId)
      const data = await api.get<EmbedToken[]>(path)
      setTokens(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Create a new embed token.
   */
  async function handleCreate() {
    if (!newTokenName.trim()) return

    try {
      setIsCreating(true)
      setError(null)
      const path = getApiPath(entityType, entityId)
      const body: Record<string, unknown> = { name: newTokenName.trim() }

      // Include expiry date if provided
      if (newTokenExpiry) {
        body.expires_at = new Date(newTokenExpiry).toISOString()
      }

      const created = await api.post<CreateTokenResponse>(path, body)

      // Store the full token for one-time display
      setCreatedToken(created.token)

      // Reset form
      setNewTokenName('')
      setNewTokenExpiry('')
      setShowCreateForm(false)

      // Refresh token list
      await fetchTokens()
      onTokensChange?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  /**
   * Revoke (delete) a token.
   */
  async function handleRevoke(tokenId: string) {
    try {
      setError(null)
      const path = getRevokeApiPath(entityType, tokenId)
      await api.delete(path)

      // Remove from local state
      setTokens((prev) => prev.filter((t) => t.id !== tokenId))
      onTokensChange?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  /**
   * Copy a token value to clipboard.
   */
  async function handleCopy(tokenValue: string, tokenId: string) {
    try {
      await navigator.clipboard.writeText(tokenValue)
      setCopiedId(tokenId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard API not available — ignore
    }
  }

  /**
   * Format a date string for display.
   */
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Key className="h-4 w-4" />
          {t('embed.tokens', 'Embed Tokens')}
        </h4>
        {!showCreateForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('embed.createToken', 'Create Token')}
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* One-time token display after creation */}
      {createdToken && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium text-primary">
            {t('embed.tokenCreated', 'Token created! Copy it now — it will not be shown again.')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono break-all">
              {createdToken}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(createdToken, 'new')}
            >
              {copiedId === 'new' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreatedToken(null)}
          >
            {t('common.dismiss', 'Dismiss')}
          </Button>
        </div>
      )}

      {/* Create token form */}
      {showCreateForm && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token-name" className="text-xs">
              {t('embed.tokenName', 'Token Name')}
            </Label>
            <Input
              id="token-name"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder={t('embed.tokenNamePlaceholder', 'e.g., Website Widget')}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token-expiry" className="text-xs">
              {t('embed.expiresAt', 'Expires At (optional)')}
            </Label>
            <Input
              id="token-expiry"
              type="date"
              value={newTokenExpiry}
              onChange={(e) => setNewTokenExpiry(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newTokenName.trim() || isCreating}
            >
              {isCreating ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreateForm(false)
                setNewTokenName('')
                setNewTokenExpiry('')
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('embed.noTokens', 'No embed tokens created yet.')}
        </p>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => {
            const isExpired = token.expires_at && new Date(token.expires_at) < new Date()

            return (
              <div
                key={token.id}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2',
                  (!token.is_active || isExpired) && 'opacity-50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{token.name}</span>
                    {!token.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        {t('embed.revoked', 'Revoked')}
                      </Badge>
                    )}
                    {isExpired && (
                      <Badge variant="destructive" className="text-xs">
                        {t('embed.expired', 'Expired')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <code className="text-xs text-muted-foreground font-mono">
                      {token.token}
                    </code>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(token.created_at)}
                    </span>
                    {token.expires_at && (
                      <span className="text-xs text-muted-foreground">
                        {t('embed.expiresLabel', 'Expires')}: {formatDate(token.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleCopy(token.token, token.id)}
                    title={t('common.copy', 'Copy')}
                  >
                    {copiedId === token.id ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {token.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(token.id)}
                      title={t('embed.revoke', 'Revoke')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

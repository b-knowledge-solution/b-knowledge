/**
 * @fileoverview Dialog for managing user API keys.
 *   Displays a table of existing keys and provides create/delete/toggle actions.
 *   Opened from the sidebar user dropdown, similar to the Settings dialog.
 * @module features/api-keys/components/ApiKeysDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/app/contexts/SettingsContext'
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey } from '../api/apiKeyQueries'
import ApiKeyTable from './ApiKeyTable'
import CreateApiKeyDialog from './CreateApiKeyDialog'
import ApiKeyCreatedDialog from './ApiKeyCreatedDialog'
import type { CreateApiKeyDto } from '../types/apiKey.types'

/**
 * @description Dialog for CRUD management of user API keys.
 *   Shows a header with description, a create button, and a table of keys.
 *   After creation, displays the one-time plaintext key in a separate dialog.
 *   Controlled by SettingsContext (isApiKeysOpen / closeApiKeys).
 * @returns {JSX.Element} Rendered API Keys management dialog
 */
export default function ApiKeysDialog() {
  const { t } = useTranslation()
  const { isApiKeysOpen, closeApiKeys } = useSettings()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const { data: keys = [], isLoading } = useApiKeys({ enabled: isApiKeysOpen })
  const createMutation = useCreateApiKey()
  const updateMutation = useUpdateApiKey()
  const deleteMutation = useDeleteApiKey()

  /**
   * @description Handle API key creation: submit to backend, show plaintext key dialog
   * @param {CreateApiKeyDto} data - The creation payload
   */
  const handleCreate = (data: CreateApiKeyDto) => {
    createMutation.mutate(data, {
      onSuccess: (result) => {
        // Close create dialog and show the one-time key dialog
        setIsCreateOpen(false)
        setCreatedKey(result.plaintext_key)
      },
    })
  }

  /**
   * @description Toggle the active status of an API key
   * @param {string} id - UUID of the key
   * @param {boolean} isActive - New active status
   */
  const handleToggleActive = (id: string, isActive: boolean) => {
    updateMutation.mutate({ id, data: { is_active: isActive } })
  }

  /**
   * @description Delete an API key permanently
   * @param {string} id - UUID of the key
   */
  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  return (
    <>
      <Dialog open={isApiKeysOpen} onOpenChange={(v: boolean) => { if (!v) closeApiKeys() }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>{t('apiKeys.title')}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('apiKeys.description')}
                </p>
              </div>
              <Button onClick={() => setIsCreateOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {t('apiKeys.createKey')}
              </Button>
            </div>
          </DialogHeader>

          {/* API Keys table */}
          <div className="mt-2">
            <ApiKeyTable
              keys={keys}
              loading={isLoading}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Create API Key dialog */}
      <CreateApiKeyDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* One-time key display dialog */}
      {createdKey && (
        <ApiKeyCreatedDialog
          open={!!createdKey}
          onClose={() => setCreatedKey(null)}
          plaintextKey={createdKey}
        />
      )}
    </>
  )
}

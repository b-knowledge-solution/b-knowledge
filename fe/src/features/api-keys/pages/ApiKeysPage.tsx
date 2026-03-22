/**
 * @fileoverview Main page for managing user API keys.
 *   Displays a table of existing keys and provides create/delete/toggle actions.
 * @module features/api-keys/pages/ApiKeysPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey } from '../api/apiKeyQueries'
import ApiKeyTable from '../components/ApiKeyTable'
import CreateApiKeyDialog from '../components/CreateApiKeyDialog'
import ApiKeyCreatedDialog from '../components/ApiKeyCreatedDialog'
import type { CreateApiKeyDto } from '../types/apiKey.types'

/**
 * @description Page for CRUD management of user API keys.
 *   Shows a header with description, a create button, and a table of keys.
 *   After creation, displays the one-time plaintext key in a separate dialog.
 * @returns {JSX.Element} Rendered API Keys management page
 */
export default function ApiKeysPage() {
  const { t } = useTranslation()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const { data: keys = [], isLoading } = useApiKeys()
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
    <div className="w-full h-full flex flex-col p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('apiKeys.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('apiKeys.description')}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('apiKeys.createKey')}
        </Button>
      </div>

      {/* API Keys table */}
      <Card>
        <CardContent className="p-0">
          <ApiKeyTable
            keys={keys}
            loading={isLoading}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

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
    </div>
  )
}

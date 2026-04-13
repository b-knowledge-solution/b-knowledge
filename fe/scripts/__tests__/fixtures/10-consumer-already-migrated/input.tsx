import React from 'react'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

interface DocumentTableProps {
  datasetId: string
  onDelete: (id: string) => void
}

const DocumentTable: React.FC<DocumentTableProps> = ({ datasetId, onDelete }) => {
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  return (
    <div>
      <span>{datasetId}</span>
      {isAdmin && <button onClick={() => onDelete(datasetId)}>Delete</button>}
    </div>
  )
}

export default DocumentTable

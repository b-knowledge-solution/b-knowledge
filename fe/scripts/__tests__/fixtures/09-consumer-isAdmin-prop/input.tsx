import React from 'react'

interface DocumentTableProps {
  datasetId: string
  isAdmin: boolean
  onDelete: (id: string) => void
}

const DocumentTable: React.FC<DocumentTableProps> = ({ datasetId, isAdmin, onDelete }) => {
  return (
    <div>
      <span>{datasetId}</span>
      {isAdmin && <button onClick={() => onDelete(datasetId)}>Delete</button>}
      {isAdmin && <span>Admin badge</span>}
    </div>
  )
}

export default DocumentTable

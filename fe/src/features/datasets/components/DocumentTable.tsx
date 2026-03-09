import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Trash2, Eye } from 'lucide-react';
import { Table, Button, Space, Progress, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Document } from '../types';

interface DocumentTableProps {
  documents: Document[];
  loading: boolean;
  isAdmin: boolean;
  onParse: (docId: string) => void;
  onDelete: (docId: string) => void;
  onView?: (doc: Document) => void;
}

const statusColorMap: Record<string, string> = {
  pending: 'default',
  parsing: 'processing',
  completed: 'success',
  failed: 'error',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  loading,
  isAdmin,
  onParse,
  onDelete,
  onView,
}) => {
  const { t } = useTranslation();

  const columns: ColumnsType<Document> = [
    {
      title: t('datasets.docName'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: Document) => (
        record.status === 'completed' && onView ? (
          <button
            className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline text-left"
            onClick={() => onView(record)}
          >
            {name}
          </button>
        ) : (
          <span className="font-medium">{name}</span>
        )
      ),
    },
    {
      title: t('datasets.docSize'),
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: t('datasets.docStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string, record: Document) => (
        <div>
          <Tag color={statusColorMap[status] || 'default'}>{status}</Tag>
          {status === 'parsing' && (
            <Progress
              percent={Math.round(record.progress * 100)}
              size="small"
              className="mt-1"
            />
          )}
        </div>
      ),
    },
    {
      title: t('datasets.chunkCount'),
      dataIndex: 'chunk_count',
      key: 'chunk_count',
      width: 100,
      align: 'right',
    },
    {
      title: t('datasets.docUploadDate'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    ...(isAdmin
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            width: 120,
            render: (_: unknown, record: Document) => (
              <Space>
                {record.status === 'completed' && onView && (
                  <Tooltip title={t('datasets.viewDocument', 'View')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<Eye size={14} />}
                      onClick={() => onView(record)}
                    />
                  </Tooltip>
                )}
                {record.status === 'pending' && (
                  <Tooltip title={t('datasets.parse')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<Play size={14} />}
                      onClick={() => onParse(record.id)}
                    />
                  </Tooltip>
                )}
                <Tooltip title={t('common.delete')}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => onDelete(record.id)}
                  />
                </Tooltip>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Table
      columns={columns}
      dataSource={documents}
      rowKey="id"
      loading={loading}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showTotal: (total: number) => `${total} ${t('datasets.documents')}`,
      }}
      scroll={{ x: true }}
    />
  );
};

export default DocumentTable;

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

interface FileUploadModalProps {
  open: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
  onCancel: () => void;
}

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.txt', '.md', '.csv', '.json', '.html', '.htm',
  '.jpg', '.jpeg', '.png', '.tiff', '.bmp',
  '.mp3', '.wav', '.ogg',
  '.eml',
];

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  open,
  uploading,
  onUpload,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    await onUpload(files);
    setFiles([]);
  };

  const handleClose = () => {
    setFiles([]);
    onCancel();
  };

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('datasets.uploadTitle')}</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <Upload
            size={40}
            className="mx-auto mb-3 text-slate-400 dark:text-slate-500"
          />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('datasets.dropFiles')}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {t('datasets.supportedFormats')}
          </p>
          <input
            id="file-input"
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <FileText size={16} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
          <Button
            disabled={files.length === 0 || uploading}
            onClick={handleUpload}
          >
            {uploading ? '...' : t('datasets.uploadButton', { count: files.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FileUploadModal;

export interface AccessControl {
  public: boolean;
  user_ids?: string[];
  team_ids?: string[];
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  embedding_model?: string | null;
  parser_id: string;
  parser_config: Record<string, unknown>;
  access_control: AccessControl;
  status: string;
  doc_count: number;
  chunk_count: number;
  token_count: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDatasetDto {
  name: string;
  description?: string;
  language?: string;
  embedding_model?: string;
  parser_id?: string;
  parser_config?: Record<string, unknown>;
  access_control?: AccessControl;
}

export interface UpdateDatasetDto extends Partial<CreateDatasetDto> {}

export interface Document {
  id: string;
  dataset_id: string;
  name: string;
  size: number;
  type?: string | null;
  status: string;
  progress: number;
  progress_msg?: string | null;
  chunk_count: number;
  token_count: number;
  storage_path?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = 'pending' | 'parsing' | 'completed' | 'failed';

export interface Chunk {
  chunk_id: string;
  text: string;
  doc_id?: string;
  doc_name?: string;
  page_num?: number[];
  positions?: number[][];
  score?: number;
  method?: string;
}

export interface ChunksResponse {
  chunks: Chunk[];
  total: number;
  page: number;
  limit: number;
}

export const PARSER_OPTIONS = [
  { value: 'naive', label: 'General' },
  { value: 'book', label: 'Book' },
  { value: 'paper', label: 'Paper' },
  { value: 'table', label: 'Table' },
  { value: 'qa', label: 'Q&A' },
  { value: 'laws', label: 'Laws' },
  { value: 'manual', label: 'Manual' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'one', label: 'One (No Split)' },
  { value: 'picture', label: 'Picture' },
  { value: 'audio', label: 'Audio' },
  { value: 'email', label: 'Email' },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Vietnamese', label: 'Vietnamese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Korean', label: 'Korean' },
] as const;

// ============================================================================
// Document Versioning Types
// ============================================================================

/** @description A version of documents within a dataset */
export interface DocumentVersion {
  id: string;
  dataset_id: string;
  version_label: string;
  ragflow_dataset_id: string | null;
  ragflow_dataset_name: string | null;
  status: 'active' | 'archived';
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** @description A file belonging to a document version */
export interface VersionFile {
  id: string;
  version_id: string;
  file_name: string;
  file_size: number;
  ragflow_doc_id: string | null;
  status: VersionFileStatus;
  error: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

/** @description Possible statuses for a version file through the conversion pipeline */
export type VersionFileStatus = 'pending' | 'converting' | 'converted' | 'imported' | 'parsing' | 'done' | 'failed';

/** @description A converter job tracking batch file processing */
export interface ConverterJob {
  id: string;
  dataset_id: string;
  version_id: string;
  status: 'pending' | 'converting' | 'finished' | 'failed';
  file_count: number;
  finished_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

/** @description DTO for creating a new document version */
export interface CreateVersionDto {
  version_label: string;
  metadata?: Record<string, unknown>;
}

/** @description DTO for updating a document version */
export interface UpdateVersionDto {
  version_label?: string;
  status?: 'active' | 'archived';
  metadata?: Record<string, unknown>;
}

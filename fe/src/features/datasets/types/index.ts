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

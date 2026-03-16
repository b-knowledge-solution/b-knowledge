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
  pagerank?: number;
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
  pagerank?: number;
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

// Removed Versioning Types

// ============================================================================
// Dataset Settings Types
// ============================================================================

/** @description Full dataset settings including chunking and advanced config */
export interface DatasetSettings {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  embedding_model?: string | null;
  permission: string;
  parser_id: string;
  parser_config: Record<string, unknown>;
  pagerank?: number;
  graphrag?: GraphRAGConfig;
  raptor?: RAPTORConfig;
  auto_keywords?: number;
  auto_questions?: number;
}

/** @description GraphRAG configuration */
export interface GraphRAGConfig {
  enabled: boolean;
  entity_types?: string[];
  method?: string;
}

/** @description RAPTOR configuration */
export interface RAPTORConfig {
  enabled: boolean;
  max_token?: number;
  threshold?: number;
  max_cluster?: number;
  random_seed?: number;
}

/** @description Result from a retrieval test */
export interface RetrievalTestResult {
  chunks: RetrievalChunk[];
  total: number;
}

/** @description A single chunk result from retrieval test */
export interface RetrievalChunk {
  chunk_id: string;
  text: string;
  doc_name?: string;
  score: number;
  vector_similarity?: number;
  term_similarity?: number;
  token_count?: number;
}

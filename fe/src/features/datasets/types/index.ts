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
  /** RAGflow fields — returned by the RAG document table */
  /** Parser ID (e.g. 'naive', 'qa', 'resume') */
  parser_id?: string;
  /** Run status: '0' = idle, '1' = running, '2' = cancelled */
  run?: string;
  /** Processing duration in seconds */
  process_duration?: number;
  /** Creation timestamp as Unix milliseconds */
  create_time?: number;
  /** Creation date as ISO/datetime string */
  create_date?: string;
  /** Suffix (file extension) */
  suffix?: string;
  /** Chunk number from RAGflow table */
  chunk_num?: number;
  /** Knowledgebase ID (RAGflow) */
  kb_id?: string;
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
  { value: 'qa', label: 'Q&A' },
  { value: 'resume', label: 'Resume' },
  { value: 'manual', label: 'Manual' },
  { value: 'table', label: 'Table' },
  { value: 'paper', label: 'Paper' },
  { value: 'book', label: 'Book' },
  { value: 'laws', label: 'Laws' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'one', label: 'One (No Split)' },
  { value: 'picture', label: 'Picture' },
  { value: 'audio', label: 'Audio' },
  { value: 'email', label: 'Email' },
] as const;

/** PDF layout recognition engine options */
export const PDF_PARSER_OPTIONS = [
  { value: 'DeepDOC', label: 'DeepDOC' },
  { value: 'Plain Text', label: 'Plain Text' },
  { value: 'MinerU', label: 'MinerU' },
  { value: 'PaddleOCR', label: 'PaddleOCR' },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Vietnamese', label: 'Vietnamese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Korean', label: 'Korean' },
] as const;

/** @description Human-readable descriptions for each built-in parser method */
export const PARSER_DESCRIPTIONS: Record<string, { title: string; description: string; formats: string }> = {
  naive: {
    title: '"General" Chunking method description',
    description:
      'This method chunks files using a \'naive\' method:\n' +
      '• Use vision detection model to split the texts into smaller segments.\n' +
      '• Then, combine adjacent segments until the token count exceeds the threshold specified by \'Chunk token number for text\', at which point a chunk is created.',
    formats: 'Supported file formats are MD, MDX, DOCX, XLSX, XLS (Excel 97-2003), PPTX, PDF, TXT, JPEG, JPG, PNG, TIF, GIF, CSV, JSON, EML, HTML.',
  },
  qa: {
    title: '"Q&A" Chunking method description',
    description:
      'This method extracts question-answer pairs from the document.\n' +
      '• Each Q&A pair becomes a separate chunk.',
    formats: 'Supported: DOCX, PDF, TXT, XLSX, MD.',
  },
  resume: {
    title: '"Resume" Chunking method description',
    description:
      'This method is optimized for extracting structured data from resumes.\n' +
      '• Extracts fields like name, education, experience, skills.',
    formats: 'Supported: DOCX, PDF, TXT, JPG, PNG.',
  },
  manual: {
    title: '"Manual" Chunking method description',
    description:
      'This method parses documents that have a hierarchical structure with numbered headings.\n' +
      '• Splits on heading boundaries.\n' +
      '• Creates chunks aligned with manual sections.',
    formats: 'Supported: DOCX, PDF, TXT.',
  },
  table: {
    title: '"Table" Chunking method description',
    description:
      'This method is optimized for spreadsheet-like data.\n' +
      '• Each row in the table becomes a separate chunk with column headers prepended.',
    formats: 'Supported: XLSX, XLS, CSV.',
  },
  paper: {
    title: '"Paper" Chunking method description',
    description:
      'This method is designed for academic papers.\n' +
      '• Detects abstract, sections, figures, tables, and references.\n' +
      '• Splits on section boundaries.',
    formats: 'Supported: PDF.',
  },
  book: {
    title: '"Book" Chunking method description',
    description:
      'This method is designed for book-length documents.\n' +
      '• Uses table of contents and chapter headings to split.',
    formats: 'Supported: DOCX, PDF, TXT.',
  },
  laws: {
    title: '"Laws" Chunking method description',
    description:
      'This method is optimized for legal documents.\n' +
      '• Splits on article/section boundaries.',
    formats: 'Supported: DOCX, PDF, TXT.',
  },
  presentation: {
    title: '"Presentation" Chunking method description',
    description:
      'This method is designed for slide decks.\n' +
      '• Each slide becomes a chunk.',
    formats: 'Supported: PPTX, PPT.',
  },
  one: {
    title: '"One (No Split)" method description',
    description:
      'This method treats the entire document as a single chunk.\n' +
      '• No splitting is performed.',
    formats: 'Supported: All text-based formats.',
  },
  picture: {
    title: '"Picture" method description',
    description:
      'This method extracts text from images using OCR.\n' +
      '• The extracted text becomes a single chunk.',
    formats: 'Supported: JPG, JPEG, PNG, GIF, TIF.',
  },
  audio: {
    title: '"Audio" method description',
    description:
      'This method transcribes audio files using speech-to-text.\n' +
      '• The transcription becomes a single chunk.',
    formats: 'Supported: MP3, WAV, FLAC, OGG, AAC.',
  },
  email: {
    title: '"Email" method description',
    description:
      'This method parses email files.\n' +
      '• Extracts headers, body, and attachments as separate chunks.',
    formats: 'Supported: EML.',
  },
};

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
  tag_sets?: string[];
  graphrag?: GraphRAGConfig;
  raptor?: RAPTORConfig;
  auto_keywords?: number;
  auto_questions?: number;
}

/** @description GraphRAG / Global Index configuration */
export interface GraphRAGConfig {
  use_graphrag?: boolean;
  enabled: boolean;
  entity_types?: string[];
  method?: string;
  resolution?: boolean;
  community?: boolean;
}

/** @description RAPTOR configuration */
export interface RAPTORConfig {
  use_raptor?: boolean;
  enabled: boolean;
  max_token?: number;
  threshold?: number;
  max_cluster?: number;
  random_seed?: number;
  scope?: 'file' | 'dataset';
  prompt?: string;
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

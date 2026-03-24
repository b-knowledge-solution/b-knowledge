/**
 * @fileoverview Type definitions for the datasets feature module.
 * Includes domain models, DTOs, settings, retrieval test, process logs,
 * knowledge graph, and metadata management types.
 *
 * @module features/datasets/types
 */

/**
 * @description Access control configuration for a dataset.
 * Determines visibility: public to all, or restricted to specific users/teams.
 */
export interface AccessControl {
  public: boolean;
  user_ids?: string[];
  team_ids?: string[];
}

/**
 * @description A single ABAC policy rule for fine-grained dataset access control.
 * Each rule specifies an effect (allow/deny), an action, a subject type,
 * and conditions that must match for the rule to apply.
 */
export interface AbacPolicyRule {
  /** Unique identifier for this rule */
  id: string
  /** Whether this rule allows or denies access */
  effect: 'allow' | 'deny'
  /** The action this rule governs (e.g. read, update, delete) */
  action: string
  /** The subject type this rule applies to (e.g. Document) */
  subject: string
  /** Attribute conditions that must match for this rule to apply */
  conditions: Record<string, unknown>
  /** Optional human-readable description of the rule */
  description?: string
}

/** @description Core dataset entity with metadata, counts, access control, and versioning fields */
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
  /** Parent dataset ID when this dataset is a version of another */
  parent_dataset_id?: string | null;
  /** Version number (1-based) when this is a version dataset */
  version_number?: number | null;
  /** Custom display label for this version (e.g., '1.2.0'). Rendered by VersionBadge when present. */
  version_label?: string | null;
  /** Human-readable description of changes in this version */
  change_summary?: string | null;
  /** User who created this version */
  version_created_by?: string | null;
  /** Custom metadata configuration for this dataset */
  metadata_config?: Record<string, unknown>;
}

/** @description Payload for creating a new dataset */
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

/** @description Payload for updating an existing dataset (all fields optional) */
export interface UpdateDatasetDto extends Partial<CreateDatasetDto> {}

/** @description Document entity within a dataset, includes RAGflow compatibility fields */
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
  /** Source type: 'local' for uploaded files, 'web_crawl' for crawled URLs */
  source_type?: 'local' | 'web_crawl';
  /** Original source URL for web-crawled documents */
  source_url?: string;
  /** Update timestamp as Unix milliseconds (RAGflow) */
  update_time?: number;
  /** Update date as datetime string (RAGflow) */
  update_date?: string;
}

/** @description Possible document processing status values */
export type DocumentStatus = 'pending' | 'parsing' | 'completed' | 'failed';

/** @description A text chunk extracted from a document */
export interface Chunk {
  chunk_id: string;
  text: string;
  doc_id?: string;
  doc_name?: string;
  page_num?: number[];
  positions?: number[][];
  score?: number;
  method?: string;
  /** Whether this chunk is available for search */
  available?: boolean;
  /** Important keywords */
  important_kwd?: string[];
  /** Associated questions */
  question_kwd?: string[];
}

/** @description Paginated response for chunk listing */
export interface ChunksResponse {
  chunks: Chunk[];
  total: number;
  page: number;
  limit: number;
}

/** @description Available built-in document parser options for chunking strategy selection */
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
  { value: 'openapi', label: 'API Spec' },
  { value: 'adr', label: 'ADR' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'sdlc_checklist', label: 'SDLC Checklist' },
] as const;

/** PDF layout recognition engine options */
export const PDF_PARSER_OPTIONS = [
  { value: 'DeepDOC', label: 'DeepDOC' },
  { value: 'Plain Text', label: 'Plain Text' },
  { value: 'MinerU', label: 'MinerU' },
  { value: 'PaddleOCR', label: 'PaddleOCR' },
] as const;

/** @description Available language options for dataset content */
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
  code: {
    title: '"Code" Chunking method description',
    description:
      'This method parses source code files using AST analysis.\n' +
      '• Chunks at function and class boundaries.\n' +
      '• Preserves import context as file-level metadata.\n' +
      '• Extracts function name, class name, parameters, and return type as metadata.',
    formats: 'Supported: PY, JS, TS, TSX, JSX, Java, Go, Rust, Ruby, C, C++, C#, PHP, Swift, Kotlin, Scala, Lua, Bash, R, Dart, Vue, Svelte.',
  },
  openapi: {
    title: '"API Spec" Chunking method description',
    description:
      'This method parses OpenAPI and Swagger specification files.\n' +
      '• Creates one chunk per API endpoint (path + method).\n' +
      '• Resolves schema references and inlines them in each chunk.\n' +
      '• Extracts endpoint path, method, operation ID, and tags as metadata.',
    formats: 'Supported: YAML, JSON (OpenAPI 3.x, Swagger 2.0).',
  },
  adr: {
    title: '"ADR" Chunking method description',
    description:
      'This method parses Architecture Decision Records.\n' +
      '• Detects MADR, Nygard, and Y-statement formats.\n' +
      '• Creates one chunk per section (Context, Decision, Consequences).\n' +
      '• Extracts ADR status, title, and date as metadata.',
    formats: 'Supported: MD, TXT.',
  },
  clinical: {
    title: '"Clinical" Chunking method description',
    description:
      'This method parses clinical and healthcare documents.\n' +
      '• Automatically classifies documents as regulatory, protocol, research, or administrative.\n' +
      '• Classification stored as metadata tag for filtering and ABAC policies.\n' +
      '• Uses general chunking with LLM-based classification.',
    formats: 'Supported: PDF, DOCX, TXT, MD.',
  },
  sdlc_checklist: {
    title: '"SDLC Checklist" Chunking method description',
    description:
      'This method parses Software Development Life Cycle checklists.\n' +
      '• Detects checkboxes, status prefixes ([DONE], [PASS], [FAIL]), and tabular layouts.\n' +
      '• Each checklist item becomes a chunk with phase, status, priority, and assignee metadata.\n' +
      '• Auto-detects SDLC phase: requirements, design review, code review, testing, security, deployment, UAT, maintenance.\n' +
      '• Supports grouped mode to combine items by section.',
    formats: 'Supported: MD, XLSX, CSV, TXT, PDF, DOCX.',
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
  /** Highlighted text with <mark> tags */
  highlight?: string;
  doc_id?: string;
  page_num?: number[];
  positions?: number[][];
}

// ============================================================================
// Process Log Types
// ============================================================================

/** @description A single task/log entry from the RAG worker */
export interface ProcessLogTask {
  task_id: string;
  task_type: string;
  progress: number;
  progress_msg: string;
  begin_at: string;
  process_duration: number;
  create_time?: number;
  create_date?: string;
  status: 'done' | 'failed' | 'running';
}

/** @description Document info returned alongside process logs */
export interface ProcessLogDocument {
  id: string;
  name: string;
  suffix: string;
  size: number;
  type: string;
  status: string;
  run: string;
  progress: number;
  progress_msg: string;
  chunk_num: number;
  token_num: number;
  create_time?: number;
  create_date?: string;
  update_time?: number;
  update_date?: string;
}

/** @description Response shape for document logs endpoint */
export interface DocumentLogsResponse {
  document: ProcessLogDocument;
  tasks: ProcessLogTask[];
}

// ============================================================================
// Dataset Overview Types
// ============================================================================

/** @description Overview statistics for a dataset */
export interface DatasetOverviewStats {
  total_documents: number;
  finished: number;
  failed: number;
  processing: number;
  cancelled: number;
}

/** @description A log entry in the dataset logs table */
export interface DatasetLogEntry {
  id: string;
  doc_id: string;
  task_type: string;
  progress: number;
  progress_msg: string;
  begin_at: string;
  process_duration?: number;
  create_time?: number;
  create_date?: string;
  document_name?: string;
  document_suffix?: string;
}

/** @description Paginated response for dataset logs */
export interface DatasetLogsResponse {
  logs: DatasetLogEntry[];
  total: number;
}

// ============================================================================
// Knowledge Graph Types
// ============================================================================

/** @description A node in the knowledge graph */
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
  pagerank: number;
}

/** @description An edge in the knowledge graph */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  weight: number;
}

/** @description Response shape for graph data endpoint */
export interface GraphDataResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ============================================================================
// Metadata Management Types
// ============================================================================

/** @description Supported metadata value types */
export type MetadataValueType = 'string' | 'number' | 'list' | 'time';

/** @description A single metadata field definition */
export interface MetadataField {
  name: string;
  type: MetadataValueType;
  description?: string;
  values?: string[];
}

/** @description Response shape for metadata endpoint */
export interface MetadataResponse {
  fields: MetadataField[];
}



/**
 * Shared model types (DB rows). Keep aligned with migrations and services.
 * Defines the shape of data returned from database queries.
 */

/**
 * User interface representing a record in the 'users' table.
 */
export interface User {
    /** Unique UUID for the user */
    id: string;
    /** User's email address (unique) */
    email: string;
    /** User's display name */
    display_name: string;
    /** 
     * Optional alias for compatibility with Azure AD profile mapping
     * @deprecated Use display_name instead
     */
    displayName?: string | undefined;
    /** User's system role (e.g., 'admin', 'user', 'leader') */
    role: string;
    /** 
     * User's specific permissions.
     * Can be a JSON string when direct from DB or parsed array in application.
     */
    permissions: string | string[];
    /** Department name from Azure AD */
    department?: string | null;
    /** Job title from Azure AD */
    job_title?: string | null;
    /** Mobile phone number from Azure AD */
    mobile_phone?: string | null;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
    /** Base64 encoded avatar image or URL */
    avatar?: string | undefined;
    /** Bcrypt-hashed password for local account login. Azure AD users have null. */
    password_hash?: string | null;
}

/**
 * Team interface representing a record in the 'teams' table.
 */
export interface Team {
    /** Unique UUID for the team */
    id: string;
    /** Name of the team */
    name: string;
    /** Optional project name associated with the team */
    project_name?: string | null;
    /** Description of the team's purpose */
    description?: string | null;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * UserTeam interface representing the many-to-many relationship
 * between Users and Teams in the 'user_teams' table.
 */
export interface UserTeam {
    /** UUID of the user */
    user_id: string;
    /** UUID of the team */
    team_id: string;
    /** Role within the team (e.g., 'leader', 'member') */
    role: string;
    /** Timestamp when user joined the team */
    joined_at: Date;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at?: Date;
    /** Timestamp of last update */
    updated_at?: Date;
}

/**
 * ChatSession interface representing a conversation session.
 */
export interface ChatSession {
    /** Unique UUID for the session */
    id: string;
    /** UUID of the user who owns the session */
    user_id: string;
    /** Title of the chat session, usually generated from first prompt */
    title: string;
    /** Optional dialog ID linking to a RAGFlow dialog configuration */
    dialog_id?: string | null;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * ChatMessage interface representing an individual message in a session.
 */
export interface ChatMessage {
    /** Unique UUID for the message */
    id: string;
    /** UUID of the session this message belongs to */
    session_id: string;
    /** Role of the message sender ('user' or 'assistant') */
    role: string;
    /** Content of the message */
    content: string;
    /** Timestamp when the message was created */
    timestamp: Date;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** JSONB citations/references from RAGFlow */
    citations?: unknown | null;
    /** RAGFlow external message ID */
    message_id?: string | null;
}

/**
 * ChatAssistant interface representing a chat assistant configuration.
 */
export interface ChatAssistant {
    /** Unique UUID for the assistant */
    id: string;
    /** Display name of the assistant */
    name: string;
    /** Description of the assistant purpose */
    description?: string | null;
    /** Icon identifier or URL */
    icon?: string | null;
    /** Array of knowledge base IDs linked to this assistant */
    kb_ids: string[];
    /** LLM model identifier to use */
    llm_id?: string | null;
    /** Prompt configuration (system prompt, temperature, etc.) */
    prompt_config: Record<string, unknown>;
    /** Whether the assistant is publicly accessible to all users */
    is_public: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * ChatAssistantAccess interface representing an RBAC access entry for a chat assistant.
 * Links an assistant to a user or team that has been granted access.
 */
export interface ChatAssistantAccess {
    /** Unique UUID for the access entry */
    id: string;
    /** UUID of the assistant this access entry belongs to */
    assistant_id: string;
    /** Type of entity granted access ('user' or 'team') */
    entity_type: 'user' | 'team';
    /** UUID of the user or team granted access */
    entity_id: string;
    /** User ID who created this access entry */
    created_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
}

/**
 * SearchApp interface representing a saved search application configuration.
 */
export interface SearchApp {
    /** Unique UUID for the search app */
    id: string;
    /** Display name */
    name: string;
    /** Description of the search app */
    description?: string | null;
    /** Array of dataset IDs to search across */
    dataset_ids: string[];
    /** Search configuration (top_k, method, threshold, etc.) */
    search_config: Record<string, unknown>;
    /** Whether the search app is publicly accessible to all users */
    is_public: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * SearchAppAccess interface representing an RBAC access entry for a search app.
 * Links a search app to a user or team that has been granted access.
 */
export interface SearchAppAccess {
    /** Unique UUID for the access entry */
    id: string;
    /** UUID of the search app this access entry belongs to */
    app_id: string;
    /** Type of entity granted access ('user' or 'team') */
    entity_type: 'user' | 'team';
    /** UUID of the user or team granted access */
    entity_id: string;
    /** User ID who created this access entry */
    created_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
}

/**
 * SearchEmbedToken interface representing an API token for embedded search widget access.
 * Links a token to a search app for unauthenticated public access.
 */
export interface SearchEmbedToken {
    /** Unique UUID for the token record */
    id: string;
    /** UUID of the search app this token grants access to */
    app_id: string;
    /** Unique 64-char hex token string */
    token: string;
    /** Human-readable label for the token */
    name: string;
    /** Whether the token is currently active */
    is_active: boolean;
    /** User ID who created this token */
    created_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Optional expiration timestamp */
    expires_at?: Date | null;
}

/**
 * SystemConfig interface representing key-value configuration pairs.
 */
export interface SystemConfig {
    /** Configuration key name */
    key: string;
    /** Configuration value */
    value: string;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at?: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * KnowledgeBaseSource interface representing a data source for RAG.
 */
export interface KnowledgeBaseSource {
    /** Unique UUID for the source */
    id: string;
    /** Type of source (e.g., 'minio', 'web') */
    type: string;
    /** Name of the source */
    name: string;
    /** URL or path to the source data */
    url: string;
    /** Description of the source */
    description?: string | null;
    /** Share ID extracted from URL (shared_id param) */
    share_id?: string | null;
    /** URL for embedded chat widget on search page */
    chat_widget_url?: string | null;
    /** Access Control List details in JSON format */
    access_control: any;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * AuditLog interface representing a system audit event.
 */
export interface AuditLog {
    /** Auto-incrementing integer ID */
    id: number;
    /** UUID of the user who performed the action (nullable for system actions) */
    user_id?: string | null;
    /** Email of the user who performed the action */
    user_email: string;
    /** Action performed (e.g., 'CREATE', 'DELETE') */
    action: string;
    /** Type of resource affected (e.g., 'USER', 'FILE') */
    resource_type: string;
    /** ID of the affected resource (optional) */
    resource_id?: string | null;
    /** Additional details in JSON format */
    details: any;
    /** IP address of the client */
    ip_address?: string | null;
    /** Timestamp when the action occurred */
    created_at: Date;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
}

/**
 * UserIpHistory interface representing IP tracking records.
 */
export interface UserIpHistory {
    /** Auto-incrementing integer ID */
    id: number;
    /** UUID of the user */
    user_id: string;
    /** IP address string */
    ip_address: string;
    /** Timestamp of last access from this IP */
    last_accessed_at: Date;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
}

/**
 * BroadcastMessage interface representing system-wide alerts.
 */
export interface BroadcastMessage {
    /** Unique UUID for the message */
    id: string;
    /** Content of the broadcast message */
    message: string;
    /** Timestamp when validity starts */
    starts_at: Date;
    /** Timestamp when validity ends */
    ends_at: Date;
    /** CSS color for the banner background */
    color?: string | null;
    /** CSS color for the text */
    font_color?: string | null;
    /** Whether the message is currently active */
    is_active: boolean;
    /** Whether users can dismiss this message */
    is_dismissible: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * UserDismissedBroadcast interface tracking dismissed messages.
 */
export interface UserDismissedBroadcast {
    /** UUID of the user */
    user_id: string;
    /** UUID of the dismissed broadcast message */
    broadcast_id: string;
    /** Timestamp when it was dismissed */
    dismissed_at: Date;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
}

/**
 * PermissionLevels enum defining access hierarchy.
 */
export enum PermissionLevel {
    /** No access */
    NONE = 0,
    /** Read-only access */
    VIEW = 1,
    /** Write/Upload access */
    UPLOAD = 2,
    /** Full control (including delete) */
    FULL = 3
}

/**
 * Prompt interface representing a saved prompt.
 */
export interface Prompt {
    /** Unique UUID for the prompt */
    id: string;
    /** The prompt text */
    prompt: string;
    /** Description of the prompt */
    description?: string | null;
    /** Array of tags */
    tags: string[]; // Parsed from JSON
    /** Source of the prompt (e.g., 'chat') */
    source: string;
    /** Whether the prompt is active */
    is_active: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * PromptInteraction interface representing user feedback (Like, Dislike, Comment).
 */
export interface PromptInteraction {
    /** Unique UUID for the interaction */
    id: string;
    /** UUID of the prompt */
    prompt_id: string;
    /** User ID who provided the feedback */
    user_id?: string | null;
    /** Type of interaction ('like', 'dislike', 'comment') */
    interaction_type: 'like' | 'dislike' | 'comment';
    /** Comment text if type is 'comment' */
    comment?: string | null;
    /** Snapshot of the prompt text at the time of interaction */
    prompt_snapshot?: string | null;
    /** Timestamp of creation */
    created_at: Date;
}

/**
 * PromptTag interface representing a reusable tag with color.
 */
export interface PromptTag {
    /** Unique UUID for the tag */
    id: string;
    /** Tag name (unique) */
    name: string;
    /** Color in hex format (e.g., #FF5733) */
    color: string;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}
/**
 * PromptPermission interface representing a record in the 'prompt_permissions' table.
 */
export interface PromptPermission {
    /** Unique UUID for the permission record */
    id: string;
    /** Type of entity granted permission ('user' or 'team') */
    entity_type: string;
    /** UUID of the user or team */
    entity_id: string;
    /** Numeric permission level */
    permission_level: number;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * DTO for bulk creating prompts.
 */
export interface BulkCreatePromptDto {
    /** The prompt text (required) */
    prompt: string;
    /** Description of the prompt */
    description?: string | null;
    /** Array of tag names */
    tags?: string[];
    /** Source identifier */
    source?: string;
}

/**
 * Result of bulk prompt creation.
 */
export interface BulkCreateResult {
    /** Whether the operation completed successfully */
    success: boolean;
    /** Number of prompts successfully imported */
    imported: number;
    /** Number of prompts skipped (duplicates) */
    skipped: number;
    /** Any error messages */
    errors: string[];
}

/**
 * GlossaryTask interface representing a task in the glossary management system.
 * Tasks are the parent entity containing prompt template instructions.
 */
export interface GlossaryTask {
    /** Unique UUID for the task */
    id: string;
    /** Task name (unique) */
    name: string;
    /** Description of the task */
    description?: string | null;
    /** Task instruction in English (required) */
    task_instruction_en: string;
    /** Task instruction in Japanese (optional) */
    task_instruction_ja?: string | null;
    /** Task instruction in Vietnamese (optional) */
    task_instruction_vi?: string | null;
    /** Keyword and context template with {keyword} placeholder */
    context_template: string;
    /** Sort order for display */
    sort_order: number;
    /** Whether the task is active */
    is_active: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * GlossaryKeyword interface representing a standalone keyword entity.
 * Keywords are independent entries in the glossary system.
 */
export interface GlossaryKeyword {
    /** Unique UUID for the keyword */
    id: string;
    /** Keyword name (globally unique) */
    name: string;
    /** English translation of the keyword */
    en_keyword?: string | null;
    /** Description of the keyword */
    description?: string | null;
    /** Sort order for display */
    sort_order: number;
    /** Whether the keyword is active */
    is_active: boolean;
    /** User ID who created this record */
    created_by?: string | null;
    /** User ID who last updated this record */
    updated_by?: string | null;
    /** Timestamp of record creation */
    created_at: Date;
    /** Timestamp of last update */
    updated_at: Date;
}

/**
 * DTO for a single row in the glossary bulk import Excel file.
 */
export interface BulkImportGlossaryRow {
    /** Name of the task (required) */
    task_name: string;
    /** Task instruction in English (required) */
    task_instruction_en: string;
    /** Task instruction in Japanese (optional) */
    task_instruction_ja?: string;
    /** Task instruction in Vietnamese (optional) */
    task_instruction_vi?: string;
    /** Context template with {keyword} placeholder */
    context_template: string;
}

/**
 * Result of glossary bulk import operation.
 */
/**
 * Dataset interface representing a RAG dataset (knowledgebase).
 */
export interface Dataset {
    id: string;
    name: string;
    description?: string | null;
    language: string;
    embedding_model?: string | null;
    parser_id: string;
    parser_config: any;
    access_control: any;
    status: string;
    doc_count: number;
    chunk_count: number;
    token_count?: number;
    pagerank?: number;
    created_by?: string | null;
    updated_by?: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Document interface representing a file within a dataset.
 */
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
    created_at: Date;
    updated_at: Date;
}

/**
 * ModelProvider interface representing a system-wide model provider config.
 *
 * Supported `model_type` values (RAGFlow canonical types):
 * - `chat`        – Conversational LLM (e.g. GPT-4o, Claude)
 * - `embedding`   – Text embedding model (e.g. text-embedding-3-large)
 * - `speech2text` – Speech-to-text / ASR (e.g. Whisper)
 * - `rerank`      – Re-ranking model for search results
 * - `tts`         – Text-to-speech model
 * - `ocr`         – Optical character recognition model
 *
 * Vision support: chat models with `vision = true` can also be used as VLM
 * (image-to-text) models by the Python worker.
 */
export interface ModelProvider {
    id: string;
    factory_name: string;
    /** One of: chat, embedding, speech2text, rerank, tts, ocr */
    model_type: string;
    model_name: string;
    api_key?: string | null;
    api_base?: string | null;
    max_tokens?: number | null;
    /** Whether this chat model supports vision (image understanding) */
    vision?: boolean;
    status: string;
    is_default: boolean;
    created_by?: string | null;
    updated_by?: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * TenantLlm interface representing a row in the shared 'tenant_llm' table.
 * This table is read by Python task executors to load LLM provider configs.
 */
export interface TenantLlm {
    /** Primary key (hex UUID without hyphens) */
    id: string;
    /** Tenant UUID this config belongs to */
    tenant_id: string;
    /** LLM provider factory name (e.g., 'OpenAI', 'Azure') */
    llm_factory: string;
    /** Model type (e.g., 'chat', 'embedding') */
    model_type: string;
    /** Model identifier (e.g., 'gpt-4o') */
    llm_name: string;
    /** API key for the provider */
    api_key: string;
    /** Optional custom API base URL */
    api_base: string;
    /** Maximum tokens allowed */
    max_tokens: number;
    /** Whether this chat model supports vision (image understanding) */
    vision?: boolean;
}

export interface BulkImportGlossaryResult {
    /** Whether the operation completed successfully */
    success: boolean;
    /** Number of tasks created */
    tasksCreated: number;
    /** Number of items skipped (duplicates) */
    skipped: number;
    /** Any error messages */
    errors: string[];
}

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

/**
 * Project interface representing a record in the 'projects' table.
 */
export interface Project {
  /** Unique UUID for the project */
  id: string
  /** Project name */
  name: string
  /** Project description */
  description?: string | null
  /** Avatar image URL or base64 */
  avatar?: string | null
  /** Default embedding model for datasets */
  default_embedding_model?: string | null
  /** Default chunk method for parsing */
  default_chunk_method?: string | null
  /** Default parser configuration (JSONB) */
  default_parser_config: any
  /** Project status: active, archived */
  status: string
  /** Whether the project is private */
  is_private: boolean
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * ProjectPermission interface representing tab-level access control.
 */
export interface ProjectPermission {
  /** Unique UUID */
  id: string
  /** Reference to the project */
  project_id: string
  /** Grantee type: 'user' or 'team' */
  grantee_type: string
  /** UUID of the grantee */
  grantee_id: string
  /** Tab-level permission for documents */
  tab_documents: string
  /** Tab-level permission for chat */
  tab_chat: string
  /** Tab-level permission for settings */
  tab_settings: string
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * ProjectDataset interface representing the project-dataset junction.
 */
export interface ProjectDataset {
  /** Unique UUID */
  id: string
  /** Reference to the project */
  project_id: string
  /** Reference to the dataset */
  dataset_id: string
  /** Whether auto-created with the project */
  auto_created: boolean
  /** Timestamp of record creation */
  created_at: Date
}

/**
 * ProjectSyncConfig interface for external data source sync configuration.
 */
export interface ProjectSyncConfig {
  /** Unique UUID */
  id: string
  /** Reference to the project */
  project_id: string
  /** Source type: sharepoint, jira, confluence, gitlab, github */
  source_type: string
  /** Encrypted connection configuration */
  connection_config?: string | null
  /** Cron expression or preset schedule */
  sync_schedule?: string | null
  /** Filter rules (JSONB) */
  filter_rules: any
  /** Last successful sync timestamp */
  last_synced_at?: Date | null
  /** Status: active, paused, error */
  status: string
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * DocumentCategory interface representing a grouping within a project.
 */
export interface DocumentCategory {
  /** Unique UUID */
  id: string
  /** Reference to the parent project */
  project_id: string
  /** Category name */
  name: string
  /** Category description */
  description?: string | null
  /** Display sort order */
  sort_order: number
  /** Dataset configuration overrides (JSONB) */
  dataset_config: any
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * DocumentCategoryVersion interface representing a version within a category.
 */
export interface DocumentCategoryVersion {
  /** Unique UUID */
  id: string
  /** Reference to the parent category */
  category_id: string
  /** Human-readable version label */
  version_label: string
  /** RAGFlow dataset ID */
  ragflow_dataset_id?: string | null
  /** RAGFlow dataset name */
  ragflow_dataset_name?: string | null
  /** Version status */
  status: string
  /** Last sync timestamp */
  last_synced_at?: Date | null
  /** Additional metadata (JSONB) */
  metadata: any
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * DocumentCategoryVersionFile interface for files within a category version.
 */
export interface DocumentCategoryVersionFile {
  /** Unique UUID */
  id: string
  /** Reference to the parent version */
  version_id: string
  /** Original file name */
  file_name: string
  /** RAGFlow document ID */
  ragflow_doc_id?: string | null
  /** File processing status */
  status: string
  /** Error message if failed */
  error?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * ProjectChat interface for chat assistants linked to projects.
 */
export interface ProjectChat {
  /** Unique UUID */
  id: string
  /** Reference to the parent project */
  project_id: string
  /** Chat name */
  name: string
  /** RAGFlow chat assistant ID */
  ragflow_chat_id?: string | null
  /** Local dataset IDs (JSON array) */
  dataset_ids: any
  /** RAGFlow dataset IDs (JSON array) */
  ragflow_dataset_ids: any
  /** LLM configuration */
  llm_config: any
  /** Prompt configuration */
  prompt_config: any
  /** Chat status */
  status: string
  /** Last sync timestamp */
  last_synced_at?: Date | null
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * ProjectSearch interface for search apps linked to projects.
 */
export interface ProjectSearch {
  /** Unique UUID */
  id: string
  /** Reference to the parent project */
  project_id: string
  /** Search app name */
  name: string
  /** Description */
  description?: string | null
  /** RAGFlow search app ID */
  ragflow_search_id?: string | null
  /** Local dataset IDs (JSON array) */
  dataset_ids: any
  /** RAGFlow dataset IDs (JSON array) */
  ragflow_dataset_ids: any
  /** Search configuration (JSONB) */
  search_config: any
  /** Status */
  status: string
  /** Last sync timestamp */
  last_synced_at?: Date | null
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * ProjectEntityPermission interface for granular entity-level access.
 */
export interface ProjectEntityPermission {
  /** Unique UUID */
  id: string
  /** Reference to the parent project */
  project_id: string
  /** Entity type: category, chat, search */
  entity_type: string
  /** UUID of the entity */
  entity_id: string
  /** Grantee type: user or team */
  grantee_type: string
  /** UUID of the grantee */
  grantee_id: string
  /** Permission level: none, view, create, edit, delete */
  permission_level: string
  /** User ID who created this record */
  created_by?: string | null
  /** User ID who last updated this record */
  updated_by?: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

// ---------------------------------------------------------------------------
// Chat embed token types
// ---------------------------------------------------------------------------

/**
 * ChatEmbedToken interface representing a record in the 'chat_embed_tokens' table.
 * Tokens grant public access to a chat dialog via embed endpoints.
 */
export interface ChatEmbedToken {
    /** Unique UUID for the token record */
    id: string;
    /** UUID of the dialog this token grants access to */
    dialog_id: string;
    /** 64-character hex token string (unique) */
    token: string;
    /** Human-readable name for the token */
    name: string;
    /** Whether the token is currently active */
    is_active: boolean;
    /** User ID who created the token */
    created_by?: string | null;
    /** Timestamp of token creation */
    created_at: Date;
    /** Timestamp when the token expires (null = never) */
    expires_at?: Date | null;
}

// ---------------------------------------------------------------------------
// RAG Peewee-schema row types (shared with Python task executors)
// ---------------------------------------------------------------------------

/**
 * DocumentRow represents a row in the Peewee 'document' table.
 * Table schema matches advance-rag/db/db_models.py.
 */
export interface DocumentRow {
    id: string;
    kb_id: string;
    parser_id: string;
    parser_config: Record<string, unknown>;
    source_type: string;
    type: string;
    created_by: string;
    name: string;
    location: string;
    size: number;
    suffix: string;
    /** "0"=not started, "1"=running, "2"=cancelled, "3"=done, "4"=fail */
    run: string;
    /** "0"=deleted, "1"=valid */
    status: string;
    progress: number;
    progress_msg: string;
    token_num: number;
    chunk_num: number;
    [key: string]: unknown;
}

/**
 * TaskRow represents a row in the Peewee 'task' table.
 */
export interface TaskRow {
    id: string;
    doc_id: string;
    from_page: number;
    to_page: number;
    task_type: string;
    priority: number;
    progress: number;
    progress_msg: string;
    begin_at: string;
    digest: string;
    chunk_ids: string;
    [key: string]: unknown;
}

/**
 * KnowledgebaseRow represents a row in the Peewee 'knowledgebase' table.
 */
export interface KnowledgebaseRow {
    id: string;
    tenant_id: string;
    name: string;
    language: string;
    description: string;
    embd_id: string;
    parser_id: string;
    parser_config: Record<string, unknown>;
    doc_num: number;
    token_num: number;
    chunk_num: number;
    graphrag_task_id: string | null;
    raptor_task_id: string | null;
    mindmap_task_id: string | null;
    status: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Document Version types
// ---------------------------------------------------------------------------

/**
 * DocumentVersion interface representing a versioned snapshot of dataset documents.
 */
export interface DocumentVersion {
    /** Unique UUID for the version */
    id: string
    /** UUID of the parent dataset */
    dataset_id: string
    /** Human-readable version label (e.g., 'v1.0', '2026-03') */
    version_label: string
    /** RAGFlow dataset ID for this version's documents */
    ragflow_dataset_id?: string | null
    /** RAGFlow dataset name */
    ragflow_dataset_name?: string | null
    /** Version status ('active' or 'archived') */
    status: 'active' | 'archived'
    /** Timestamp of last sync with RAGFlow */
    last_synced_at?: Date | null
    /** JSONB metadata (pagerank, chunk_method, parser_config, etc.) */
    metadata: Record<string, unknown>
    /** User ID who created this version */
    created_by?: string | null
    /** Timestamp of record creation */
    created_at: Date
    /** Timestamp of last update */
    updated_at: Date
}

/**
 * DocumentVersionFile interface representing a file within a document version.
 */
export interface DocumentVersionFile {
    /** Unique UUID for the file record */
    id: string
    /** UUID of the parent version */
    version_id: string
    /** Original file name */
    file_name: string
    /** RAGFlow document ID (set after upload to RAGFlow) */
    ragflow_doc_id?: string | null
    /** Current file status in the pipeline */
    status: 'pending' | 'converting' | 'converted' | 'imported' | 'parsing' | 'done' | 'failed'
    /** Error message if failed */
    error?: string | null
    /** Timestamp of record creation */
    created_at: Date
    /** Timestamp of last update */
    updated_at: Date
}

/**
 * ConverterJob interface representing a conversion job for a document version.
 */
export interface ConverterJob {
    /** Unique UUID for the job */
    id: string
    /** UUID of the parent dataset */
    dataset_id: string
    /** UUID of the version being converted */
    version_id: string
    /** Job status */
    status: 'pending' | 'converting' | 'finished' | 'failed'
    /** Total number of files in this job */
    file_count: number
    /** Number of successfully finished files */
    finished_count: number
    /** Number of failed files */
    failed_count: number
    /** Timestamp of record creation */
    created_at: Date
    /** Timestamp of last update */
    updated_at: Date
}

// ---------------------------------------------------------------------------
// Prompt variable types
// ---------------------------------------------------------------------------

/**
 * PromptVariable defines a user-replaceable placeholder in a dialog's system prompt.
 * Variables use `{variable_name}` syntax in the prompt template.
 */
export interface PromptVariable {
  /** Variable key (must match /^[a-zA-Z_][a-zA-Z0-9_]*$/) */
  key: string
  /** Human-readable description of the variable */
  description?: string
  /** Whether the variable can be omitted at chat time */
  optional: boolean
  /** Default value used when the variable is not provided */
  default_value?: string
}

/**
 * MetadataFilterCondition defines a single metadata filter for RAG search.
 */
export interface MetadataFilterCondition {
  /** Field name in the OpenSearch document metadata */
  name: string
  /** Comparison operator */
  comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
  /** Value to compare against (string, number, or [min, max] for range) */
  value: string | number | [number, number]
}

// ---------------------------------------------------------------------------
// Shared service interfaces
// ---------------------------------------------------------------------------

/**
 * Access control definition for datasets and knowledge base sources.
 */
export interface AccessControl {
    public: boolean;
    team_ids: string[];
    user_ids: string[];
}

/**
 * Authenticated user context passed to service methods for audit logging.
 */
export interface UserContext {
    id: string;
    email: string;
    role?: string;
    ip?: string;
}

// ---------------------------------------------------------------------------
// RAG search types
// ---------------------------------------------------------------------------

/**
 * A single chunk result from Elasticsearch search.
 */
export interface ChunkResult {
    chunk_id: string;
    text: string;
    doc_id?: string;
    doc_name?: string;
    /** Page numbers where the chunk was extracted from */
    page_num?: number[];
    /** Position coordinates: [[page, x1, x2, y1, y2], ...] for PDF highlighting */
    positions?: number[][];
    score?: number;
    method?: string;
    /** Image ID for image-type chunks */
    img_id?: string;
}

/**
 * Search request parameters for RAG search.
 */
export interface SearchRequest {
    query: string;
    method?: 'hybrid' | 'semantic' | 'full_text';
    top_k?: number;
    similarity_threshold?: number;
    /** Optional vector similarity weight for hybrid search (0-1) */
    vector_similarity_weight?: number;
    /** Optional metadata filter for OpenSearch bool query conditions */
    metadata_filter?: {
        logic: 'and' | 'or';
        conditions: Array<{
            name: string;
            comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range';
            value: string | number | (string | number)[];
        }>;
    };
}

// ---------------------------------------------------------------------------
// RAG Redis task types
// ---------------------------------------------------------------------------

/**
 * Task message sent to Redis Streams for advance-rag task executors.
 */
export interface TaskMessage {
    id: string;
    doc_id: string;
    from_page: number;
    to_page: number;
    task_type: string;
    priority?: number;
    progress?: number;
    progress_msg?: string;
    begin_at?: string;
    digest?: string;
    doc_ids?: string[];
    [key: string]: unknown;
}

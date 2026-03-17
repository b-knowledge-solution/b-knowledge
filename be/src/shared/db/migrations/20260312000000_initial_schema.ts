/**
 * @fileoverview Initial database schema migration.
 * @description Creates all application tables in correct dependency order.
 *   Tables are organized into logical groups: core, chat, knowledge base,
 *   broadcast, history tracking, glossary, RAG pipeline, sync, access control,
 *   and projects. Also encrypts any existing plaintext API keys at rest.
 */
import type { Knex } from 'knex'
import { cryptoService } from '../../services/crypto.service.js'

/**
 * @description Create all application tables in dependency order, set up indexes,
 * foreign key constraints, and encrypt any existing plaintext API keys.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // ──────────────────────────────────────────────
  // 1. Core tables (no foreign key dependencies)
  // ──────────────────────────────────────────────

  // Users - central identity table referenced by most other tables
  await knex.schema.createTable('users', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('email').unique().notNullable()
    table.text('display_name').notNullable()
    table.text('role').notNullable().defaultTo('user')
    table.text('permissions').notNullable().defaultTo('[]')
    table.text('department')
    table.text('job_title')
    table.text('mobile_phone')
    // Nullable bcrypt hash for local-auth users; Azure AD users remain null
    table.text('password_hash').nullable()
    // Peewee-managed columns (merged from legacy 'user' table)
    table.text('access_token').nullable()
    table.text('avatar').nullable()
    table.string('language', 32).nullable().defaultTo('English')
    table.string('color_schema', 32).nullable().defaultTo('Bright')
    table.string('timezone', 64).nullable()
    table.timestamp('last_login_time').nullable()
    table.string('is_authenticated', 1).notNullable().defaultTo('1')
    table.string('is_active', 1).notNullable().defaultTo('1')
    table.string('is_anonymous', 1).notNullable().defaultTo('0')
    table.text('login_channel').nullable()
    table.string('status', 1).nullable().defaultTo('1')
    table.boolean('is_superuser').nullable().defaultTo(false)
    // Peewee BaseModel timestamp columns (used by advance-rag UserService)
    table.bigInteger('create_time').nullable()
    table.timestamp('create_date').nullable()
    table.bigInteger('update_time').nullable()
    table.timestamp('update_date').nullable()
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  // Teams - organizational grouping for users
  await knex.schema.createTable('teams', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('name').notNullable()
    table.text('project_name')
    table.text('description')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  // System configs - key-value application settings
  await knex.schema.createTable('system_configs', (table) => {
    table.text('key').primary()
    table.text('value').notNullable()
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })


  // ──────────────────────────────────────────────
  // 2. User-Teams junction (depends on users, teams)
  // ──────────────────────────────────────────────

  await knex.schema.createTable('user_teams', (table) => {
    table.text('user_id').notNullable()
    table.text('team_id').notNullable()
    table.text('role').notNullable().defaultTo('member')
    table.timestamp('joined_at', { useTz: true }).defaultTo(knex.fn.now())
    table.primary(['user_id', 'team_id'])
    table.foreign('user_id').references('users.id').onDelete('CASCADE')
    table.foreign('team_id').references('teams.id').onDelete('CASCADE')
    table.index('user_id')
    table.index('team_id')
  })

  // ──────────────────────────────────────────────
  // 3. Chat tables (depends on users)
  // ──────────────────────────────────────────────

  // Chat assistants - chat assistant configurations (RAGFlow "dialog")
  await knex.schema.createTable('chat_assistants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 128).notNullable()
    table.text('description')
    table.string('icon', 256)
    table.jsonb('kb_ids').defaultTo('[]')
    table.string('llm_id', 128)
    table.jsonb('prompt_config').defaultTo('{}')
    table.boolean('is_public').defaultTo(false)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })

  // Chat assistant access - RBAC junction table for assistant sharing
  await knex.schema.createTable('chat_assistant_access', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Reference to the assistant being shared
    table.uuid('assistant_id').notNullable().references('id').inTable('chat_assistants').onDelete('CASCADE')
    // Entity type: 'user' or 'team'
    table.string('entity_type', 16).notNullable()
    // UUID of the user or team granted access
    table.uuid('entity_id').notNullable()
    // User who created this access entry
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    // Enforce valid entity types
    table.check('?? IN (?, ?)', ['entity_type', 'user', 'team'])
    // Prevent duplicate access entries
    table.unique(['assistant_id', 'entity_type', 'entity_id'])
    // Index for fast lookups by assistant
    table.index('assistant_id', 'idx_chat_assistant_access_assistant_id')
    // Composite index for querying accessible assistants by entity
    table.index(['entity_type', 'entity_id'], 'idx_chat_assistant_access_entity')
  })

  // Chat embed tokens - tokens for external chat widget authentication
  await knex.schema.createTable('chat_embed_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('assistant_id').notNullable().references('id').inTable('chat_assistants').onDelete('CASCADE')
    table.string('token', 64).notNullable().unique()
    table.string('name', 128).notNullable()
    table.boolean('is_active').defaultTo(true)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('expires_at', { useTz: true }).nullable()
    table.index('assistant_id', 'idx_embed_tokens_assistant')
    table.index('token', 'idx_embed_tokens_token')
  })

  // Chat sessions - user conversation sessions
  await knex.schema.createTable('chat_sessions', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('user_id').notNullable()
    table.text('title').notNullable()
    table.uuid('dialog_id').nullable()
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table.foreign('user_id').references('users.id').onDelete('CASCADE')
  })

  // Chat messages - individual messages within sessions
  await knex.schema.createTable('chat_messages', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('session_id').notNullable()
    table.text('role').notNullable()
    table.text('content').notNullable()
    table.jsonb('citations').nullable()
    table.string('message_id', 64).nullable()
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now())
    table.foreign('session_id').references('chat_sessions.id').onDelete('CASCADE')
  })

  // Chat files - file attachments uploaded during chat conversations
  await knex.schema.createTable('chat_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // session_id must be text to match chat_sessions.id which is defined as text
    table.text('session_id').notNullable().references('id').inTable('chat_sessions').onDelete('CASCADE')
    table.text('message_id').nullable()
    table.string('original_name', 256).notNullable()
    table.string('mime_type', 128).notNullable()
    table.bigInteger('size').notNullable()
    table.string('s3_key', 1024).notNullable()
    table.string('s3_bucket', 256).notNullable()
    table.text('url').nullable()
    table.text('uploaded_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('expires_at', { useTz: true }).nullable()
    table.index('session_id', 'idx_chat_files_session')
    table.index('expires_at', 'idx_chat_files_expires')
  })

  // ──────────────────────────────────────────────
  // 4. Search apps (depends on users)
  // ──────────────────────────────────────────────

  // Search apps - saved search configurations
  await knex.schema.createTable('search_apps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 128).notNullable()
    table.text('description')
    table.jsonb('dataset_ids').defaultTo('[]')
    table.jsonb('search_config').defaultTo('{}')
    table.boolean('is_public').defaultTo(false)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })

  // Search app access - RBAC junction table for search app sharing
  await knex.schema.createTable('search_app_access', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Reference to the search app being shared
    table.uuid('app_id').notNullable().references('id').inTable('search_apps').onDelete('CASCADE')
    // Entity type: 'user' or 'team'
    table.string('entity_type', 16).notNullable()
    // UUID of the user or team granted access
    table.uuid('entity_id').notNullable()
    // User who created this access entry
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    // Enforce valid entity types
    table.check('?? IN (?, ?)', ['entity_type', 'user', 'team'])
    // Prevent duplicate access entries
    table.unique(['app_id', 'entity_type', 'entity_id'])
    // Index for fast lookups by search app
    table.index('app_id', 'idx_search_app_access_app_id')
    // Composite index for querying accessible apps by entity
    table.index(['entity_type', 'entity_id'], 'idx_search_app_access_entity')
  })

  // Search embed tokens - tokens for external search widget authentication
  await knex.schema.createTable('search_embed_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Reference to the search app this token grants access to
    table.uuid('app_id').notNullable().references('id').inTable('search_apps').onDelete('CASCADE')
    // Unique 64-char hex token for API authentication
    table.string('token', 64).notNullable().unique()
    // Human-readable label for the token
    table.string('name', 128).notNullable()
    // Whether the token is currently active
    table.boolean('is_active').defaultTo(true)
    // User who created this token
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    // Creation timestamp
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    // Optional expiration timestamp
    table.timestamp('expires_at', { useTz: true }).nullable()

    // Index for fast lookups by app
    table.index('app_id', 'idx_search_embed_tokens_app_id')
    // Index for token-based authentication lookups
    table.index('token', 'idx_search_embed_tokens_token')
  })

  // ──────────────────────────────────────────────
  // 5. Audit and IP tracking (depends on users)
  // ──────────────────────────────────────────────

  // Audit logs - security and compliance trail
  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary()
    table.text('user_id')
    table.text('user_email').notNullable()
    table.text('action').notNullable()
    table.text('resource_type').notNullable()
    table.text('resource_id')
    table.jsonb('details').defaultTo('{}')
    table.text('ip_address')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('user_id')
    table.index('action')
    table.index('resource_type')
    table.index('created_at')
  })
  // Descending index for recent-first queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)')
  // Composite index for user-scoped recent queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_user ON audit_logs(created_at DESC, user_id)')

  // User IP history - tracks user login IP addresses
  await knex.schema.createTable('user_ip_history', (table) => {
    table.increments('id').primary()
    table.text('user_id').notNullable()
    table.text('ip_address').notNullable()
    table.timestamp('last_accessed_at', { useTz: true }).defaultTo(knex.fn.now())
    table.unique(['user_id', 'ip_address'])
    table.foreign('user_id').references('users.id').onDelete('CASCADE')
    table.index('user_id')
  })

  // ──────────────────────────────────────────────
  // 6. Broadcast messages (depends on users)
  // ──────────────────────────────────────────────

  // Broadcast messages - system-wide notifications
  await knex.schema.createTable('broadcast_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.text('message').notNullable()
    table.timestamp('starts_at', { useTz: true }).notNullable()
    table.timestamp('ends_at', { useTz: true }).notNullable()
    table.string('color', 50).defaultTo('#E75E40')
    table.string('font_color', 50).defaultTo('#FFFFFF')
    table.boolean('is_active').defaultTo(true)
    table.boolean('is_dismissible').defaultTo(true)
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table.index(['is_active', 'starts_at', 'ends_at'])
  })

  // User dismissed broadcasts - tracks which users dismissed which broadcasts
  await knex.schema.createTable('user_dismissed_broadcasts', (table) => {
    table.text('user_id').notNullable()
    table.uuid('broadcast_id').notNullable()
    table.timestamp('dismissed_at', { useTz: true }).defaultTo(knex.fn.now())
    table.primary(['user_id', 'broadcast_id'])
    table.foreign('user_id').references('users.id').onDelete('CASCADE')
    table.foreign('broadcast_id').references('broadcast_messages.id').onDelete('CASCADE')
    table.index('user_id')
  })

  // ──────────────────────────────────────────────
  // 7. History tracking tables (renamed from external_*)
  // ──────────────────────────────────────────────

  // History chat sessions - chat sessions from external clients
  await knex.schema.createTable('history_chat_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.text('session_id').unique().notNullable()
    table.text('share_id')
    table.text('user_email')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('share_id')
    table.index('user_email')
  })

  // History chat messages - messages within history chat sessions
  await knex.schema.createTable('history_chat_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.text('session_id').notNullable()
    table.text('user_prompt').notNullable()
    table.text('llm_response').notNullable()
    table.jsonb('citations').defaultTo('[]')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    // Full-text search vector for prompt and response content
    table.specificType('search_vector', "tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(user_prompt, '') || ' ' || coalesce(llm_response, ''))) STORED")

    table.index('session_id')
    table.foreign('session_id').references('history_chat_sessions.session_id').onDelete('CASCADE')
  })
  // Descending index for recent-first message queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_hist_chat_msg_created_at ON history_chat_messages(created_at DESC)')
  // GIN index for full-text search
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_hist_chat_msg_search_vector ON history_chat_messages USING GIN(search_vector)')

  // History search sessions - search sessions from external clients
  await knex.schema.createTable('history_search_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.text('session_id').unique().notNullable()
    table.text('share_id')
    table.text('user_email')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('share_id')
    table.index('user_email')
  })

  // History search records - individual search results within sessions
  await knex.schema.createTable('history_search_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.text('session_id').notNullable()
    table.text('search_input').notNullable()
    table.text('ai_summary')
    table.jsonb('file_results').defaultTo('[]')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    // Full-text search vector for search input and AI summary
    table.specificType('search_vector', "tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(search_input, '') || ' ' || coalesce(ai_summary, ''))) STORED")

    table.index('session_id')
    table.foreign('session_id').references('history_search_sessions.session_id').onDelete('CASCADE')
  })
  // Descending index for recent-first search record queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_hist_search_rec_created_at ON history_search_records(created_at DESC)')
  // GIN index for full-text search
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_hist_search_rec_search_vector ON history_search_records USING GIN(search_vector)')

  // ──────────────────────────────────────────────
  // 8. Glossary tables
  // ──────────────────────────────────────────────

  // Glossary tasks - prompt template instructions
  await knex.schema.createTable('glossary_tasks', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('name').unique().notNullable()
    table.text('description')
    table.text('task_instruction_en').notNullable()
    table.text('task_instruction_ja')
    table.text('task_instruction_vi')
    table.text('context_template').notNullable()
    table.integer('sort_order').defaultTo(0)
    table.boolean('is_active').defaultTo(true)
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('name')
    table.index('is_active')
    table.index('sort_order')
  })

  // Glossary keywords - standalone keyword entities
  await knex.schema.createTable('glossary_keywords', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('name').unique().notNullable()
    table.text('en_keyword')
    table.text('description')
    table.integer('sort_order').defaultTo(0)
    table.boolean('is_active').defaultTo(true)
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('is_active')
    table.index('sort_order')
  })

  // ──────────────────────────────────────────────
  // 9a. Peewee-managed tables (shared with advance-rag Python worker)
  // ──────────────────────────────────────────────

  const SYSTEM_TENANT_ID = (
    process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
  ).replace(/-/g, '')

  // Tenant — system tenant record (single-tenant mode)
  await knex.schema.createTable('tenant', (t) => {
    t.string('id', 32).primary()
    t.string('name', 100).nullable().index()
    t.string('public_key', 255).nullable().index()
    t.string('llm_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_llm_id').nullable().index()
    t.string('embd_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_embd_id').nullable().index()
    t.string('asr_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_asr_id').nullable().index()
    t.string('img2txt_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_img2txt_id').nullable().index()
    t.string('rerank_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_rerank_id').nullable().index()
    t.string('tts_id', 256).nullable().index()
    t.text('tenant_tts_id').nullable().index()
    t.string('parser_ids', 256).notNullable().defaultTo('').index()
    t.integer('credit').defaultTo(512).index()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // Seed system tenant
  await knex('tenant').insert({
    id: SYSTEM_TENANT_ID,
    name: 'system',
    llm_id: '',
    embd_id: '',
    asr_id: '',
    img2txt_id: '',
    rerank_id: '',
    tts_id: '',
    parser_ids: 'naive:General,qa:Q&A,table:Table,paper:Paper,book:Book,laws:Laws,presentation:Presentation,picture:Picture,one:One,audio:Audio,email:Email',
    credit: 9999999,
    status: '1',
    create_time: Date.now(),
    create_date: new Date(),
    update_time: Date.now(),
    update_date: new Date(),
  })

  // Knowledgebase — dataset/knowledge base metadata (Peewee-managed)
  await knex.schema.createTable('knowledgebase', (t) => {
    t.string('id', 32).primary()
    t.text('avatar').nullable()
    t.string('tenant_id', 32).notNullable().index()
    t.string('name', 128).notNullable().index()
    t.string('language', 32).nullable().defaultTo('English').index()
    t.text('description').nullable()
    t.string('embd_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_embd_id').nullable().index()
    t.string('permission', 16).notNullable().defaultTo('me').index()
    t.string('created_by', 32).notNullable().index()
    t.integer('doc_num').defaultTo(0).index()
    t.integer('token_num').defaultTo(0).index()
    t.integer('chunk_num').defaultTo(0).index()
    t.float('similarity_threshold').defaultTo(0.2).index()
    t.float('vector_similarity_weight').defaultTo(0.3).index()
    t.string('parser_id', 32).notNullable().defaultTo('naive').index()
    t.string('pipeline_id', 32).nullable().index()
    t.jsonb('parser_config').notNullable().defaultTo('{"pages":[[1,1000000]],"table_context_size":0,"image_context_size":0}')
    t.integer('pagerank').defaultTo(0)
    t.string('graphrag_task_id', 32).nullable().index()
    t.timestamp('graphrag_task_finish_at').nullable()
    t.string('raptor_task_id', 32).nullable().index()
    t.timestamp('raptor_task_finish_at').nullable()
    t.string('mindmap_task_id', 32).nullable().index()
    t.timestamp('mindmap_task_finish_at').nullable()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // Document — document records for RAG processing (Peewee-managed)
  await knex.schema.createTable('document', (t) => {
    t.string('id', 32).primary()
    t.text('thumbnail').nullable()
    t.string('kb_id', 256).notNullable().index()
    t.string('parser_id', 32).notNullable().index()
    t.string('pipeline_id', 32).nullable().index()
    t.jsonb('parser_config').notNullable().defaultTo('{"pages":[[1,1000000]],"table_context_size":0,"image_context_size":0}')
    t.string('source_type', 128).notNullable().defaultTo('local').index()
    t.string('type', 32).notNullable().index()
    t.string('created_by', 32).notNullable().index()
    t.string('name', 255).nullable().index()
    t.string('location', 255).nullable().index()
    t.integer('size').defaultTo(0).index()
    t.integer('token_num').defaultTo(0).index()
    t.integer('chunk_num').defaultTo(0).index()
    t.float('progress').defaultTo(0).index()
    t.text('progress_msg').nullable().defaultTo('')
    t.timestamp('process_begin_at').nullable().index()
    t.float('process_duration').defaultTo(0)
    t.string('suffix', 32).notNullable().defaultTo('').index()
    t.string('content_hash', 32).nullable().defaultTo('').index()
    t.string('run', 1).nullable().defaultTo('0').index()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.string('source_url', 2048).nullable()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // File — file metadata (S3 storage references, Peewee-managed)
  await knex.schema.createTable('file', (t) => {
    t.string('id', 32).primary()
    t.string('parent_id', 32).notNullable().index()
    t.string('tenant_id', 32).notNullable().index()
    t.string('created_by', 32).notNullable().index()
    t.string('name', 255).notNullable().index()
    t.string('location', 255).nullable().index()
    t.integer('size').defaultTo(0).index()
    t.string('type', 32).notNullable().index()
    t.string('source_type', 128).notNullable().defaultTo('').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // File2Document — join table linking files to documents (Peewee-managed)
  await knex.schema.createTable('file2document', (t) => {
    t.string('id', 32).primary()
    t.string('file_id', 32).nullable().index()
    t.string('document_id', 32).nullable().index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // Task — RAG processing task queue (Peewee-managed)
  await knex.schema.createTable('task', (t) => {
    t.string('id', 32).primary()
    t.string('doc_id', 32).notNullable().index()
    t.integer('from_page').defaultTo(0)
    t.integer('to_page').defaultTo(100000000)
    t.string('task_type', 32).notNullable().defaultTo('')
    t.integer('priority').defaultTo(0)
    t.timestamp('begin_at').nullable().index()
    t.float('process_duration').defaultTo(0)
    t.float('progress').defaultTo(0).index()
    t.text('progress_msg').nullable().defaultTo('')
    t.integer('retry_count').defaultTo(0)
    t.text('digest').nullable().defaultTo('')
    t.text('chunk_ids').nullable().defaultTo('')
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // UserTenant — maps RAGFlow users to tenants (Peewee-managed)
  if (!(await knex.schema.hasTable('user_tenant'))) {
    await knex.schema.createTable('user_tenant', (t) => {
      t.string('id', 32).primary()
      t.string('user_id', 32).notNullable().index()
      t.string('tenant_id', 32).notNullable().index()
      t.string('role', 32).notNullable().index()
      t.string('invited_by', 32).notNullable().index()
      t.string('status', 1).nullable().defaultTo('1').index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // LLMFactories — LLM provider factory registry (Peewee-managed)
  if (!(await knex.schema.hasTable('llm_factories'))) {
    await knex.schema.createTable('llm_factories', (t) => {
      t.string('name', 128).primary()
      t.text('logo').nullable()
      t.string('tags', 255).notNullable().index()
      t.integer('rank').defaultTo(0)
      t.string('status', 1).nullable().defaultTo('1').index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // LLM — LLM model dictionary with composite primary key (Peewee-managed)
  if (!(await knex.schema.hasTable('llm'))) {
    await knex.schema.createTable('llm', (t) => {
      t.string('llm_name', 128).notNullable().index()
      t.string('model_type', 128).notNullable().index()
      t.string('fid', 128).notNullable().index()
      t.integer('max_tokens').defaultTo(0)
      t.string('tags', 255).notNullable().index()
      t.boolean('is_tools').notNullable().defaultTo(false)
      t.string('status', 1).nullable().defaultTo('1').index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
      t.primary(['fid', 'llm_name'])
    })
  }

  // TenantLangfuse — Langfuse observability config per tenant (Peewee-managed)
  if (!(await knex.schema.hasTable('tenant_langfuse'))) {
    await knex.schema.createTable('tenant_langfuse', (t) => {
      t.string('tenant_id', 32).primary()
      t.string('secret_key', 2048).notNullable().index()
      t.string('public_key', 2048).notNullable().index()
      t.string('host', 128).notNullable().index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // UserCanvas — user-created canvas workflows (Peewee-managed)
  if (!(await knex.schema.hasTable('user_canvas'))) {
    await knex.schema.createTable('user_canvas', (t) => {
      t.string('id', 32).primary()
      t.text('avatar').nullable()
      t.string('user_id', 255).notNullable().index()
      t.string('title', 255).nullable()
      t.string('permission', 16).notNullable().defaultTo('me').index()
      t.boolean('release').notNullable().defaultTo(false).index()
      t.text('description').nullable()
      t.string('canvas_type', 32).nullable().index()
      t.string('canvas_category', 32).notNullable().defaultTo('agent_canvas').index()
      t.text('dsl').nullable()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // CanvasTemplate — predefined canvas templates (Peewee-managed)
  if (!(await knex.schema.hasTable('canvas_template'))) {
    await knex.schema.createTable('canvas_template', (t) => {
      t.string('id', 32).primary()
      t.text('avatar').nullable()
      t.text('title').nullable()
      t.text('description').nullable()
      t.string('canvas_type', 32).nullable().index()
      t.string('canvas_category', 32).notNullable().defaultTo('agent_canvas').index()
      t.text('dsl').nullable()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // MCPServer — MCP server configurations per tenant (Peewee-managed)
  if (!(await knex.schema.hasTable('mcp_server'))) {
    await knex.schema.createTable('mcp_server', (t) => {
      t.string('id', 32).primary()
      t.string('name', 255).notNullable()
      t.string('tenant_id', 32).notNullable().index()
      t.string('url', 2048).notNullable()
      t.string('server_type', 32).notNullable()
      t.text('description').nullable()
      t.text('variables').nullable()
      t.text('headers').nullable()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // PipelineOperationLog — tracks pipeline execution history (Peewee-managed)
  if (!(await knex.schema.hasTable('pipeline_operation_log'))) {
    await knex.schema.createTable('pipeline_operation_log', (t) => {
      t.string('id', 32).primary()
      t.string('document_id', 32).index()
      t.string('tenant_id', 32).notNullable().index()
      t.string('kb_id', 32).notNullable().index()
      t.string('pipeline_id', 32).nullable().index()
      t.string('pipeline_title', 32).nullable().index()
      t.string('parser_id', 32).notNullable().index()
      t.string('document_name', 255).notNullable()
      t.string('document_suffix', 255).notNullable()
      t.string('document_type', 255).notNullable()
      t.string('source_from', 255).notNullable()
      t.float('progress').defaultTo(0).index()
      t.text('progress_msg').nullable().defaultTo('')
      t.timestamp('process_begin_at').nullable().index()
      t.float('process_duration').defaultTo(0)
      t.text('dsl').nullable()
      t.string('task_type', 32).notNullable().defaultTo('')
      t.string('operation_status', 32).notNullable()
      t.text('avatar').nullable()
      t.string('status', 1).nullable().defaultTo('1').index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // Connector — data source connector configs (Peewee-managed, separate from Knex `connectors`)
  if (!(await knex.schema.hasTable('connector'))) {
    await knex.schema.createTable('connector', (t) => {
      t.string('id', 32).primary()
      t.string('tenant_id', 32).notNullable().index()
      t.string('name', 128).notNullable()
      t.string('source', 128).notNullable().index()
      t.string('input_type', 128).notNullable().index()
      t.text('config').notNullable().defaultTo('{}')
      t.integer('refresh_freq').defaultTo(0)
      t.integer('prune_freq').defaultTo(0)
      t.integer('timeout_secs').defaultTo(3600)
      t.timestamp('indexing_start').nullable().index()
      t.string('status', 16).nullable().defaultTo('schedule').index()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // Connector2Kb — join table linking connectors to knowledge bases (Peewee-managed)
  if (!(await knex.schema.hasTable('connector2kb'))) {
    await knex.schema.createTable('connector2kb', (t) => {
      t.string('id', 32).primary()
      t.string('connector_id', 32).notNullable().index()
      t.string('kb_id', 32).notNullable().index()
      t.string('auto_parse', 1).notNullable().defaultTo('1')
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // Memory — AI memory storage configurations (Peewee-managed)
  if (!(await knex.schema.hasTable('memory'))) {
    await knex.schema.createTable('memory', (t) => {
      t.string('id', 32).primary()
      t.string('name', 128).notNullable()
      t.text('avatar').nullable()
      t.string('tenant_id', 32).notNullable().index()
      t.integer('memory_type').notNullable().defaultTo(1).index()
      t.string('storage_type', 32).notNullable().defaultTo('table').index()
      t.string('embd_id', 128).notNullable()
      t.text('tenant_embd_id').nullable().index()
      t.string('llm_id', 128).notNullable()
      t.text('tenant_llm_id').nullable().index()
      t.string('permissions', 16).notNullable().defaultTo('me').index()
      t.text('description').nullable()
      t.integer('memory_size').notNullable().defaultTo(5242880)
      t.string('forgetting_policy', 32).notNullable().defaultTo('FIFO')
      t.float('temperature').defaultTo(0.5)
      t.text('system_prompt').nullable()
      t.text('user_prompt').nullable()
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ──────────────────────────────────────────────
  // 9b. RAG pipeline tables (depends on users)
  // ──────────────────────────────────────────────

  // Datasets - system-level resource with IAM access control
  await knex.schema.createTable('datasets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 128).notNullable()
    table.text('description')
    table.string('language', 32).defaultTo('English')
    table.string('embedding_model', 128)
    table.string('parser_id', 32).defaultTo('naive')
    table.jsonb('parser_config').defaultTo('{}')
    table.jsonb('access_control').defaultTo('{"public": true}')
    table.string('status', 16).defaultTo('active')
    table.integer('doc_count').defaultTo(0)
    table.integer('chunk_count').defaultTo(0)
    table.integer('token_count').defaultTo(0)
    // Pagerank for search result boosting (positive = boost, negative = suppress)
    table.integer('pagerank').defaultTo(0)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })

  // Partial unique index — only active (non-deleted) datasets must have unique names
  await knex.raw(`
    CREATE UNIQUE INDEX datasets_name_active_unique
    ON datasets (LOWER(name))
    WHERE status <> 'deleted'
  `)

  // Documents - files within a dataset
  await knex.schema.createTable('documents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('dataset_id').notNullable().references('id').inTable('datasets').onDelete('CASCADE')
    table.string('name', 255).notNullable()
    table.bigInteger('size').defaultTo(0)
    table.string('type', 32)
    table.string('status', 16).defaultTo('pending')
    table.float('progress').defaultTo(0)
    table.text('progress_msg')
    table.integer('chunk_count').defaultTo(0)
    table.integer('token_count').defaultTo(0)
    table.string('storage_path', 512)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)

    table.index('dataset_id')
  })

  // Model providers - system-wide LLM model provider configuration
  await knex.schema.createTable('model_providers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('factory_name', 128).notNullable()
    table.string('model_type', 128).notNullable()
    table.string('model_name', 128).notNullable()
    table.text('api_key')
    table.string('api_base', 512)
    table.integer('max_tokens')
    // Whether this chat model supports vision (image understanding)
    table.boolean('vision').defaultTo(false).notNullable()
    table.string('status', 16).defaultTo('active')
    table.boolean('is_default').defaultTo(false)
    // Tenant scoping (single-tenant default, future multi-tenant ready)
    table.string('tenant_id', 32).notNullable().defaultTo(
      (process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001').replace(/-/g, '')
    )
    // Cumulative token usage tracked by advance-rag worker
    table.integer('used_tokens').notNullable().defaultTo(0)
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })
  // Partial unique index — only active rows must have unique (tenant_id, factory_name, model_name)
  await knex.raw(`
    CREATE UNIQUE INDEX model_providers_tenant_factory_model_active_unique
    ON model_providers (tenant_id, factory_name, model_name)
    WHERE status = 'active'
  `)

  // ──────────────────────────────────────────────
  // 11. Sync tables (depends on knowledgebase*, users)
  //     *knowledgebase is a RAGFlow Peewee table
  // ──────────────────────────────────────────────

  // Connectors - external data source connection configurations
  await knex.schema.createTable('connectors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 255).notNullable()
    table.string('source_type', 64).notNullable()
    // References the RAGFlow Peewee knowledgebase table (no FK constraint
    // because that table is managed by Python ORM, not Knex migrations)
    table.string('kb_id', 255).notNullable()
    table.jsonb('config').defaultTo('{}')
    table.text('description')
    table.string('schedule', 128)
    table.string('status', 16).defaultTo('active')
    table.timestamp('last_synced_at')
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)

    table.index('kb_id')
    table.index('status')
  })

  // Sync logs - tracks individual sync task executions
  await knex.schema.createTable('sync_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('connector_id').notNullable().references('id').inTable('connectors').onDelete('CASCADE')
    table.string('kb_id', 255).notNullable()
    table.string('status', 16).defaultTo('pending')
    table.integer('docs_synced').defaultTo(0)
    table.integer('docs_failed').defaultTo(0)
    table.integer('progress').defaultTo(0)
    table.text('message')
    table.timestamp('started_at')
    table.timestamp('finished_at')
    table.timestamps(true, true)

    table.index('connector_id')
    table.index('status')
  })

  // ──────────────────────────────────────────────
  // Section 12 – Project tables
  // ──────────────────────────────────────────────

  // 12.1 Projects - core project entity
  await knex.schema.createTable('projects', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('name').notNullable()
    table.text('description')
    table.text('avatar')
    // Reference to the RAGFlow server used by this project
    table.text('ragflow_server_id')
    // Default embedding model for datasets created within this project
    table.text('default_embedding_model')
    // Default chunk method for document parsing
    table.text('default_chunk_method')
    // Default parser configuration (JSON)
    table.jsonb('default_parser_config').defaultTo('{}')
    // Project status: active, archived, etc.
    table.text('status').notNullable().defaultTo('active')
    // Whether the project is private (restricted access)
    table.boolean('is_private').defaultTo(false)
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index('status')
    table.index('created_by')
  })

  // 12.2 Project permissions - tab-level access control
  await knex.schema.createTable('project_permissions', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the project
    table.text('project_id').notNullable()
    // Grantee type: 'user' or 'team'
    table.text('grantee_type').notNullable()
    // UUID of the user or team granted access
    table.text('grantee_id').notNullable()
    // Tab-level permissions: 'none' | 'view' | 'manage'
    table.text('tab_documents').notNullable().defaultTo('none')
    table.text('tab_chat').notNullable().defaultTo('none')
    table.text('tab_settings').notNullable().defaultTo('none')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    // Composite unique: one permission row per grantee per project
    table.unique(['project_id', 'grantee_type', 'grantee_id'])
    table.index('project_id')
    table.index(['grantee_type', 'grantee_id'])
  })

  // 12.3 Document categories - groupings within a project
  await knex.schema.createTable('document_categories', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    table.text('name').notNullable()
    table.text('description')
    // Display ordering within the project
    table.integer('sort_order').defaultTo(0)
    // Optional dataset configuration overrides (JSON)
    table.jsonb('dataset_config').defaultTo('{}')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    table.index('project_id')
    table.index('sort_order')
  })

  // 12.4 Document category versions - each maps to 1 RAGFlow dataset
  await knex.schema.createTable('document_category_versions', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent category
    table.text('category_id').notNullable()
    table.text('version_label').notNullable()
    // RAGFlow dataset mapping
    table.text('ragflow_dataset_id')
    table.text('ragflow_dataset_name')
    // Version status: active, archived, syncing, etc.
    table.text('status').notNullable().defaultTo('active')
    // Last time this version was synced with RAGFlow
    table.timestamp('last_synced_at', { useTz: true })
    // Additional metadata (JSON)
    table.jsonb('metadata').defaultTo('{}')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('category_id').references('document_categories.id').onDelete('CASCADE')
    table.index('category_id')
    table.unique(['category_id', 'version_label'])
  })

  // 12.5 Document category version files - per-file records
  await knex.schema.createTable('document_category_version_files', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent version
    table.text('version_id').notNullable()
    table.text('file_name').notNullable()
    // RAGFlow document ID after upload
    table.text('ragflow_doc_id')
    // File processing status: pending, uploaded, parsing, completed, failed
    table.text('status').notNullable().defaultTo('pending')
    // Error message if processing failed
    table.text('error')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('version_id').references('document_category_versions.id').onDelete('CASCADE')
    table.unique(['version_id', 'file_name'])
    table.index('version_id')
  })

  // 12.6 Project chats - chat assistants linked to projects
  await knex.schema.createTable('project_chats', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    table.text('name').notNullable()
    // RAGFlow chat assistant mapping
    table.text('ragflow_chat_id')
    // Local dataset IDs (JSON array)
    table.jsonb('dataset_ids').defaultTo('[]')
    // RAGFlow dataset IDs (JSON array)
    table.jsonb('ragflow_dataset_ids').defaultTo('[]')
    // LLM configuration (model, temperature, etc.)
    table.jsonb('llm_config').defaultTo('{}')
    // Prompt configuration (system prompt, etc.)
    table.jsonb('prompt_config').defaultTo('{}')
    // Chat status: active, inactive, syncing
    table.text('status').notNullable().defaultTo('active')
    // Last time this chat was synced with RAGFlow
    table.timestamp('last_synced_at', { useTz: true })
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    table.index('project_id')
  })

  // 12.7 Project searches - search apps linked to projects
  await knex.schema.createTable('project_searches', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    table.text('name').notNullable()
    table.text('description')
    // RAGFlow search app mapping
    table.text('ragflow_search_id')
    // Local dataset IDs (JSON array)
    table.jsonb('dataset_ids').defaultTo('[]')
    // RAGFlow dataset IDs (JSON array)
    table.jsonb('ragflow_dataset_ids').defaultTo('[]')
    // Search configuration (JSON)
    table.jsonb('search_config').defaultTo('{}')
    // Search status: active, inactive, syncing
    table.text('status').notNullable().defaultTo('active')
    // Last time this search was synced with RAGFlow
    table.timestamp('last_synced_at', { useTz: true })
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    table.index('project_id')
  })

  // 12.8 Project entity permissions - granular entity-level access
  await knex.schema.createTable('project_entity_permissions', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    // Entity type: 'category', 'chat', 'search'
    table.text('entity_type').notNullable()
    // UUID of the specific entity
    table.text('entity_id').notNullable()
    // Grantee type: 'user' or 'team'
    table.text('grantee_type').notNullable()
    // UUID of the user or team granted access
    table.text('grantee_id').notNullable()
    // Permission level: 'none' | 'view' | 'create' | 'edit' | 'delete'
    table.text('permission_level').notNullable().defaultTo('none')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    // Composite unique: one permission per entity per grantee
    table.unique(['project_id', 'entity_type', 'entity_id', 'grantee_type', 'grantee_id'])
    table.index('project_id')
    table.index(['entity_type', 'entity_id'])
    table.index(['grantee_type', 'grantee_id'])
  })

  // 12.9 Project datasets - datasets linked to projects
  await knex.schema.createTable('project_datasets', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    // Reference to the dataset
    table.uuid('dataset_id').notNullable()
    // Role within the project: 'primary' | 'secondary'
    table.text('role').notNullable().defaultTo('primary')
    table.text('created_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    table.foreign('dataset_id').references('datasets.id').onDelete('CASCADE')
    // Each dataset can only be linked once per project
    table.unique(['project_id', 'dataset_id'])
    table.index('project_id')
    table.index('dataset_id')
  })

  // 12.10 Project sync configs - per-project RAGFlow sync settings
  await knex.schema.createTable('project_sync_configs', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    // Sync schedule (cron expression or keyword)
    table.text('schedule')
    // Whether automatic sync is enabled
    table.boolean('auto_sync_enabled').defaultTo(false)
    // Last successful sync timestamp
    table.timestamp('last_synced_at', { useTz: true })
    // Additional sync settings (JSON)
    table.jsonb('settings').defaultTo('{}')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    // One sync config per project
    table.unique(['project_id'])
  })

  // ──────────────────────────────────────────────
  // Section 14 – Encrypt existing plaintext API keys
  // ──────────────────────────────────────────────
  // On a fresh database this is a no-op (no rows to encrypt).

  // Encrypt model_providers rows
  const providers = await knex('model_providers')
    .select('id', 'api_key')
    .whereNotNull('api_key')
    .andWhereNot('api_key', '')

  for (const row of providers) {
    // Skip if already encrypted
    if (row.api_key.startsWith('enc:')) continue

    const encrypted = cryptoService.encrypt(row.api_key)
    await knex('model_providers')
      .where('id', row.id)
      .update({ api_key: encrypted })
  }

}

/**
 * @description Drop all application tables in reverse dependency order and
 * decrypt any encrypted API keys back to plaintext before removal.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  // Decrypt api_key values back to plaintext (rollback)
  const hasProviders = await knex.schema.hasTable('model_providers')
  if (hasProviders) {
    const providers = await knex('model_providers')
      .select('id', 'api_key')
      .whereNotNull('api_key')
      .andWhere('api_key', 'like', 'enc:%')

    for (const row of providers) {
      const decrypted = cryptoService.decrypt(row.api_key)
      await knex('model_providers')
        .where('id', row.id)
        .update({ api_key: decrypted })
    }
  }

  // Project tables (reverse dependency order)
  await knex.schema.dropTableIfExists('project_sync_configs')
  await knex.schema.dropTableIfExists('project_datasets')
  await knex.schema.dropTableIfExists('project_entity_permissions')
  await knex.schema.dropTableIfExists('project_searches')
  await knex.schema.dropTableIfExists('project_chats')
  await knex.schema.dropTableIfExists('document_category_version_files')
  await knex.schema.dropTableIfExists('document_category_versions')
  await knex.schema.dropTableIfExists('document_categories')
  await knex.schema.dropTableIfExists('project_permissions')
  await knex.schema.dropTableIfExists('projects')

  // Sync tables
  await knex.schema.dropTableIfExists('sync_logs')
  await knex.schema.dropTableIfExists('connectors')

  // RAG pipeline
  await knex.raw('DROP INDEX IF EXISTS datasets_name_active_unique')
  await knex.raw('DROP INDEX IF EXISTS model_providers_tenant_factory_model_active_unique')
  await knex.schema.dropTableIfExists('model_providers')
  await knex.schema.dropTableIfExists('documents')
  await knex.schema.dropTableIfExists('datasets')

  // Peewee-managed tables
  await knex.schema.dropTableIfExists('memory')
  await knex.schema.dropTableIfExists('connector2kb')
  await knex.schema.dropTableIfExists('connector')
  await knex.schema.dropTableIfExists('pipeline_operation_log')
  await knex.schema.dropTableIfExists('mcp_server')
  await knex.schema.dropTableIfExists('canvas_template')
  await knex.schema.dropTableIfExists('user_canvas')
  await knex.schema.dropTableIfExists('tenant_langfuse')
  await knex.schema.dropTableIfExists('llm')
  await knex.schema.dropTableIfExists('llm_factories')
  await knex.schema.dropTableIfExists('user_tenant')
  await knex.schema.dropTableIfExists('task')
  await knex.schema.dropTableIfExists('file2document')
  await knex.schema.dropTableIfExists('file')
  await knex.schema.dropTableIfExists('document')
  await knex.schema.dropTableIfExists('knowledgebase')
  await knex.schema.dropTableIfExists('tenant')

  // Glossary
  await knex.schema.dropTableIfExists('glossary_keywords')
  await knex.schema.dropTableIfExists('glossary_tasks')

  // History tracking
  await knex.schema.dropTableIfExists('history_search_records')
  await knex.schema.dropTableIfExists('history_search_sessions')
  await knex.schema.dropTableIfExists('history_chat_messages')
  await knex.schema.dropTableIfExists('history_chat_sessions')

  // Broadcast
  await knex.schema.dropTableIfExists('user_dismissed_broadcasts')
  await knex.schema.dropTableIfExists('broadcast_messages')

  // Audit and IP tracking
  await knex.schema.dropTableIfExists('user_ip_history')
  await knex.schema.dropTableIfExists('audit_logs')

  // Search apps
  await knex.schema.dropTableIfExists('search_embed_tokens')
  await knex.schema.dropTableIfExists('search_app_access')
  await knex.schema.dropTableIfExists('search_apps')

  // Chat tables
  await knex.schema.dropTableIfExists('chat_files')
  await knex.schema.dropTableIfExists('chat_messages')
  await knex.schema.dropTableIfExists('chat_sessions')
  await knex.schema.dropTableIfExists('chat_embed_tokens')
  await knex.schema.dropTableIfExists('chat_assistant_access')
  await knex.schema.dropTableIfExists('chat_assistants')

  // User-Teams junction
  await knex.schema.dropTableIfExists('user_teams')

  // Core tables
  await knex.schema.dropTableIfExists('system_configs')
  await knex.schema.dropTableIfExists('teams')
  await knex.schema.dropTableIfExists('users')
}

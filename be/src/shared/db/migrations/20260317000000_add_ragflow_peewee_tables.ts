/**
 * @fileoverview Create advance-rag Peewee-managed tables via Knex migration.
 *
 * These tables are shared between the Node.js backend and the Python advance-rag
 * worker. Previously they were created by Peewee's init_database_tables(), but
 * per project convention all schema changes must go through Knex migrations.
 *
 * Tables created:
 *   - tenant: System tenant record (single-tenant mode)
 *   - knowledgebase: Dataset/knowledge base metadata
 *   - document: Document records for RAG processing
 *   - file: File metadata (S3 storage references)
 *   - file2document: Join table linking files to documents
 *   - task: RAG processing task queue
 *   - tenant_llm: Per-tenant LLM model configurations
 *
 * The system tenant row is seeded with SYSTEM_TENANT_ID.
 */
import type { Knex } from 'knex'

const SYSTEM_TENANT_ID = (
  process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '')

export async function up(knex: Knex): Promise<void> {
  // ---- tenant ----
  if (!(await knex.schema.hasTable('tenant'))) {
    await knex.schema.createTable('tenant', (t) => {
      t.string('id', 32).primary()
      t.string('name', 100).nullable().index()
      t.string('public_key', 255).nullable().index()
      t.string('llm_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_llm_id').nullable().index()
      t.string('embd_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_embd_id').nullable().index()
      t.string('asr_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_asr_id').nullable().index()
      t.string('img2txt_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_img2txt_id').nullable().index()
      t.string('rerank_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_rerank_id').nullable().index()
      t.string('tts_id', 256).nullable().index()
      t.integer('tenant_tts_id').nullable().index()
      t.string('parser_ids', 256).notNullable().defaultTo('').index()
      t.integer('credit').defaultTo(512).index()
      t.string('status', 1).nullable().defaultTo('1').index()
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // Seed system tenant if not present
  const existingTenant = await knex('tenant').where('id', SYSTEM_TENANT_ID).first()
  if (!existingTenant) {
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
  }

  // ---- knowledgebase ----
  if (!(await knex.schema.hasTable('knowledgebase'))) {
    await knex.schema.createTable('knowledgebase', (t) => {
      t.string('id', 32).primary()
      t.text('avatar').nullable()
      t.string('tenant_id', 32).notNullable().index()
      t.string('name', 128).notNullable().index()
      t.string('language', 32).nullable().defaultTo('English').index()
      t.text('description').nullable()
      t.string('embd_id', 128).notNullable().defaultTo('').index()
      t.integer('tenant_embd_id').nullable().index()
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
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ---- document ----
  if (!(await knex.schema.hasTable('document'))) {
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
      // Added by initial_schema Section 13 for web-crawled documents
      t.string('source_url', 2048).nullable()
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ---- file ----
  if (!(await knex.schema.hasTable('file'))) {
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
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ---- file2document ----
  if (!(await knex.schema.hasTable('file2document'))) {
    await knex.schema.createTable('file2document', (t) => {
      t.string('id', 32).primary()
      t.string('file_id', 32).nullable().index()
      t.string('document_id', 32).nullable().index()
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ---- task ----
  if (!(await knex.schema.hasTable('task'))) {
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
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
    })
  }

  // ---- tenant_llm ----
  if (!(await knex.schema.hasTable('tenant_llm'))) {
    await knex.schema.createTable('tenant_llm', (t) => {
      t.increments('id').primary()
      t.string('tenant_id', 32).notNullable().index()
      t.string('llm_factory', 128).notNullable().index()
      t.string('model_type', 128).nullable().index()
      t.string('llm_name', 128).nullable().defaultTo('').index()
      t.text('api_key').nullable()
      t.string('api_base', 255).nullable()
      t.integer('max_tokens').defaultTo(8192).index()
      t.integer('used_tokens').defaultTo(0).index()
      t.boolean('vision').nullable().defaultTo(false)
      t.string('status', 1).notNullable().defaultTo('1').index()
      // BaseModel fields
      t.bigInteger('create_time').nullable().index()
      t.timestamp('create_date').nullable().index()
      t.bigInteger('update_time').nullable().index()
      t.timestamp('update_date').nullable().index()
      // Unique constraint matching Peewee model
      t.unique(['tenant_id', 'llm_factory', 'llm_name'])
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists('tenant_llm')
  await knex.schema.dropTableIfExists('task')
  await knex.schema.dropTableIfExists('file2document')
  await knex.schema.dropTableIfExists('file')
  await knex.schema.dropTableIfExists('document')
  await knex.schema.dropTableIfExists('knowledgebase')
  await knex.schema.dropTableIfExists('tenant')
}

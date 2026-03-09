import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // datasets: system-level resource with IAM access_control
    await knex.schema.createTable('datasets', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('name', 128).notNullable().unique();
        table.text('description');
        table.string('language', 32).defaultTo('English');
        table.string('embedding_model', 128);
        table.string('parser_id', 32).defaultTo('naive');
        table.jsonb('parser_config').defaultTo('{}');
        table.jsonb('access_control').defaultTo('{"public": true}');
        table.string('status', 16).defaultTo('active');
        table.integer('doc_count').defaultTo(0);
        table.integer('chunk_count').defaultTo(0);
        table.integer('token_count').defaultTo(0);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamps(true, true);
    });

    // documents: files within a dataset
    await knex.schema.createTable('documents', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('dataset_id').notNullable().references('id').inTable('datasets').onDelete('CASCADE');
        table.string('name', 255).notNullable();
        table.bigInteger('size').defaultTo(0);
        table.string('type', 32);
        table.string('status', 16).defaultTo('pending');
        table.float('progress').defaultTo(0);
        table.text('progress_msg');
        table.integer('chunk_count').defaultTo(0);
        table.integer('token_count').defaultTo(0);
        table.string('storage_path', 512);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamps(true, true);

        table.index('dataset_id');
    });

    // model_providers: system-wide model provider config
    await knex.schema.createTable('model_providers', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('factory_name', 128).notNullable();
        table.string('model_type', 32).notNullable();
        table.string('model_name', 128).notNullable();
        table.text('api_key');
        table.string('api_base', 512);
        table.integer('max_tokens');
        table.string('status', 16).defaultTo('active');
        table.boolean('is_default').defaultTo(false);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamps(true, true);

        table.unique(['factory_name', 'model_name']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('model_providers');
    await knex.schema.dropTableIfExists('documents');
    await knex.schema.dropTableIfExists('datasets');
}

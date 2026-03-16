import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('converter_jobs');
  await knex.schema.dropTableIfExists('document_version_files');
  await knex.schema.dropTableIfExists('document_versions');
}


export async function down(knex: Knex): Promise<void> {
  // Irreversible migration (schema recreating is complex and handled by initial_schema)
  // For safety, we just log a warning or leave it empty so rollbacks don't crash.
  console.warn('Cannot reverse remove_dataset_versions migration automatically.');
}

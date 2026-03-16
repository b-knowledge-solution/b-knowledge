
/**
 * GlossaryTaskModel — Data access layer for glossary_tasks table.
 * Extends BaseModel for standard CRUD and adds custom query methods.
 * @module models/glossary-task.model
 */
import { Knex } from 'knex';
import { BaseModel } from '@/shared/models/base.model.js';
import { GlossaryTask } from '@/shared/models/types.js';
import { db } from '@/shared/db/knex.js';

/**
 * @description Model for glossary_tasks table operations, providing task management for the prompt builder
 */
export class GlossaryTaskModel extends BaseModel<GlossaryTask> {
    protected tableName = 'glossary_tasks';
    protected knex: Knex = db;

    /**
     * @description Search tasks by name using case-insensitive LIKE matching
     * @param {string} query - Search query string
     * @param {number} limit - Maximum results to return
     * @returns {Promise<GlossaryTask[]>} Array of matching tasks
     */
    async searchByName(query: string, limit = 50): Promise<GlossaryTask[]> {
        return this.knex(this.tableName)
            .whereRaw('LOWER(name) LIKE ?', [`%${query.toLowerCase()}%`])
            .orderBy('sort_order', 'asc')
            .orderBy('name', 'asc')
            .limit(limit);
    }

    /**
     * @description Find a task by exact name using case-insensitive comparison
     * @param {string} name - Exact task name to find
     * @returns {Promise<GlossaryTask | undefined>} Task if found, undefined otherwise
     */
    async findByName(name: string): Promise<GlossaryTask | undefined> {
        return this.knex(this.tableName)
            .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
            .first();
    }

    /**
     * @description Find an existing task by name or create a new one, used during bulk import
     * @param {string} name - Task name
     * @param {string} taskInstructionEn - English task instruction
     * @param {string} contextTemplate - Context template with {keyword} placeholder
     * @param {string} userId - User performing the action
     * @param {string} taskInstructionJa - Japanese task instruction (optional)
     * @param {string} taskInstructionVi - Vietnamese task instruction (optional)
     * @returns {Promise<GlossaryTask>} The found or created task
     */
    async findOrCreate(
        name: string,
        taskInstructionEn: string,
        contextTemplate: string,
        userId?: string,
        taskInstructionJa?: string,
        taskInstructionVi?: string,
    ): Promise<GlossaryTask> {
        // Check if task already exists
        const existing = await this.findByName(name);
        if (existing) return existing;

        // Create new task
        return this.create({
            name: name.trim(),
            task_instruction_en: taskInstructionEn,
            task_instruction_ja: taskInstructionJa || null,
            task_instruction_vi: taskInstructionVi || null,
            context_template: contextTemplate,
            created_by: userId || null,
            updated_by: userId || null,
        });
    }

    /**
     * @description Bulk insert a chunk of task rows within a transaction, skipping duplicates using DB checks and in-memory seen set
     * @param {Array} rows - Array of task rows to insert
     * @param {Set<string>} seen - Set of already-processed names (lowercase) for cross-chunk dedup
     * @param {string} userId - User performing the import
     * @returns {Promise<{ created: number; skipped: number }>} Object with created and skipped counts
     */
    async bulkInsertChunk(
        rows: Array<{
            task_name: string;
            task_instruction_en: string;
            task_instruction_ja?: string;
            task_instruction_vi?: string;
            context_template: string;
        }>,
        seen: Set<string>,
        userId?: string,
    ): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;

        await this.knex.transaction(async (trx) => {
            for (const row of rows) {
                const taskName = row.task_name?.trim();
                if (!taskName) {
                    skipped++;
                    continue;
                }

                // Skip if already processed in this import
                const nameLower = taskName.toLowerCase();
                if (seen.has(nameLower)) {
                    skipped++;
                    continue;
                }
                seen.add(nameLower);

                // Skip if task already exists in DB (query within trx)
                const existing = await trx(this.tableName)
                    .whereRaw('LOWER(name) = ?', [nameLower])
                    .first();
                if (existing) {
                    skipped++;
                    continue;
                }

                // Insert new task
                await trx(this.tableName).insert({
                    name: taskName,
                    task_instruction_en: row.task_instruction_en || '',
                    task_instruction_ja: row.task_instruction_ja || null,
                    task_instruction_vi: row.task_instruction_vi || null,
                    context_template: row.context_template || '',
                    created_by: userId || null,
                    updated_by: userId || null,
                });
                created++;
            }
        });

        return { created, skipped };
    }
}

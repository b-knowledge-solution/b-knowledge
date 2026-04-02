/**
 * Glossary Service — Business logic for glossary tasks and keywords.
 * Implements Singleton Pattern via module-level instance.
 * Tasks and keywords are independent entities.
 * @module services/glossary.service
 */
import { ModelFactory } from "@/shared/models/factory.js";
import {
  GlossaryTask,
  GlossaryKeyword,
  BulkImportGlossaryRow,
  BulkImportGlossaryResult,
} from "@/shared/models/types.js";
import { log } from "@/shared/services/logger.service.js";

/**
 * @description Service for glossary management including tasks, keywords, prompt generation, and bulk import
 */
class GlossaryService {
  // ========================================================================
  // Task Operations
  // ========================================================================

  /**
   * @description List all glossary tasks, optionally filtering to active-only
   * @param {boolean} activeOnly - If true, only return active tasks
   * @returns {Promise<GlossaryTask[]>} Array of tasks
   */
  async listTasks(activeOnly = false): Promise<GlossaryTask[]> {
    const filter = activeOnly ? { is_active: true } : undefined;
    return ModelFactory.glossaryTask.findAll(filter, {
      orderBy: { sort_order: "asc", name: "asc" },
    });
  }

  /**
   * @description Get a single task by ID
   * @param {string} id - Task UUID
   * @returns {Promise<GlossaryTask | undefined>} Task, or undefined
   */
  async getTask(id: string): Promise<GlossaryTask | undefined> {
    return ModelFactory.glossaryTask.findById(id);
  }

  /**
   * @description Create a new glossary task
   * @param {Partial<GlossaryTask>} data - Task data to create
   * @returns {Promise<GlossaryTask>} Created task
   */
  async createTask(data: Partial<GlossaryTask>): Promise<GlossaryTask> {
    return ModelFactory.glossaryTask.create(data);
  }

  /**
   * @description Update an existing glossary task with timestamp
   * @param {string} id - Task UUID
   * @param {Partial<GlossaryTask>} data - Fields to update
   * @returns {Promise<GlossaryTask | undefined>} Updated task
   */
  async updateTask(
    id: string,
    data: Partial<GlossaryTask>,
  ): Promise<GlossaryTask | undefined> {
    return ModelFactory.glossaryTask.update(id, {
      ...data,
      updated_at: new Date(),
    });
  }

  /**
   * @description Delete a glossary task by ID
   * @param {string} id - Task UUID
   * @returns {Promise<void>}
   */
  async deleteTask(id: string): Promise<void> {
    return ModelFactory.glossaryTask.delete(id);
  }

  // ========================================================================
  // Keyword Operations
  // ========================================================================

  /**
   * @description List all keywords sorted by sort_order then name
   * @returns {Promise<GlossaryKeyword[]>} Array of keywords
   */
  async listKeywords(): Promise<GlossaryKeyword[]> {
    return ModelFactory.glossaryKeyword.findAll(undefined, {
      orderBy: { sort_order: "asc", name: "asc" },
    });
  }

  /**
   * @description Search active keywords with server-side pagination and filtering
   * @param {string} search - Search query string (empty = all active)
   * @param {number} page - Page number (1-indexed)
   * @param {number} pageSize - Items per page
   * @returns {Promise<{ data: GlossaryKeyword[]; total: number; page: number; pageSize: number }>} Paginated result
   */
  async searchKeywords(
    search: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: GlossaryKeyword[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return ModelFactory.glossaryKeyword.searchPaginated(search, page, pageSize);
  }

  /**
   * @description Create a new glossary keyword
   * @param {Partial<GlossaryKeyword>} data - Keyword data to create
   * @returns {Promise<GlossaryKeyword>} Created keyword
   */
  async createKeyword(
    data: Partial<GlossaryKeyword>,
  ): Promise<GlossaryKeyword> {
    return ModelFactory.glossaryKeyword.create(data);
  }

  /**
   * @description Update an existing keyword with timestamp
   * @param {string} id - Keyword UUID
   * @param {Partial<GlossaryKeyword>} data - Fields to update
   * @returns {Promise<GlossaryKeyword | undefined>} Updated keyword
   */
  async updateKeyword(
    id: string,
    data: Partial<GlossaryKeyword>,
  ): Promise<GlossaryKeyword | undefined> {
    return ModelFactory.glossaryKeyword.update(id, {
      ...data,
      updated_at: new Date(),
    });
  }

  /**
   * @description Delete a glossary keyword by ID
   * @param {string} id - Keyword UUID
   * @returns {Promise<void>}
   */
  async deleteKeyword(id: string): Promise<void> {
    return ModelFactory.glossaryKeyword.delete(id);
  }

  // ========================================================================
  // Prompt Builder
  // ========================================================================

  /**
   * @description Search tasks and keywords by name for the Prompt Builder feature
   * @param {string} query - Search string
   * @returns {Promise<{ tasks: GlossaryTask[]; keywords: GlossaryKeyword[] }>} Object with matching tasks and keywords
   */
  async search(query: string): Promise<{
    tasks: GlossaryTask[];
    keywords: GlossaryKeyword[];
  }> {
    const [tasks, keywords] = await Promise.all([
      ModelFactory.glossaryTask.searchByName(query),
      ModelFactory.glossaryKeyword.searchByName(query),
    ]);
    return { tasks, keywords };
  }

  /**
   * @description Generate a structured prompt by combining task instruction with keyword-replaced context template
   * @param {string} taskId - Task UUID
   * @param {string[]} keywordIds - Array of keyword UUIDs to include
   * @returns {Promise<string>} Generated prompt string
   * @throws {Error} If task not found or no valid keywords selected
   */
  async generatePrompt(taskId: string, keywordIds: string[]): Promise<string> {
    // Fetch the task
    const task = await ModelFactory.glossaryTask.findById(taskId);
    if (!task) throw new Error("Task not found");

    // Fetch selected keywords by IDs
    const allKeywords = await ModelFactory.glossaryKeyword.findAll();
    const selectedKeywords = allKeywords.filter((kw) =>
      keywordIds.includes(kw.id),
    );

    if (selectedKeywords.length === 0) {
      throw new Error("No valid keywords selected");
    }

    // Build prompt: Line 1 (instruction) + Line 2 (context per keyword)
    const keywordNames = selectedKeywords.map((kw) => kw.name).join(", ");
    const contextLine = task.context_template.replace(
      /\{keyword\}/g,
      keywordNames,
    );

    return `${task.task_instruction_en}\n${contextLine}`;
  }

  // ========================================================================
  // Bulk Import
  // ========================================================================

  /** Chunk size for bulk import operations */
  private readonly CHUNK_SIZE = 100;

  /**
   * @description Bulk import glossary tasks from parsed Excel rows in chunks, skipping duplicates
   * @param {BulkImportGlossaryRow[]} rows - Parsed rows from Excel import
   * @param {string} userId - User performing the import
   * @returns {Promise<BulkImportGlossaryResult>} Import result with counts
   */
  async bulkImport(
    rows: BulkImportGlossaryRow[],
    userId?: string,
  ): Promise<BulkImportGlossaryResult> {
    const result: BulkImportGlossaryResult = {
      success: true,
      tasksCreated: 0,
      skipped: 0,
      errors: [],
    };

    // Deduplicate rows by task_name in-memory (keep first occurrence)
    const seen = new Set<string>();
    const totalRows = rows.length;
    const totalChunks = Math.ceil(totalRows / this.CHUNK_SIZE);

    log.info(`[Glossary] Task bulk import started`, {
      totalRows,
      totalChunks,
      chunkSize: this.CHUNK_SIZE,
    });

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.CHUNK_SIZE;
      const chunk = rows.slice(start, start + this.CHUNK_SIZE);

      log.debug(
        `[Glossary] Processing task chunk ${chunkIndex + 1}/${totalChunks}`,
        {
          chunkStart: start,
          chunkEnd: start + chunk.length,
          chunkSize: chunk.length,
        },
      );

      try {
        // Delegate transactional insert to model layer
        const chunkResult = await ModelFactory.glossaryTask.bulkInsertChunk(
          chunk,
          seen,
          userId,
        );
        result.tasksCreated += chunkResult.created;
        result.skipped += chunkResult.skipped;

        log.debug(
          `[Glossary] Task chunk ${chunkIndex + 1}/${totalChunks} committed`,
          {
            created: result.tasksCreated,
            skipped: result.skipped,
          },
        );
      } catch (error: any) {
        log.error(
          `[Glossary] Task chunk ${chunkIndex + 1}/${totalChunks} failed`,
          { error: error.message },
        );
        result.errors.push(`Chunk ${chunkIndex + 1} failed: ${error.message}`);
      }
    }

    result.success = result.errors.length === 0;
    log.info(`[Glossary] Task bulk import completed`, {
      totalRows,
      created: result.tasksCreated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * @description Bulk import keywords from parsed Excel rows in chunks, skipping duplicates
   * @param {Array<{ name: string; en_keyword?: string; description?: string }>} rows - Parsed rows
   * @param {string} userId - User performing the import
   * @returns {Promise<{ success: boolean; created: number; skipped: number; errors: string[] }>} Import result
   */
  async bulkImportKeywords(
    rows: { name: string; en_keyword?: string; description?: string }[],
    userId?: string,
  ): Promise<{
    success: boolean;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Track names seen across all chunks to skip duplicates within the file
    const seen = new Set<string>();
    const totalRows = rows.length;
    const totalChunks = Math.ceil(totalRows / this.CHUNK_SIZE);

    log.info(`[Glossary] Keyword bulk import started`, {
      totalRows,
      totalChunks,
      chunkSize: this.CHUNK_SIZE,
    });

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.CHUNK_SIZE;
      const chunk = rows.slice(start, start + this.CHUNK_SIZE);

      log.debug(
        `[Glossary] Processing keyword chunk ${chunkIndex + 1}/${totalChunks}`,
        {
          chunkStart: start,
          chunkEnd: start + chunk.length,
          chunkSize: chunk.length,
        },
      );

      try {
        // Delegate transactional insert to model layer
        const chunkResult = await ModelFactory.glossaryKeyword.bulkInsertChunk(
          chunk,
          seen,
          userId,
        );
        result.created += chunkResult.created;
        result.skipped += chunkResult.skipped;

        log.debug(
          `[Glossary] Keyword chunk ${chunkIndex + 1}/${totalChunks} committed`,
          {
            created: result.created,
            skipped: result.skipped,
          },
        );
      } catch (error: any) {
        log.error(
          `[Glossary] Keyword chunk ${chunkIndex + 1}/${totalChunks} failed`,
          { error: error.message },
        );
        result.errors.push(`Chunk ${chunkIndex + 1} failed: ${error.message}`);
      }
    }

    result.success = result.errors.length === 0;
    log.info(`[Glossary] Keyword bulk import completed`, {
      totalRows,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  }
}

/**
 * Singleton instance of GlossaryService.
 * Import this instance for all glossary operations.
 */
export const glossaryService = new GlossaryService();

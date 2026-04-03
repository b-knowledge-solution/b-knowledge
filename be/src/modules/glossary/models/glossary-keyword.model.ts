/**
 * GlossaryKeywordModel — Data access layer for glossary_keywords table.
 * Extends BaseModel for standard CRUD and adds custom query methods.
 * Keywords are standalone entities (not linked to tasks).
 * @module models/glossary-keyword.model
 */
import { Knex } from "knex";
import { BaseModel } from "@/shared/models/base.model.js";
import { GlossaryKeyword } from "@/shared/models/types.js";
import { db } from "@/shared/db/knex.js";

/**
 * @description Model for glossary_keywords table operations. Keywords are standalone entities in the glossary system.
 */
export class GlossaryKeywordModel extends BaseModel<GlossaryKeyword> {
  protected tableName = "glossary_keywords";
  protected knex: Knex = db;

  /**
   * @description Search keywords by name using case-insensitive LIKE matching
   * @param {string} query - Search query string
   * @param {number} limit - Maximum results to return
   * @returns {Promise<GlossaryKeyword[]>} Array of matching keywords
   */
  async searchByName(query: string, limit = 50): Promise<GlossaryKeyword[]> {
    return this.knex(this.tableName)
      .whereRaw("LOWER(name) LIKE ?", [`%${query.toLowerCase()}%`])
      .orderBy("name", "asc")
      .limit(limit);
  }

  /**
   * @description Find a keyword by exact name using case-insensitive comparison
   * @param {string} name - Exact keyword name
   * @returns {Promise<GlossaryKeyword | undefined>} Keyword if found, undefined otherwise
   */
  async findByName(name: string): Promise<GlossaryKeyword | undefined> {
    return this.knex(this.tableName)
      .whereRaw("LOWER(name) = ?", [name.toLowerCase()])
      .first();
  }

  /**
   * @description Bulk create multiple keywords within a transaction, skipping duplicates by name
   * @param {Array<{ name: string; en_keyword?: string; description?: string }>} keywords - Array of keyword data to insert
   * @param {string} userId - User performing the action
   * @param {Knex.Transaction} trx - Optional Knex transaction
   * @returns {Promise<GlossaryKeyword[]>} Array of created keywords
   */
  async bulkCreate(
    keywords: Array<{
      name: string;
      en_keyword?: string;
      description?: string;
    }>,
    userId?: string,
    trx?: Knex.Transaction,
  ): Promise<GlossaryKeyword[]> {
    // Wrap in a transaction to guarantee all-or-nothing semantics
    const execute = async (queryBuilder: Knex | Knex.Transaction) => {
      const results: GlossaryKeyword[] = [];

      for (const kw of keywords) {
        // Check for existing keyword by name
        const existing = await queryBuilder(this.tableName)
          .whereRaw("LOWER(name) = ?", [kw.name.toLowerCase().trim()])
          .first();

        if (existing) {
          // Skip duplicate
          results.push(existing);
          continue;
        }

        // Insert new keyword
        const [created] = await queryBuilder(this.tableName)
          .insert({
            name: kw.name.trim(),
            en_keyword: kw.en_keyword || null,
            description: kw.description || null,
            created_by: userId || null,
            updated_by: userId || null,
          })
          .returning("*");

        results.push(created);
      }

      return results;
    };

    // Use provided transaction or create a new one for atomicity
    if (trx) return execute(trx);
    return this.knex.transaction((newTrx) => execute(newTrx));
  }

  /**
   * @description Search active keywords with pagination, supporting ILIKE search across name, en_keyword, and description
   * @param {string} search - Search query string (empty = no filter)
   * @param {number} page - Page number (1-indexed)
   * @param {number} pageSize - Number of items per page
   * @returns {Promise<{ data: GlossaryKeyword[]; total: number; page: number; pageSize: number }>} Paginated result
   */
  async searchPaginated(
    search: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: GlossaryKeyword[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // Build base query for active keywords only
    const baseQuery = this.knex(this.tableName).where({ is_active: true });

    // Apply search filter if provided (ILIKE across name, en_keyword, description)
    if (search.trim()) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      baseQuery.where(function () {
        this.whereRaw("LOWER(name) LIKE ?", [pattern])
          .orWhereRaw("LOWER(COALESCE(en_keyword, '')) LIKE ?", [pattern])
          .orWhereRaw("LOWER(COALESCE(description, '')) LIKE ?", [pattern]);
      });
    }

    // Count total matching records (clone to avoid mutating the base query)
    const countResult = await baseQuery.clone().count("* as count").first();
    const total = Number(countResult?.count ?? 0);

    // Calculate offset from page number
    const offset = (page - 1) * pageSize;

    // Fetch paginated data with ordering
    const data = await baseQuery
      .orderBy("sort_order", "asc")
      .orderBy("name", "asc")
      .limit(pageSize)
      .offset(offset);

    return { data, total, page, pageSize };
  }

  /**
   * @description Bulk insert a chunk of keyword rows within a transaction, skipping duplicates using DB checks and in-memory seen set
   * @param {Array<{ name: string; en_keyword?: string; description?: string }>} rows - Array of keyword rows to insert
   * @param {Set<string>} seen - Set of already-processed names (lowercase) for cross-chunk dedup
   * @param {string} userId - User performing the import
   * @returns {Promise<{ created: number; skipped: number }>} Object with created and skipped counts
   */
  async bulkInsertChunk(
    rows: Array<{ name: string; en_keyword?: string; description?: string }>,
    seen: Set<string>,
    userId?: string,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    await this.knex.transaction(async (trx) => {
      for (const row of rows) {
        const name = row.name?.trim();
        if (!name) {
          skipped++;
          continue;
        }

        // Skip if already seen in this import
        const nameLower = name.toLowerCase();
        if (seen.has(nameLower)) {
          skipped++;
          continue;
        }
        seen.add(nameLower);

        // Check if keyword already exists in DB (using trx)
        const existing = await trx(this.tableName)
          .whereRaw("LOWER(name) = ?", [nameLower])
          .first();
        if (existing) {
          skipped++;
          continue;
        }

        // Insert keyword
        await trx(this.tableName).insert({
          name,
          en_keyword: row.en_keyword?.trim() || null,
          description: row.description?.trim() || null,
          created_by: userId || null,
          updated_by: userId || null,
        });
        created++;
      }
    });

    return { created, skipped };
  }
}

/**
 * Glossary Controller — Handles HTTP requests for glossary management.
 * Delegates business logic to glossaryService.
 * @module controllers/glossary.controller
 */
import { Request, Response } from "express";
import { glossaryService } from "@/modules/glossary/services/glossary.service.js";
import { log } from "@/shared/services/logger.service.js";

/**
 * @description Controller for glossary tasks, keywords, prompt builder, and bulk import API endpoints
 */
export class GlossaryController {
  // ========================================================================
  // Task Endpoints
  // ========================================================================

  /**
   * @description List all glossary tasks
   * @param {Request} _req - Express request object (unused)
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async listTasks(_req: Request, res: Response): Promise<void> {
    try {
      // Fetch all tasks from service layer
      const tasks = await glossaryService.listTasks();
      res.json(tasks);
    } catch (error: any) {
      log.error("Error listing glossary tasks:", error);
      res.status(500).json({ error: error.message || "Failed to list tasks" });
    }
  }

  /**
   * @description Get a single glossary task by ID
   * @param {Request} req - Express request with task ID param
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async getTask(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id!;
      const task = await glossaryService.getTask(id);

      // Return 404 if task not found
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      res.json(task);
    } catch (error: any) {
      log.error("Error getting glossary task:", error);
      res.status(500).json({ error: error.message || "Failed to get task" });
    }
  }

  /**
   * @description Create a new glossary task with required instruction and template fields
   * @param {Request} req - Express request with task data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || null;
      const {
        name,
        description,
        task_instruction_en,
        task_instruction_ja,
        task_instruction_vi,
        context_template,
        sort_order,
        is_active,
      } = req.body;

      // Validate required fields
      if (!name || !task_instruction_en || !context_template) {
        res.status(400).json({
          error: "name, task_instruction_en, and context_template are required",
        });
        return;
      }

      const task = await glossaryService.createTask({
        name: name.trim(),
        description: description || null,
        task_instruction_en,
        task_instruction_ja: task_instruction_ja || null,
        task_instruction_vi: task_instruction_vi || null,
        context_template,
        sort_order: sort_order || 0,
        is_active: is_active !== false,
        created_by: userId,
        updated_by: userId,
      });

      res.status(201).json(task);
    } catch (error: any) {
      log.error("Error creating glossary task:", error);
      // Handle unique constraint violation
      if (error.message?.includes("unique") || error.code === "23505") {
        res.status(409).json({ error: "Task name already exists" });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to create task" });
    }
  }

  /**
   * @description Update an existing glossary task by ID with partial data
   * @param {Request} req - Express request with task ID param and update data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || null;
      const id = req.params.id!;
      const {
        name,
        description,
        task_instruction_en,
        task_instruction_ja,
        task_instruction_vi,
        context_template,
        sort_order,
        is_active,
      } = req.body;

      // Build update payload with only defined fields to support partial updates
      const updateData: Record<string, any> = { updated_by: userId };
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (task_instruction_en !== undefined)
        updateData.task_instruction_en = task_instruction_en;
      if (task_instruction_ja !== undefined)
        updateData.task_instruction_ja = task_instruction_ja;
      if (task_instruction_vi !== undefined)
        updateData.task_instruction_vi = task_instruction_vi;
      if (context_template !== undefined)
        updateData.context_template = context_template;
      if (sort_order !== undefined) updateData.sort_order = sort_order;
      if (is_active !== undefined) updateData.is_active = is_active;

      const task = await glossaryService.updateTask(id, updateData);
      // Return 404 if task not found
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      res.json(task);
    } catch (error: any) {
      log.error("Error updating glossary task:", error);
      if (error.message?.includes("unique") || error.code === "23505") {
        res.status(409).json({ error: "Task name already exists" });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to update task" });
    }
  }

  /**
   * @description Delete a glossary task by ID
   * @param {Request} req - Express request with task ID param
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id!;
      await glossaryService.deleteTask(id);
      res.status(204).send();
    } catch (error: any) {
      log.error("Error deleting glossary task:", error);
      res.status(500).json({ error: error.message || "Failed to delete task" });
    }
  }

  // ========================================================================
  // Keyword Endpoints
  // ========================================================================

  /**
   * @description Search keywords with pagination and filtering
   * @param {Request} req - Express request with query params: q, page, pageSize
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async searchKeywords(req: Request, res: Response): Promise<void> {
    try {
      // Parse search and pagination parameters with safe defaults
      const q = (req.query.q as string) || "";
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      // Clamp pageSize between 1 and 100 to prevent excessive result sets
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(req.query.pageSize as string, 10) || 20),
      );

      const result = await glossaryService.searchKeywords(q, page, pageSize);
      res.json(result);
    } catch (error: any) {
      log.error("Error searching glossary keywords:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to search keywords" });
    }
  }

  /**
   * @description List all glossary keywords
   * @param {Request} _req - Express request object (unused)
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async listKeywords(_req: Request, res: Response): Promise<void> {
    try {
      const keywords = await glossaryService.listKeywords();
      res.json(keywords);
    } catch (error: any) {
      log.error("Error listing glossary keywords:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to list keywords" });
    }
  }

  /**
   * @description Create a new glossary keyword
   * @param {Request} req - Express request with keyword data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async createKeyword(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || null;
      const { name, en_keyword, description, sort_order, is_active } = req.body;

      // Validate required fields
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const keyword = await glossaryService.createKeyword({
        name: name.trim(),
        en_keyword: en_keyword || null,
        description: description || null,
        sort_order: sort_order || 0,
        is_active: is_active !== false,
        created_by: userId,
        updated_by: userId,
      });

      res.status(201).json(keyword);
    } catch (error: any) {
      log.error("Error creating glossary keyword:", error);
      if (error.message?.includes("unique") || error.code === "23505") {
        res.status(409).json({ error: "Keyword name already exists" });
        return;
      }
      res
        .status(500)
        .json({ error: error.message || "Failed to create keyword" });
    }
  }

  /**
   * @description Update an existing glossary keyword by ID
   * @param {Request} req - Express request with keyword ID param and update data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async updateKeyword(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || null;
      const id = req.params.id!;
      const { name, en_keyword, description, sort_order, is_active } = req.body;

      // Build update payload with only defined fields to support partial updates
      const updateData: Record<string, any> = { updated_by: userId };
      if (name !== undefined) updateData.name = name.trim();
      if (en_keyword !== undefined) updateData.en_keyword = en_keyword;
      if (description !== undefined) updateData.description = description;
      if (sort_order !== undefined) updateData.sort_order = sort_order;
      if (is_active !== undefined) updateData.is_active = is_active;

      const keyword = await glossaryService.updateKeyword(id, updateData);
      // Return 404 if keyword not found
      if (!keyword) {
        res.status(404).json({ error: "Keyword not found" });
        return;
      }

      res.json(keyword);
    } catch (error: any) {
      log.error("Error updating glossary keyword:", error);
      if (error.message?.includes("unique") || error.code === "23505") {
        res.status(409).json({ error: "Keyword name already exists" });
        return;
      }
      res
        .status(500)
        .json({ error: error.message || "Failed to update keyword" });
    }
  }

  /**
   * @description Delete a glossary keyword by ID
   * @param {Request} req - Express request with keyword ID param
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async deleteKeyword(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id!;
      await glossaryService.deleteKeyword(id);
      res.status(204).send();
    } catch (error: any) {
      log.error("Error deleting glossary keyword:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to delete keyword" });
    }
  }

  // ========================================================================
  // Prompt Builder Endpoints
  // ========================================================================

  /**
   * @description Search both tasks and keywords by name for prompt builder
   * @param {Request} req - Express request with q query param
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async search(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q as string) || "";
      // Return empty results for blank queries
      if (!query.trim()) {
        res.json({ tasks: [], keywords: [] });
        return;
      }
      const results = await glossaryService.search(query);
      res.json(results);
    } catch (error: any) {
      log.error("Error searching glossary:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to search glossary" });
    }
  }

  /**
   * @description Generate a structured prompt by combining a task instruction with selected keywords
   * @param {Request} req - Express request with taskId and keywordIds in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async generatePrompt(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, keywordIds } = req.body;

      // Validate both taskId and keywordIds array are provided
      if (!taskId || !keywordIds || !Array.isArray(keywordIds)) {
        res.status(400).json({
          error: "taskId and keywordIds (array) are required",
        });
        return;
      }

      const prompt = await glossaryService.generatePrompt(taskId, keywordIds);
      res.json({ prompt });
    } catch (error: any) {
      log.error("Error generating prompt:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to generate prompt" });
    }
  }

  /**
   * @description Bulk import glossary tasks from parsed Excel row data
   * @param {Request} req - Express request with rows array in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkImport(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || undefined;
      const { rows } = req.body;

      // Validate rows array is non-empty
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        res
          .status(400)
          .json({ error: "rows array is required and must not be empty" });
        return;
      }

      const result = await glossaryService.bulkImport(rows, userId);
      res.json(result);
    } catch (error: any) {
      log.error("Error bulk importing glossary:", error);
      res.status(500).json({ error: error.message || "Failed to bulk import" });
    }
  }

  /**
   * @description Bulk import glossary keywords from parsed Excel row data
   * @param {Request} req - Express request with rows array in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkImportKeywords(req: Request, res: Response): Promise<void> {
    try {
      // @ts-ignore - userId from auth middleware
      const userId = req.user?.id || undefined;
      const { rows } = req.body;

      // Validate rows array is non-empty
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        res
          .status(400)
          .json({ error: "rows array is required and must not be empty" });
        return;
      }

      const result = await glossaryService.bulkImportKeywords(rows, userId);
      res.json(result);
    } catch (error: any) {
      log.error("Error bulk importing keywords:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to bulk import keywords" });
    }
  }
}

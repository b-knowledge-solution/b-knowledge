/**
 * Routes for glossary management API endpoints.
 * Mounts task, keyword, and prompt builder routes with auth middleware.
 * @module routes/glossary.routes
 */
import { Router } from "express";
import { GlossaryController } from "../controllers/glossary.controller.js";
import {
  requireAuth,
  requirePermission,
} from "@/shared/middleware/auth.middleware.js";
import { validate } from "@/shared/middleware/validate.middleware.js";
import { createTaskSchema, updateTaskSchema, createKeywordSchema, updateKeywordSchema, generatePromptSchema, uuidParamSchema } from "../schemas/glossary.schemas.js";

const router = Router();

// ============================================================================
// Prompt Builder (read-only, all authenticated users)
// ============================================================================

// Search tasks and keywords
router.get("/search", requireAuth, GlossaryController.search);

// Generate prompt from task + keyword selections — read-only composition over glossary data
router.post("/generate-prompt", requirePermission('glossary.view'), validate(generatePromptSchema), GlossaryController.generatePrompt);

// ============================================================================
// Task Management (admin/leader only)
// ============================================================================

// List all tasks
router.get("/tasks", requireAuth, GlossaryController.listTasks);

// Get single task
router.get("/tasks/:id", requireAuth, GlossaryController.getTask);

// Create a new task
router.post(
  "/tasks",
  requirePermission('glossary.create'),
  validate(createTaskSchema),
  GlossaryController.createTask,
);

// Update a task
router.put(
  "/tasks/:id",
  requirePermission('glossary.edit'),
  validate({ params: uuidParamSchema, body: updateTaskSchema }),
  GlossaryController.updateTask,
);

// Delete a task
router.delete(
  "/tasks/:id",
  requirePermission('glossary.delete'),
  GlossaryController.deleteTask,
);

// ============================================================================
// Keyword Management (admin/leader only)
// ============================================================================

// Search keywords with pagination (must be before :id routes)
router.get("/keywords/search", requireAuth, GlossaryController.searchKeywords);

// List all keywords
router.get("/keywords", requireAuth, GlossaryController.listKeywords);

// Create a keyword
router.post(
  "/keywords",
  requirePermission('glossary.create'),
  validate(createKeywordSchema),
  GlossaryController.createKeyword,
);

// Update a keyword
router.put(
  "/keywords/:id",
  requirePermission('glossary.edit'),
  validate({ params: uuidParamSchema, body: updateKeywordSchema }),
  GlossaryController.updateKeyword,
);

// Delete a keyword
router.delete(
  "/keywords/:id",
  requirePermission('glossary.delete'),
  GlossaryController.deleteKeyword,
);

// ============================================================================
// Bulk Import (admin/leader only)
// ============================================================================

// Bulk import tasks from Excel data
router.post(
  "/bulk-import",
  requirePermission('glossary.import'),
  GlossaryController.bulkImport,
);

// Bulk import keywords from Excel data
router.post(
  "/keywords/bulk-import",
  requirePermission('glossary.import'),
  GlossaryController.bulkImportKeywords,
);

export default router;

/**
 * Routes for glossary management API endpoints.
 * Mounts task, keyword, and prompt builder routes with auth middleware.
 * @module routes/glossary.routes
 */
import { Router } from "express";
import { GlossaryController } from "../controllers/glossary.controller.js";
import {
  requireAuth,
  requireRole,
} from "@/shared/middleware/auth.middleware.js";
import { validate } from "@/shared/middleware/validate.middleware.js";
import { createTaskSchema, updateTaskSchema, createKeywordSchema, updateKeywordSchema, generatePromptSchema, uuidParamSchema } from "../schemas/glossary.schemas.js";

const router = Router();

// ============================================================================
// Prompt Builder (read-only, all authenticated users)
// ============================================================================

// Search tasks and keywords
router.get("/search", requireAuth, GlossaryController.search);

// Generate prompt from task + keyword selections
router.post("/generate-prompt", requireAuth, validate(generatePromptSchema), GlossaryController.generatePrompt);

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
  requireRole("admin"),
  validate(createTaskSchema),
  GlossaryController.createTask,
);

// Update a task
router.put(
  "/tasks/:id",
  requireRole("admin"),
  validate({ params: uuidParamSchema, body: updateTaskSchema }),
  GlossaryController.updateTask,
);

// Delete a task
router.delete(
  "/tasks/:id",
  requireRole("admin"),
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
  requireRole("admin"),
  validate(createKeywordSchema),
  GlossaryController.createKeyword,
);

// Update a keyword
router.put(
  "/keywords/:id",
  requireRole("admin"),
  validate({ params: uuidParamSchema, body: updateKeywordSchema }),
  GlossaryController.updateKeyword,
);

// Delete a keyword
router.delete(
  "/keywords/:id",
  requireRole("admin"),
  GlossaryController.deleteKeyword,
);

// ============================================================================
// Bulk Import (admin/leader only)
// ============================================================================

// Bulk import tasks from Excel data
router.post(
  "/bulk-import",
  requireRole("admin"),
  GlossaryController.bulkImport,
);

// Bulk import keywords from Excel data
router.post(
  "/keywords/bulk-import",
  requireRole("admin"),
  GlossaryController.bulkImportKeywords,
);

export default router;

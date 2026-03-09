import { Router } from 'express';
import multer from 'multer';
import { RagController } from './rag.controller.js';
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js';

const router = Router();
const controller = new RagController();
const upload = multer({ storage: multer.memoryStorage() });

// Dataset endpoints
router.get('/datasets', requireAuth, controller.listDatasets.bind(controller));
router.get('/datasets/:id', requireAuth, controller.getDataset.bind(controller));
router.post('/datasets', requirePermission('manage_datasets'), controller.createDataset.bind(controller));
router.put('/datasets/:id', requirePermission('manage_datasets'), controller.updateDataset.bind(controller));
router.delete('/datasets/:id', requirePermission('manage_datasets'), controller.deleteDataset.bind(controller));

// Document endpoints
router.get('/datasets/:id/documents', requireAuth, controller.listDocuments.bind(controller));
router.post('/datasets/:id/documents', requirePermission('manage_datasets'), upload.array('files'), controller.uploadDocuments.bind(controller));
router.post('/datasets/:id/documents/:docId/parse', requirePermission('manage_datasets'), controller.parseDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/download', requireAuth, controller.downloadDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/status', requireAuth, controller.streamDocumentProgress.bind(controller));
router.delete('/datasets/:id/documents/:docId', requirePermission('manage_datasets'), controller.deleteDocument.bind(controller));

// Search + Chunks
router.post('/datasets/:id/search', requireAuth, controller.searchChunks.bind(controller));
router.get('/datasets/:id/chunks', requireAuth, controller.listChunks.bind(controller));

// Advanced tasks (GraphRAG, RAPTOR, Mindmap)
router.post('/datasets/:id/:taskType(graphrag|raptor|mindmap)', requirePermission('manage_datasets'), controller.runAdvancedTask.bind(controller));
router.get('/datasets/:id/:taskType(graphrag|raptor|mindmap)/status', requireAuth, controller.traceAdvancedTask.bind(controller));

// Document enrichment (keywords, questions, tags, metadata)
router.post('/datasets/:id/documents/:docId/:enrichType(keywords|questions|tags|metadata)', requirePermission('manage_datasets'), controller.runDocumentEnrichment.bind(controller));

// Task status
router.get('/tasks/:taskId/status', requireAuth, controller.getTaskStatus.bind(controller));

export default router;

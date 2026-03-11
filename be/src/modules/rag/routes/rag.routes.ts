import { Router } from 'express';
import multer from 'multer';
import { RagController } from '../controllers/rag.controller.js';
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.middleware.js';
import {
  createDatasetSchema, updateDatasetSchema, searchChunksSchema, uuidParamSchema, datasetAccessSchema,
  createVersionSchema, updateVersionSchema, versionParamSchema, bulkDeleteFilesSchema,
} from '../schemas/rag.schemas.js';

const router = Router();
const controller = new RagController();
const upload = multer({ storage: multer.memoryStorage() });

// Dataset endpoints
router.get('/datasets', requireAuth, controller.listDatasets.bind(controller));
router.get('/datasets/:id', requireAuth, controller.getDataset.bind(controller));
router.post('/datasets', requirePermission('manage_datasets'), validate(createDatasetSchema), controller.createDataset.bind(controller));
router.put('/datasets/:id', requirePermission('manage_datasets'), validate({ params: uuidParamSchema, body: updateDatasetSchema }), controller.updateDataset.bind(controller));
router.delete('/datasets/:id', requirePermission('manage_datasets'), controller.deleteDataset.bind(controller));

// Dataset RBAC access control endpoints
router.get('/datasets/:id/access', requirePermission('manage_datasets'), controller.getDatasetAccess.bind(controller));
router.put('/datasets/:id/access', requirePermission('manage_datasets'), validate({ params: uuidParamSchema, body: datasetAccessSchema }), controller.setDatasetAccess.bind(controller));

// Version endpoints
router.get('/datasets/:id/versions', requireAuth, controller.listVersions.bind(controller));
router.post('/datasets/:id/versions', requirePermission('manage_datasets'), validate({ params: uuidParamSchema, body: createVersionSchema }), controller.createVersion.bind(controller));
router.put('/datasets/:id/versions/:versionId', requirePermission('manage_datasets'), validate({ params: versionParamSchema, body: updateVersionSchema }), controller.updateVersion.bind(controller));
router.delete('/datasets/:id/versions/:versionId', requirePermission('manage_datasets'), controller.deleteVersion.bind(controller));

// Version document endpoints
router.post('/datasets/:id/versions/:versionId/documents', requirePermission('manage_datasets'), upload.array('files'), controller.uploadVersionDocuments.bind(controller));
router.get('/datasets/:id/versions/:versionId/documents', requireAuth, controller.listVersionDocuments.bind(controller));
router.delete('/datasets/:id/versions/:versionId/documents', requirePermission('manage_datasets'), validate({ params: versionParamSchema, body: bulkDeleteFilesSchema }), controller.deleteVersionDocuments.bind(controller));
router.post('/datasets/:id/versions/:versionId/documents/convert', requirePermission('manage_datasets'), controller.convertVersionDocuments.bind(controller));
router.post('/datasets/:id/versions/:versionId/documents/parse', requirePermission('manage_datasets'), controller.parseVersionDocuments.bind(controller));
router.get('/datasets/:id/versions/:versionId/documents/status', requireAuth, controller.syncVersionDocumentStatus.bind(controller));
router.post('/datasets/:id/versions/:versionId/documents/requeue', requirePermission('manage_datasets'), controller.requeueVersionDocuments.bind(controller));

// Document endpoints
router.get('/datasets/:id/documents', requireAuth, controller.listDocuments.bind(controller));
router.post('/datasets/:id/documents', requirePermission('manage_datasets'), upload.array('files'), controller.uploadDocuments.bind(controller));
router.post('/datasets/:id/documents/:docId/parse', requirePermission('manage_datasets'), controller.parseDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/download', requireAuth, controller.downloadDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/status', requireAuth, controller.streamDocumentProgress.bind(controller));
router.delete('/datasets/:id/documents/:docId', requirePermission('manage_datasets'), controller.deleteDocument.bind(controller));

// Search + Chunks
router.post('/datasets/:id/search', requireAuth, validate({ params: uuidParamSchema, body: searchChunksSchema }), controller.searchChunks.bind(controller));
router.get('/datasets/:id/chunks', requireAuth, controller.listChunks.bind(controller));

// Advanced tasks (GraphRAG, RAPTOR, Mindmap)
router.post('/datasets/:id/:taskType(graphrag|raptor|mindmap)', requirePermission('manage_datasets'), controller.runAdvancedTask.bind(controller));
router.get('/datasets/:id/:taskType(graphrag|raptor|mindmap)/status', requireAuth, controller.traceAdvancedTask.bind(controller));

// Document enrichment (keywords, questions, tags, metadata)
router.post('/datasets/:id/documents/:docId/:enrichType(keywords|questions|tags|metadata)', requirePermission('manage_datasets'), controller.runDocumentEnrichment.bind(controller));

// Task status
router.get('/tasks/:taskId/status', requireAuth, controller.getTaskStatus.bind(controller));

export default router;

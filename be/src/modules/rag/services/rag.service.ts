/**
 * @fileoverview Core RAG service — dataset CRUD, RBAC access control, and document operations.
 *
 * Manages dataset lifecycle, access control enforcement, and document metadata.
 * Delegates DB operations to ModelFactory and logs audit events for mutations.
 *
 * @module modules/rag/services/rag
 */

import { ModelFactory } from '@/shared/models/factory.js';
import { db } from '@/shared/db/knex.js';
import { log } from '@/shared/services/logger.service.js';
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js';
import { Dataset, Document, AccessControl, UserContext } from '@/shared/models/types.js';
import { teamService } from '@/modules/teams/services/team.service.js';
import { getUuid } from '@/shared/utils/uuid.js';

/**
 * @description Core service for dataset CRUD, RBAC access control, and document operations.
 * Handles business logic including access filtering, name uniqueness, embedding model locking,
 * stale reference cleanup, and audit logging.
 */
export class RagService {
    // -------------------------------------------------------------------------
    // Dataset CRUD
    // -------------------------------------------------------------------------

    /**
     * @description Get all datasets accessible to the current user.
     * Admins see all datasets. Anonymous users see only public ones.
     * Regular users see public datasets plus those granted via user_ids or team_ids.
     * @param {any} [user] - Authenticated user context (undefined for anonymous)
     * @returns {Promise<Dataset[]>} Filtered array of accessible datasets
     */
    async getAvailableDatasets(user?: any): Promise<Dataset[]> {
        const allDatasets = await ModelFactory.dataset.findAll(
            { status: 'active' },
            { orderBy: { name: 'asc' } }
        );

        // Anonymous users only see public datasets
        if (!user) {
            return allDatasets.filter(d => {
                const ac = typeof d.access_control === 'string' ? JSON.parse(d.access_control) : d.access_control;
                return ac?.public === true;
            });
        }

        // Admins see all datasets without filtering
        if (user.role === 'admin') {
            return allDatasets;
        }

        // Regular users: filter by public, user grant, or team membership
        const userTeams = await teamService.getUserTeams(user.id);
        const teamIds = userTeams.map((t: any) => t.id);

        return allDatasets.filter(d => {
            const ac = typeof d.access_control === 'string' ? JSON.parse(d.access_control) : d.access_control;
            if (!ac) return false;
            if (ac.public === true) return true;
            if (ac.user_ids?.includes(user.id)) return true;
            // Check team intersection between user's teams and dataset's team grants
            if (ac.team_ids?.some((tid: string) => teamIds.includes(tid))) return true;
            return false;
        });
    }

    /**
     * @description Retrieve a dataset by its UUID
     * @param {string} id - Dataset UUID
     * @returns {Promise<Dataset | undefined>} The dataset record or undefined
     */
    async getDatasetById(id: string): Promise<Dataset | undefined> {
        return ModelFactory.dataset.findById(id);
    }

    /**
     * @description Create a new dataset with case-insensitive name uniqueness enforcement.
     * Logs an audit event if a user context is provided.
     * @param {any} data - Dataset creation data (name, description, language, etc.)
     * @param {UserContext} [user] - Authenticated user context for ownership and audit
     * @returns {Promise<Dataset>} The created dataset record
     * @throws {Error} If a dataset with the same name already exists
     */
    async createDataset(data: any, user?: UserContext): Promise<Dataset> {
        try {
            // Case-insensitive name uniqueness check
            const existing = await db('datasets')
                .whereRaw('LOWER(name) = LOWER(?)', [data.name])
                .where('status', '!=', 'deleted')
                .first()
            if (existing) {
                throw new Error('A dataset with this name already exists')
            }

            // Generate 32-char hex UUID upfront so datasets and knowledgebase tables share the same ID format
            const dataset = await ModelFactory.dataset.create({
                id: getUuid(),
                name: data.name,
                description: data.description || null,
                language: data.language || 'English',
                embedding_model: data.embedding_model || null,
                parser_id: data.parser_id || 'naive',
                parser_config: JSON.stringify(data.parser_config || {}),
                pagerank: data.pagerank || 0,
                access_control: JSON.stringify(data.access_control || { public: true }),

                status: 'active',
                created_by: user?.id || null,
                updated_by: user?.id || null,
            });

            if (user) {
                await auditService.log({
                    userId: user.id,
                    userEmail: user.email,
                    action: AuditAction.CREATE_SOURCE,
                    resourceType: AuditResourceType.DATASET,
                    resourceId: dataset.id,
                    details: { name: dataset.name },
                    ipAddress: user.ip,
                });
            }

            return dataset;
        } catch (error) {
            log.error('Failed to create dataset', { error: String(error) });
            throw error;
        }
    }

    /**
     * @description Update a dataset's properties.
     * Prevents embedding model changes when chunks already exist.
     * Logs an audit event if a user context is provided.
     * @param {string} id - Dataset UUID
     * @param {any} data - Fields to update
     * @param {UserContext} [user] - Authenticated user context for audit
     * @returns {Promise<Dataset | undefined>} The updated dataset or undefined if not found
     * @throws {Error} If attempting to change embedding model after documents are parsed
     */
    async updateDataset(id: string, data: any, user?: UserContext): Promise<Dataset | undefined> {
        try {
            // Embedding model lock: cannot change if dataset has chunks
            if (data.embedding_model !== undefined) {
                const current = await ModelFactory.dataset.findById(id)
                if (current && data.embedding_model !== current.embedding_model && (current as any).chunk_count > 0) {
                    throw new Error('Cannot change embedding model after documents have been parsed. Delete all chunks first.')
                }
            }

            const updateData: any = {};
            if (data.name !== undefined) updateData.name = data.name;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.language !== undefined) updateData.language = data.language;
            if (data.embedding_model !== undefined) updateData.embedding_model = data.embedding_model;
            if (data.parser_id !== undefined) updateData.parser_id = data.parser_id;
            if (data.parser_config !== undefined) updateData.parser_config = JSON.stringify(data.parser_config);
            if (data.pagerank !== undefined) updateData.pagerank = data.pagerank;
            if (data.access_control !== undefined) updateData.access_control = JSON.stringify(data.access_control);

            if (user) updateData.updated_by = user.id;

            const dataset = await ModelFactory.dataset.update(id, updateData);

            if (user) {
                await auditService.log({
                    userId: user.id,
                    userEmail: user.email,
                    action: AuditAction.UPDATE_SOURCE,
                    resourceType: AuditResourceType.DATASET,
                    resourceId: id,
                    details: { changes: data },
                    ipAddress: user.ip,
                });
            }

            return dataset;
        } catch (error) {
            log.error('Failed to update dataset', { error: String(error) });
            throw error;
        }
    }

    /**
     * @description Soft-delete a dataset and clean up stale references in chat assistants and search apps.
     * Logs an audit event if a user context is provided.
     * @param {string} id - Dataset UUID
     * @param {UserContext} [user] - Authenticated user context for audit
     * @returns {Promise<void>}
     */
    async deleteDataset(id: string, user?: UserContext): Promise<void> {
        try {
            // Soft-delete the dataset by setting status to 'deleted'
            await ModelFactory.dataset.update(id, { status: 'deleted' });

            if (user) {
                await auditService.log({
                    userId: user.id,
                    userEmail: user.email,
                    action: AuditAction.DELETE_SOURCE,
                    resourceType: AuditResourceType.DATASET,
                    resourceId: id,
                    ipAddress: user.ip,
                });
            }

            // Clean stale references in chat_assistants.kb_ids
            const affectedAssistants = await db('chat_assistants')
                .whereRaw("kb_ids @> ?::jsonb", [JSON.stringify([id])])
                .select('id', 'kb_ids');

            for (const assistant of affectedAssistants) {
                const updatedKbIds = (assistant.kb_ids as string[]).filter((kbId: string) => kbId !== id);
                await db('chat_assistants')
                    .where('id', assistant.id)
                    .update({ kb_ids: JSON.stringify(updatedKbIds) });
            }

            // Clean stale references in search_apps.dataset_ids
            const affectedApps = await db('search_apps')
                .whereRaw("dataset_ids @> ?::jsonb", [JSON.stringify([id])])
                .select('id', 'dataset_ids');

            for (const app of affectedApps) {
                const updatedIds = (app.dataset_ids as string[]).filter((dsId: string) => dsId !== id);
                await db('search_apps')
                    .where('id', app.id)
                    .update({ dataset_ids: JSON.stringify(updatedIds) });
            }

            log.info(`Cleaned stale references: ${affectedAssistants.length} assistants, ${affectedApps.length} search apps`);
        } catch (error) {
            log.error('Failed to delete dataset', { error: String(error) });
            throw error;
        }
    }



    // -------------------------------------------------------------------------
    // Dataset RBAC Access Control
    // -------------------------------------------------------------------------

    /**
     * Get enriched access control for a dataset, resolving user and team names.
     * @param datasetId - UUID of the dataset
     * @returns Object with public flag, enriched teams array, and enriched users array
     */
    async getDatasetAccess(datasetId: string): Promise<{
        public: boolean;
        teams: Array<{ id: string; name: string }>;
        users: Array<{ id: string; display_name: string }>;
    }> {
        // Fetch the dataset record
        const dataset = await ModelFactory.dataset.findById(datasetId);
        if (!dataset) {
            throw new Error('Dataset not found');
        }

        // Parse access_control from string if needed
        const ac: AccessControl = typeof dataset.access_control === 'string'
            ? JSON.parse(dataset.access_control)
            : dataset.access_control || { public: true, team_ids: [], user_ids: [] };

        const teamIds = ac.team_ids || [];
        const userIds = ac.user_ids || [];

        // Batch fetch team names for enrichment
        let teams: Array<{ id: string; name: string }> = [];
        if (teamIds.length > 0) {
            teams = await ModelFactory.team.getKnex()
                .select('id', 'name')
                .whereIn('id', teamIds);
        }

        // Batch fetch user display names for enrichment
        let users: Array<{ id: string; display_name: string }> = [];
        if (userIds.length > 0) {
            users = await ModelFactory.user.getKnex()
                .select('id', 'display_name')
                .whereIn('id', userIds);
        }

        return {
            public: ac.public ?? true,
            teams,
            users,
        };
    }

    /**
     * Update the access_control JSONB field on a dataset.
     * @param datasetId - UUID of the dataset to update
     * @param accessControl - New access control settings (partial merge)
     * @param user - Authenticated user context for audit logging
     * @returns The updated dataset record
     */
    async setDatasetAccess(
        datasetId: string,
        accessControl: { public?: boolean; team_ids?: string[]; user_ids?: string[] },
        user: UserContext
    ): Promise<Dataset | undefined> {
        // Build the new access_control payload
        const newAc: AccessControl = {
            public: accessControl.public ?? false,
            team_ids: accessControl.team_ids ?? [],
            user_ids: accessControl.user_ids ?? [],
        };

        // Persist the updated access_control JSONB column
        const dataset = await ModelFactory.dataset.update(datasetId, {
            access_control: JSON.stringify(newAc),
            updated_by: user.id,
        } as Partial<Dataset>);

        // Audit log the access control change
        await auditService.log({
            userId: user.id,
            userEmail: user.email,
            action: AuditAction.UPDATE_SOURCE,
            resourceType: AuditResourceType.DATASET,
            resourceId: datasetId,
            details: { access_control: newAc },
            ipAddress: user.ip,
        });

        log.info('Dataset access control updated', { datasetId, userId: user.id });
        return dataset;
    }

    /**
     * Check whether a user has access to a specific dataset.
     * Admins always have access. Otherwise checks public flag, creator, user_ids, and team_ids.
     * @param datasetId - UUID of the dataset
     * @param userId - UUID of the user to check
     * @param userRole - Role of the user (e.g., 'admin', 'user')
     * @param teamIds - Array of team UUIDs the user belongs to
     * @returns True if the user can access the dataset
     */
    async checkDatasetAccess(
        datasetId: string,
        userId: string,
        userRole: string,
        teamIds: string[]
    ): Promise<boolean> {
        // Admins always have access
        if (userRole === 'admin' || userRole === 'superadmin') {
            return true;
        }

        // Fetch the dataset to inspect access_control
        const dataset = await ModelFactory.dataset.findById(datasetId);
        if (!dataset || dataset.status === 'deleted') {
            return false;
        }

        // Creator always has access
        if (dataset.created_by === userId) {
            return true;
        }

        // Parse access_control
        const ac: AccessControl = typeof dataset.access_control === 'string'
            ? JSON.parse(dataset.access_control)
            : dataset.access_control || { public: true, team_ids: [], user_ids: [] };

        // Public datasets are accessible to everyone
        if (ac.public === true) {
            return true;
        }

        // Check explicit user grant
        if (ac.user_ids?.includes(userId)) {
            return true;
        }

        // Check team intersection
        if (ac.team_ids?.some((tid: string) => teamIds.includes(tid))) {
            return true;
        }

        return false;
    }

    // -------------------------------------------------------------------------
    // Dataset Versioning
    // -------------------------------------------------------------------------

    /**
     * @description Create a new version dataset that inherits settings from a parent dataset.
     * Each version is a full dataset with pagerank = version_number for recency boost.
     * The version auto-inherits parser_config, access_control, embedding_model, and language
     * @param {string} parentDatasetId - UUID of the parent dataset to version
     * @param {string | null} changeSummary - User-provided change summary, or null for auto-generated
     * @param {string} userId - ID of the user creating the version
     * @param {string} tenantId - Tenant ID for multi-org isolation
     * @returns {Promise<Dataset>} The newly created version dataset
     * @throws {Error} If parent dataset is not found
     */
    async createVersionDataset(
        parentDatasetId: string,
        changeSummary: string | null,
        versionLabel: string | null,
        userId: string,
        tenantId: string,
    ): Promise<Dataset> {
        // Fetch parent dataset to inherit settings
        const parent = await ModelFactory.dataset.findById(parentDatasetId)
        if (!parent || parent.status === 'deleted') {
            throw new Error('Parent dataset not found')
        }

        // Determine next version number by finding the max existing version
        const maxResult = await db('datasets')
            .where('parent_dataset_id', parentDatasetId)
            .max('version_number as max')
            .first()
        const versionNumber = ((maxResult?.max as number) ?? 0) + 1

        // Build default change summary if none provided
        const summary = changeSummary || `Version ${versionNumber} uploaded by user`

        // Create version dataset inheriting parent config
        const versionDataset = await ModelFactory.dataset.create({
            name: `${parent.name} (v${versionNumber})`,
            description: parent.description || null,
            language: parent.language,
            embedding_model: parent.embedding_model || null,
            parser_id: parent.parser_id || 'naive',
            parser_config: typeof parent.parser_config === 'string'
                ? parent.parser_config
                : JSON.stringify(parent.parser_config || {}),
            access_control: typeof parent.access_control === 'string'
                ? parent.access_control
                : JSON.stringify(parent.access_control || { public: true }),
            // Inherit policy rules from parent to preserve permission constraints
            policy_rules: typeof parent.policy_rules === 'string'
                ? parent.policy_rules
                : JSON.stringify(parent.policy_rules || []),

            // Pagerank = version_number for recency boost in OpenSearch rank_feature queries
            pagerank: versionNumber,
            status: 'active',
            tenant_id: tenantId || parent.tenant_id || null,
            parent_dataset_id: parentDatasetId,
            version_number: versionNumber,
            // Store custom version label if provided (e.g., '1.2.0', 'Q1 Release')
            version_label: versionLabel || null,
            change_summary: summary,
            version_created_by: userId,
            created_by: userId,
            updated_by: userId,
        } as Partial<Dataset>)

        // Log audit event for version creation
        await auditService.log({
            userId,
            userEmail: '',
            action: AuditAction.CREATE_SOURCE,
            resourceType: AuditResourceType.DATASET,
            resourceId: versionDataset.id,
            details: { parentDatasetId, versionNumber, versionLabel, changeSummary: summary },
        })

        log.info('Version dataset created', {
            parentDatasetId,
            versionDatasetId: versionDataset.id,
            versionNumber,
        })

        return versionDataset
    }

    /**
     * @description Get all version datasets for a given parent dataset, ordered by version number ascending.
     * @param {string} parentDatasetId - UUID of the parent dataset
     * @returns {Promise<Dataset[]>} Array of version datasets ordered by version_number
     */
    async getVersionDatasets(parentDatasetId: string): Promise<Dataset[]> {
        return db('datasets')
            .where('parent_dataset_id', parentDatasetId)
            .where('status', '!=', 'deleted')
            .orderBy('version_number', 'asc')
    }

    // -------------------------------------------------------------------------
    // Bulk Metadata Operations
    // -------------------------------------------------------------------------

    /**
     * @description Bulk update metadata_tags on multiple datasets.
     * Stores tags in parser_config.metadata_tags (separate from parser_config.metadata
     * which holds auto-extraction schema).
     * @param {string[]} datasetIds - Array of dataset UUIDs to update
     * @param {Record<string, string>} metadataTags - Key-value pairs to set/merge into parser_config.metadata_tags
     * @param {'merge' | 'overwrite'} mode - 'merge' adds to existing metadata_tags, 'overwrite' replaces entirely
     * @param {string} tenantId - Tenant for isolation
     * @returns {Promise<void>}
     */
    async bulkUpdateMetadata(
        datasetIds: string[],
        metadataTags: Record<string, string>,
        mode: 'merge' | 'overwrite',
        tenantId: string,
    ): Promise<void> {
        const tagsJson = JSON.stringify(metadataTags)

        if (mode === 'merge') {
            // Merge new tags into existing metadata_tags, preserving other parser_config keys
            await db('datasets')
                .whereIn('id', datasetIds)
                .andWhere('tenant_id', tenantId)
                .update({
                    parser_config: db.raw(
                        `jsonb_set(COALESCE(parser_config, '{}'), '{metadata_tags}', COALESCE(parser_config->'metadata_tags', '{}') || ?::jsonb)`,
                        [tagsJson],
                    ),
                })
        } else {
            // Overwrite mode: replace metadata_tags entirely
            await db('datasets')
                .whereIn('id', datasetIds)
                .andWhere('tenant_id', tenantId)
                .update({
                    parser_config: db.raw(
                        `jsonb_set(COALESCE(parser_config, '{}'), '{metadata_tags}', ?::jsonb)`,
                        [tagsJson],
                    ),
                })
        }

        log.info('Bulk metadata update completed', {
            datasetCount: datasetIds.length,
            mode,
            tagCount: Object.keys(metadataTags).length,
        })
    }

    // -------------------------------------------------------------------------
    // Document operations (metadata only — actual files managed by advance-rag)
    // -------------------------------------------------------------------------

    /**
     * @description Get all documents for a dataset from the Node.js documents table
     * @param {string} datasetId - Dataset UUID
     * @returns {Promise<Document[]>} Array of document records
     */
    async getDocuments(datasetId: string): Promise<Document[]> {
        return ModelFactory.document.findByDatasetId(datasetId);
    }

    /**
     * @description Retrieve a single document by its UUID
     * @param {string} id - Document UUID
     * @returns {Promise<Document | undefined>} The document record or undefined
     */
    async getDocumentById(id: string): Promise<Document | undefined> {
        return ModelFactory.document.findById(id);
    }
}

/** Singleton instance of the core RAG service */
export const ragService = new RagService();

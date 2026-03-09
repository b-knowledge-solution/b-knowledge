import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/audit.service.js';
import { Dataset, Document } from '@/shared/models/types.js';
import { teamService } from '@/modules/teams/team.service.js';

export interface AccessControl {
    public: boolean;
    team_ids: string[];
    user_ids: string[];
}

interface UserContext {
    id: string;
    email: string;
    role?: string;
    ip?: string;
}

export class RagService {
    // -------------------------------------------------------------------------
    // Dataset CRUD
    // -------------------------------------------------------------------------

    async getAvailableDatasets(user?: any): Promise<Dataset[]> {
        const allDatasets = await ModelFactory.dataset.findAll(
            { status: 'active' },
            { orderBy: { name: 'asc' } }
        );

        if (!user) {
            return allDatasets.filter(d => {
                const ac = typeof d.access_control === 'string' ? JSON.parse(d.access_control) : d.access_control;
                return ac?.public === true;
            });
        }

        if (user.role === 'admin') {
            return allDatasets;
        }

        const userTeams = await teamService.getUserTeams(user.id);
        const teamIds = userTeams.map((t: any) => t.id);

        return allDatasets.filter(d => {
            const ac = typeof d.access_control === 'string' ? JSON.parse(d.access_control) : d.access_control;
            if (!ac) return false;
            if (ac.public === true) return true;
            if (ac.user_ids?.includes(user.id)) return true;
            if (ac.team_ids?.some((tid: string) => teamIds.includes(tid))) return true;
            return false;
        });
    }

    async getDatasetById(id: string): Promise<Dataset | undefined> {
        return ModelFactory.dataset.findById(id);
    }

    async createDataset(data: any, user?: UserContext): Promise<Dataset> {
        try {
            const dataset = await ModelFactory.dataset.create({
                name: data.name,
                description: data.description || null,
                language: data.language || 'English',
                embedding_model: data.embedding_model || null,
                parser_id: data.parser_id || 'naive',
                parser_config: JSON.stringify(data.parser_config || {}),
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

    async updateDataset(id: string, data: any, user?: UserContext): Promise<Dataset | undefined> {
        try {
            const updateData: any = {};
            if (data.name !== undefined) updateData.name = data.name;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.language !== undefined) updateData.language = data.language;
            if (data.embedding_model !== undefined) updateData.embedding_model = data.embedding_model;
            if (data.parser_id !== undefined) updateData.parser_id = data.parser_id;
            if (data.parser_config !== undefined) updateData.parser_config = JSON.stringify(data.parser_config);
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

    async deleteDataset(id: string, user?: UserContext): Promise<void> {
        try {
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
        } catch (error) {
            log.error('Failed to delete dataset', { error: String(error) });
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Document operations (metadata only — actual files managed by py-rag)
    // -------------------------------------------------------------------------

    async getDocuments(datasetId: string): Promise<Document[]> {
        return ModelFactory.document.findByDatasetId(datasetId);
    }

    async getDocumentById(id: string): Promise<Document | undefined> {
        return ModelFactory.document.findById(id);
    }
}

export const ragService = new RagService();

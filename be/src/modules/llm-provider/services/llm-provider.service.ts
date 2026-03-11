import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { cryptoService } from '@/shared/services/crypto.service.js';
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js';
import { ModelProvider } from '@/shared/models/types.js';

interface UserContext {
    id: string;
    email: string;
    ip?: string;
}

export class LlmProviderService {
    async list(): Promise<ModelProvider[]> {
        return ModelFactory.modelProvider.findAll(
            { status: 'active' },
            { orderBy: { factory_name: 'asc' } }
        );
    }

    async getById(id: string): Promise<ModelProvider | undefined> {
        return ModelFactory.modelProvider.findById(id);
    }

    async getDefaults(): Promise<ModelProvider[]> {
        return ModelFactory.modelProvider.findDefaults();
    }

    async create(data: any, user?: UserContext): Promise<ModelProvider> {
        // Encrypt the API key before persisting to database
        const encryptedKey = data.api_key
            ? cryptoService.encrypt(data.api_key)
            : null;

        const provider = await ModelFactory.modelProvider.create({
            factory_name: data.factory_name,
            model_type: data.model_type,
            model_name: data.model_name,
            api_key: encryptedKey,
            api_base: data.api_base || null,
            max_tokens: data.max_tokens || null,
            status: 'active',
            is_default: data.is_default || false,
            created_by: user?.id || null,
            updated_by: user?.id || null,
        });

        // Sync to shared tenant_llm table (used by task executors)
        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider to tenant_llm', { error: String(err) });
        }

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: provider.id,
                details: { factory_name: provider.factory_name, model_name: provider.model_name },
                ipAddress: user.ip,
            });
        }

        return provider;
    }

    async update(id: string, data: any, user?: UserContext): Promise<ModelProvider | undefined> {
        const updateData: any = {};
        if (data.factory_name !== undefined) updateData.factory_name = data.factory_name;
        if (data.model_type !== undefined) updateData.model_type = data.model_type;
        if (data.model_name !== undefined) updateData.model_name = data.model_name;
        // Encrypt the API key; skip masked placeholder '***' (means "keep existing")
        if (data.api_key !== undefined && data.api_key !== '***') {
            updateData.api_key = data.api_key
                ? cryptoService.encrypt(data.api_key)
                : data.api_key;
        }
        if (data.api_base !== undefined) updateData.api_base = data.api_base;
        if (data.max_tokens !== undefined) updateData.max_tokens = data.max_tokens;
        if (data.is_default !== undefined) updateData.is_default = data.is_default;
        if (user) updateData.updated_by = user.id;

        const provider = await ModelFactory.modelProvider.update(id, updateData);
        if (!provider) return undefined;

        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider update to tenant_llm', { error: String(err) });
        }

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: id,
                details: { changes: data },
                ipAddress: user.ip,
            });
        }

        return provider;
    }

    async delete(id: string, user?: UserContext): Promise<void> {
        await ModelFactory.modelProvider.update(id, { status: 'deleted' });

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: id,
                ipAddress: user.ip,
            });
        }
    }
}

export const llmProviderService = new LlmProviderService();

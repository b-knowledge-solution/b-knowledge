import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { llmProviderService } from '../services/llm-provider.service.js';
import { log } from '@/shared/services/logger.service.js';
import { getClientIp } from '@/shared/utils/ip.js';

/** Pre-load factory presets JSON at module init for fast responses */
const __dirname = dirname(fileURLToPath(import.meta.url));
const factoryPresets = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'factory-presets.json'), 'utf-8'),
);

export class LlmProviderController {
    /**
     * Return static factory preset configurations for all supported LLM providers.
     * @description GET /api/llm-provider/presets
     * @param _req - Express request
     * @param res - Express response with factory presets array
     */
    async getPresets(_req: Request, res: Response): Promise<void> {
        res.json(factoryPresets);
    }

    async list(_req: Request, res: Response): Promise<void> {
        try {
            const providers = await llmProviderService.list();
            // Mask API keys in response
            const masked = providers.map(p => ({
                ...p,
                api_key: p.api_key ? '***' : null,
            }));
            res.json(masked);
        } catch (error) {
            log.error('Failed to list model providers', { error: String(error) });
            res.status(500).json({ error: 'Failed to list model providers' });
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const provider = await llmProviderService.getById(req.params['id']!);
            if (!provider) {
                res.status(404).json({ error: 'Model provider not found' });
                return;
            }
            res.json({ ...provider, api_key: provider.api_key ? '***' : null });
        } catch (error) {
            log.error('Failed to get model provider', { error: String(error) });
            res.status(500).json({ error: 'Failed to get model provider' });
        }
    }

    async getDefaults(_req: Request, res: Response): Promise<void> {
        try {
            const defaults = await llmProviderService.getDefaults();
            res.json(defaults.map(p => ({ ...p, api_key: p.api_key ? '***' : null })));
        } catch (error) {
            log.error('Failed to get default model providers', { error: String(error) });
            res.status(500).json({ error: 'Failed to get defaults' });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;
            const provider = await llmProviderService.create(req.body, user);
            res.status(201).json({ ...provider, api_key: provider.api_key ? '***' : null });
        } catch (error: any) {
            log.error('Failed to create model provider', { error: String(error) });
            const status = error.message?.includes('already exists') ? 409 : 500;
            res.status(status).json({ error: error.message || 'Failed to create model provider' });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;
            const provider = await llmProviderService.update(id, req.body, user);
            if (!provider) { res.status(404).json({ error: 'Model provider not found' }); return; }
            res.json({ ...provider, api_key: provider.api_key ? '***' : null });
        } catch (error: any) {
            log.error('Failed to update model provider', { error: String(error) });
            res.status(500).json({ error: error.message || 'Failed to update model provider' });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;
            await llmProviderService.delete(id, user);
            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete model provider', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete model provider' });
        }
    }

    /**
     * Test the connection to an LLM provider.
     * @description POST /api/llm-provider/:id/test-connection
     * @param req - Express request with provider ID param
     * @param res - Express response with test result
     */
    async testConnection(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const result = await llmProviderService.testConnection(id);
            res.json(result);
        } catch (error) {
            log.error('Failed to test provider connection', { error: String(error) });
            res.status(500).json({ success: false, error: 'Failed to test connection' });
        }
    }
}

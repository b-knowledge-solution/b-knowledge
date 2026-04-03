/**
 * Audit controller: exposes paginated audit logs and metadata (actions/resource types).
 * All routes are protected at router level to admin-only; this layer focuses on validation and shaping filters.
 */
import { Request, Response } from 'express'
import { auditService } from '@/modules/audit/services/audit.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'

/**
 * @description Exposes paginated audit logs and metadata (actions/resource types) for the admin UI
 */
export class AuditController {
  /**
   * @description Retrieve filtered and paginated audit logs with support for user, action, resource type, date range, and text search
   * @param {Request} req - Express request object containing query filters (page, limit, userId, action, resourceType, startDate, endDate, search)
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      // Safely extract and validate query parameters
      const page = this.getStringParam(req.query.page) || '1';
      const limit = this.getStringParam(req.query.limit) || '50';
      const userId = this.getStringParam(req.query.userId);
      const action = this.getStringParam(req.query.action);
      const resourceType = this.getStringParam(req.query.resourceType);
      const startDate = this.getStringParam(req.query.startDate);
      const endDate = this.getStringParam(req.query.endDate);
      const search = this.getStringParam(req.query.search);

      // Parse and validate pagination params
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      // Calculate offset from page number
      const offset = (pageNum - 1) * limitNum;

      // Build filters object (without pagination)
      const filters: Record<string, string> = {};
      if (userId) filters.userId = userId;
      if (action) filters.action = action;
      if (resourceType) filters.resourceType = resourceType;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (search) filters.search = search;

      // Tenant scoping: super-admins can optionally filter by org, admins see only their org
      const user = req.session?.user
      if (user?.is_superuser) {
        // Super-admin can optionally filter by a specific tenant via query param
        const tenantFilter = this.getStringParam(req.query.tenantId)
        if (tenantFilter) filters.tenantId = tenantFilter
      } else {
        // Non-super-admin users are forced to see only their own org's audit logs
        const tenantId = getTenantId(req)
        if (tenantId) filters.tenantId = tenantId
      }

      // Fetch logs from service with filters (pass limit and offset as separate params)
      const result = await auditService.getLogs(filters, limitNum, offset);

      // Debug log for audit fetch
      log.debug('Audit logs fetched', {
        page: pageNum,
        limit: limitNum,
        offset,
        total: result.pagination.total,
        requestedBy: req.session?.user?.email,
      });

      res.json(result);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch audit logs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }

  /**
   * @description Return the list of distinct audit action types for populating filter dropdowns
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getActions(req: Request, res: Response): Promise<void> {
    try {
      // Fetch action types from service
      const actions = await auditService.getActionTypes();
      res.json(actions);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch action types', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to fetch action types' });
    }
  }

  /**
   * @description Return the list of distinct audit resource types for populating filter dropdowns
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getResourceTypes(req: Request, res: Response): Promise<void> {
    try {
      // Fetch resource types from service
      const resourceTypes = await auditService.getResourceTypes();
      res.json(resourceTypes);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch resource types', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to fetch resource types' });
    }
  }

  /**
   * @description Retrieve audit history for a specific resource identified by type and ID
   * @param {Request} req - Express request object containing route parameters (type, id)
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getResourceHistory(req: Request, res: Response): Promise<void> {
    const { type, id } = req.params;
    // Validate required parameters
    if (!type || !id) {
      res.status(400).json({ error: 'Resource type and ID are required' });
      return;
    }

    try {
      // Fetch resource history from service
      const logs = await auditService.getResourceHistory(type, id);
      res.json(logs);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch resource history', { error: String(error) });
      res.status(500).json({ error: 'Failed to fetch resource history' });
    }
  }

  /**
   * @description Export filtered audit logs as a downloadable CSV file
   * @param {Request} req - Express request object containing query filters (userId, action, resourceType, startDate, endDate)
   * @param {Response} res - Express response object with CSV content-type headers
   * @returns {Promise<void>}
   */
  async exportLogs(req: Request, res: Response): Promise<void> {
    try {
      // Build filter object from query parameters
      const filters: any = {};
      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.action) filters.action = req.query.action as string;
      if (req.query.resourceType) filters.resourceType = req.query.resourceType as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      // Generate CSV from service
      const csv = await auditService.exportLogsToCsv(filters);

      // Set headers for CSV download
      res.header('Content-Type', 'text/csv');
      res.attachment(`audit-logs-${new Date().toISOString()}.csv`);
      res.send(csv);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to export audit logs', { error: String(error) });
      res.status(500).json({ error: 'Failed to export audit logs' });
    }
  }

  /**
   * @description Safely extract a string from an unknown query parameter value, handling array duplicates
   * @param {unknown} value - The raw query parameter value to normalize
   * @returns {string | undefined} The extracted string or undefined if not a valid string
   */
  private getStringParam(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    // Handle array case (e.g., duplicated query params)
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0]; // Take first value if array
    }
    return undefined;
  }
}

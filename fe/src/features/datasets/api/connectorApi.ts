/**
 * @fileoverview Raw HTTP API functions for dataset connector (external source) feature.
 * Handles connector CRUD, sync triggering, and sync log listing.
 *
 * @module features/datasets/api/connectorApi
 */

import { api } from '@/lib/api'
import type { Connector, CreateConnectorDto, UpdateConnectorDto, SyncLog } from '../types'

/** @description Base URL prefix for sync API endpoints */
const BASE_URL = '/api/sync'

/**
 * @description Connector API client containing all raw HTTP calls for external source management.
 */
export const connectorApi = {
  // ============================================================================
  // Connector CRUD
  // ============================================================================

  /**
   * @description List all connectors for a specific knowledge base (dataset).
   * @param {string} kbId - Knowledge base UUID to filter connectors by
   * @returns {Promise<Connector[]>} Array of connector objects
   */
  listConnectors: async (kbId: string): Promise<Connector[]> => {
    return api.get<Connector[]>(`${BASE_URL}/connectors?kb_id=${kbId}`)
  },

  /**
   * @description Get a single connector by ID.
   * @param {string} id - Connector UUID
   * @returns {Promise<Connector>} Connector object
   */
  getConnector: async (id: string): Promise<Connector> => {
    return api.get<Connector>(`${BASE_URL}/connectors/${id}`)
  },

  /**
   * @description Create a new external source connector.
   * @param {CreateConnectorDto} data - Connector creation payload
   * @returns {Promise<Connector>} Created connector object
   */
  createConnector: async (data: CreateConnectorDto): Promise<Connector> => {
    return api.post<Connector>(`${BASE_URL}/connectors`, data)
  },

  /**
   * @description Update an existing connector.
   * @param {string} id - Connector UUID
   * @param {UpdateConnectorDto} data - Partial update payload
   * @returns {Promise<Connector>} Updated connector object
   */
  updateConnector: async (id: string, data: UpdateConnectorDto): Promise<Connector> => {
    return api.put<Connector>(`${BASE_URL}/connectors/${id}`, data)
  },

  /**
   * @description Delete a connector by ID.
   * @param {string} id - Connector UUID
   * @returns {Promise<void>}
   */
  deleteConnector: async (id: string): Promise<void> => {
    return api.delete(`${BASE_URL}/connectors/${id}`)
  },

  // ============================================================================
  // Sync Operations
  // ============================================================================

  /**
   * @description Trigger an immediate sync for a connector.
   * @param {string} id - Connector UUID
   * @param {string} [pollRangeStart] - Optional start date for incremental sync
   * @returns {Promise<SyncLog>} Created sync log entry
   */
  triggerSync: async (id: string, pollRangeStart?: string): Promise<SyncLog> => {
    return api.post<SyncLog>(`${BASE_URL}/connectors/${id}/sync`, {
      poll_range_start: pollRangeStart,
    })
  },

  /**
   * @description List sync logs for a connector with pagination.
   * @param {string} connectorId - Connector UUID
   * @param {object} [params] - Pagination and filter params
   * @param {number} [params.page] - Page number (1-based)
   * @param {number} [params.limit] - Items per page
   * @param {string} [params.status] - Optional status filter
   * @returns {Promise<SyncLog[]>} Array of sync log entries
   */
  listSyncLogs: async (
    connectorId: string,
    params?: { page?: number; limit?: number; status?: string },
  ): Promise<SyncLog[]> => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.status) query.set('status', params.status)
    const qs = query.toString()
    return api.get<SyncLog[]>(`${BASE_URL}/connectors/${connectorId}/logs${qs ? `?${qs}` : ''}`)
  },
}

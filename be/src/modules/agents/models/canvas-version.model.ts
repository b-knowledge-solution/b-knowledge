/**
 * @fileoverview Canvas version model for user_canvas_version table.
 * Manages canvas/agent version release state.
 * @module modules/agents/models/canvas-version
 */
import { Knex } from 'knex'
import { db } from '@/shared/db/knex.js'
import { BaseModel } from '@/shared/models/base.model.js'

/**
 * @description Canvas version entity representing a row in the user_canvas_version table
 */
export interface CanvasVersion {
  id: string
  canvas_id: string
  tenant_id: string
  release: boolean
  create_time: Date
  [key: string]: unknown
}

/**
 * @description Model for user_canvas_version table managing canvas release state
 */
export class CanvasVersionModel extends BaseModel<CanvasVersion> {
  protected tableName = 'user_canvas_version'
  protected knex: Knex = db

  /**
   * @description Atomically release a canvas version by clearing all release flags
   *   for the canvas and setting the specified version as released.
   * @param {string} canvasId - Canvas/agent ID
   * @param {string} versionId - Version ID to release
   * @param {string} tenantId - Tenant ID for access control
   * @returns {Promise<void>}
   */
  async releaseVersion(canvasId: string, versionId: string, tenantId: string): Promise<void> {
    // Use transaction to atomically swap the release flag and prevent race conditions
    await this.knex.transaction(async (trx) => {
      // Clear any existing release flag for this canvas (only one active release)
      await trx(this.tableName)
        .where('canvas_id', canvasId)
        .where('tenant_id', tenantId)
        .update({ release: false })

      // Set the release flag on the specified version
      await trx(this.tableName)
        .where('id', versionId)
        .where('canvas_id', canvasId)
        .where('tenant_id', tenantId)
        .update({ release: true })
    })
  }

  /**
   * @description Get the currently released version of a canvas
   * @param {string} canvasId - Canvas/agent ID
   * @param {string} tenantId - Tenant ID for access control
   * @returns {Promise<CanvasVersion | null>} Released version row or null
   */
  async findReleasedVersion(canvasId: string, tenantId: string): Promise<CanvasVersion | null> {
    // Query for the version with release=true, ordered by creation time desc
    const version = await this.knex(this.tableName)
      .where('canvas_id', canvasId)
      .where('tenant_id', tenantId)
      .where('release', true)
      .orderBy('create_time', 'desc')
      .first()
    return version || null
  }
}

/**
 * @fileoverview History Chat Message Model.
 *
 * Represents individual chat messages within history chat sessions.
 * Stores user prompts, LLM responses, and citation data.
 *
 * @module shared/models/history-chat-message
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Knex } from 'knex'

/**
 * History chat message record shape.
 * @description Defines the columns of the history_chat_messages table.
 */
export interface HistoryChatMessage {
    /** Primary key */
    id: string
    /** Session ID linking to parent session */
    session_id: string
    /** The user's prompt text */
    user_prompt: string
    /** The LLM's response text */
    llm_response: string
    /** Array of citation/source references */
    citations: any[]
    /** Timestamp of creation */
    created_at: Date
}

/**
 * HistoryChatMessageModel
 * Provides CRUD operations for the history_chat_messages table.
 * @description Manages history chat message records with session-scoped queries.
 */
export class HistoryChatMessageModel extends BaseModel<HistoryChatMessage> {
    /** Database table name */
    protected tableName = 'history_chat_messages'
    /** Knex connection instance */
    protected knex: Knex = db

    /**
     * Find messages by session ID and verify user ownership.
     * @param sessionId - The session ID to look up.
     * @param userEmail - The email of the requesting user.
     * @returns Promise<any[]> - Array of messages ordered by creation time.
     * @description Joins with sessions table to verify ownership before returning messages.
     */
    async findBySessionIdAndUserEmail(sessionId: string, userEmail: string) {
        // Join with sessions table to verify ownership before returning messages
        return await this.knex
            .select('history_chat_messages.*')
            .from(this.tableName)
            .join('history_chat_sessions', 'history_chat_messages.session_id', 'history_chat_sessions.session_id')
            .where('history_chat_messages.session_id', sessionId)
            .andWhere('history_chat_sessions.user_email', userEmail)
            .orderBy('history_chat_messages.created_at', 'asc')
    }
}

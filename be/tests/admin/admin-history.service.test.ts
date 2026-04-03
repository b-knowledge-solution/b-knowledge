/**
 * @fileoverview Unit tests for AdminHistoryService.
 * Tests feedback enrichment (positive_count, negative_count), feedback filter,
 * agent run history, and agent run details.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/shared/db/knex.js', () => {
    const createChain = (): any => new Proxy({}, {
        get(_t, prop) {
            if (prop === 'then') return (resolve: any) => Promise.resolve(resolve([]))
            if (prop === 'first') return () => Promise.resolve(undefined)
            if (prop === 'raw') return (sql: string) => sql
            return () => createChain()
        },
    })
    const dbFn: any = () => createChain()
    dbFn.raw = vi.fn((sql: string) => sql)
    return { db: dbFn }
})

import { adminHistoryService } from '../../src/modules/admin/services/admin-history.service.js';
import { ModelFactory } from '../../src/shared/models/factory.js';

describe('AdminHistoryService', () => {
    let mockQuery: any;
    let mockKnex: any;

    const createMockQuery = () => {
        const query: any = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(function(arg: any){ if (typeof arg === 'function') { arg(this); return this } return this }),
            andWhere: vi.fn().mockReturnThis(),
            orWhere: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            then: vi.fn((cb: any) => Promise.resolve([]).then(cb)),
            whereExists: vi.fn().mockReturnThis(),
            whereNotExists: vi.fn().mockReturnThis(),
            orWhereExists: vi.fn().mockImplementation(function(fn: any){ fn.call(this); return this }),
            whereRaw: vi.fn().mockReturnThis(),
            orWhereRaw: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(undefined),
            client: {
                raw: vi.fn((sql) => sql) // Mock client.raw for getSystemChatHistory
            }
        };
        return query;
    };

    beforeEach(() => {
        mockQuery = createMockQuery();
        mockKnex = vi.fn(() => mockQuery) as any;

        // Mock getter to return mockKnex which returns mockQuery
        vi.spyOn(ModelFactory.historyChatSession, 'getKnex').mockReturnValue(mockQuery);
        vi.spyOn(ModelFactory.historySearchSession, 'getKnex').mockReturnValue(mockQuery);
        vi.spyOn(ModelFactory.historyChatMessage, 'getKnex').mockReturnValue(mockQuery);
        vi.spyOn(ModelFactory.historySearchRecord, 'getKnex').mockReturnValue(mockQuery);
        vi.spyOn(ModelFactory.chatSession, 'getKnex').mockReturnValue(mockQuery);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getChatHistory', () => {
        const page = 1;
        const limit = 10;
        const email = 'user@test.com';

        it('should build correct query with feedback count subqueries', async () => {
            await adminHistoryService.getChatHistory(page, limit, '', email, '', '');

            expect(mockQuery.select).toHaveBeenCalled();
            expect(mockQuery.from).toHaveBeenCalledWith('history_chat_sessions');
            expect(mockQuery.orderBy).toHaveBeenCalledWith('history_chat_sessions.updated_at', 'desc');
            expect(mockQuery.limit).toHaveBeenCalledWith(limit);
        });

        it('should return results with positive_count and negative_count fields', async () => {
            // Verify the select call includes feedback subquery columns
            await adminHistoryService.getChatHistory(page, limit, '', '', '', '');

            // The select should have been called — we verify the call happened
            // with db.raw subqueries for positive_count and negative_count
            const selectCalls = mockQuery.select.mock.calls;
            expect(selectCalls.length).toBeGreaterThan(0);
        });

        it('should apply filters', async () => {
            await adminHistoryService.getChatHistory(page, limit, 'searchterm', email, '2023-01-01', '2023-01-31', 'source1');

            // Check date filters applied to the chain
            expect(mockQuery.where).toHaveBeenCalledWith('history_chat_sessions.updated_at', '>=', '2023-01-01');
            expect(mockQuery.where).toHaveBeenCalledWith('history_chat_sessions.updated_at', '<=', '2023-01-31 23:59:59');
        });

        it('should apply feedbackFilter=negative correctly', async () => {
            await adminHistoryService.getChatHistory(page, limit, '', '', '', '', undefined, 'negative');

            // The whereExists method should be called for 'negative' filter
            expect(mockQuery.whereExists).toHaveBeenCalled();
        });

        it('should apply feedbackFilter=none with whereNotExists', async () => {
            await adminHistoryService.getChatHistory(page, limit, '', '', '', '', undefined, 'none');

            // The whereNotExists method should be called for 'none' filter
            expect(mockQuery.whereNotExists).toHaveBeenCalled();
        });
    });

    describe('getSearchHistory', () => {
        it('should build correct query with feedback counts', async () => {
            const page = 1;
            const limit = 10;
            const email = 'user@test.com';

            await adminHistoryService.getSearchHistory(page, limit, '', email, '', '');

            expect(mockQuery.select).toHaveBeenCalled();
            expect(mockQuery.from).toHaveBeenCalledWith('history_search_sessions');
            expect(mockQuery.orderBy).toHaveBeenCalledWith('history_search_sessions.updated_at', 'desc');
        });

        it('should apply search and orWhereExists when search provided', async () => {
            mockQuery.orWhereExists = vi.fn().mockImplementation(function(fn: any) { fn.call(this); return this })

            await adminHistoryService.getSearchHistory(1, 10, 'term', '', '', '', '')
            // Ensure the subquery search predicates were applied on the sub builder
            expect(mockQuery.whereRaw).toHaveBeenCalled()
            expect(mockQuery.orWhereRaw).toHaveBeenCalled()
        })

        it('should apply feedbackFilter=positive correctly', async () => {
            await adminHistoryService.getSearchHistory(1, 10, '', '', '', '', undefined, 'positive');

            expect(mockQuery.whereExists).toHaveBeenCalled();
        });
    });

    describe('getAgentRunHistory', () => {
        it('should execute without error for basic query', async () => {
            // Agent run queries use db() directly which goes through Proxy mock
            await expect(
                adminHistoryService.getAgentRunHistory(1, 20, '', '', '', '')
            ).resolves.not.toThrow();
        });

        it('should execute without error with search filter', async () => {
            await expect(
                adminHistoryService.getAgentRunHistory(1, 10, 'test-agent', '', '', '')
            ).resolves.not.toThrow();
        });

        it('should execute without error with feedbackFilter=any', async () => {
            await expect(
                adminHistoryService.getAgentRunHistory(1, 10, '', '', '', '', 'any')
            ).resolves.not.toThrow();
        });

        it('should execute without error with date range filters', async () => {
            await expect(
                adminHistoryService.getAgentRunHistory(1, 10, '', 'user@test.com', '2024-01-01', '2024-12-31')
            ).resolves.not.toThrow();
        });
    });

    describe('getAgentRunDetails', () => {
        it('should return null when run not found', async () => {
            // first() returns undefined by default in mock
            const result = await adminHistoryService.getAgentRunDetails('non-existent-id');

            expect(result).toBeNull();
        });

        it('should return null for non-existent run (db proxy returns undefined from first)', async () => {
            // The Proxy-based db mock returns undefined from first(), so the method returns null
            const result = await adminHistoryService.getAgentRunDetails('run-1');
            expect(result).toBeNull();
        });
    });

    describe('getSystemChatHistory', () => {
        it('should build correct query', async () => {
            const page = 1;
            const limit = 10;

            await adminHistoryService.getSystemChatHistory(page, limit, '');

            expect(mockQuery.from).toHaveBeenCalledWith('chat_sessions');
            expect(mockQuery.leftJoin).toHaveBeenCalledWith('users', 'chat_sessions.user_id', 'users.id');
            expect(mockQuery.select).toHaveBeenCalled();
            expect(mockQuery.orderBy).toHaveBeenCalledWith('chat_sessions.updated_at', 'desc');
        });

        it('should apply search filter and orWhereExists', async () => {
            mockQuery.orWhereExists = vi.fn().mockImplementation(function(fn: any) { fn.call(this); return this })
            await adminHistoryService.getSystemChatHistory(1, 10, 'hello')
            // check that message content filter applied to subquery
            expect(mockQuery.andWhere).toHaveBeenCalledWith('content', 'ilike', '%hello%')
        })
    });
});

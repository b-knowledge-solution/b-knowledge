/**
 * @fileoverview API service for user management.
 * Migrated from raw fetch to shared api utility.
 * @module features/users/api/userApi
 */
import { api } from '@/lib/api'
import type { User } from '@/features/auth'
import type { IpHistoryMap, CreateUserDto, UpdateUserDto, UserIpHistory, UserSession } from '../types/user.types'

const BASE_URL = '/api/users'

export const userApi = {
    /**
     * Fetch users, optionally filtered by roles.
     * @param roles - Array of roles to filter by.
     * @returns List of users with normalized display names.
     */
    async getUsers(roles?: string[]): Promise<User[]> {
        const queryParams = roles ? `?roles=${roles.join(',')}` : ''
        const data = await api.get<any[]>(`${BASE_URL}${queryParams}`)
        return data.map((user: any) => ({
            ...user,
            displayName: user.display_name || user.displayName || user.name,
        }))
    },

    /**
     * Alias for getUsers to fetch all users.
     * @param roles - Optional role filter.
     * @returns List of users.
     */
    getAllUsers(roles?: string[]): Promise<User[]> {
        return this.getUsers(roles)
    },

    /**
     * Create a new local user with optional password.
     * @param data - User creation payload.
     * @returns Newly created user (without password_hash).
     */
    createUser(data: CreateUserDto): Promise<User> {
        return api.post<User>(BASE_URL, data)
    },

    /**
     * Update a user's profile fields (display name, department, etc.).
     * @param userId - User ID.
     * @param data - Fields to update.
     * @returns Updated user object.
     */
    updateUser(userId: string, data: UpdateUserDto): Promise<User> {
        return api.put<User>(`${BASE_URL}/${userId}`, data)
    },

    /**
     * Delete a user from the system.
     * @param userId - User ID to delete.
     */
    deleteUser(userId: string): Promise<void> {
        return api.delete<void>(`${BASE_URL}/${userId}`)
    },

    /**
     * Update the role of a specific user.
     * @param userId - User ID.
     * @param role - New role value.
     * @returns Updated user data.
     */
    updateUserRole(userId: string, role: string): Promise<any> {
        return api.put(`${BASE_URL}/${userId}/role`, { role })
    },

    /**
     * Update permissions for a specific user.
     * @param userId - User ID.
     * @param permissions - List of permission strings.
     */
    updateUserPermissions(userId: string, permissions: string[]): Promise<void> {
        return api.put<void>(`${BASE_URL}/${userId}/permissions`, { permissions })
    },

    /**
     * Fetch IP access history for all users.
     * @returns Map of user ID to IP history records.
     */
    getIpHistory(): Promise<IpHistoryMap> {
        return api.get<IpHistoryMap>(`${BASE_URL}/ip-history`)
    },

    /**
     * Fetch IP access history for a specific user.
     * @param userId - User ID.
     * @returns Array of IP history records for the user.
     */
    getUserIpHistory(userId: string): Promise<UserIpHistory[]> {
        return api.get<UserIpHistory[]>(`${BASE_URL}/${userId}/ip-history`)
    },

    /**
     * Fetch active sessions for a specific user.
     * @param userId - User ID.
     * @returns Array of active session records.
     */
    getUserSessions(userId: string): Promise<UserSession[]> {
        return api.get<UserSession[]>(`${BASE_URL}/${userId}/sessions`)
    },
}

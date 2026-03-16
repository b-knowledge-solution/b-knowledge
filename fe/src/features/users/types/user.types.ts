/**
 * @fileoverview Type definitions for the Users feature.
 * @module features/users/types/user.types
 */

/**
 * User IP history record from the backend.
 */
export interface UserIpHistory {
    /** Record ID */
    id: number
    /** User ID this record belongs to */
    user_id: string
    /** IP address used for access */
    ip_address: string
    /** ISO timestamp of last access from this IP */
    last_accessed_at: string
}

/**
 * Map of user ID to their IP history records.
 */
export type IpHistoryMap = Record<string, UserIpHistory[]>

/**
 * DTO for creating a new local user (admin only).
 */
export interface CreateUserDto {
    /** User email address (required, unique) */
    email: string
    /** Display name shown in the UI */
    display_name?: string
    /** Optional plain-text password (will be bcrypt-hashed on server) */
    password?: string
    /** User role; defaults to 'user' */
    role?: 'admin' | 'leader' | 'user'
    /** Department name */
    department?: string | null
    /** Job title */
    job_title?: string | null
    /** Mobile phone number */
    mobile_phone?: string | null
}

/**
 * DTO for updating an existing user's profile fields.
 * Does not include password or email (immutable after creation).
 */
export type UpdateUserDto = Pick<
    CreateUserDto,
    'display_name' | 'department' | 'job_title' | 'mobile_phone'
>

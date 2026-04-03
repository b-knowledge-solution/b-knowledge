/**
 * @fileoverview Socket.IO client for real-time WebSocket communication.
 * 
 * Provides singleton socket connection and utilities for:
 * - Connecting to backend WebSocket server
 * - Subscribing to notification events
 * - Managing connection lifecycle
 * 
 * @module lib/socket
 * @example
 * import { socket, subscribeToNotifications, connectSocket } from '@/lib/socket';
 * 
 * // Connect with user authentication
 * connectSocket({ email: 'user@example.com' });
 * 
 * // Subscribe to notifications
 * const unsubscribe = subscribeToNotifications((notification) => {
 *   console.log('Received:', notification);
 * });
 * 
 * // Cleanup on unmount
 * unsubscribe();
 */

import { io, Socket } from 'socket.io-client'
import { config } from '@/config'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Notification payload structure received from the server via WebSocket
 */
export interface NotificationPayload {
    type: string
    title?: string
    message: string
    data?: Record<string, unknown>
    timestamp: string
}

/**
 * @description Authentication options passed when connecting the socket
 */
export interface SocketAuthOptions {
    userId?: string
    email?: string
    token?: string
}

/**
 * @description Possible states of the WebSocket connection lifecycle
 */
export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// ============================================================================
// Socket Instance
// ============================================================================

/** Socket.IO client instance */
let socket: Socket | null = null
let connectionStatus: SocketStatus = 'disconnected'

/**
 * Get the WebSocket server URL from config.
 * Falls back to current origin if not configured.
 */
const getSocketUrl = (): string => {
    // Use API base URL or fallback to current origin
    const baseUrl = config.apiBaseUrl || window.location.origin
    return baseUrl
}

/**
 * @description Initializes and connects the Socket.IO client with authentication and automatic reconnection
 * @param {SocketAuthOptions} [auth] - Authentication options (email, userId, token)
 * @returns {Socket} Connected socket instance
 */
export const connectSocket = (auth?: SocketAuthOptions): Socket => {
    // Skip if already connected to avoid duplicate connections
    if (socket?.connected) {
        console.debug('[Socket] Already connected')
        return socket
    }

    const socketUrl = getSocketUrl()

    socket = io(socketUrl, {
        auth: auth || {},
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    })

    // Connection event handlers
    socket.on('connect', () => {
        connectionStatus = 'connected'
        console.debug('[Socket] Connected:', socket?.id)
    })

    socket.on('disconnect', (reason) => {
        connectionStatus = 'disconnected'
        console.debug('[Socket] Disconnected:', reason)
    })

    socket.on('connect_error', (error) => {
        connectionStatus = 'error'
        console.error('[Socket] Connection error:', error.message)
    })

    socket.on('reconnect', (attempt) => {
        connectionStatus = 'connected'
        console.debug('[Socket] Reconnected after', attempt, 'attempts')
    })

    socket.on('reconnect_attempt', () => {
        connectionStatus = 'connecting'
        console.debug('[Socket] Attempting to reconnect...')
    })

    socket.on('pong', (data: { timestamp: string }) => {
        console.debug('[Socket] Pong received:', data.timestamp)
    })

    socket.on('server:shutdown', () => {
        console.warn('[Socket] Server is shutting down')
    })

    connectionStatus = 'connecting'
    return socket
}

/**
 * @description Disconnects and destroys the socket instance, resetting connection state
 */
export const disconnectSocket = (): void => {
    if (socket) {
        socket.disconnect()
        socket = null
        connectionStatus = 'disconnected'
        console.debug('[Socket] Manually disconnected')
    }
}

/**
 * @description Returns the current socket instance for direct event subscription
 * @returns {Socket | null} Socket instance or null if not initialized
 */
export const getSocket = (): Socket | null => socket

/**
 * @description Returns the current WebSocket connection status
 * @returns {SocketStatus} Current connection status
 */
export const getSocketStatus = (): SocketStatus => connectionStatus

/**
 * @description Checks whether the socket is currently in a connected state
 * @returns {boolean} True if the socket exists and is connected
 */
export const isSocketConnected = (): boolean => socket?.connected ?? false

// ============================================================================
// Notification Subscriptions
// ============================================================================

/**
 * @description Subscribes to server notification events on the socket
 * @param {(notification: NotificationPayload) => void} callback - Handler invoked when a notification arrives
 * @returns {() => void} Cleanup function to unsubscribe from notifications
 */
export const subscribeToNotifications = (
    callback: (notification: NotificationPayload) => void
): (() => void) => {
    // Guard: warn and return no-op if socket is not initialized
    if (!socket) {
        console.warn('[Socket] Not connected. Call connectSocket() first.')
        return () => { }
    }

    socket.on('notification', callback)

    return () => {
        socket?.off('notification', callback)
    }
}

/**
 * @description Joins a specific socket room for targeted event broadcasting
 * @param {string} room - Room name to join
 */
export const subscribeToRoom = (room: string): void => {
    if (!socket) {
        console.warn('[Socket] Not connected. Call connectSocket() first.')
        return
    }
    socket.emit('subscribe', room)
}

/**
 * @description Leaves a specific socket room to stop receiving targeted events
 * @param {string} room - Room name to leave
 */
export const unsubscribeFromRoom = (room: string): void => {
    if (!socket) return
    socket.emit('unsubscribe', room)
}

/**
 * @description Sends a ping event to verify the socket connection is alive
 */
export const sendPing = (): void => {
    if (!socket) return
    socket.emit('ping')
}

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * @description Subscribes to any named socket event with automatic type inference
 * @template T - Expected event payload type
 * @param {string} event - Socket event name to listen for
 * @param {(data: T) => void} callback - Handler invoked with the event payload
 * @returns {() => void} Cleanup function to remove the listener
 */
export const onSocketEvent = <T = unknown>(
    event: string,
    callback: (data: T) => void
): (() => void) => {
    if (!socket) {
        console.warn('[Socket] Not connected. Call connectSocket() first.')
        return () => { }
    }

    socket.on(event, callback)

    return () => {
        socket?.off(event, callback)
    }
}

/**
 * @description Emits a named event to the server with an optional payload
 * @template T - Event payload type
 * @param {string} event - Socket event name to emit
 * @param {T} [data] - Optional event payload
 */
export const emitSocketEvent = <T = unknown>(event: string, data?: T): void => {
    if (!socket) {
        console.warn('[Socket] Not connected. Call connectSocket() first.')
        return
    }
    socket.emit(event, data)
}

// Export socket instance for direct access if needed
export { socket }

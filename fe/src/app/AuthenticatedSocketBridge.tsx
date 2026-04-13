/**
 * @fileoverview Authenticated socket lifecycle bridge for the root provider tree.
 *
 * Connects the shared Socket.IO client when an authenticated session exists,
 * mounts the query invalidation bridge against that live socket, and tears the
 * socket down on logout or unmount.
 *
 * @module app/AuthenticatedSocketBridge
 */

import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth'
import { useSocketQueryInvalidation } from '@/hooks/useSocket'
import { connectSocket, disconnectSocket } from '@/lib/socket'

/**
 * @description Renders nothing and exists only to bind socket events to
 * TanStack Query invalidation once a socket connection is available.
 * @returns {null} No visual output.
 */
function SocketQueryBridge() {
  useSocketQueryInvalidation()
  return null
}

/**
 * @description Establishes the authenticated socket lifecycle and mounts the
 * query invalidation bridge only after a socket instance exists.
 * @returns {JSX.Element | null} Socket invalidation bridge for authenticated sessions.
 */
export function AuthenticatedSocketBridge() {
  const { user } = useAuth()
  const [socketBridgeKey, setSocketBridgeKey] = useState<string | null>(null)

  useEffect(() => {
    // Tear down any existing socket as soon as the session disappears.
    if (!user) {
      setSocketBridgeKey(null)
      disconnectSocket()
      return
    }

    // Connect once the authenticated session is available, then mount the
    // invalidation bridge against that socket instance.
    connectSocket({
      userId: user.id,
      email: user.email,
    })
    setSocketBridgeKey(user.id)

    return () => {
      setSocketBridgeKey(null)
      disconnectSocket()
    }
  }, [user])

  if (!socketBridgeKey) {
    return null
  }

  return <SocketQueryBridge key={socketBridgeKey} />
}


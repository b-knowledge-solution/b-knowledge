/**
 * @fileoverview Admin-only route wrapper component.
 *
 * Restricts access to routes that require admin-level access.
 * Redirects unauthorized users to 403 Forbidden page.
 *
 * Phase 4: migrated from role-string comparison to catalog permission key.
 * Gates on PERMISSION_KEYS.SYSTEM_VIEW (seeded to admin + super-admin in Phase 3 P3.5).
 * If a more specific admin-panel permission is added later, update this gate.
 *
 * @module features/auth/components/AdminRoute
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useHasPermission } from '@/lib/permissions';
import { PERMISSION_KEYS } from '@/constants/permission-keys';

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for AdminRoute component
 */
interface AdminRouteProps {
    /** Child components to render for authorized users */
    children: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Route wrapper that restricts access to users with the SYSTEM_VIEW
 *   catalog permission (seeded to admin + super-admin in Phase 3 P3.5).
 *   Checks the user's effective permissions and redirects if access is denied.
 *
 * @param {AdminRouteProps} props - Component properties.
 * @returns {JSX.Element | null} The child components if allowed, or a redirect.
 */
const AdminRoute = ({ children }: AdminRouteProps) => {
    const { user, isLoading } = useAuth();
    // Phase 4: gate on catalog key instead of comparing role strings.
    const allowed = useHasPermission(PERMISSION_KEYS.SYSTEM_VIEW);

    // Do nothing while authentication state is being determined
    if (isLoading) {
        return null;
    }

    // Redirect unauthenticated users or users without the required permission
    if (!user || !allowed) {
        return <Navigate to="/403" replace />;
    }

    // Render the protected children when the permission check passes
    return <>{children}</>;
};

export default AdminRoute;

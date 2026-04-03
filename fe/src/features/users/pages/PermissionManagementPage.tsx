/**
 * @fileoverview Permission reference page.
 * Displays a static matrix of permissions per role (Admin, Leader, Member).
 */
import { useTranslation } from 'react-i18next';
import { Check, X, Shield, Users, User, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

/**
 * Defines a permission row in the matrix.
 */
interface PermissionMatrixItem {
    /** Permission name */
    permission: string;
    /** Detailed description */
    description: string;
    /** Whether Admin has this permission */
    admin: boolean;
    /** Whether Leader has this permission */
    leader: boolean;
    /** Whether Member has this permission */
    user: boolean;
}

/**
 * Permission Management Page.
 * Currently a read-only view explaining the role-based access control (RBAC) model.
 */
export default function PermissionManagementPage() {
    const { t } = useTranslation();

    const permissions: PermissionMatrixItem[] = [
        {
            permission: 'AI Chat Access',
            description: t('iam.permissions.chatDesc', 'Access to AI Chat interface'),
            admin: true,
            leader: true,
            user: true
        },
        {
            permission: 'AI Search Access',
            description: t('iam.permissions.searchDesc', 'Access to AI Search interface'),
            admin: true,
            leader: true,
            user: true
        },
        {
            permission: 'Select Sources',
            description: t('iam.permissions.sourceDesc', 'Ability to choose different Chat/Search sources'),
            admin: true,
            leader: true,
            user: false
        },
        {
            permission: 'Storage: Read',
            description: t('iam.permissions.storageReadDesc', 'View and download files'),
            admin: true,
            leader: true,
            user: false
        },
        {
            permission: 'Storage: Write',
            description: t('iam.permissions.storageWriteDesc', 'Upload, delete, and manage files/folders'),
            admin: true,
            leader: true,
            user: false
        },
        {
            permission: 'User Management',
            description: t('iam.permissions.userManageDesc', 'Add/Remove users, manage teams'),
            admin: true,
            leader: true,
            user: false
        },
        {
            permission: 'System Config',
            description: t('iam.permissions.sysConfigDesc', 'Configure system settings and API connections'),
            admin: true,
            leader: false,
            user: false
        }
    ];

    const renderCheckOrX = (value: boolean) => (
        <div className="flex justify-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${value ? 'bg-green-100 dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {value ? (
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                    <X className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                )}
            </div>
        </div>
    );

    return (
        <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
            <div className="flex items-center gap-3 mb-6 shrink-0">
                <Shield className="w-8 h-8 text-primary dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    {t('iam.permissions.title', 'Permission Management')}
                </h2>
            </div>

            <Card className="flex-1 min-h-0 overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                <CardContent className="p-0 h-full flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700 shrink-0">
                        <p className="text-slate-600 dark:text-slate-400 block mb-4">
                            {t('iam.permissions.description', 'View and understand the permission levels for different roles in the system. Roles are assigned at the team level.')}
                        </p>

                        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium">{t('iam.permissions.noteTitle', 'Role Assignment Note')}</p>
                                <p className="mt-1">{t('iam.permissions.noteBody', 'Permissions are predefined and cannot be customized per user. To change a user\'s access level, assign them a different role (Member or Leader) within their team.')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('iam.permissions.feature', 'Feature / Permission')}</TableHead>
                                    <TableHead className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <User className="w-5 h-5 text-slate-500" />
                                            <span>{t('iam.roles.user', 'Member')}</span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <Users className="w-5 h-5 text-blue-500" />
                                            <span>{t('iam.roles.leader', 'Leader')}</span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <Shield className="w-5 h-5 text-purple-500" />
                                            <span>{t('iam.roles.admin', 'Admin')}</span>
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {permissions.map((item) => (
                                    <TableRow key={item.permission}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-slate-800 dark:text-slate-200">{item.permission}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{renderCheckOrX(item.user)}</TableCell>
                                        <TableCell>{renderCheckOrX(item.leader)}</TableCell>
                                        <TableCell>{renderCheckOrX(item.admin)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

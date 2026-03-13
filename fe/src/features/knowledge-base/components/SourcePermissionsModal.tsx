import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Lock, Users, User, Trash2, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AccessControl, KnowledgeBaseSource } from '../api/knowledgeBaseApi';
import { teamApi, type Team } from '@/features/teams';
import { userApi } from '@/features/users';
import { User as UserType } from '@/features/auth';

export interface PermissionsSelectorProps {
  /** Whether the source is public */
  isPublic: boolean;
  /** Callback to update public state */
  setIsPublic: (value: boolean) => void;
  /** Team IDs with access */
  selectedTeamIds?: string[];
  /** Callback to update team IDs */
  setSelectedTeamIds?: (value: string[]) => void;
  /** User IDs with access */
  selectedUserIds?: string[];
  /** Callback to update user IDs */
  setSelectedUserIds?: (value: string[]) => void;
  /** List of available teams */
  teams?: Team[];
  /** List of available users */
  users?: UserType[];
  /** Loading state for data */
  isLoading?: boolean;
  /** Disable editing */
  disabled?: boolean;
}

/**
 * PermissionsSelector - Inline component for selecting permissions in forms.
 *
 * @param {PermissionsSelectorProps} props - Component props including selection state and data.
 * @returns {React.ReactElement} React component for selecting public/private access and specific ACLs.
 */
export const PermissionsSelector: React.FC<PermissionsSelectorProps> = ({
  isPublic,
  setIsPublic,
  selectedTeamIds = [],
  setSelectedTeamIds,
  selectedUserIds = [],
  setSelectedUserIds,
  teams = [],
  users = [],
  isLoading = false,
  disabled = false
}) => {
  const { t } = useTranslation();

  // Search filters for teams and users
  const [teamSearch, setTeamSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Filter available items by search
  const filteredTeams = teams.filter(team =>
    team.name.toLowerCase().includes(teamSearch.toLowerCase())
  );
  const filteredUsers = users.filter(user =>
    `${user.displayName} ${user.email}`.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Filter selected entities to display in tables
  const selectedTeams = teams.filter(team => selectedTeamIds.includes(team.id));
  const selectedUsers = users.filter(user => selectedUserIds.includes(user.id));

  const toggleTeam = (teamId: string) => {
    if (!setSelectedTeamIds) return;
    if (selectedTeamIds.includes(teamId)) {
      setSelectedTeamIds(selectedTeamIds.filter(id => id !== teamId));
    } else {
      setSelectedTeamIds([...selectedTeamIds, teamId]);
    }
  };

  const toggleUser = (userId: string) => {
    if (!setSelectedUserIds) return;
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col min-h-0">
      {/* Section Header */}
      <div className="flex items-center gap-2 shrink-0">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('common.permissions') || 'Permissions'}
        </h4>
      </div>

      {/* Public/Private Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 shrink-0">
        <div className="flex items-center gap-3">
          {isPublic ? (
            <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          )}
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {isPublic
                ? (t('knowledgeBaseConfig.publicAccess') || 'Public Access')
                : (t('knowledgeBaseConfig.privateAccess') || 'Private Access')
              }
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isPublic
                ? (t('knowledgeBaseConfig.publicAccessDesc') || 'All authenticated users can access this source')
                : (t('knowledgeBaseConfig.privateAccessDesc') || 'Only selected teams or users can access this source')
              }
            </p>
          </div>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={setIsPublic}
          disabled={disabled}
        />
      </div>

      {/* Private Access Detail Selectors */}
      {!isPublic && (
        <div className="space-y-6 flex-1 min-h-0 overflow-y-auto pr-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Team Selection Section */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Users size={14} />
                {t('knowledgeBaseConfig.selectTeams') || 'Select Teams'}
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t('knowledgeBaseConfig.selectTeamsPlaceholder') || 'Search teams...'}
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                  disabled={disabled || isLoading}
                />
              </div>
              {/* Scrollable checkbox list */}
              <div className="max-h-40 overflow-y-auto border rounded-md border-gray-200 dark:border-slate-600">
                {isLoading ? (
                  <div className="p-3 text-center text-sm text-gray-400">Loading...</div>
                ) : filteredTeams.length === 0 ? (
                  <div className="p-3 text-center text-sm text-gray-400">
                    {teams.length === 0 ? 'No teams available' : 'No matches'}
                  </div>
                ) : filteredTeams.map(team => (
                  <label
                    key={team.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      disabled={disabled}
                      className="rounded"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{team.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Selected Teams Table */}
            {selectedTeams.length > 0 && (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t('common.name') || 'Name'}</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTeams.map(team => (
                      <TableRow key={team.id}>
                        <TableCell className="text-xs">{team.name}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => setSelectedTeamIds?.(selectedTeamIds.filter(id => id !== team.id))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* User Selection Section */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <User size={14} />
                {t('knowledgeBaseConfig.selectUsers') || 'Select Users'}
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t('knowledgeBaseConfig.selectUsersPlaceholder') || 'Search users...'}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                  disabled={disabled || isLoading}
                />
              </div>
              {/* Scrollable checkbox list */}
              <div className="max-h-40 overflow-y-auto border rounded-md border-gray-200 dark:border-slate-600">
                {isLoading ? (
                  <div className="p-3 text-center text-sm text-gray-400">Loading...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-3 text-center text-sm text-gray-400">
                    {users.length === 0 ? 'No users available' : 'No matches'}
                  </div>
                ) : filteredUsers.map(user => (
                  <label
                    key={user.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                      disabled={disabled}
                      className="rounded"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{user.displayName} ({user.email})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Selected Users Table */}
            {selectedUsers.length > 0 && (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t('common.name') || 'Name'}</TableHead>
                      <TableHead className="text-xs">{t('common.email') || 'Email'}</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="text-xs">{user.displayName}</TableCell>
                        <TableCell className="text-xs text-gray-500 dark:text-gray-400">{user.email}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => setSelectedUserIds?.(selectedUserIds.filter(id => id !== user.id))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Note about System Defaults */}
      <p className="text-xs text-orange-500 dark:text-orange-400 shrink-0">
        {t('knowledgeBaseConfig.publicOnlyNote') || 'Only public sources can be set as system defaults.'}
      </p>
    </div>
  );
};

export interface SourcePermissionsModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Source to edit permissions for */
  source: KnowledgeBaseSource | null;
  /** Callback to save permissions */
  onSave: (id: string, permissions: AccessControl) => void;
}

/**
 * SourcePermissionsModal - Standalone modal for editing source permissions.
 *
 * @param {SourcePermissionsModalProps} props - Component props including open state and callbacks.
 * @returns {React.ReactElement | null} Modal dialog for editing source permissions or null if not open.
 */
export const SourcePermissionsModal: React.FC<SourcePermissionsModalProps> = ({
  open,
  onClose,
  source,
  onSave
}) => {
  const { t } = useTranslation();

  // Local state for permissions
  const [isPublic, setIsPublic] = useState(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // State for teams and users lists
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Sync state when source changes
  useEffect(() => {
    if (source?.access_control) {
      setIsPublic(source.access_control.public);
      setSelectedTeamIds(source.access_control.team_ids || []);
      setSelectedUserIds(source.access_control.user_ids || []);
    } else {
      // Default to public if no access control
      setIsPublic(true);
      setSelectedTeamIds([]);
      setSelectedUserIds([]);
    }
  }, [source]);

  // Fetch teams and users when modal opens or becomes private
  useEffect(() => {
    if (open && !isPublic && teams.length === 0 && users.length === 0) {
      const fetchData = async () => {
        setIsLoadingData(true);
        try {
          const [teamsList, usersList] = await Promise.all([
            teamApi.getTeams(),
            userApi.getUsers()
          ]);
          setTeams(teamsList);
          setUsers(usersList);
        } catch (error) {
          console.error('[SourcePermissionsModal] Failed to fetch teams/users:', error);
        } finally {
          setIsLoadingData(false);
        }
      };
      fetchData();
    }
  }, [open, isPublic, teams.length, users.length]);

  /**
   * Handle save button click.
   */
  const handleSave = () => {
    if (!source?.id) return;

    const accessControl: AccessControl = {
      public: isPublic,
      team_ids: isPublic ? [] : selectedTeamIds,
      user_ids: isPublic ? [] : selectedUserIds,
    };

    onSave(source.id, accessControl);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[40vw]">
        <DialogHeader>
          <DialogTitle>{t('knowledgeBaseConfig.editPermissions') || 'Edit Permissions'}</DialogTitle>
        </DialogHeader>
      <div className="space-y-6">
        {/* Source Info */}
        {source && (
          <div className="p-3 bg-gray-100 dark:bg-slate-800 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-gray-100">{source.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{source.url}</p>
          </div>
        )}

        {/* Permissions Selector */}
        <PermissionsSelector
          isPublic={isPublic}
          setIsPublic={setIsPublic}
          selectedTeamIds={selectedTeamIds}
          setSelectedTeamIds={setSelectedTeamIds}
          selectedUserIds={selectedUserIds}
          setSelectedUserIds={setSelectedUserIds}
          teams={teams}
          users={users}
          isLoading={isLoadingData}
        />

        {/* Actions */}
        <DialogFooter className="pt-4 border-t dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button onClick={handleSave}>
            {t('common.save') || 'Save'}
          </Button>
        </DialogFooter>
      </div>
      </DialogContent>
    </Dialog>
  );
};

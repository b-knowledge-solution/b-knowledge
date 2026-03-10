/**
 * @fileoverview Sidebar navigation component.
 *
 * Renders the collapsible sidebar with:
 * - Role-based navigation links
 * - Expandable sub-menus
 * - User profile section
 * - Settings and logout actions
 *
 * @module layouts/Sidebar
 */

import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, User } from '@/features/auth';
import { useSettings } from '@/app/contexts/SettingsContext';
import { useNavigation } from '@/components/NavigationLoader';
import { config } from '@/config';
import {
  MessageSquare,
  Search,
  Settings,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Users,
  Server,
  ClipboardList,
  FileCode,
  Settings2,
  Activity,
  Shield,
  ChevronDown,
  User as UserIcon,
  UserCog,
  Megaphone,
  History,
  BarChart3,
  Database,
} from 'lucide-react';
import logo from '@/assets/logo.png';
import logoDark from '@/assets/logo-dark.png';

// ============================================================================
// Sub-components
// ============================================================================

/**
 * User avatar component with image or initials fallback.
 */
function UserAvatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.displayName}
        className={`${sizeClasses} rounded-full object-cover`}
      />
    );
  }

  const initials = user.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`${sizeClasses} rounded-full bg-slate-600 dark:bg-slate-700 flex items-center justify-center text-white font-medium`}>
      {initials}
    </div>
  );
}

// ============================================================================
// Sidebar Component
// ============================================================================

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isIamExpanded, setIsIamExpanded] = useState(false);
  const [isAdministratorsExpanded, setIsAdministratorsExpanded] = useState(false);
  const [isKnowledgeBaseExpanded, setIsKnowledgeBaseExpanded] = useState(false);

  const { user } = useAuth();
  const { openSettings, resolvedTheme } = useSettings();
  const { startNavigation } = useNavigation();

  const handleNavClick = (targetPath: string) => (_e: React.MouseEvent) => {
    if (location.pathname !== targetPath) {
      startNavigation();
    }
  };

  const logoSrc = resolvedTheme === 'dark' ? logoDark : logo;

  // Auto-expand parent menus when their children are active
  const isKnowledgeBaseActive = ['/knowledge-base/config', '/knowledge-base/glossary', '/datasets'].includes(location.pathname) || location.pathname.startsWith('/datasets/');
  const isIamActive = ['/iam/users', '/iam/teams'].includes(location.pathname);
  const isAdministratorsActive = ['/admin/audit-log', '/admin/system-tools', '/admin/system-monitor', '/admin/tokenizer', '/admin/broadcast-messages', '/admin/histories', '/admin/dashboard', '/admin/chat-dialogs', '/admin/search-apps'].includes(location.pathname);
  const isChatActive = ['/chat', '/chat/history'].includes(location.pathname);
  const isSearchActive = ['/search', '/search/history'].includes(location.pathname);

  const shouldExpandKnowledgeBase = isKnowledgeBaseExpanded || isKnowledgeBaseActive;
  const shouldExpandIam = isIamExpanded || isIamActive;
  const shouldExpandAdministrators = isAdministratorsExpanded || isAdministratorsActive;
  const shouldExpandChat = isChatActive;
  const shouldExpandSearch = isSearchActive;

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-sidebar-bg dark:bg-slate-950 text-sidebar-text flex flex-col transition-all duration-300`}>
      {/* Logo / Collapse toggle */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-white/10 ${resolvedTheme === 'dark' ? '' : 'bg-white'}`}>
        {!isCollapsed && (
          <div className="flex items-center justify-start w-full transition-all duration-300">
            <img src={logoSrc} alt="Knowledge Base" className="w-48 object-contain object-left" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 rounded-lg transition-colors ml-2 flex-shrink-0 ${resolvedTheme === 'dark' ? 'hover:bg-white/10 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
          title={isCollapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2 flex-1 mt-4 overflow-y-auto scrollbar-hide px-2">
        {/* Chat */}
        {config.features.enableAiChat && (
          <div className="flex flex-col gap-1">
            <NavLink
              to="/chat"
              onClick={handleNavClick('/chat')}
              className={({ isActive }: { isActive: boolean }) => `sidebar-link w-full ${isActive && !location.pathname.includes('history') ? 'active' : ''} ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={t('nav.aiChat')}
            >
              <MessageSquare size={20} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">{t('nav.aiChat')}</span>
                  {shouldExpandChat ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </>
              )}
            </NavLink>
            {(!isCollapsed && shouldExpandChat) && config.features.enableHistory && (
              <div className="pl-4 flex flex-col gap-1">
                <NavLink to="/chat/history" onClick={handleNavClick('/chat/history')} className={({ isActive }: { isActive: boolean }) => `sidebar-link text-sm ${isActive ? 'active' : ''}`} title={t('nav.chatHistory')}>
                  <History size={16} />
                  <span>{t('nav.chatHistory')}</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        {config.features.enableAiSearch && (
          <div className="flex flex-col gap-1">
            <NavLink
              to="/search"
              onClick={handleNavClick('/search')}
              className={({ isActive }: { isActive: boolean }) => `sidebar-link w-full ${isActive && !location.pathname.includes('history') ? 'active' : ''} ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={t('nav.aiSearch')}
            >
              <Search size={20} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">{t('nav.aiSearch')}</span>
                  {shouldExpandSearch ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </>
              )}
            </NavLink>
            {(!isCollapsed && shouldExpandSearch) && config.features.enableHistory && (
              <div className="pl-4 flex flex-col gap-1">
                <NavLink to="/search/history" onClick={handleNavClick('/search/history')} className={({ isActive }: { isActive: boolean }) => `sidebar-link text-sm ${isActive ? 'active' : ''}`} title={t('nav.searchHistory')}>
                  <ClipboardList size={16} />
                  <span>{t('nav.searchHistory')}</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* Knowledge Base (admin/leader) */}
        {(user?.role === 'admin' || user?.role === 'leader') && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setIsKnowledgeBaseExpanded(!isKnowledgeBaseExpanded)}
              className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={t('nav.knowledgeBase')}
            >
              <BookOpen size={20} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">{t('nav.knowledgeBase')}</span>
                  {shouldExpandKnowledgeBase ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </>
              )}
            </button>
            {(!isCollapsed && shouldExpandKnowledgeBase) && (
              <div className="pl-4 flex flex-col gap-1">
                {user?.role === 'admin' && (
                  <NavLink to="/knowledge-base/config" onClick={handleNavClick('/knowledge-base/config')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('knowledgeBaseConfig.title')}>
                    <Settings2 size={18} />
                    <span>{t('knowledgeBaseConfig.title')}</span>
                  </NavLink>
                )}
                <NavLink to="/knowledge-base/glossary" onClick={handleNavClick('/knowledge-base/glossary')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.glossary')}>
                  <BookOpen size={18} />
                  <span>{t('nav.glossary')}</span>
                </NavLink>
                <NavLink to="/datasets" onClick={handleNavClick('/datasets')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.datasets')}>
                  <Database size={18} />
                  <span>{t('nav.datasets')}</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* IAM (admin) */}
        {user?.role === 'admin' && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setIsIamExpanded(!isIamExpanded)}
              className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={t('nav.iam')}
            >
              <UserCog size={20} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">{t('nav.iam')}</span>
                  {shouldExpandIam ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </>
              )}
            </button>
            {(!isCollapsed && shouldExpandIam) && (
              <div className="pl-4 flex flex-col gap-1">
                <NavLink to="/iam/users" onClick={handleNavClick('/iam/users')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.userManagement')}>
                  <UserIcon size={18} />
                  <span>{t('nav.userManagement')}</span>
                </NavLink>
                <NavLink to="/iam/teams" onClick={handleNavClick('/iam/teams')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.teamManagement')}>
                  <Users size={18} />
                  <span>{t('nav.teamManagement')}</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* Administration (admin) */}
        {user?.role === 'admin' && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setIsAdministratorsExpanded(!isAdministratorsExpanded)}
              className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={t('nav.administrators')}
            >
              <Shield size={20} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">{t('nav.administrators')}</span>
                  {shouldExpandAdministrators ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </>
              )}
            </button>
            {(!isCollapsed && shouldExpandAdministrators) && (
              <div className="pl-4 flex flex-col gap-1">
                <NavLink to="/admin/dashboard" onClick={handleNavClick('/admin/dashboard')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.dashboard')}>
                  <BarChart3 size={18} />
                  <span>{t('nav.dashboard')}</span>
                </NavLink>
                <NavLink to="/admin/chat-dialogs" onClick={handleNavClick('/admin/chat-dialogs')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.chatAssistants')}>
                  <MessageSquare size={18} />
                  <span>{t('nav.chatAssistants')}</span>
                </NavLink>
                <NavLink to="/admin/search-apps" onClick={handleNavClick('/admin/search-apps')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.searchApps')}>
                  <Search size={18} />
                  <span>{t('nav.searchApps')}</span>
                </NavLink>
                <NavLink to="/admin/audit-log" onClick={handleNavClick('/admin/audit-log')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.auditLog')}>
                  <ClipboardList size={18} />
                  <span>{t('nav.auditLog')}</span>
                </NavLink>
                <NavLink to="/admin/system-tools" onClick={handleNavClick('/admin/system-tools')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.systemTools')}>
                  <Server size={18} />
                  <span>{t('nav.systemTools')}</span>
                </NavLink>
                <NavLink to="/admin/system-monitor" onClick={handleNavClick('/admin/system-monitor')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.systemMonitor')}>
                  <Activity size={18} />
                  <span>{t('nav.systemMonitor')}</span>
                </NavLink>
                <NavLink to="/admin/tokenizer" onClick={handleNavClick('/admin/tokenizer')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.tokenizer')}>
                  <FileCode size={18} />
                  <span>{t('nav.tokenizer')}</span>
                </NavLink>
                <NavLink to="/admin/broadcast-messages" onClick={handleNavClick('/admin/broadcast-messages')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.broadcastMessages')}>
                  <Megaphone size={18} />
                  <span>{t('nav.broadcastMessages')}</span>
                </NavLink>
                <NavLink to="/admin/histories" onClick={handleNavClick('/admin/histories')} className={({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`} title={t('nav.histories')}>
                  <History size={18} />
                  <span>{t('nav.histories')}</span>
                </NavLink>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User profile / Settings / Logout */}
      <div className={`mt-auto pt-4 border-t border-white/10 space-y-3 pb-4 ${resolvedTheme === 'dark' ? '' : 'bg-white'}`}>
        {user && (
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'}`} title={isCollapsed ? user.displayName : undefined}>
            <UserAvatar user={user} size={isCollapsed ? 'sm' : 'md'} />
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{user.displayName}</div>
                <div className={`text-xs truncate ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</div>
              </div>
            )}
          </div>
        )}
        <button onClick={openSettings} className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''} ${resolvedTheme === 'dark' ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} title={t('common.settings')}>
          <Settings size={20} />
          {!isCollapsed && <span>{t('common.settings')}</span>}
        </button>
        <Link to="/logout" className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''} ${resolvedTheme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`} title={t('nav.signOut')}>
          <LogOut size={20} />
          {!isCollapsed && <span>{t('nav.signOut')}</span>}
        </Link>
      </div>
    </aside>
  );
}

export default Sidebar;

/**
 * @fileoverview Individual team card component.
 * @module features/teams/components/TeamCard
 */
import { useTranslation } from 'react-i18next'
import { Edit, Trash2, Users } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Team } from '../types/team.types'

interface TeamCardProps {
    /** Team data */
    team: Team
    /** Open edit dialog */
    onEdit: (team: Team) => void
    /** Delete team */
    onDelete: (id: string) => void
    /** Open members dialog */
    onManageMembers: (team: Team) => void
}

/**
 * @description Card displaying a single team with leader info and action buttons.
 * @param props - Team data and action handlers.
 * @returns Card element.
 */
export function TeamCard({ team, onEdit, onDelete, onManageMembers }: TeamCardProps) {
    const { t } = useTranslation()

    return (
        <Card className="dark:bg-slate-800 dark:border-slate-700 shadow-sm flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                        <span className="text-lg font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">{team.name}</span>
                        {team.project_name && (
                            <Badge variant="info" className="w-fit mt-1">
                                {team.project_name}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onEdit(team)}
                                    >
                                        <Edit size={18} className="text-slate-400" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('iam.teams.edit')}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => onDelete(team.id)}
                                    >
                                        <Trash2 size={18} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('common.delete')}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 pb-3">
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                    {team.description || t('common.noDescription')}
                </p>

                {/* Leader Info */}
                {team.leader ? (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-purple-500 text-white text-sm">
                                {team.leader.display_name?.charAt(0)?.toUpperCase() || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-purple-700 dark:text-purple-300 truncate">
                                {team.leader.display_name || 'Leader'}
                            </div>
                            <div className="text-xs text-purple-500 dark:text-purple-400 truncate">
                                {team.leader.email}
                            </div>
                        </div>
                        <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            {t('iam.teams.leader')}
                        </Badge>
                    </div>
                ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 italic">
                        {t('iam.teams.leader')}: -
                    </div>
                )}
            </CardContent>

            <CardFooter className="border-t border-slate-200 dark:border-slate-700 p-0">
                <button
                    onClick={() => onManageMembers(team)}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-3"
                >
                    <Users size={16} />
                    {t('iam.teams.members')} ({team.member_count || 0})
                </button>
            </CardFooter>
        </Card>
    )
}

/**
 * @fileoverview Create/Edit team dialog component.
 * @module features/teams/components/TeamFormDialog
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Team, CreateTeamDTO } from '../types/team.types'

interface TeamFormDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
    /** Team to edit (null = create mode) */
    team: Team | null
    /** Callback on successful save */
    onSave: (data: CreateTeamDTO) => Promise<boolean>
}

/**
 * @description Combined create/edit team dialog with name, project name, and description fields.
 * @param props - Dialog state, team to edit, and save callback.
 * @returns Dialog element.
 */
export function TeamFormDialog({ open, onClose, team, onSave }: TeamFormDialogProps) {
    const { t } = useTranslation()
    const [formData, setFormData] = useState({ name: '', project_name: '', description: '' })

    // Populate form when editing, reset when creating
    useEffect(() => {
        if (team) {
            setFormData({
                name: team.name,
                project_name: team.project_name || '',
                description: team.description || '',
            })
        } else {
            setFormData({ name: '', project_name: '', description: '' })
        }
    }, [team, open])

    /** Handle save: call onSave and close on success */
    const handleSave = async () => {
        const success = await onSave(formData)
        if (success) onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{team ? t('iam.teams.edit') : t('iam.teams.create')}</DialogTitle>
                </DialogHeader>
            <div className="space-y-4 py-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('iam.teams.name')}
                    </label>
                    <Input
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                        placeholder={t('iam.teams.name')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('iam.teams.projectName')}
                    </label>
                    <Input
                        value={formData.project_name}
                        onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                        className="dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                        placeholder={t('iam.teams.projectName')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('iam.teams.formDescription')}
                    </label>
                    <textarea
                        rows={4}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                        placeholder={t('iam.teams.formDescription')}
                    />
                </div>
            </div>
                <DialogFooter>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleSave}>
                            {t('common.save')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * @fileoverview Date range filter dialog for history pages.
 * @module features/history/components/FilterDialog
 */
import { useTranslation } from 'react-i18next'
import { DatePicker } from '@/components/ui/date-picker'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { FilterState } from '../api/historyService'

/**
 * Props for the FilterDialog component.
 */
interface FilterDialogProps {
    /** Whether the dialog is open. */
    open: boolean
    /** Callback to close the dialog. */
    onClose: () => void
    /** Temporary filter values being edited. */
    tempFilters: FilterState
    /** Update temporary filter values. */
    setTempFilters: (filters: FilterState) => void
    /** Apply the current temporary filters. */
    onApply: () => void
    /** Reset all filters and close. */
    onReset: () => void
    /** Accent color class for the apply button. */
    accentClass?: string
}

/**
 * Reusable date range filter dialog.
 * @param props - Component props.
 * @returns Rendered filter dialog.
 */
export const FilterDialog = ({
    open,
    onClose,
    tempFilters,
    setTempFilters,
    onApply,
    onReset,
    accentClass = 'bg-primary shadow-primary/25 hover:shadow-primary/40',
}: FilterDialogProps) => {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('userHistory.filterTitle')}</DialogTitle>
                </DialogHeader>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('common.startDate')}</label>
                        <DatePicker
                            value={tempFilters.startDate ? new Date(tempFilters.startDate) : undefined}
                            onChange={(date) => setTempFilters({ ...tempFilters, startDate: date ? date.toISOString().split('T')[0] ?? '' : '' })}
                            placeholder={t('common.startDate')}
                            disabledDates={(d) => tempFilters.endDate ? d > new Date(tempFilters.endDate) : false}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('common.endDate')}</label>
                        <DatePicker
                            value={tempFilters.endDate ? new Date(tempFilters.endDate) : undefined}
                            onChange={(date) => setTempFilters({ ...tempFilters, endDate: date ? date.toISOString().split('T')[0] ?? '' : '' })}
                            placeholder={t('common.endDate')}
                            disabledDates={(d) => tempFilters.startDate ? d < new Date(tempFilters.startDate) : false}
                        />
                    </div>
                </div>
            </div>
                <DialogFooter className="w-full">
                    <div className="flex justify-end gap-3 w-full">
                        <button
                            onClick={() => { onClose(); onReset() }}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                        >
                            {t('common.reset')}
                        </button>
                        <button
                            onClick={onApply}
                            className={`px-6 py-2 rounded-xl text-white text-sm font-bold shadow-lg hover:-translate-y-0.5 transition-all ${accentClass}`}
                        >
                            {t('userHistory.applyFilter')}
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

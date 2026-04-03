/**
 * @fileoverview Admin filter dialog with email, source name, date range, and feedback filters.
 * @module features/histories/components/AdminFilterDialog
 */
import { useTranslation } from 'react-i18next'
import { DatePicker } from '@/components/ui/date-picker'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FilterState } from '../types/histories.types'

/**
 * Props for the AdminFilterDialog component.
 */
interface AdminFilterDialogProps {
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
}

/**
 * @description Admin-specific filter dialog with email, source name, date range, and feedback status fields.
 * @param {AdminFilterDialogProps} props - Component props.
 * @returns {JSX.Element} Rendered filter dialog.
 */
export const AdminFilterDialog = ({
    open,
    onClose,
    tempFilters,
    setTempFilters,
    onApply,
    onReset,
}: AdminFilterDialogProps) => {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('histories.filterTitle', 'Filter History')}</DialogTitle>
                </DialogHeader>
            <div className="space-y-4">
                {/* Email Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('histories.userEmail', 'User Email')}
                    </label>
                    <input
                        type="text"
                        value={tempFilters.email}
                        onChange={(e) => setTempFilters({ ...tempFilters, email: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        placeholder={t('histories.userEmailPlaceholder', 'e.g. user@example.com')}
                    />
                </div>

                {/* Source Name Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('histories.sourceName', 'Source Name')}
                    </label>
                    <input
                        type="text"
                        value={tempFilters.sourceName || ''}
                        onChange={(e) => setTempFilters({ ...tempFilters, sourceName: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        placeholder={t('histories.sourceNamePlaceholder', 'e.g. My Knowledge Base')}
                    />
                </div>

                {/* Feedback Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('histories.filters.feedback', 'Feedback')}
                    </label>
                    <Select
                        value={tempFilters.feedbackFilter || 'all'}
                        onValueChange={(value: string) => setTempFilters({
                            ...tempFilters,
                            feedbackFilter: value as 'all' | 'positive' | 'negative' | 'any' | 'none'
                        })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('histories.filters.feedbackAll', 'All')}</SelectItem>
                            <SelectItem value="positive">{t('histories.filters.feedbackPositive', 'Positive only')}</SelectItem>
                            <SelectItem value="negative">{t('histories.filters.feedbackNegative', 'Negative only')}</SelectItem>
                            <SelectItem value="any">{t('histories.filters.feedbackAny', 'Any feedback')}</SelectItem>
                            <SelectItem value="none">{t('histories.filters.feedbackNone', 'No feedback')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            {t('common.startDate')}
                        </label>
                        <DatePicker
                            value={tempFilters.startDate ? new Date(tempFilters.startDate) : undefined}
                            onChange={(date) => setTempFilters({ ...tempFilters, startDate: date ? date.toISOString().split('T')[0] ?? '' : '' })}
                            placeholder={t('common.startDate')}
                            disabledDates={(d) => tempFilters.endDate ? d > new Date(tempFilters.endDate) : false}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            {t('common.endDate')}
                        </label>
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
                            onClick={() => { onReset(); onClose() }}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                        >
                            {t('common.reset')}
                        </button>
                        <button
                            onClick={onApply}
                            className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
                        >
                            {t('histories.applyFilter', 'Apply Filters')}
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

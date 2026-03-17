import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/* ========================================================================
 * Calendar (react-day-picker wrapper)
 * ======================================================================== */

/** @description Props inherited from react-day-picker's DayPicker component */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * @description Styled calendar grid wrapping react-day-picker with themed class names
 * @param {CalendarProps} props - DayPicker props including mode, selected, and onSelect
 * @returns {JSX.Element} Rendered calendar grid
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1 inline-flex items-center justify-center rounded-md border border-input'
        ),
        button_next: cn(
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1 inline-flex items-center justify-center rounded-md border border-input'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: cn('relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md'),
        day_button: cn(
          'h-8 w-8 p-0 font-normal inline-flex items-center justify-center rounded-md text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'aria-selected:opacity-100'
        ),
        range_end: 'day-range-end',
        selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md',
        today: 'bg-accent text-accent-foreground',
        outside: 'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

/* ========================================================================
 * DatePicker (Calendar in a Popover)
 * ======================================================================== */

/** @description Configuration props for the DatePicker component */
interface DatePickerProps {
  value?: Date | undefined;
  onChange?: ((date: Date | undefined) => void) | undefined;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** date-fns format string */
  dateFormat?: string;
  /** Callback to disable specific dates (return true to disable). Replaces antd `disabledDate`. */
  disabledDates?: (date: Date) => boolean;
}

/**
 * @description Single date picker with popover calendar, replacing Ant Design's DatePicker
 * @param {DatePickerProps} props - Date picker configuration including value, onChange, and format
 * @returns {JSX.Element} Rendered date picker with trigger button and calendar popover
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  dateFormat = 'PPP',
  disabledDates,
}: DatePickerProps) {
  const { t } = useTranslation();
  const displayPlaceholder = placeholder ?? t('common.pickDate');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, dateFormat) : <span>{displayPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required={false}
          selected={value}
          onSelect={(date: Date | undefined) => onChange?.(date)}
          disabled={disabledDates}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { Calendar };

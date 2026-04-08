/**
 * @fileoverview Searchable picker over the build-time permission catalog.
 * Used by the OverrideEditor to add allow/deny rows.
 * @module features/permissions/components/PermissionKeyPicker
 */
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

/**
 * @description Props for {@link PermissionKeyPicker}.
 */
export interface PermissionKeyPickerProps {
  /** Whether the picker popover is currently open. */
  open: boolean
  /** Open/close callback fired by the popover primitive. */
  onOpenChange: (open: boolean) => void
  /** Catalog keys to filter out (e.g. existing override keys for the same effect). */
  excludeKeys?: string[]
  /** Called with the selected permission key. The picker closes itself after. */
  onSelect: (key: string) => void
  /** Trigger element rendered inside the popover trigger. */
  children: React.ReactNode
}

/**
 * @description Group catalog keys by their dotted prefix (e.g. `dataset.view`
 * → `dataset`). Mirrors the grouping rule used by the role × permission
 * matrix so admins see a consistent layout across surfaces.
 *
 * @param {string[]} keys - Catalog permission keys to group.
 * @returns {Record<string, string[]>} A map of prefix → keys.
 */
function groupByPrefix(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const key of keys) {
    // Use the segment before the first dot; fall back to "other" for un-dotted keys.
    const dotIdx = key.indexOf('.')
    const prefix = dotIdx >= 0 ? key.slice(0, dotIdx) : 'other'
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(key)
  }
  // Sort each bucket so the order is stable across renders.
  for (const prefix of Object.keys(groups)) {
    groups[prefix]!.sort()
  }
  return groups
}

/**
 * @description Searchable popover picker that lists every permission key in
 * the build-time catalog, grouped by feature prefix. Selecting an item calls
 * `onSelect(key)` and dismisses the popover.
 *
 * @param {PermissionKeyPickerProps} props - Picker configuration.
 * @returns {JSX.Element} The rendered popover trigger + content.
 */
export function PermissionKeyPicker({
  open,
  onOpenChange,
  excludeKeys = [],
  onSelect,
  children,
}: PermissionKeyPickerProps) {
  const { t } = useTranslation()

  // Pull every catalog key, drop the excluded ones, then bucket them by prefix.
  const excluded = new Set(excludeKeys)
  const allKeys = Object.values(PERMISSION_KEYS).filter(k => !excluded.has(k))
  const groups = groupByPrefix(allKeys)
  const sortedPrefixes = Object.keys(groups).sort()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('permissions.admin.overrides.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('permissions.admin.overrides.empty')}</CommandEmpty>
            {sortedPrefixes.map(prefix => (
              <CommandGroup key={prefix} heading={prefix}>
                {groups[prefix]!.map(key => (
                  <CommandItem
                    key={key}
                    value={key}
                    onSelect={() => {
                      // Fire selection then close — the parent owns the open state.
                      onSelect(key)
                      onOpenChange(false)
                    }}
                  >
                    {key}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default PermissionKeyPicker

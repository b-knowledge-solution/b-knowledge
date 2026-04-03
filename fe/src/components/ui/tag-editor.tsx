import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * @description Props for the TagEditor component
 */
interface TagEditorProps {
  /** Current tag values */
  value: string[]
  /** Callback when tags are added or removed */
  onChange: (tags: string[]) => void
  /** Input placeholder text */
  placeholder?: string
  /** Optional label displayed above the editor */
  label?: string
  /** Badge variant for tag pills */
  variant?: 'default' | 'secondary' | 'outline'
  /** Whether the editor is read-only */
  disabled?: boolean
}

/**
 * @description Editable tag list with input field for adding/removing string tags.
 * Supports comma/newline-separated paste and backspace deletion.
 * @param {TagEditorProps} props - Tag editor configuration
 * @returns {JSX.Element} Tag editor with badge pills and inline input
 */
export function TagEditor({
  value,
  onChange,
  placeholder = 'Type and press Enter',
  label,
  variant = 'secondary',
  disabled = false,
}: TagEditorProps) {
  const [input, setInput] = useState('')

  /** Split pasted or typed text into individual tags, filtering duplicates */
  const addTags = (text: string) => {
    const newTags = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !value.includes(t))
    if (newTags.length > 0) onChange([...value, ...newTags])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Add tag on Enter key press
    if (e.key === 'Enter') {
      e.preventDefault()
      addTags(input)
      setInput('')
    }
    // Remove last tag on Backspace when input is empty
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  /** Handle paste events to support bulk tag entry via comma/newline separation */
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    addTags(e.clipboardData.getData('text'))
    setInput('')
  }

  /** Remove a tag by its index */
  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index))

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs font-medium">{label}</Label>}
      <div className="flex flex-wrap gap-1 rounded-md border p-2 min-h-[36px]">
        {value.map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant={variant} className="gap-1 text-xs">
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="hover:text-destructive"
              >
                <X size={12} />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[100px] border-0 p-0 h-6 text-xs shadow-none focus-visible:ring-0"
          />
        )}
      </div>
    </div>
  )
}

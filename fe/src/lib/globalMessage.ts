import { toast } from 'sonner'

/**
 * @description Global notification bridge that exposes Sonner toast helpers to non-component modules
 * @returns {{ success: (content: string) => string | number; error: (content: string) => string | number; info: (content: string) => string | number; warning: (content: string) => string | number }} Shared notification API
 */
export const globalMessage = {
  success: (content: string) => toast.success(content),
  error: (content: string) => toast.error(content),
  info: (content: string) => toast.info(content),
  warning: (content: string) => toast.warning(content),
}

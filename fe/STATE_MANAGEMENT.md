# Frontend State Management Conventions

## Decision Tree

| State Type | Solution | Example |
|---|---|---|
| **Server data** (fetched from API) | TanStack Query `useQuery` | User list, datasets, audit logs |
| **Server mutations** (create/update/delete) | TanStack Query `useMutation` | Create dataset, update role |
| **User-triggered async actions** | TanStack Query `useMutation` | Search submit, file upload |
| **App-wide client state** | React Context | Auth, theme, KB config |
| **Feature-local UI state** | `useState` | Modal open, form data, selected tab |
| **URL-shareable state** | `useSearchParams` / `useUrlState` | Filters, pagination, active tab |
| **Real-time updates** | Socket.IO + Query invalidation | File status, notifications |
| **Streaming (SSE)** | Imperative hooks with `useState` + `useRef` | Chat stream, search stream |

## Query Key Factory

All query keys are centralized in `fe/src/lib/queryKeys.ts`. Use these keys for consistency:

```typescript
import { queryKeys } from '@/lib/queryKeys'

// In useQuery
useQuery({ queryKey: queryKeys.datasets.list(), queryFn: ... })

// In invalidation
queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all })
```

## TanStack Query Patterns

### Fetching data
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: queryKeys.feature.list(),
  queryFn: featureApi.getList,
})
```

### Mutations with cache invalidation
```typescript
const mutation = useMutation({
  mutationFn: featureApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.feature.all })
  },
  meta: { successMessage: t('feature.createSuccess') },
})
```

### Conditional fetching
```typescript
useQuery({
  queryKey: queryKeys.feature.detail(id),
  queryFn: () => featureApi.getById(id),
  enabled: !!id,
})
```

## No Manual Memoization

This project uses `babel-plugin-react-compiler`. Do **NOT** use:
- `useCallback` (except for context provider values)
- `useMemo` (except for context provider values)
- `React.memo`

The compiler handles memoization automatically.

## URL State for Filterable Views

Use `useSearchParams` or the `useUrlState` hook for filters and pagination:

```typescript
import { useUrlState } from '@/hooks/useUrlState'

const [search, setSearch] = useUrlState('q', '')
const [page, setPage] = useUrlState('page', 1)
```

This makes views bookmarkable and shareable.

## Socket + Query Integration

Socket events automatically invalidate TanStack Query caches via `useSocketQueryInvalidation()` in Providers. To add new event mappings, edit `fe/src/hooks/useSocket.ts`.

## Error Boundaries

All feature routes are wrapped with `<FeatureErrorBoundary>`. On error, the boundary:
1. Renders a fallback UI with retry button
2. Clears the TanStack Query cache on retry
3. Resets the component tree

## Form State

Use native `useState` for form data:

```typescript
const [formData, setFormData] = useState<FormType>(INITIAL)
const setField = <K extends keyof FormType>(key: K, value: FormType[K]) =>
  setFormData(prev => ({ ...prev, [key]: value }))
```

Do **NOT** use Ant Design `Form.useForm()` in new code.

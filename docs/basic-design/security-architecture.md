# Security Architecture

## Authentication Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant N as Nginx
    participant B as Backend API
    participant V as Valkey (Session Store)
    participant A as Azure AD

    alt Local Login
        U->>N: POST /api/auth/login {email, password}
        N->>B: Forward request
        B->>B: Validate credentials (bcrypt)
        B->>V: Create session
        V-->>B: Session ID
        B-->>U: Set-Cookie: connect.sid (httpOnly, secure)
    end

    alt Azure AD OAuth2
        U->>N: GET /api/auth/azure
        N->>B: Forward
        B-->>U: Redirect to Azure AD authorize URL
        U->>A: Authenticate with Microsoft
        A-->>U: Redirect with auth code
        U->>B: GET /api/auth/azure/callback?code=xxx
        B->>A: Exchange code for tokens
        A-->>B: ID token + access token
        B->>B: Find or create user by azure_ad_id
        B->>V: Create session
        B-->>U: Set-Cookie + redirect to SPA
    end
```

## Authentication Methods

| Method | When Used | Details |
|--------|-----------|---------|
| Local login | Development, root admin | Email + bcrypt password; disabled in prod via `ENABLE_LOCAL_LOGIN=false` |
| Azure AD OAuth2 | Production SSO | OIDC flow with PKCE; auto-provisions users on first login |
| Session cookie | All authenticated requests | `connect.sid` with Valkey backing store |

## Authorization Model

B-Knowledge uses a dual authorization approach:

- **RBAC** (Role-Based): Global role hierarchy via CASL
- **ABAC** (Attribute-Based): Per-dataset and per-project permissions

### Role Hierarchy

```mermaid
graph TD
    SA["super-admin<br/>Full system access"]
    A["admin<br/>Tenant management"]
    L["leader<br/>Team + dataset management"]
    M["member<br/>Read + use assigned resources"]

    SA --> A
    A --> L
    L --> M
```

Each higher role inherits all abilities of lower roles.

### Request Authorization Pipeline

```mermaid
flowchart TD
    req["Incoming Request"] --> auth{"requireAuth<br/>middleware"}
    auth -->|"No session"| r401["401 Unauthorized"]
    auth -->|"Valid session"| perm{"requirePermission<br/>middleware"}
    perm -->|"Route-level<br/>role check"| role{"User role ≥<br/>required role?"}
    role -->|No| r403["403 Forbidden"]
    role -->|Yes| ability{"requireAbility<br/>middleware"}
    ability -->|"CASL check on<br/>resource + action"| can{"user.can(action,<br/>resource)?"}
    can -->|No| r403
    can -->|Yes| handler["Route Handler"]
    handler --> abac{"Resource-level<br/>ABAC check?"}
    abac -->|"Dataset/Project"| check["Check grantee_type<br/>+ permission level"]
    abac -->|"No ABAC"| ok["200 OK"]
    check -->|Denied| r403
    check -->|Allowed| ok
```

### ABAC Permission Grants

Resources like datasets, chat assistants, and search apps use a grantee model:

| Field | Values | Description |
|-------|--------|-------------|
| `grantee_type` | `user`, `team` | Who receives the permission |
| `grantee_id` | UUID | User or team ID |
| `permission` | `view`, `edit`, `manage` | Access level granted |

## Security Headers

Configured via Helmet middleware:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `frame-ancestors` relaxed | Allow embedding in customer sites via widgets |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | Relaxed (for embeds) | Controlled framing for widget use cases |
| `Strict-Transport-Security` | `max-age=31536000` | Enforce HTTPS |
| `X-XSS-Protection` | `0` | Disabled (CSP preferred) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |

## Rate Limiting

| Scope | Limit | Window | Key |
|-------|-------|--------|-----|
| General API | 1000 requests | 15 minutes | IP address |
| Auth endpoints | 20 requests | 15 minutes | IP address |

Implemented via `express-rate-limit` with Valkey store for distributed counting.

## Session Configuration

| Property | Value | Purpose |
|----------|-------|---------|
| `httpOnly` | `true` | Prevent JavaScript access to cookie |
| `secure` | `true` (prod) | Cookie only sent over HTTPS |
| `sameSite` | `lax` | CSRF protection while allowing top-level navigations |
| `maxAge` | 7 days | Session TTL |
| `store` | Valkey (connect-redis) | Distributed session storage |
| `secret` | `SESSION_SECRET` env var | Must be strong random value in production |

## CORS Policy

- **Allowed origin**: Restricted to `FRONTEND_URL` environment variable
- **Credentials**: `true` (cookies sent cross-origin)
- **Methods**: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- **Exposed headers**: `Content-Disposition` (for file downloads)

## Input Validation

```mermaid
flowchart LR
    req["Request"] --> ct{"Content-Type<br/>check"}
    ct -->|"Invalid"| r415["415 Unsupported<br/>Media Type"]
    ct -->|"Valid"| zod["Zod Schema<br/>Validation"]
    zod -->|"Invalid"| r400["400 Bad Request<br/>+ field errors"]
    zod -->|"Valid"| sanitize["Sanitize &<br/>Transform"]
    sanitize --> handler["Route Handler"]
```

- All mutation endpoints (POST, PUT, PATCH, DELETE) use Zod schemas via `validate()` middleware
- Content-type enforcement prevents request smuggling
- Zod schemas strip unknown fields (`.strict()` or `.strip()`)
- Error responses include per-field validation details

## Security Checklist (Production)

- [ ] Set `ENABLE_LOCAL_LOGIN=false`
- [ ] Generate strong `SESSION_SECRET` (min 64 random characters)
- [ ] Change all default database/service passwords
- [ ] Configure TLS certificates (not self-signed)
- [ ] Restrict CORS to production frontend URL
- [ ] Enable Nginx rate limiting headers
- [ ] Review CSP `frame-ancestors` for embed domains

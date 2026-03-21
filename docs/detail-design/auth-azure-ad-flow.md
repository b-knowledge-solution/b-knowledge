# Auth: Azure AD OAuth2 Flow

## Overview

Azure AD authentication uses the OAuth2 Authorization Code flow. The backend acts as a confidential client, exchanging an authorization code for tokens and creating a local session.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Backend
    participant AzureAD
    participant DB as PostgreSQL
    participant Valkey

    Browser->>Frontend: Click "Sign in with Azure AD"
    Frontend->>Backend: GET /api/auth/login
    Backend->>Backend: Generate state + nonce, store in session
    Backend-->>Browser: 302 Redirect to Azure AD /authorize

    Browser->>AzureAD: GET /authorize?client_id&redirect_uri&state&scope
    AzureAD->>Browser: Show login page
    Browser->>AzureAD: Enter credentials + MFA
    AzureAD-->>Browser: 302 Redirect to callback URL

    Browser->>Backend: GET /api/auth/callback?code=xxx&state=yyy

    Backend->>Backend: Validate state matches session
    Backend->>AzureAD: POST /token {code, client_secret, redirect_uri}
    AzureAD-->>Backend: {access_token, id_token, refresh_token}

    Backend->>Backend: Decode id_token, extract user claims
    Backend->>DB: Find user by azure_ad_id or email
    alt User exists
        Backend->>DB: Update user profile (name, email, avatar)
    else New user
        Backend->>DB: Create user with default role (member)
    end

    Backend->>Valkey: Create session {userId, orgId, tokens}
    Backend-->>Browser: 302 Redirect to frontend + Set-Cookie
    Browser->>Frontend: Load app with session cookie
```

## Token Handling

| Token | Storage | Purpose | Lifetime |
|-------|---------|---------|----------|
| `access_token` | Valkey session | Call Microsoft Graph API | ~1 hour |
| `id_token` | Decoded, not stored | Extract user claims (sub, email, name) | ~1 hour |
| `refresh_token` | Valkey session | Obtain new access_token | Days/weeks |

### Token Refresh

```mermaid
flowchart TD
    A[API request needs Graph call] --> B{access_token expired?}
    B -->|No| C[Use existing token]
    B -->|Yes| D[POST /token with refresh_token]
    D --> E{Refresh success?}
    E -->|Yes| F[Update tokens in session]
    E -->|No| G[Clear session, force re-login]
    F --> C
```

## User Creation / Update Logic

```mermaid
flowchart TD
    A[Receive id_token claims] --> B[Extract azure_ad_id, email, name]
    B --> C{Find by azure_ad_id?}
    C -->|Found| D[Update profile fields]
    C -->|Not found| E{Find by email?}
    E -->|Found| F[Link azure_ad_id to existing user]
    E -->|Not found| G[Create new user]
    F --> D
    G --> H[Assign default role: member]
    H --> I[Assign to default organization]
    D --> J[Return user record]
    I --> J
```

### Claim Mapping

| Azure AD Claim | DB Field | Notes |
|----------------|----------|-------|
| `oid` / `sub` | `azure_ad_id` | Primary match key |
| `preferred_username` | `email` | Fallback match key |
| `name` | `display_name` | Updated on each login |
| `given_name` | `first_name` | Optional |
| `family_name` | `last_name` | Optional |

## Error Handling

```mermaid
flowchart TD
    A[Callback received] --> B{State valid?}
    B -->|No| C[400: Invalid state / CSRF]
    B -->|Yes| D{Code present?}
    D -->|No| E[400: Missing authorization code]
    D -->|Yes| F[Exchange code for tokens]
    F --> G{Exchange success?}
    G -->|No| H{Error type?}
    H -->|Network| I[502: Azure AD unreachable]
    H -->|Invalid code| J[401: Code expired or invalid]
    H -->|Other| K[500: Unexpected error]
    G -->|Yes| L{User disabled?}
    L -->|Yes| M[403: Account disabled]
    L -->|No| N[Create session, redirect]
```

| Error Scenario | HTTP Status | User Experience |
|----------------|-------------|-----------------|
| Invalid state parameter | 400 | Redirect to login with error |
| Code exchange failure | 401 | Redirect to login with error |
| Azure AD unreachable | 502 | Error page, retry prompt |
| User account disabled | 403 | "Account disabled" message |
| Organization not found | 403 | "No organization access" message |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/auth/auth.controller.ts` | `/login`, `/callback`, `/logout` route handlers |
| `be/src/modules/auth/auth.service.ts` | Token exchange, user upsert, session creation |
| `be/src/modules/auth/index.ts` | Module barrel export and route registration |

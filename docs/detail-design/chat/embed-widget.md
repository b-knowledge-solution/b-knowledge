# Chat Embed Widget - Detail Design

## Overview

The current chat embed implementation exposes token-authenticated public endpoints for dialog info, anonymous session creation, and streamed completions. It is public-access oriented, but the source code documents public API routes rather than a standalone IIFE bundle.

## Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: POST /api/chat/dialogs/:id/embed-tokens
    Created --> Active: Token issued
    Active --> Active: Widget requests (no expiry by default)
    Active --> Revoked: DELETE /api/chat/embed-tokens/:tokenId
    Revoked --> [*]
```

- **Create**: Admin generates a token scoped to a specific dialog.
- **Active**: Token authorizes all embed endpoints. No user session required.
- **Revoke**: Admin deletes the token; subsequent requests return 401.

## End-to-End Sequence

```mermaid
sequenceDiagram
    participant Admin
    participant BE as Backend API
    participant Widget as Embed Widget (iframe)
    participant LLM as LLM Provider

    Admin->>BE: POST /api/chat/dialogs/:id/embed-tokens
    BE-->>Admin: { token, embed_url }

    Note over Widget: Host page loads iframe with token

    Widget->>BE: GET /api/chat/embed/:token/info
    BE-->>Widget: { dialog_name, avatar, welcome_message, prompt_config }

    Widget->>BE: POST /api/chat/embed/:token/sessions
    BE-->>Widget: { session_id } (anonymous session)

    Widget->>BE: POST /api/chat/embed/:token/completions
    Note right of BE: SSE streaming response
    BE->>LLM: Forward prompt + context
    LLM-->>BE: Stream delta tokens
    BE-->>Widget: SSE: {delta: "token"} ...
    BE-->>Widget: SSE: {answer, reference} (final)
    BE-->>Widget: SSE: [DONE]
```

## Public API Endpoints

All embed endpoints bypass session authentication. The embed token is the sole credential.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/chat/embed/:token/info` | Retrieve dialog metadata and prompt config |
| POST | `/api/chat/embed/:token/sessions` | Create an anonymous chat session |
| POST | `/api/chat/embed/:token/completions` | Send message and receive SSE streaming response |
| DELETE | `/api/chat/dialogs/:id/embed-tokens/:tokenId` | Revoke a token (admin, session required) |

## Public Client Integration

The implemented public surface is:

- `GET /api/chat/embed/:token/info`
- `POST /api/chat/embed/:token/sessions`
- `POST /api/chat/embed/:token/completions`

The frontend or host page is responsible for calling these routes with the token in the URL. The current source does not expose a documented standalone IIFE bundle in this docs set.

### Security Notes

- Public access is token-based, not session-based.
- Admin token creation and revocation still require authenticated permissions.
- Streaming responses are delivered over SSE.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/chat/controllers/chat-embed.controller.ts` | Embed endpoint handlers |
| `be/src/modules/chat/services/chat-embed.service.ts` | Token management and session logic |
| `be/src/modules/chat/routes/chat-embed.routes.ts` | Route definitions for embed API |

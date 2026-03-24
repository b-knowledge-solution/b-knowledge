# External Evals API — AI Agent Reference

> Machine-readable API specification for AI agents integrating with the Knowledge Base evaluation and tracing system.

## Base Configuration

```yaml
base_url: "${BASE_URL}/api"
auth:
  trace_api:
    header: "X-External-API-Key"
    env_var: "EXTERNAL_TRACE_API_KEY"
  history_api:
    header: "x-api-key"
    env_var: "EXTERNAL_API_KEY"
content_type: "application/json"
```

---

## Endpoints

### 1. Health Check

```
GET /api/external/health
```

**Response:**
```json
{"status": "ok", "service": "external-trace", "timestamp": "2026-03-23T00:00:00.000Z"}
```

Use this to verify connectivity before sending trace/history data.

---

### 2. Submit Trace

```
POST /api/external/trace/submit
```

Logs an LLM interaction (user prompt or assistant response) to Langfuse for evaluation and observability.

**Required headers:** `Content-Type: application/json`, `X-External-API-Key: <key>`

**Request body schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | **Yes** | Registered user email (validated against user DB) |
| `message` | string | **Yes** | The input message/prompt |
| `share_id` | string | No | Knowledge base source share ID (added as tag `share_id:<value>`) |
| `role` | `"user"` \| `"assistant"` | No | Defaults to `"user"`. Set `"assistant"` to log LLM responses |
| `response` | string | No | LLM output (required when `role` is `"assistant"`) |
| `metadata` | object | No | Additional context (see metadata fields below) |

**Metadata fields:**

| Field | Type | Description |
|-------|------|-------------|
| `metadata.chatId` | string | Chat session identifier (used as Langfuse sessionId) |
| `metadata.sessionId` | string | Fallback for chatId |
| `metadata.model` | string | Model identifier (e.g. `"gpt-4"`, `"claude-sonnet-4-20250514"`) |
| `metadata.modelName` | string | Human-readable model name |
| `metadata.source` | string | Source application name (added as tag) |
| `metadata.task` | string | Task type (added as tag unless `"user_response"` or `"llm_response"`) |
| `metadata.tags` | string[] | Additional tags for Langfuse filtering |
| `metadata.timestamp` | string | ISO 8601 timestamp override |
| `metadata.usage` | object | Token usage data |
| `metadata.usage.promptTokens` | number | Input token count |
| `metadata.usage.completionTokens` | number | Output token count |
| `metadata.usage.totalTokens` | number | Total token count |

**Success response:** `200 OK`
```json
{"success": true, "traceId": "uuid-string"}
```

**Error responses:**
```json
// Invalid email (not registered)
{"success": false, "error": "Invalid email: not registered in system"}

// Server error
{"error": "Failed to submit trace"}  // 500
```

**Agent integration pattern:**
```python
# Step 1: Log user prompt
trace_result = POST("/api/external/trace/submit", {
    "email": user_email,
    "message": user_prompt,
    "role": "user",
    "metadata": {"chatId": session_id, "source": "my-agent"}
})

# Step 2: Log LLM response with token usage
POST("/api/external/trace/submit", {
    "email": user_email,
    "message": user_prompt,
    "role": "assistant",
    "response": llm_output,
    "metadata": {
        "chatId": session_id,
        "model": "gpt-4",
        "source": "my-agent",
        "usage": {
            "promptTokens": 150,
            "completionTokens": 300,
            "totalTokens": 450
        }
    }
})
```

---

### 3. Submit Feedback

```
POST /api/external/trace/feedback
```

Attaches a user feedback score to an existing trace for evaluation purposes.

**Required headers:** `Content-Type: application/json`, `X-External-API-Key: <key>`

**Request body schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `traceId` | string | **Yes*** | Trace ID from submit response |
| `messageId` | string | **Yes*** | Alternative to traceId |
| `value` | number | **Yes*** | Feedback score (typically 0 or 1) |
| `score` | number | **Yes*** | Alternative to value |
| `comment` | string | No | Free-text feedback |

*Either `traceId` or `messageId` required. Either `value` or `score` required.

**Success response:** `200 OK`
```json
{"success": true}
```

**Agent integration pattern:**
```python
# After receiving user feedback on an LLM response
POST("/api/external/trace/feedback", {
    "traceId": trace_id_from_step_1,
    "value": 1,        # 1 = positive, 0 = negative
    "comment": "Accurate and helpful"
})
```

---

### 4. Collect Chat History

```
POST /api/external/history/chat
```

Persists a chat conversation turn for analytics and audit.

**Required headers:** `Content-Type: application/json`, `x-api-key: <key>`

**Request body schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | Unique session identifier |
| `user_prompt` | string | **Yes** | User's message |
| `llm_response` | string | **Yes** | Assistant's response |
| `share_id` | string | No | Knowledge base source share ID |
| `user_email` | string | No | User email |
| `citations` | array | No | Citation objects (default: `[]`) |

**Success response:** `201 Created`
```json
{"message": "Chat history saved successfully"}
```

**Error responses:**
- `400` — Missing `session_id`, `user_prompt`, or `llm_response`
- `401` — Invalid or missing API key
- `500` — Server error

---

### 5. Collect Search History

```
POST /api/external/history/search
```

Persists a search query and results for analytics.

**Required headers:** `Content-Type: application/json`, `x-api-key: <key>`

**Request body schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `search_input` | string | **Yes** | The search query |
| `session_id` | string | No | Session identifier |
| `share_id` | string | No | Knowledge base source share ID |
| `user_email` | string | No | User email |
| `ai_summary` | string | No | AI-generated summary of results |
| `file_results` | array | No | File names found (default: `[]`) |

**Success response:** `201 Created`
```json
{"message": "Search history saved successfully"}
```

**Error responses:**
- `400` — Missing `search_input`
- `401` — Invalid or missing API key
- `500` — Server error

---

## Complete Agent Workflow

```
1. GET  /api/external/health            → verify service is up
2. POST /api/external/trace/submit      → log user prompt (role: "user")
3. [Agent performs LLM call]
4. POST /api/external/trace/submit      → log LLM response (role: "assistant")
5. POST /api/external/history/chat      → persist conversation for audit
6. [User provides feedback]
7. POST /api/external/trace/feedback    → record feedback score
```

## Default Tags Applied

Every trace automatically receives these Langfuse tags:
- `knowledge-base`
- `external-trace`
- `<NODE_ENV>` (e.g., `production`, `development`)
- `share_id:<value>` (if share_id provided)
- Any tags from `metadata.tags[]`
- `metadata.source` value
- `metadata.task` value (unless `user_response` or `llm_response`)

## Rate Limiting & Caching

- Email validation is cached in Redis with configurable TTL (`EXTERNAL_TRACE_CACHE_TTL_SECONDS`)
- Distributed locking prevents cache stampedes on concurrent requests for the same email
- If Redis is unavailable, the system falls back to direct DB validation (no cache)

## Error Handling

| HTTP Status | Meaning | Agent Action |
|-------------|---------|--------------|
| `200` | Success | Continue |
| `201` | Created | Continue |
| `400` | Bad request (missing fields) | Fix request body |
| `401` | Invalid API key | Check API key configuration |
| `500` | Server error | Retry with exponential backoff (max 3 retries) |

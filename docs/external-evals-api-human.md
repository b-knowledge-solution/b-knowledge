# External Evals API Guide

A practical guide for developers integrating external applications with the Knowledge Base evaluation and tracing system.

## Overview

The External Evals API lets you send LLM interaction data from your applications into the Knowledge Base platform for:

- **Observability** — Track LLM calls, token usage, and response quality via Langfuse
- **Evaluation** — Collect user feedback scores against specific LLM responses
- **Analytics** — Persist chat and search history for audit trails and usage analysis

## Getting Started

### Prerequisites

1. A running Knowledge Base instance
2. An API key (set via `EXTERNAL_TRACE_API_KEY` and/or `EXTERNAL_API_KEY` environment variables)
3. A registered user email in the system (required for trace submission)

### Quick Start

Verify the service is reachable:

```bash
curl https://your-domain.com/api/external/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "external-trace",
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

---

## API Reference

### Authentication

The API uses two separate API keys depending on the endpoint group:

| Endpoint Group | Header | Env Variable |
|---------------|--------|--------------|
| Trace API (`/trace/*`) | `X-External-API-Key` | `EXTERNAL_TRACE_API_KEY` |
| History API (`/history/*`) | `x-api-key` | `EXTERNAL_API_KEY` |

---

### 1. Submit a Trace

Records an LLM interaction (user prompt or assistant response) in Langfuse.

```
POST /api/external/trace/submit
```

#### Minimal Example

```bash
curl -X POST https://your-domain.com/api/external/trace/submit \
  -H "Content-Type: application/json" \
  -H "X-External-API-Key: YOUR_API_KEY" \
  -d '{
    "email": "developer@company.com",
    "message": "What is retrieval-augmented generation?"
  }'
```

#### Full Example (with LLM response and token usage)

```bash
curl -X POST https://your-domain.com/api/external/trace/submit \
  -H "Content-Type: application/json" \
  -H "X-External-API-Key: YOUR_API_KEY" \
  -d '{
    "email": "developer@company.com",
    "message": "What is retrieval-augmented generation?",
    "role": "assistant",
    "response": "RAG is a technique that combines information retrieval with text generation...",
    "share_id": "8ba5b33ed9c111f0883b8ade979b1598",
    "metadata": {
      "chatId": "session-abc-123",
      "model": "gpt-4",
      "source": "internal-chatbot",
      "tags": ["production", "customer-support"],
      "usage": {
        "promptTokens": 45,
        "completionTokens": 120,
        "totalTokens": 165
      }
    }
  }'
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email of a registered user in the system |
| `message` | string | Yes | The user prompt or input text |
| `role` | string | No | `"user"` (default) or `"assistant"` |
| `response` | string | No | The LLM response text (use with `role: "assistant"`) |
| `share_id` | string | No | Links the trace to a specific knowledge base source |
| `metadata` | object | No | Additional context — see below |

#### Metadata Options

| Field | Description |
|-------|-------------|
| `chatId` / `sessionId` | Groups multiple messages into a single conversation trace |
| `model` | Model identifier (e.g., `"gpt-4"`, `"claude-sonnet-4-20250514"`) |
| `modelName` | Human-friendly model name |
| `source` | Your application name (appears as a Langfuse tag) |
| `task` | Custom task type (appears as a tag) |
| `tags` | Array of additional string tags for filtering |
| `timestamp` | ISO 8601 timestamp override |
| `usage.promptTokens` | Number of input tokens |
| `usage.completionTokens` | Number of output tokens |
| `usage.totalTokens` | Total tokens consumed |

#### Response

```json
{
  "success": true,
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Save the `traceId` — you'll need it to submit feedback later.

> **Note:** The `email` must belong to a user registered in the Knowledge Base system. Unregistered emails will be rejected.

---

### 2. Submit Feedback

Attaches a quality score to a previously submitted trace. This is how you capture "thumbs up / thumbs down" or numeric ratings for LLM evaluation.

```
POST /api/external/trace/feedback
```

```bash
curl -X POST https://your-domain.com/api/external/trace/feedback \
  -H "Content-Type: application/json" \
  -H "X-External-API-Key: YOUR_API_KEY" \
  -d '{
    "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "value": 1,
    "comment": "Accurate answer with good citations"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `traceId` | string | Yes* | The trace ID from the submit response |
| `messageId` | string | Yes* | Alternative identifier (use either traceId or messageId) |
| `value` | number | Yes* | Score — typically `1` (positive) or `0` (negative) |
| `score` | number | Yes* | Alternative to `value` |
| `comment` | string | No | Free-text explanation of the rating |

---

### 3. Save Chat History

Persists a complete chat turn (user question + AI answer) for analytics dashboards and audit.

```
POST /api/external/history/chat
```

```bash
curl -X POST https://your-domain.com/api/external/history/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "session_id": "chat-session-001",
    "share_id": "8ba5b33ed9c111f0883b8ade979b1598",
    "user_email": "developer@company.com",
    "user_prompt": "What are the Q3 revenue numbers?",
    "llm_response": "According to the quarterly report, Q3 revenue was $4.2M...",
    "citations": [
      {"source": "q3-report.pdf", "page": 3},
      {"source": "financial-summary.xlsx", "sheet": "Revenue"}
    ]
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | Yes | Groups messages in the same conversation |
| `user_prompt` | string | Yes | What the user asked |
| `llm_response` | string | Yes | What the AI responded |
| `share_id` | string | No | Knowledge base source identifier |
| `user_email` | string | No | Who asked the question |
| `citations` | array | No | Source references (any JSON structure) |

**Response:** `201 Created`
```json
{"message": "Chat history saved successfully"}
```

---

### 4. Save Search History

Logs search queries and results for usage analytics.

```
POST /api/external/history/search
```

```bash
curl -X POST https://your-domain.com/api/external/history/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "session_id": "search-session-001",
    "share_id": "9ca6c44fd0d222f1994c9bef080c2699",
    "user_email": "developer@company.com",
    "search_input": "annual report 2024",
    "ai_summary": "Found 3 documents related to the 2024 annual report...",
    "file_results": ["annual_report_2024.pdf", "board_presentation.pptx"]
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `search_input` | string | Yes | The search query |
| `session_id` | string | No | Session identifier |
| `share_id` | string | No | Knowledge base source identifier |
| `user_email` | string | No | Who performed the search |
| `ai_summary` | string | No | AI-generated summary of results |
| `file_results` | array | No | List of file names returned |

**Response:** `201 Created`
```json
{"message": "Search history saved successfully"}
```

---

## Integration Examples

### Python

```python
import requests
import uuid

BASE_URL = "https://your-domain.com"
TRACE_API_KEY = "your-trace-api-key"
HISTORY_API_KEY = "your-history-api-key"

class EvalsClient:
    def __init__(self, base_url, trace_key, history_key):
        self.base_url = base_url
        self.trace_headers = {
            "Content-Type": "application/json",
            "X-External-API-Key": trace_key
        }
        self.history_headers = {
            "Content-Type": "application/json",
            "x-api-key": history_key
        }

    def log_interaction(self, email, user_message, llm_response,
                        model="gpt-4", session_id=None):
        """Log a complete LLM interaction (prompt + response)."""
        session_id = session_id or str(uuid.uuid4())

        # Log user prompt
        requests.post(
            f"{self.base_url}/api/external/trace/submit",
            headers=self.trace_headers,
            json={
                "email": email,
                "message": user_message,
                "role": "user",
                "metadata": {"chatId": session_id, "source": "my-app"}
            }
        )

        # Log LLM response
        result = requests.post(
            f"{self.base_url}/api/external/trace/submit",
            headers=self.trace_headers,
            json={
                "email": email,
                "message": user_message,
                "role": "assistant",
                "response": llm_response,
                "metadata": {
                    "chatId": session_id,
                    "model": model,
                    "source": "my-app"
                }
            }
        ).json()

        # Also save to history for analytics
        requests.post(
            f"{self.base_url}/api/external/history/chat",
            headers=self.history_headers,
            json={
                "session_id": session_id,
                "user_email": email,
                "user_prompt": user_message,
                "llm_response": llm_response
            }
        )

        return result.get("traceId")

    def submit_feedback(self, trace_id, score, comment=""):
        """Submit user feedback for a traced interaction."""
        requests.post(
            f"{self.base_url}/api/external/trace/feedback",
            headers=self.trace_headers,
            json={
                "traceId": trace_id,
                "value": score,
                "comment": comment
            }
        )

# Usage
client = EvalsClient(BASE_URL, TRACE_API_KEY, HISTORY_API_KEY)
trace_id = client.log_interaction(
    email="user@company.com",
    user_message="What is RAG?",
    llm_response="RAG stands for Retrieval-Augmented Generation..."
)
client.submit_feedback(trace_id, score=1, comment="Good answer")
```

### JavaScript / TypeScript

```typescript
const BASE_URL = "https://your-domain.com";

class EvalsClient {
  constructor(
    private baseUrl: string,
    private traceKey: string,
    private historyKey: string
  ) {}

  async logInteraction(
    email: string,
    userMessage: string,
    llmResponse: string,
    options: { model?: string; sessionId?: string; shareId?: string } = {}
  ) {
    const sessionId = options.sessionId ?? crypto.randomUUID();

    // Log user prompt
    await fetch(`${this.baseUrl}/api/external/trace/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-External-API-Key": this.traceKey,
      },
      body: JSON.stringify({
        email,
        message: userMessage,
        role: "user",
        share_id: options.shareId,
        metadata: { chatId: sessionId, source: "my-app" },
      }),
    });

    // Log LLM response
    const traceRes = await fetch(`${this.baseUrl}/api/external/trace/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-External-API-Key": this.traceKey,
      },
      body: JSON.stringify({
        email,
        message: userMessage,
        role: "assistant",
        response: llmResponse,
        share_id: options.shareId,
        metadata: {
          chatId: sessionId,
          model: options.model ?? "gpt-4",
          source: "my-app",
        },
      }),
    });

    const { traceId } = await traceRes.json();

    // Save to history
    await fetch(`${this.baseUrl}/api/external/history/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.historyKey,
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_email: email,
        user_prompt: userMessage,
        llm_response: llmResponse,
      }),
    });

    return traceId;
  }

  async submitFeedback(traceId: string, value: number, comment?: string) {
    await fetch(`${this.baseUrl}/api/external/trace/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-External-API-Key": this.traceKey,
      },
      body: JSON.stringify({ traceId, value, comment }),
    });
  }
}
```

---

## Error Reference

| Status | Cause | Fix |
|--------|-------|-----|
| `400 Bad Request` | Missing required fields | Check required fields for the endpoint |
| `401 Unauthorized` | Invalid or missing API key | Verify the correct API key header and value |
| `500 Internal Server Error` | Server-side failure | Retry after a short delay; check server logs |

Trace-specific errors return in the body:
```json
{"success": false, "error": "Invalid email: not registered in system"}
```

---

## How Data Flows

```
Your Application
    │
    ├── POST /trace/submit (user prompt)    ──→  Langfuse Trace
    ├── POST /trace/submit (LLM response)   ──→  Langfuse Generation + Token Usage
    ├── POST /trace/feedback                 ──→  Langfuse Score
    ├── POST /history/chat                   ──→  PostgreSQL (external_chat_history)
    └── POST /history/search                 ──→  PostgreSQL (external_search_history)
```

- **Trace data** goes to Langfuse for real-time LLM observability, cost tracking, and evaluation dashboards
- **History data** goes to PostgreSQL with full-text search indexes for analytics queries and audit trails
- **Feedback scores** are attached to specific traces in Langfuse for quality evaluation over time

---

## Tips

- Use consistent `chatId`/`session_id` values to group related messages into conversations
- Submit both `user` and `assistant` roles for each interaction to get complete conversation traces
- Always save the `traceId` from trace submission so you can attach feedback later
- The `share_id` field links traces to specific knowledge base sources — useful for per-source quality analysis
- Use `metadata.tags` to create custom filters in Langfuse (e.g., `["production", "customer-support", "high-priority"]`)

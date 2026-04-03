# Basic User Manual: LLM Setup, Dataset, Chat/Search Apps, and Promptfoo RAG Evaluation

> Step-by-step operational guide for admins and team users to configure LLMs, build datasets, create apps, and evaluate RAG quality with Promptfoo.

## 1. Overview

This manual covers the minimum workflow to get value from B-Knowledge:

1. Configure an LLM provider in **Admin**
2. Create a dataset and choose the right ingestion pipeline
3. Create **Chat App** and **Search App**
4. Use both apps effectively
5. Create an external API key and integrate with [Promptfoo RAG evaluation guide](https://www.promptfoo.dev/docs/guides/evaluate-rag/)

## 2. Prerequisites

- You can sign in with an account that has access to Admin and Dataset features (typically **admin** or **leader** role).
- Backend/worker infrastructure is healthy (database, OpenSearch, converter, task executor).
- At least one LLM provider credential is available (for example OpenAI/Azure/OpenAI-compatible endpoint).

## 3. Step 1 — Configure LLM in Admin

### 3.1 Open LLM Provider Settings

1. Sign in to B-Knowledge.
2. Open **Admin**.
3. Go to **LLM Provider**.

### 3.2 Add a Provider

1. Click **Add provider**.
2. Enter provider metadata:
   - Provider name (display name)
   - API base URL (if required)
   - API key/secret
   - Model name(s)
3. Save the provider.

### 3.3 Validate Connectivity

1. Use built-in test/health check if available.
2. Confirm the provider status is active.
3. If validation fails, verify:
   - API key is valid
   - Base URL is correct
   - Outbound network and SSL are allowed
   - Model ID exists in provider account

### 3.4 Set Default Model Policy

Recommended defaults:
- One **general chat** model (balanced speed + quality)
- One **high-quality** model for final answers
- One **embedding model** for dataset indexing

## 4. Step 2 — Create Dataset and Choose the Right Ingestion Pipeline

### 4.1 Create a Dataset

1. Open **Datasets**.
2. Click **Create dataset**.
3. Set dataset metadata:
   - Name
   - Description/purpose
   - Access scope/project/team
4. Save.

### 4.2 Choose Ingestion Pipeline by Document Type

Use this decision table before uploading:

| Content type | Recommended parser/pipeline | Why |
|---|---|---|
| General text docs (default) | **Naive parser** | Fast and robust default for mixed content |
| Structured manuals / SOPs | **Manual parser** | Preserves heading hierarchy and procedural steps |
| Academic papers | **Paper parser** | Better section semantics for abstracts/method/results |
| Slide decks | **Presentation parser** | Handles slide boundaries and concise bullet chunks |
| Legal/policy documents | **Laws parser** | Better handling of clause-like structures |
| Books/long-form docs | **Book parser** | Improved long-context segmentation |
| Tables/CSV-like content | Table-oriented parser modes | Keeps row/column meaning for retrieval |

### 4.3 Upload Documents

1. Enter the dataset.
2. Click **Upload**.
3. Select files or web crawl/source connector input.
4. Choose parser/pipeline from the table above.
5. Start ingestion.

### 4.4 Validate Ingestion Quality

After processing completes:

1. Open document chunk preview.
2. Check:
   - Chunk boundaries are logical
   - Titles/metadata are preserved
   - Language detection is correct
3. Run **Retrieval test** with 5–10 real user queries.
4. If quality is poor, use **Change parser** and re-ingest.

## 5. Step 3 — Create Chat App and Search App

### 5.1 Create Chat App

1. Open **Chat App** management.
2. Click **Create app**.
3. Configure:
   - App name and description
   - Bound dataset(s)
   - Model/provider
   - System instruction / answer style
   - Citation and grounding settings
4. Save and publish.

### 5.2 Create Search App

1. Open **Search App** management.
2. Click **Create app**.
3. Configure:
   - App name and description
   - Bound dataset(s)
   - Retrieval strategy (keyword/vector/hybrid)
   - Result display options (snippet/highlight/source)
4. Save and publish.

### 5.3 Basic Permission Check

Before sharing links:

- Verify app visibility for intended roles/teams.
- Confirm unauthorized users cannot access restricted datasets.

## 6. Step 4 — Use Chat App and Search App

### 6.1 Effective Chat Usage

1. Ask grounded questions with context constraints (e.g., date range, product area).
2. Prefer specific prompts over broad prompts.
3. Inspect citations before trusting an answer.
4. If answer quality is low:
   - refine prompt
   - switch model
   - improve dataset chunks/parser

### 6.2 Effective Search Usage

1. Start with keywords users naturally use.
2. Add filters (project/date/source) to reduce noise.
3. Open top 3–5 results and validate source relevance.
4. For poor results, tune indexing strategy or metadata tags.

### 6.3 Team Operating Pattern (Recommended)

- Search first to discover sources
- Chat second to synthesize answer with citations
- Save high-value prompts/queries for team reuse

## 7. Step 5 — Create External API Key and Integrate with Promptfoo (Latest External API)

### 7.1 Create API Key in B-Knowledge with Correct Scopes

1. Open **Settings** or **API Keys**.
2. Click **Create key**.
3. Provide key name and scope (least privilege).
4. For Promptfoo evaluation, select the scope(s) that match your test:
   - `chat` → `POST /api/v1/external/chat`
   - `search` → `POST /api/v1/external/search`
   - `retrieval` → `POST /api/v1/external/retrieval`
5. Copy the key once and store in a secret manager.

### 7.2 Prepare Promptfoo Environment

1. Follow Promptfoo setup guide: [Evaluate RAG](https://www.promptfoo.dev/docs/guides/evaluate-rag/)
2. Install promptfoo in your evaluation repo.
3. Add environment variables:

```bash
export BKNOWLEDGE_API_BASE_URL="https://<your-domain-or-local-api>"
export BKNOWLEDGE_API_KEY="<your-external-api-key>"
export BKNOWLEDGE_ASSISTANT_ID="<assistant-id-for-chat-eval>"
export BKNOWLEDGE_SEARCH_APP_ID="<search-app-id-for-search-eval>"
export BKNOWLEDGE_DATASET_ID="<dataset-id-for-retrieval-eval>"
```

### 7.3 Sanity Test Endpoint First (Recommended)

Before running Promptfoo, validate your key and route:

```bash
curl -X POST "$BKNOWLEDGE_API_BASE_URL/api/v1/external/chat" \
  -H "Authorization: Bearer $BKNOWLEDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Summarize refund policy in 2 bullets",
    "assistant_id": "'"$BKNOWLEDGE_ASSISTANT_ID"'",
    "options": {
      "method": "hybrid",
      "top_k": 8,
      "include_contexts": true,
      "include_metadata": true
    }
  }'
```

If this request returns `401/403`, re-check API key scope and header format.

### 7.4 Promptfoo Config — Chat Evaluation (`/api/v1/external/chat`)

Use this when you want answer quality + citation/context quality from your **Chat App / assistant**:

```yaml
# promptfooconfig.yaml
prompts:
  - "{{question}}"

providers:
  - id: http
    config:
      url: "{{ env.BKNOWLEDGE_API_BASE_URL }}/api/v1/external/chat"
      method: POST
      headers:
        Authorization: "Bearer {{ env.BKNOWLEDGE_API_KEY }}"
        Content-Type: application/json
      body:
        assistant_id: "{{ env.BKNOWLEDGE_ASSISTANT_ID }}"
        query: "{{question}}"
        options:
          method: "hybrid"
          top_k: 8
          include_contexts: true
          include_metadata: true

tests:
  - vars:
      question: "What is the SLA for incident severity 1?"
    assert:
      - type: contains
        value: "SLA"
      - type: javascript
        value: "Array.isArray(output.contexts) && output.contexts.length > 0"
      - type: javascript
        value: "typeof output.answer === 'string' && output.answer.length > 0"
```

### 7.5 Promptfoo Config — Retrieval Evaluation (`/api/v1/external/retrieval`)

Use this to isolate retrieval quality (without generation variance):

```yaml
# promptfooconfig.retrieval.yaml
prompts:
  - "{{question}}"

providers:
  - id: http
    config:
      url: "{{ env.BKNOWLEDGE_API_BASE_URL }}/api/v1/external/retrieval"
      method: POST
      headers:
        Authorization: "Bearer {{ env.BKNOWLEDGE_API_KEY }}"
        Content-Type: application/json
      body:
        query: "{{question}}"
        dataset_ids:
          - "{{ env.BKNOWLEDGE_DATASET_ID }}"
        options:
          method: "hybrid"
          top_k: 15
          similarity_threshold: 0.2
          include_contexts: true
          include_metadata: true

tests:
  - vars:
      question: "Which auth methods are supported?"
    assert:
      - type: javascript
        value: "Array.isArray(output.contexts) && output.contexts.length >= 3"
      - type: javascript
        value: "output.metadata && output.metadata.search_method === 'hybrid'"
```

### 7.6 Promptfoo Config — Search Evaluation (`/api/v1/external/search`)

Use this when evaluating search-app behavior (ranking + synthesized summary):

```yaml
# promptfooconfig.search.yaml
prompts:
  - "{{question}}"

providers:
  - id: http
    config:
      url: "{{ env.BKNOWLEDGE_API_BASE_URL }}/api/v1/external/search"
      method: POST
      headers:
        Authorization: "Bearer {{ env.BKNOWLEDGE_API_KEY }}"
        Content-Type: application/json
      body:
        search_app_id: "{{ env.BKNOWLEDGE_SEARCH_APP_ID }}"
        query: "{{question}}"
        options:
          method: "hybrid"
          top_k: 10
          include_contexts: true
          include_metadata: true
```

### 7.7 Run Evaluation

```bash
promptfoo eval
promptfoo view
```

For alternative configs:

```bash
promptfoo eval -c promptfooconfig.retrieval.yaml
promptfoo eval -c promptfooconfig.search.yaml
```

Track these metrics over time:
- Faithfulness / groundedness
- Relevance
- Context recall
- Response consistency across model versions
- Retrieval hit quality (retrieval mode only)

## 8. Troubleshooting Quick Reference

| Symptom | Likely cause | Action |
|---|---|---|
| LLM test fails | Invalid key/base URL | Recheck provider credentials and endpoint |
| Dataset returns irrelevant chunks | Wrong parser/chunking | Re-ingest with parser aligned to document type |
| Chat has no citations | Citation settings disabled or no retrievable chunks | Enable citations and validate indexing |
| Search misses obvious docs | Poor metadata/indexing strategy | Add tags, improve chunk metadata, tune retrieval mode |
| Promptfoo returns 401/403 | Wrong/expired API key or missing scope | Regenerate key and verify Bearer header + endpoint scope |
| Promptfoo gets 429 | External API rate limit (100 req/min/IP) | Reduce concurrency, batch tests, or stagger runs |

## 9. Recommended Next Steps

- Create one golden evaluation set per business domain.
- Run Promptfoo evaluation for every major model or pipeline change.
- Keep a parser selection playbook per document source.
- Audit API key scopes quarterly.

## 10. Related Docs

- [LLM Provider Detail](/detail-design/supporting/llm-provider-detail)
- [API Keys Detail](/detail-design/supporting/api-keys-detail)
- [Dataset Overview](/detail-design/dataset-document/dataset-overview)
- [Document Parsers Reference](/detail-design/dataset-document/document-parsers-reference)
- [OpenAI-Compatible API](/detail-design/supporting/openai-compatible-api)
- [External API Reference](/detail-design/supporting/external-api-reference)

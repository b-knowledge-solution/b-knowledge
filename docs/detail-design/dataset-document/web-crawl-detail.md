# Web Crawl as Data Source — Detail Design

> **Feature**: GAP-5 | **Module**: RAG | **Status**: Implemented

## 1. Overview

The web crawl feature allows users to add web pages as documents in their dataset by providing a URL. The system validates the URL, prevents SSRF attacks, creates a placeholder document, and queues a crawl task. The advance-rag worker fetches the page, converts HTML to PDF, uploads it to storage, and optionally auto-parses it into searchable chunks.

---

## 2. Use Cases

| Actor | Action | Outcome |
|-------|--------|---------|
| Knowledge Manager | Enters URL of a docs page | Page fetched, converted to PDF, parsed into chunks |
| Researcher | Adds reference article URL | Article content becomes searchable in knowledge base |
| User | Enters URL with custom name | Document created with user-specified name |
| User | Disables auto-parse | Document fetched but not parsed (manual parse later) |
| Attacker | Enters internal URL (10.0.0.1) | Request rejected by SSRF protection |

---

## 3. Design

### 3.1 End-to-End Flow

```
User                  Frontend              Backend                 Redis           Worker
 │                      │                      │                      │                │
 │ Enter URL + options  │                      │                      │                │
 │─────────────────────▶│                      │                      │                │
 │                      │ POST /documents/     │                      │                │
 │                      │      web-crawl       │                      │                │
 │                      │─────────────────────▶│                      │                │
 │                      │                      │                      │                │
 │                      │                      │ 1. Validate URL      │                │
 │                      │                      │    (http/https only) │                │
 │                      │                      │                      │                │
 │                      │                      │ 2. SSRF check        │                │
 │                      │                      │    (block private    │                │
 │                      │                      │     IPs)             │                │
 │                      │                      │                      │                │
 │                      │                      │ 3. Create document   │                │
 │                      │                      │    source_type=      │                │
 │                      │                      │    'web_crawl'       │                │
 │                      │                      │    status=UNSTART    │                │
 │                      │                      │                      │                │
 │                      │                      │ 4. Queue crawl task  │                │
 │                      │                      │─────────────────────▶│                │
 │                      │                      │                      │                │
 │                      │ 200 OK (placeholder) │                      │                │
 │                      │◀─────────────────────│                      │                │
 │                      │                      │                      │                │
 │ See document in list │                      │                      │ 5. Consume     │
 │ (status: crawling)   │                      │                      │────────────▶│
 │                      │                      │                      │              │
 │                      │                      │                      │ 6. Fetch URL │
 │                      │                      │                      │ 7. HTML→PDF  │
 │                      │                      │                      │ 8. Upload S3 │
 │                      │                      │                      │ 9. If auto:  │
 │                      │                      │                      │    parse     │
 │                      │                      │                      │              │
 │ Status updates via   │                      │                      │◀─────────────│
 │ polling/SSE          │                      │                      │                │
```

### 3.2 SSRF Prevention

The backend validates URLs server-side to prevent Server-Side Request Forgery:

```
Blocked IP Ranges:
├── 10.0.0.0/8        (Private Class A)
├── 172.16.0.0/12     (Private Class B)
├── 192.168.0.0/16    (Private Class C)
├── 127.0.0.0/8       (Loopback)
├── ::1               (IPv6 Loopback)
├── fe80::/10         (Link-Local)
└── 0.0.0.0           (Unspecified)
```

**Validation steps:**
1. Parse URL — must be `http://` or `https://` scheme
2. Resolve hostname to IP address
3. Check IP against blocked ranges
4. If blocked, return 400 with "URL resolves to a private IP address"

### 3.3 Database Schema

```sql
-- Existing columns on document table
source_type VARCHAR DEFAULT 'local'   -- 'local' | 'web_crawl'
source_url  VARCHAR NULL              -- Original URL for web_crawl
```

---

## 4. Business Logic

### 4.1 Request Processing

1. **Validate URL format**: Must be a valid URL with http/https scheme
2. **SSRF check**: Resolve hostname, verify IP is not in blocked ranges
3. **Create document record**:
   - `name`: User-provided name or auto-detected from URL path
   - `source_type`: `'web_crawl'`
   - `source_url`: Original URL
   - `status`: `'UNSTART'`
   - `parser_id`: Dataset's default parser
4. **Queue crawl task**: Push to Redis queue for advance-rag worker

### 4.2 Worker Execution

The advance-rag worker processes the crawl task:

1. **Fetch URL**: HTTP GET with timeout and user-agent header
2. **Extract content**: Parse HTML, extract main content
3. **Convert to PDF**: HTML → PDF conversion (consistent with document parsing pipeline)
4. **Upload to S3/RustFS**: Store the PDF in the documents bucket
5. **Update document**: Set file path, size, status
6. **Auto-parse** (if enabled): Queue a parse task for the same document

### 4.3 Document Display

Web-crawled documents are visually distinguished in the document table:

| Source Type | Icon | Tooltip |
|------------|------|---------|
| `local` | Upload icon | "Uploaded file" |
| `web_crawl` | Globe icon | Shows original URL |

---

## 5. Frontend Components

### 5.1 WebCrawlDialog

| Element | Type | Details |
|---------|------|---------|
| URL input | Text input | Required, validates HTTP/HTTPS format |
| Document name | Text input | Optional, placeholder: "Auto-detected from page title" |
| Auto-parse toggle | Checkbox | Default: checked. "Automatically parse after crawl" |
| URL validation | Inline error | Shows error for invalid URLs on blur |
| Submit button | Button | "Crawl", disabled until valid URL, loading state |
| Cancel button | Button | Closes dialog |

### 5.2 Document Table Integration

- "Web Crawl" button in the document toolbar (alongside "Upload")
- Opens the WebCrawlDialog
- After submission, new document appears in the table with globe icon

### 5.3 i18n Keys

| Key | EN | VI | JA |
|-----|----|----|-----|
| `webCrawl` | Web Crawl | Thu thập web | Webクロール |
| `webCrawlUrl` | URL | URL | URL |
| `webCrawlName` | Document Name | Tên tài liệu | ドキュメント名 |
| `webCrawlAutoParse` | Auto-parse after crawl | Tự động phân tích | クロール後に自動解析 |
| `webCrawlInvalidUrl` | Please enter a valid HTTP/HTTPS URL | ... | ... |

---

## 6. API Reference

```
POST /api/v1/datasets/:id/documents/web-crawl
Content-Type: application/json

{
  "url": "https://docs.example.com/getting-started",
  "name": "Getting Started Guide",
  "auto_parse": true
}

Response 200:
{
  "id": "doc-456",
  "name": "Getting Started Guide",
  "source_type": "web_crawl",
  "source_url": "https://docs.example.com/getting-started",
  "run": "UNSTART",
  "progress": 0,
  "parser_id": "naive"
}

Response 400 (SSRF blocked):
{
  "error": "URL resolves to a private IP address"
}

Response 400 (invalid URL):
{
  "error": "Invalid URL format. Must be HTTP or HTTPS."
}
```

---

## 7. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| SSRF — access internal services | Block private IP ranges, loopback, link-local |
| SSRF — DNS rebinding | Resolve hostname before request, validate IP |
| Content injection | HTML→PDF conversion isolates content from backend |
| DoS — large pages | Worker-side timeout and max content size limits |
| Credential exposure | No authentication headers sent with crawl requests |

---

## 8. Error Handling

| Scenario | Response | UI Behavior |
|----------|----------|-------------|
| Invalid URL format | 400 | Inline validation error on URL input |
| SSRF — private IP | 400 | Toast: "URL resolves to a private IP address" |
| URL unreachable | Worker error | Document status set to FAIL |
| HTML conversion fails | Worker error | Document status set to FAIL |
| Duplicate URL | 200 (creates new) | New document created (duplicates allowed) |

---

## 9. Related Documents

- [Document Upload](/detail-design/dataset-document/document-upload-detail)
- [Document Parsing](/detail-design/dataset-document/document-parsing-detail)
- [Dataset Overview](/detail-design/dataset-document/dataset-overview)

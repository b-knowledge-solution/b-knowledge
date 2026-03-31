# Email Parser — Detail Design

> **Module**: `advance-rag/rag/app/email.py`
> **Parser Type**: `ParserType.EMAIL`
> **Category**: Communication
> **Role**: Parser for email files (.eml format)

---

## 1. Overview

The Email Parser handles RFC 5322 email files (.eml format). It extracts email headers (From, To, Subject, Date, etc.), parses the body (handling multipart messages with text/plain and text/html alternatives), and recursively processes attachments using the Naive Parser. The result is a set of chunks covering the email body and all attachment content.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Email archival** | Index corporate email archives for compliance search |
| **Customer correspondence** | Import customer email threads into knowledge base |
| **Support tickets** | Email-based support tickets with attachments |
| **Legal discovery** | E-discovery of email communications |
| **Knowledge capture** | Important email discussions as searchable knowledge |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| EML | RFC 5322 standard email format |
| (MBOX) | Not directly supported; requires pre-splitting into .eml files |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Parse EML headers      │
              │  (From, To, Subject,    │
              │   Date, CC, etc.)       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Parse body             │
              │  (multipart handling)   │
              └────────────┬────────────┘
                           │
              ┌────────Yes─┴──No────────┐
              ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ text/plain body  │      │ text/html body   │
    │ (preferred)      │      │ (strip HTML)     │
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             └───────────┬─────────────┘
                         │
              ┌──────────▼──────────┐
              │ Combine headers     │
              │ + body text         │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ naive_merge() with  │
              │ configurable        │
              │ delimiters          │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ Process attachments │
              │ recursively via     │
              │ naive_chunk()       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ Combine body chunks │
              │ + attachment chunks │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ tokenize_chunks()   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ Return all chunks   │
              └─────────────────────┘
```

### 4.2 Function Signature

```python
def chunk(
    filename: str,
    binary: bytes,
    from_page: int = 0,
    to_page: int = 100000,
    lang: str = "English",
    callback=None,
    **kwargs
) -> list[dict]:
```

---

## 5. Business Logic

### 5.1 Header Extraction

All email headers are extracted and formatted as text:

```
From: john.doe@company.com
To: jane.smith@company.com
CC: team@company.com
Subject: Q3 Product Roadmap Discussion
Date: Mon, 15 Mar 2024 10:30:00 +0700
```

Headers are included at the beginning of the email body text, ensuring they are searchable. Users can find emails by sender, subject, date, etc.

### 5.2 Body Parsing — Multipart Handling

Emails can contain multiple body parts (MIME multipart):

**Priority order**:
1. **text/plain**: Preferred — clean text without formatting
2. **text/html**: Fallback — HTML tags are stripped, text content extracted

**For multipart messages**:
1. Walk the MIME tree recursively
2. For each `text/plain` part, extract the text
3. For each `text/html` part (if no plain text), strip HTML and extract text
4. Combine all text parts

### 5.3 Encoding Handling

Email encodings can vary significantly:

**Charset fallback chain**:
1. Use the charset declared in the Content-Type header
2. If decoding fails, try UTF-8
3. If UTF-8 fails, try GB2312 (common for Chinese emails)
4. If GB2312 fails, try GBK
5. Last resort: Latin-1 (never fails, but may produce garbage for non-Latin text)

### 5.4 Chunking Strategy

The combined headers + body text is chunked using `naive_merge()`:
- Same configurable delimiters as the Naive Parser
- Same `chunk_token_num` limit
- Headers are included in the first chunk to maintain context

### 5.5 Attachment Processing

Attachments are processed recursively:

1. **Extract**: Each MIME attachment is extracted with its filename and binary data
2. **Delegate**: Passed to `naive_chunk()` (the Naive Parser's chunk function)
3. **Combine**: Attachment chunks are appended to the body chunks
4. **Isolation**: If an attachment fails to parse, it is logged but does not block the main body

**Supported attachment types**: Any format supported by the Naive Parser (PDF, DOCX, Excel, images, etc.)

### 5.6 Nested Emails

For forwarded or attached emails (.eml within .eml):
- The parser can recursively process nested email attachments
- Each nested email produces its own set of chunks

---

## 6. Output Example

```python
# Email body chunk
{
    "content_with_weight": "From: john.doe@company.com\nTo: jane.smith@company.com\nSubject: Q3 Product Roadmap Discussion\nDate: Mon, 15 Mar 2024\n\nHi Jane,\n\nI've reviewed the product roadmap for Q3. Here are my thoughts on the key priorities:\n\n1. Authentication module overhaul\n2. Performance optimization for search\n3. New file format support",
    "content_ltks": ["from", "john", "doe", "subject", "roadmap", "authentication", "performance"],
    "docnm_kwd": "roadmap-discussion.eml",
    "title_tks": ["product", "roadmap", "discussion"],
    "page_num_int": [0]
}

# Attachment chunk (PDF attached to the email)
{
    "content_with_weight": "Q3 2024 Product Roadmap\n\nPhase 1: Foundation (July)\n- Complete auth module redesign...",
    "content_ltks": ["product", "roadmap", "phase", "foundation", "auth", "module"],
    "docnm_kwd": "q3-roadmap.pdf",
    "page_num_int": [1]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Email | Naive | QA |
|--------|-------|-------|----|
| Header extraction | Yes (From, To, Subject, etc.) | No | No |
| Multipart handling | Yes (text/plain + text/html) | No | No |
| Attachment processing | Yes (recursive via Naive) | No | No |
| Encoding fallback | 5-level charset chain | UTF-8 only | UTF-8 only |
| Chunking | naive_merge() | naive_merge() | Q&A pairs |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Corrupt EML file | Logs error, returns empty list |
| Unknown charset | Falls through to Latin-1 |
| Attachment parse failure | Logged; body chunks still returned |
| Nested email failure | Logged; outer email still processed |
| HTML-only email (no plain text) | HTML stripped to extract text |
| Empty email body | Returns headers-only chunk |
| Binary-only email (no text part) | Returns headers + attachment chunks only |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `email` (stdlib) | EML parsing (RFC 5322) |
| `rag/app/naive.py` | Attachment processing via naive_chunk() |
| `rag/nlp/` | naive_merge(), tokenize_chunks() |

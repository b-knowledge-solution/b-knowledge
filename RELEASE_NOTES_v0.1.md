# B-Knowledge v0.1 — Initial Release

> Open-source UI to centralize and manage AI Search, Chat, and Knowledge Base.

## Highlights

- **19 document parsers** — PDF, Word, Excel, PowerPoint, Code, Email, Audio, Images, and more
- **RAG pipeline** with GraphRAG, RAPTOR, and Mindmap knowledge extraction
- **AI Chat & Search** with streaming responses, assistants, and OpenAI-compatible API
- **Agent workflow canvas** with visual node editor, debug mode, and MCP tool integration
- **Code Knowledge Graph** with 12-language Tree-sitter parsing and NL-to-Cypher queries
- **Multi-tenant** with Azure AD SSO, RBAC, and team-based access control
- **3 languages** — English, Vietnamese, Japanese

---

## Chat & Conversational AI

- Multi-turn conversations with persistent history
- Real-time streaming via Server-Sent Events
- Configurable chat assistants with custom prompts and model selection
- File attachments (images, PDFs) for multimodal context
- Text-to-speech (TTS) for responses
- Prompt builder with glossary-based keyword/task management
- Embed widget for external websites
- OpenAI-compatible endpoint (`POST /v1/chat/completions`)

## Search & Retrieval

- Hybrid vector + full-text semantic search
- Configurable search apps with reranking
- Related question generation
- Mindmap visualization of search results
- Retrieval testing and evaluation tools
- Embed widget for external integration
- OpenAI-compatible endpoint (`POST /v1/search/completions`)

## RAG Document Pipeline

- **19 specialized parsers:** Naive (general), Book, Paper, Clinical, Code, Manual, Email, Audio, Picture, OpenAPI, ADR, QA, One, Resume, SDLC Checklist, Table, Presentation, Laws, Tag
- **Multiple PDF backends:** DeepDOC, MinerU, Docling, TCADP, PaddleOCR, VLM
- Configurable chunk size, overlap, and splitting strategy
- Document enrichment: keyword extraction, question generation, auto-tagging, metadata
- Bulk document operations (upload, parse, delete, toggle availability)
- Per-document parser override
- Web crawl document creation from URLs
- Document versioning with full lifecycle tracking

## Advanced Knowledge Extraction

- **GraphRAG** — Knowledge graph construction with entity/relation extraction and multi-hop querying
- **RAPTOR** — Recursive abstractive processing for hierarchical document understanding
- **Mindmap** — Topic mapping and hierarchical visualization
- Task status tracking with real-time progress streaming

## Office Document Converter

- Word (.doc/.docx/.docm) to PDF via LibreOffice
- Excel (.xls/.xlsx/.xlsm) to PDF with smart page sizing
- PowerPoint (.ppt/.pptx/.pptm) to PDF
- PDF post-processing (empty page removal, whitespace trimming)
- Redis-based job queue with scheduled conversion windows
- Manual trigger for immediate processing
- Per-file progress tracking

## Dataset Management

- Dataset creation with embedding model and parser configuration
- Document table with parse/stop, progress bars, enabled toggle, parser badge
- Chunk browser with content preview
- Process log dialog with error highlighting
- Change parser per document with chunk reset
- Metadata schema builder and tag management
- Field map auto-detection from OpenSearch data
- Dataset access control (RBAC per dataset)
- Dataset settings (language, embedding model, chunk config, GraphRAG config)

## Project Management

- Project creation and organization
- Multi-category grouping (Documents, Standard, Code)
- Category versioning with document lifecycle
- Version document list with full dataset-detail parity
- Git repository import (clone) and ZIP upload
- Dataset linking across projects
- Entity-level permissions
- Converter job monitoring with Force Convert button

## Agent Workflow System

- Visual canvas editor for agent definition
- Node-based graph composition (input, output, action nodes)
- Agent execution with SSE streaming
- Debug mode with step-by-step execution and breakpoints
- Agent versioning and publishing
- Agent templates and duplication
- Export/import for sharing
- Tool credential management
- MCP (Model Context Protocol) integration
- Embed tokens for public agent access

## Code Knowledge Graph

- 12-language Tree-sitter parsing (Python, TypeScript, Java, Go, Rust, C++, etc.)
- Code graph extraction from AST (functions, classes, imports, calls)
- Memgraph graph database backend
- Cypher query execution
- Natural language to Cypher translation via AI
- Function caller/callee relationships
- Class inheritance hierarchy
- File dependency mapping
- Interactive graph visualization with PNG/SVG/JSON export

## Memory System

- Persistent memory pools for agents and chat
- Memory message CRUD with vector search
- Import from chat conversation history
- Direct memory write from agent nodes
- Soft-delete with forgetting semantics

## LLM Provider Management

- Multiple provider support: OpenAI, Anthropic Claude, Ollama, vLLM, custom
- Provider credential management and connection testing
- Default model selection per type (chat, embedding, reranking)
- Factory presets for common configurations
- Tokenizer utility for prompt planning

## Authentication & Security

- Azure AD OAuth SSO
- Local root user authentication
- Session management (Redis in production, memory in dev)
- Role-based access control (admin, manager, user)
- Attribute-based access control (ABAC) via CASL
- Team-based permission management
- Comprehensive audit logging
- Rate limiting (general: 1000/15min, auth: 20/15min)
- Helmet CSP, CORS, input validation (Zod)
- File upload security (magic byte validation, 60+ blocked extensions)

## External API

- API key management with scopes
- Three evaluation endpoints: chat, search, retrieval-only
- OpenAI-compatible chat and search APIs
- Rate limiting per API key
- Request/response logging

## Admin & Monitoring

- Dashboard with system statistics
- User and team management
- Audit log viewer with filtering
- Broadcast message system
- System health monitoring (DB, Redis, services)
- Chat/Search/Agent history browser with feedback indicators and CSV export

## Frontend

- React 19 + TypeScript + Vite 7 SPA
- shadcn/ui component library with dark mode
- TanStack Query for server state
- Socket.IO for real-time updates
- Responsive design with Tailwind CSS
- 18+ pages with lazy loading and error boundaries
- Internationalization: English, Vietnamese, Japanese

## Infrastructure

| Service | Technology | Purpose |
|---------|-----------|---------|
| Backend | Node.js 22 / Express 4 / TypeScript | API server |
| Frontend | React 19 / Vite 7 / Tailwind | SPA |
| RAG Worker | Python 3.11 / FastAPI | Document parsing & chunking |
| Converter | Python 3 / LibreOffice | Office-to-PDF conversion |
| Database | PostgreSQL 17 | Primary data store |
| Cache | Valkey (Redis) 8 | Sessions, queues, pub/sub |
| Search | OpenSearch 3.5 | Vector + text search |
| Storage | RustFS (S3-compatible) | File storage |

## Getting Started

```bash
npm run setup               # Full setup: prereqs, .env, deps, Python venv, Docker infra
npm run dev                 # Start all services (BE + FE + Worker + Converter)
```

See [README.md](README.md) for detailed setup instructions.

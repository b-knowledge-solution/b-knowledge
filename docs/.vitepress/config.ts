import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'B-Knowledge',
    description: 'System Documentation — SRS, Basic Design & Detail Design',
    head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
    ignoreDeadLinks: true,
    srcExclude: ['legacy/**'],

    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'B-Knowledge Docs',

      nav: [
        { text: 'Home', link: '/' },
        { text: 'RAG Guide', link: '/rag-guide/' },
        { text: 'SRS', link: '/srs/' },
        { text: 'Basic Design', link: '/basic-design/system-infra/system-architecture' },
        { text: 'Detail Design', link: '/detail-design/auth/overview' },
        { text: 'RAG Pipeline', link: '/detail-design/rag-pipeline/overview' },
        { text: 'ADR', link: '/adr/001-mem0-memory-backend' },
        { text: 'Superpowers', link: '/superpowers/specs/2026-03-25-source-code-sync' },
      ],

      sidebar: {
        '/rag-guide/': [
          {
            text: 'RAG Guide',
            items: [
              { text: 'RAG Pipeline Overview', link: '/rag-guide/' },
            ],
          },
          {
            text: 'Dive Deeper',
            collapsed: false,
            items: [
              { text: 'Basic Design: Pipeline Steps', link: '/basic-design/rag-pipeline/rag-pipeline-overview' },
              { text: 'Detail Design: Ingestion', link: '/detail-design/rag-pipeline/overview' },
              { text: 'Detail Design: Chat Pipeline', link: '/detail-design/chat/overview' },
              { text: 'Detail Design: Search Pipeline', link: '/detail-design/search/overview' },
              { text: 'SRS: RAG Strategy', link: '/srs/core-platform/fr-rag-strategy' },
            ],
          },
        ],

        '/srs/core-platform/': [
          {
            text: 'Core Platform',
            items: [
              { text: 'RAG Strategy & Architecture', link: '/srs/core-platform/fr-rag-strategy' },
              { text: 'Retrieval Pipeline', link: '/srs/core-platform/fr-retrieval-pipeline' },
              { text: 'Authentication', link: '/srs/core-platform/fr-authentication' },
              { text: 'User & Team Management', link: '/srs/core-platform/fr-user-team-management' },
              { text: 'Dataset Management', link: '/srs/core-platform/fr-dataset-management' },
              { text: 'Document Processing', link: '/srs/core-platform/fr-document-processing' },
              { text: 'Dataset & Chunk Gaps', link: '/srs/core-platform/fr-dataset-gaps' },
            ],
          },
        ],

        '/srs/ai-features/': [
          {
            text: 'AI Features',
            items: [
              { text: 'AI Chat', link: '/srs/ai-features/fr-ai-chat' },
              { text: 'AI Search', link: '/srs/ai-features/fr-ai-search' },
              { text: 'Agents', link: '/srs/ai-features/fr-agents' },
              { text: 'Memory', link: '/srs/ai-features/fr-memory' },
            ],
          },
        ],

        '/srs/management/': [
          {
            text: 'Management & Operations',
            items: [
              { text: 'Project Management', link: '/srs/management/fr-project-management' },
              { text: 'Glossary', link: '/srs/management/fr-glossary' },
              { text: 'LLM Provider', link: '/srs/management/fr-llm-provider' },
              { text: 'Admin Operations', link: '/srs/management/fr-admin-operations' },
              { text: 'Audit & Compliance', link: '/srs/management/fr-audit-compliance' },
              { text: 'Feedback System', link: '/srs/management/fr-feedback-system' },
              { text: 'Guideline & Onboarding', link: '/srs/management/fr-guideline-onboarding' },
              { text: 'Broadcast Messages', link: '/srs/management/fr-broadcast' },
              { text: 'User History', link: '/srs/management/fr-user-history' },
              { text: 'System Tools', link: '/srs/management/fr-system-tools' },
              { text: 'Landing Page', link: '/srs/management/fr-landing-page' },
            ],
          },
        ],

        '/srs/integrations/': [
          {
            text: 'Integrations & Extensions',
            items: [
              { text: 'Embed Widgets', link: '/srs/integrations/fr-embed-widgets' },
              { text: 'Sync Connectors', link: '/srs/integrations/fr-sync-connectors' },
              { text: 'Document Converter', link: '/srs/integrations/fr-document-converter' },
              { text: 'Code Knowledge Graph', link: '/srs/integrations/fr-code-graph' },
              { text: 'External API & API Keys', link: '/srs/integrations/fr-external-api' },
            ],
          },
        ],

        '/srs/': [
          {
            text: 'Software Requirements Specification',
            items: [
              { text: 'Overview & Scope', link: '/srs/' },
              { text: 'Non-Functional Requirements', link: '/srs/nfr' },
            ],
          },
          {
            text: 'Core Platform',
            collapsed: false,
            items: [
              { text: 'RAG Strategy & Architecture', link: '/srs/core-platform/fr-rag-strategy' },
              { text: 'Retrieval Pipeline', link: '/srs/core-platform/fr-retrieval-pipeline' },
              { text: 'Authentication', link: '/srs/core-platform/fr-authentication' },
              { text: 'User & Team Management', link: '/srs/core-platform/fr-user-team-management' },
              { text: 'Dataset Management', link: '/srs/core-platform/fr-dataset-management' },
              { text: 'Document Processing', link: '/srs/core-platform/fr-document-processing' },
            ],
          },
          {
            text: 'AI Features',
            collapsed: false,
            items: [
              { text: 'AI Chat', link: '/srs/ai-features/fr-ai-chat' },
              { text: 'AI Search', link: '/srs/ai-features/fr-ai-search' },
              { text: 'Agents', link: '/srs/ai-features/fr-agents' },
              { text: 'Memory', link: '/srs/ai-features/fr-memory' },
            ],
          },
          {
            text: 'Management & Operations',
            collapsed: false,
            items: [
              { text: 'Project Management', link: '/srs/management/fr-project-management' },
              { text: 'Glossary', link: '/srs/management/fr-glossary' },
              { text: 'LLM Provider', link: '/srs/management/fr-llm-provider' },
              { text: 'Admin Operations', link: '/srs/management/fr-admin-operations' },
              { text: 'Audit & Compliance', link: '/srs/management/fr-audit-compliance' },
              { text: 'Feedback System', link: '/srs/management/fr-feedback-system' },
              { text: 'Guideline & Onboarding', link: '/srs/management/fr-guideline-onboarding' },
              { text: 'Broadcast Messages', link: '/srs/management/fr-broadcast' },
              { text: 'User History', link: '/srs/management/fr-user-history' },
              { text: 'System Tools', link: '/srs/management/fr-system-tools' },
              { text: 'Landing Page', link: '/srs/management/fr-landing-page' },
            ],
          },
          {
            text: 'Integrations & Extensions',
            collapsed: false,
            items: [
              { text: 'Embed Widgets', link: '/srs/integrations/fr-embed-widgets' },
              { text: 'Sync Connectors', link: '/srs/integrations/fr-sync-connectors' },
              { text: 'Document Converter', link: '/srs/integrations/fr-document-converter' },
              { text: 'Code Knowledge Graph', link: '/srs/integrations/fr-code-graph' },
              { text: 'External API & API Keys', link: '/srs/integrations/fr-external-api' },
            ],
          },
        ],

        '/basic-design/': [
          {
            text: 'System & Infrastructure',
            items: [
              { text: 'System Architecture', link: '/basic-design/system-infra/system-architecture' },
              { text: 'Infrastructure & Deployment', link: '/basic-design/system-infra/infrastructure-deployment' },
              { text: 'Security Architecture', link: '/basic-design/system-infra/security-architecture' },
            ],
          },
          {
            text: 'Database Design',
            items: [
              { text: 'Core Tables', link: '/basic-design/database/database-design-core' },
              { text: 'RAG Tables', link: '/basic-design/database/database-design-rag' },
              { text: 'Chat & Search Tables', link: '/basic-design/database/database-design-chat-search' },
              { text: 'Project Tables', link: '/basic-design/database/database-design-projects' },
              { text: 'Support Tables', link: '/basic-design/database/database-design-support' },
              { text: 'Agent & Memory Tables', link: '/basic-design/database/database-design-agents-memory' },
            ],
          },
          {
            text: 'Component Architecture',
            items: [
              { text: 'Backend Architecture', link: '/basic-design/component/backend-architecture' },
              { text: 'Frontend Architecture', link: '/basic-design/component/frontend-architecture' },
              { text: 'API Design: Overview', link: '/basic-design/component/api-design-overview' },
              { text: 'API Design: Endpoints', link: '/basic-design/component/api-design-endpoints' },
            ],
          },
          {
            text: 'RAG Pipeline',
            items: [
              { text: 'Pipeline Overview', link: '/basic-design/rag-pipeline/rag-pipeline-overview' },
              { text: 'Step 1: Document Ingestion', link: '/basic-design/rag-pipeline/rag-step-document-ingestion' },
              { text: 'Step 2: Parser Selection', link: '/basic-design/rag-pipeline/rag-step-parser-selection' },
              { text: 'Step 3: Content Extraction', link: '/basic-design/rag-pipeline/rag-step-content-extraction' },
              { text: 'Step 4: LLM Enhancement', link: '/basic-design/rag-pipeline/rag-step-llm-enhancement' },
              { text: 'Step 5: Chunking', link: '/basic-design/rag-pipeline/rag-step-chunking' },
              { text: 'Step 6: Embedding & Indexing', link: '/basic-design/rag-pipeline/rag-step-embedding-indexing' },
              { text: 'Step 7: Retrieval', link: '/basic-design/rag-pipeline/rag-step-retrieval' },
              { text: 'Advanced: GraphRAG', link: '/basic-design/rag-pipeline/rag-advanced-graphrag' },
              { text: 'Advanced: Search Execution', link: '/basic-design/rag-pipeline/rag-advanced-search' },
              { text: 'Dataset Gaps Architecture', link: '/basic-design/rag-pipeline/dataset-gaps-architecture' },
            ],
          },
          {
            text: 'Agent & Memory',
            items: [
              { text: 'Agent Architecture', link: '/basic-design/agent-memory/agent-architecture' },
              { text: 'Memory Architecture', link: '/basic-design/agent-memory/memory-architecture' },
            ],
          },
          {
            text: 'Converter',
            items: [
              { text: 'Converter Pipeline', link: '/basic-design/converter/converter-pipeline' },
            ],
          },
        ],

        '/detail-design/': [
          {
            text: 'Authentication & Authorization',
            items: [
              { text: 'Overview', link: '/detail-design/auth/overview' },
              { text: 'Azure AD Flow', link: '/detail-design/auth/azure-ad-flow' },
              { text: 'Local Login', link: '/detail-design/auth/local-login' },
              { text: 'RBAC & ABAC', link: '/detail-design/auth/rbac-abac' },
              { text: 'RBAC & ABAC Comprehensive', link: '/detail-design/auth/rbac-abac-comprehensive' },
              { text: 'Permission Matrix System', link: '/detail-design/auth/permission-matrix-system' },
              { text: 'Permission Maintenance Guide', link: '/detail-design/auth/permission-maintenance-guide' },
            ],
          },
          {
            text: 'User & Team Management',
            items: [
              { text: 'User Management Overview', link: '/detail-design/user-team/user-management-overview' },
              { text: 'User Operations', link: '/detail-design/user-team/user-management-detail' },
              { text: 'Team Management', link: '/detail-design/user-team/team-management-detail' },
            ],
          },
          {
            text: 'Dataset & Document',
            items: [
              { text: 'Dataset Overview', link: '/detail-design/dataset-document/dataset-overview' },
              { text: 'Dataset CRUD', link: '/detail-design/dataset-document/dataset-crud-detail' },
              { text: 'Document Upload', link: '/detail-design/dataset-document/document-upload-detail' },
              { text: 'Document Parsing', link: '/detail-design/dataset-document/document-parsing-detail' },
              { text: 'Document Enrichment', link: '/detail-design/dataset-document/document-enrichment-detail' },
              { text: 'Chunk Management', link: '/detail-design/dataset-document/chunk-management-detail' },
              { text: 'Parser Reference', link: '/detail-design/dataset-document/document-parsers-reference' },
              { text: 'Chunk Toggle', link: '/detail-design/dataset-document/chunk-toggle-detail' },
              { text: 'Chunk Keywords & Questions', link: '/detail-design/dataset-document/chunk-keywords-detail' },
              { text: 'Retrieval Test', link: '/detail-design/dataset-document/retrieval-test-detail' },
              { text: 'Change Parser', link: '/detail-design/dataset-document/change-parser-detail' },
              { text: 'Web Crawl', link: '/detail-design/dataset-document/web-crawl-detail' },
              { text: 'RAG Pipeline Parsers ➜', link: '/detail-design/rag-pipeline/overview' },
            ],
          },
          {
            text: 'AI Chat',
            items: [
              { text: 'Overview (14-Step Pipeline)', link: '/detail-design/chat/overview' },
              { text: 'Assistant Configuration', link: '/detail-design/chat/assistant-config' },
              { text: 'Input Processing (Steps 1-6)', link: '/detail-design/chat/completion-input-processing' },
              { text: 'Retrieval (Steps 7-8b)', link: '/detail-design/chat/completion-retrieval' },
              { text: 'Generation & Citations (Steps 9-14)', link: '/detail-design/chat/completion-generation' },
              { text: 'Embed Widget', link: '/detail-design/chat/embed-widget' },
            ],
          },
          {
            text: 'AI Search',
            items: [
              { text: 'Overview', link: '/detail-design/search/overview' },
              { text: 'Retrieval Pipeline', link: '/detail-design/search/retrieval-detail' },
              { text: 'Retrieval Pipeline (Deep Dive)', link: '/detail-design/search/retrieval-pipeline-detail' },
              { text: 'Ask Streaming (SSE)', link: '/detail-design/search/ask-streaming' },
              { text: 'Features', link: '/detail-design/search/features-detail' },
              { text: 'Embed Widget', link: '/detail-design/search/embed-widget' },
            ],
          },
          {
            text: 'Project Management',
            items: [
              { text: 'Overview', link: '/detail-design/project/overview' },
              { text: 'Project CRUD', link: '/detail-design/project/crud-detail' },
              { text: 'Categories & Versions', link: '/detail-design/project/category-detail' },
            ],
          },
          {
            text: 'Agent Workflows',
            items: [
              { text: 'Agent Overview', link: '/detail-design/agent/overview' },
              { text: 'Execution Engine', link: '/detail-design/agent/execution-engine' },
              { text: 'Canvas Editor & Frontend', link: '/detail-design/agent/canvas-editor' },
              { text: 'Sandbox & MCP Integration', link: '/detail-design/agent/sandbox-mcp' },
              { text: 'Triggers & Embed Widget', link: '/detail-design/agent/triggers-embed' },
            ],
          },
          {
            text: 'AI Memory',
            items: [
              { text: 'Memory Overview', link: '/detail-design/memory/overview' },
              { text: 'Extraction Pipeline', link: '/detail-design/memory/extraction-pipeline' },
              { text: 'Chat Integration', link: '/detail-design/memory/chat-integration' },
            ],
          },
          {
            text: 'Supporting Features',
            items: [
              { text: 'Glossary', link: '/detail-design/supporting/glossary-detail' },
              { text: 'LLM Provider', link: '/detail-design/supporting/llm-provider-detail' },
              { text: 'Admin Dashboard', link: '/detail-design/supporting/admin-dashboard-detail' },
              { text: 'Audit Logging', link: '/detail-design/supporting/audit-logging-detail' },
              { text: 'Broadcast Messages', link: '/detail-design/supporting/broadcast-detail' },
              { text: 'Sync Connectors', link: '/detail-design/supporting/sync-connectors-detail' },
              { text: 'Document Converter', link: '/detail-design/supporting/converter-detail' },
              { text: 'Chat Widget Client', link: '/detail-design/supporting/chat-widget-detail' },
              { text: 'Search Widget Client', link: '/detail-design/supporting/search-widget-detail' },
              { text: 'Agent Widget Client', link: '/detail-design/supporting/agent-widget-detail' },
              { text: 'Real-time Communication', link: '/detail-design/supporting/realtime-communication' },
              { text: 'OpenAI-Compatible API', link: '/detail-design/supporting/openai-compatible-api' },
              { text: 'External API Reference', link: '/detail-design/supporting/external-api-reference' },
              { text: 'GraphRAG', link: '/detail-design/supporting/graphrag-detail' },
              { text: 'Code Graph', link: '/detail-design/supporting/code-graph-detail' },
              { text: 'Guideline & Onboarding', link: '/detail-design/supporting/guideline-onboarding-detail' },
              { text: 'Basic User Manual', link: '/detail-design/supporting/basic-user-manual' },
              { text: 'Feedback', link: '/detail-design/supporting/feedback-detail' },
              { text: 'History Browsing', link: '/detail-design/supporting/history-browsing-detail' },
              { text: 'API Keys', link: '/detail-design/supporting/api-keys-detail' },
              { text: 'PDF Citation Highlighting', link: '/detail-design/supporting/pdf-citation-highlight-detail' },
              { text: 'Office Document Citations', link: '/detail-design/supporting/office-document-citation-highlighting' },
              { text: 'Preview', link: '/detail-design/supporting/preview-detail' },
              { text: 'Query Logging', link: '/detail-design/supporting/query-logging-detail' },
              { text: 'System Tools', link: '/detail-design/supporting/system-tools-detail' },
              { text: 'Tokenizer Playground', link: '/detail-design/supporting/tokenizer-detail' },
              { text: 'Landing Page', link: '/detail-design/supporting/landing-page-detail' },
              { text: 'Horizontal Scaling', link: '/detail-design/supporting/horizontal-scaling' },
            ],
          },
          {
            text: 'RAG Ingestion Pipeline',
            items: [
              { text: 'RAG Newcomer Guide', link: '/detail-design/rag-pipeline/rag-newcomer-guide' },
              { text: 'Pipeline Overview', link: '/detail-design/rag-pipeline/overview' },
            ],
          },
          {
            text: 'Document Parsing',
            collapsed: false,
            items: [
              { text: 'Naive Parser (Default)', link: '/detail-design/rag-pipeline/document-parsing/naive-parser' },
              { text: 'Book Parser', link: '/detail-design/rag-pipeline/document-parsing/book-parser' },
              { text: 'Paper Parser', link: '/detail-design/rag-pipeline/document-parsing/paper-parser' },
              { text: 'Manual Parser', link: '/detail-design/rag-pipeline/document-parsing/manual-parser' },
              { text: 'Laws Parser', link: '/detail-design/rag-pipeline/document-parsing/laws-parser' },
              { text: 'Presentation Parser', link: '/detail-design/rag-pipeline/document-parsing/presentation-parser' },
              { text: 'One Parser (Whole Doc)', link: '/detail-design/rag-pipeline/document-parsing/one-parser' },
            ],
          },
          {
            text: 'Structured Data',
            collapsed: false,
            items: [
              { text: 'Table Parser', link: '/detail-design/rag-pipeline/structured-data/table-parser' },
              { text: 'QA Parser', link: '/detail-design/rag-pipeline/structured-data/qa-parser' },
              { text: 'Tag Parser', link: '/detail-design/rag-pipeline/structured-data/tag-parser' },
            ],
          },
          {
            text: 'Media Processing',
            collapsed: false,
            items: [
              { text: 'Picture Parser', link: '/detail-design/rag-pipeline/media-processing/picture-parser' },
              { text: 'Audio Parser', link: '/detail-design/rag-pipeline/media-processing/audio-parser' },
            ],
          },
          {
            text: 'Communication',
            collapsed: false,
            items: [
              { text: 'Email Parser', link: '/detail-design/rag-pipeline/communication/email-parser' },
            ],
          },
          {
            text: 'Developer Tools',
            collapsed: false,
            items: [
              { text: 'Code Parser', link: '/detail-design/rag-pipeline/developer-tools/code-parser' },
              { text: 'OpenAPI Parser', link: '/detail-design/rag-pipeline/developer-tools/openapi-parser' },
              { text: 'ADR Parser', link: '/detail-design/rag-pipeline/developer-tools/adr-parser' },
              { text: 'SDLC Checklist Parser', link: '/detail-design/rag-pipeline/developer-tools/sdlc-checklist-parser' },
            ],
          },
          {
            text: 'Specialized',
            collapsed: false,
            items: [
              { text: 'Resume Parser', link: '/detail-design/rag-pipeline/specialized/resume-parser' },
              { text: 'Clinical Parser', link: '/detail-design/rag-pipeline/specialized/clinical-parser' },
            ],
          },
        ],

        '/adr/': [
          {
            text: 'Architecture Decision Records',
            items: [
              { text: 'ADR-001: mem0 Memory Backend', link: '/adr/001-mem0-memory-backend' },
            ],
          },
        ],

        '/superpowers/specs/': [
          {
            text: 'Superpowers Specs',
            items: [
              { text: '2026-03-25 Source Code Sync', link: '/superpowers/specs/2026-03-25-source-code-sync' },
              { text: '2026-03-25 Doc Coverage Audit', link: '/superpowers/specs/2026-03-25-doc-coverage-audit' },
              { text: 'Search Feature Gaps Design', link: '/superpowers/specs/2026-03-25-search-feature-gaps-design' },
              { text: 'SQL Fallback, Tags, Spotlight Design', link: '/superpowers/specs/2026-03-25-sql-fallback-tags-spotlight-design' },
            ],
          },
        ],

        '/superpowers/plans/': [
          {
            text: 'Superpowers Plans',
            items: [
              { text: '2026-04-01 Document Upload Converter Pipeline', link: '/superpowers/plans/2026-04-01-document-upload-converter-pipeline' },
              { text: '2026-03-25 Search Feature Gaps', link: '/superpowers/plans/2026-03-25-search-feature-gaps' },
              { text: '2026-03-25 SQL Tags Spotlight', link: '/superpowers/plans/2026-03-25-sql-tags-spotlight' },
              { text: '2026-03-24 Retrieval Quality Parity', link: '/superpowers/plans/2026-03-24-retrieval-quality-parity' },
            ],
          },
        ],

        '/superpowers/': [
          {
            text: 'Superpowers',
            items: [
              { text: '2026-03-25 Source Code Sync', link: '/superpowers/specs/2026-03-25-source-code-sync' },
              { text: '2026-03-25 Doc Coverage Audit', link: '/superpowers/specs/2026-03-25-doc-coverage-audit' },
              { text: 'Search Feature Gaps Design', link: '/superpowers/specs/2026-03-25-search-feature-gaps-design' },
              { text: 'SQL Fallback, Tags, Spotlight Design', link: '/superpowers/specs/2026-03-25-sql-fallback-tags-spotlight-design' },
              { text: '2026-04-01 Document Upload Converter Pipeline Plan', link: '/superpowers/plans/2026-04-01-document-upload-converter-pipeline' },
              { text: '2026-03-25 Search Feature Gaps Plan', link: '/superpowers/plans/2026-03-25-search-feature-gaps' },
              { text: '2026-03-25 SQL Tags Spotlight Plan', link: '/superpowers/plans/2026-03-25-sql-tags-spotlight' },
              { text: '2026-03-24 Retrieval Quality Parity Plan', link: '/superpowers/plans/2026-03-24-retrieval-quality-parity' },
            ],
          },
        ],
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/your-org/b-knowledge' },
      ],

      search: {
        provider: 'local',
      },

      outline: {
        level: [2, 3],
      },

      footer: {
        message: 'B-Knowledge System Documentation',
        copyright: 'Open Source Project',
      },
    },

    mermaid: {},
    mermaidPlugin: {
      class: 'mermaid',
    },
  })
)

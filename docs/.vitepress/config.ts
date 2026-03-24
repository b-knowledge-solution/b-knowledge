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
        { text: 'SRS', link: '/srs/' },
        { text: 'Basic Design', link: '/basic-design/system-architecture' },
        { text: 'Detail Design', link: '/detail-design/auth-overview' },
      ],

      sidebar: {
        '/srs/': [
          {
            text: 'Software Requirements Specification',
            items: [
              { text: 'Overview & Scope', link: '/srs/' },
              { text: 'RAG Strategy & Architecture', link: '/srs/fr-rag-strategy' },
              { text: 'Authentication', link: '/srs/fr-authentication' },
              { text: 'User & Team Management', link: '/srs/fr-user-team-management' },
              { text: 'Dataset Management', link: '/srs/fr-dataset-management' },
              { text: 'Document Processing', link: '/srs/fr-document-processing' },
              { text: 'AI Chat', link: '/srs/fr-ai-chat' },
              { text: 'AI Search', link: '/srs/fr-ai-search' },
              { text: 'Project Management', link: '/srs/fr-project-management' },
              { text: 'Glossary', link: '/srs/fr-glossary' },
              { text: 'LLM Provider', link: '/srs/fr-llm-provider' },
              { text: 'Admin Operations', link: '/srs/fr-admin-operations' },
              { text: 'Audit & Compliance', link: '/srs/fr-audit-compliance' },
              { text: 'Embed Widgets', link: '/srs/fr-embed-widgets' },
              { text: 'Sync Connectors', link: '/srs/fr-sync-connectors' },
              { text: 'Document Converter', link: '/srs/fr-document-converter' },
              { text: 'Agents', link: '/srs/fr-agents' },
              { text: 'Memory', link: '/srs/fr-memory' },
              { text: 'Non-Functional Requirements', link: '/srs/nfr' },
            ],
          },
        ],

        '/basic-design/': [
          {
            text: 'System & Infrastructure',
            items: [
              { text: 'System Architecture', link: '/basic-design/system-architecture' },
              { text: 'Infrastructure & Deployment', link: '/basic-design/infrastructure-deployment' },
              { text: 'Security Architecture', link: '/basic-design/security-architecture' },
            ],
          },
          {
            text: 'Database Design',
            items: [
              { text: 'Core Tables', link: '/basic-design/database-design-core' },
              { text: 'RAG Tables', link: '/basic-design/database-design-rag' },
              { text: 'Chat & Search Tables', link: '/basic-design/database-design-chat-search' },
              { text: 'Project Tables', link: '/basic-design/database-design-projects' },
              { text: 'Support Tables', link: '/basic-design/database-design-support' },
              { text: 'Agent & Memory Tables', link: '/basic-design/database-design-agents-memory' },
            ],
          },
          {
            text: 'Component Architecture',
            items: [
              { text: 'Backend Architecture', link: '/basic-design/backend-architecture' },
              { text: 'Frontend Architecture', link: '/basic-design/frontend-architecture' },
              { text: 'API Design: Overview', link: '/basic-design/api-design-overview' },
              { text: 'API Design: Endpoints', link: '/basic-design/api-design-endpoints' },
            ],
          },
          {
            text: 'RAG Pipeline',
            items: [
              { text: 'Pipeline Overview', link: '/basic-design/rag-pipeline-overview' },
              { text: 'Step 1: Document Ingestion', link: '/basic-design/rag-step-document-ingestion' },
              { text: 'Step 2: Parser Selection', link: '/basic-design/rag-step-parser-selection' },
              { text: 'Step 3: Content Extraction', link: '/basic-design/rag-step-content-extraction' },
              { text: 'Step 4: LLM Enhancement', link: '/basic-design/rag-step-llm-enhancement' },
              { text: 'Step 5: Chunking', link: '/basic-design/rag-step-chunking' },
              { text: 'Step 6: Embedding & Indexing', link: '/basic-design/rag-step-embedding-indexing' },
              { text: 'Advanced: GraphRAG', link: '/basic-design/rag-advanced-graphrag' },
              { text: 'Advanced: Search Execution', link: '/basic-design/rag-advanced-search' },
            ],
          },
          {
            text: 'Agent & Memory',
            items: [
              { text: 'Agent Architecture', link: '/basic-design/agent-architecture' },
              { text: 'Memory Architecture', link: '/basic-design/memory-architecture' },
            ],
          },
          {
            text: 'Converter',
            items: [
              { text: 'Converter Pipeline', link: '/basic-design/converter-pipeline' },
            ],
          },
        ],

        '/detail-design/': [
          {
            text: 'Authentication & Authorization',
            items: [
              { text: 'Overview', link: '/detail-design/auth-overview' },
              { text: 'Azure AD Flow', link: '/detail-design/auth-azure-ad-flow' },
              { text: 'Local Login', link: '/detail-design/auth-local-login' },
              { text: 'RBAC & ABAC', link: '/detail-design/auth-rbac-abac' },
              { text: 'RBAC & ABAC Comprehensive', link: '/detail-design/auth-rbac-abac-comprehensive' },
            ],
          },
          {
            text: 'User & Team Management',
            items: [
              { text: 'User Management Overview', link: '/detail-design/user-management-overview' },
              { text: 'User Operations', link: '/detail-design/user-management-detail' },
              { text: 'Team Management', link: '/detail-design/team-management-detail' },
            ],
          },
          {
            text: 'Dataset & Document',
            items: [
              { text: 'Dataset Overview', link: '/detail-design/dataset-overview' },
              { text: 'Dataset CRUD', link: '/detail-design/dataset-crud-detail' },
              { text: 'Document Upload', link: '/detail-design/document-upload-detail' },
              { text: 'Document Parsing', link: '/detail-design/document-parsing-detail' },
              { text: 'Document Enrichment', link: '/detail-design/document-enrichment-detail' },
              { text: 'Chunk Management', link: '/detail-design/chunk-management-detail' },
            ],
          },
          {
            text: 'AI Chat',
            items: [
              { text: 'Overview (14-Step Pipeline)', link: '/detail-design/chat-overview' },
              { text: 'Assistant Configuration', link: '/detail-design/chat-assistant-config' },
              { text: 'Input Processing (Steps 1-6)', link: '/detail-design/chat-completion-input-processing' },
              { text: 'Retrieval (Steps 7-8b)', link: '/detail-design/chat-completion-retrieval' },
              { text: 'Generation & Citations (Steps 9-14)', link: '/detail-design/chat-completion-generation' },
              { text: 'Embed Widget', link: '/detail-design/chat-embed-widget' },
            ],
          },
          {
            text: 'AI Search',
            items: [
              { text: 'Overview', link: '/detail-design/search-overview' },
              { text: 'Retrieval Pipeline', link: '/detail-design/search-retrieval-detail' },
              { text: 'Ask Streaming (SSE)', link: '/detail-design/search-ask-streaming' },
              { text: 'Features', link: '/detail-design/search-features-detail' },
              { text: 'Embed Widget', link: '/detail-design/search-embed-widget' },
            ],
          },
          {
            text: 'Project Management',
            items: [
              { text: 'Overview', link: '/detail-design/project-overview' },
              { text: 'Project CRUD', link: '/detail-design/project-crud-detail' },
              { text: 'Categories & Versions', link: '/detail-design/project-category-detail' },
            ],
          },
          {
            text: 'Agent Workflows',
            items: [
              { text: 'Agent Overview', link: '/detail-design/agent-overview' },
            ],
          },
          {
            text: 'AI Memory',
            items: [
              { text: 'Memory Overview', link: '/detail-design/memory-overview' },
            ],
          },
          {
            text: 'Supporting Features',
            items: [
              { text: 'Glossary', link: '/detail-design/glossary-detail' },
              { text: 'LLM Provider', link: '/detail-design/llm-provider-detail' },
              { text: 'Admin Dashboard', link: '/detail-design/admin-dashboard-detail' },
              { text: 'Audit Logging', link: '/detail-design/audit-logging-detail' },
              { text: 'Broadcast Messages', link: '/detail-design/broadcast-detail' },
              { text: 'Sync Connectors', link: '/detail-design/sync-connectors-detail' },
              { text: 'Document Converter', link: '/detail-design/converter-detail' },
              { text: 'Real-time Communication', link: '/detail-design/realtime-communication' },
              { text: 'OpenAI-Compatible API', link: '/detail-design/openai-compatible-api' },
              { text: 'GraphRAG', link: '/detail-design/graphrag-detail' },
              { text: 'Guideline & Onboarding', link: '/detail-design/guideline-onboarding-detail' },
              { text: 'Feedback', link: '/detail-design/feedback-detail' },
              { text: 'History Browsing', link: '/detail-design/history-browsing-detail' },
              { text: 'PDF Citation Highlighting', link: '/detail-design/pdf-citation-highlight-detail' },
              { text: 'Office Document Citations', link: '/detail-design/office-document-citation-highlighting' },
              { text: 'Preview', link: '/detail-design/preview-detail' },
              { text: 'Query Logging', link: '/detail-design/query-logging-detail' },
              { text: 'System Tools', link: '/detail-design/system-tools-detail' },
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

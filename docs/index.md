---
layout: home
hero:
  name: B-Knowledge
  text: System Documentation
  tagline: SRS, Basic Design & Detail Design — Complete Software Lifecycle Documentation
  actions:
    - theme: brand
      text: SRS Overview
      link: /srs/
    - theme: alt
      text: Basic Design
      link: /basic-design/system-architecture
    - theme: alt
      text: Detail Design
      link: /detail-design/auth-overview

features:
  - icon: 📋
    title: Software Requirements Specification
    details: Functional and non-functional requirements for all 15+ features including RAG strategy, AI Chat, AI Search, and more.
    link: /srs/
  - icon: 🏗️
    title: Basic Design
    details: System architecture, database ER diagrams, API design, RAG pipeline (9 detailed steps), and infrastructure deployment.
    link: /basic-design/system-architecture
  - icon: 🔧
    title: Detail Design
    details: Step-by-step implementation guides with sequence diagrams, state machines, and [OPTIONAL] config tags for every pipeline step.
    link: /detail-design/auth-overview
  - icon: 🤖
    title: Hybrid RAG Pipeline
    details: 14-step chat completion and multi-method search with vector + BM25 hybrid retrieval, GraphRAG, RAPTOR, and deep research.
    link: /basic-design/rag-pipeline-overview
  - icon: 🔒
    title: Security & Access Control
    details: Azure AD SSO, CASL RBAC, ABAC policies, multi-tenant isolation, audit logging, and session management.
    link: /basic-design/security-architecture
  - icon: 🐳
    title: Infrastructure & Deployment
    details: Docker Compose orchestration with PostgreSQL, Valkey, OpenSearch, RustFS, Nginx reverse proxy, and CI/CD.
    link: /basic-design/infrastructure-deployment
---

# FR: Landing Page

> Public landing page that serves as the entry point to the B-Knowledge platform, displaying feature highlights and navigation to login.

## 1. Overview

The Landing Page is the public-facing entry point of the B-Knowledge platform. It provides an overview of the platform's capabilities, feature highlights, and directs users to the login flow.

### 1.1 Goals

- Present the platform's value proposition to new visitors
- Highlight key features (AI Chat, AI Search, Knowledge Base, Agents)
- Provide clear call-to-action for login/registration
- Support both light and dark themes

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Anonymous Visitor | View landing page, navigate to login |
| Authenticated User | Redirected to dashboard (bypasses landing) |

## 2. Functional Requirements

### 2.1 Page Content

- **FR-LP-001**: The landing page shall display the platform name, description, and key feature highlights.
- **FR-LP-002**: Feature sections shall include AI Chat, AI Search, Knowledge Base Management, and Agent Workflows.
- **FR-LP-003**: The page shall include a prominent login/get-started button.

### 2.2 Navigation

- **FR-LP-010**: Authenticated users shall be redirected from the landing page to the main dashboard.
- **FR-LP-011**: The landing page shall be accessible without authentication.

## 3. Implementation

This is a frontend-only feature with no backend API endpoints:

| Component | Location | Purpose |
|-----------|----------|---------|
| Landing page components | `fe/src/features/landing/components/` | UI components |
| Landing pages | `fe/src/features/landing/pages/` | Page layouts |

## 4. Non-Functional Requirements

- Fully responsive (mobile, tablet, desktop)
- Dark mode support via class-based theming
- Fast initial load (no API calls required)
- i18n support (en, vi, ja)

## 5. Dependencies

- [Frontend Architecture](/basic-design/component/frontend-architecture) — React Router, theming, i18n
- [Authentication](/srs/core-platform/fr-authentication) — Login redirect flow

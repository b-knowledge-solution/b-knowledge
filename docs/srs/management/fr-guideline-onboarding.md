# FR: Guideline & Onboarding

> Provide contextual help dialogs and guided tours to onboard new users, explain feature functionality, and improve discoverability across the application.

## 1. Overview

The Guideline & Onboarding system delivers in-app help content through two mechanisms: **guideline dialogs** (contextual help panels) and **guided tours** (step-by-step walkthroughs). It detects first-time visitors and surfaces relevant guidance automatically, while also providing on-demand help buttons throughout the UI.

### 1.1 Goals

- Reduce time-to-productivity for new users
- Provide contextual, page-specific guidance without external documentation
- Support guided tours that walk users through key workflows
- Detect first visits per page and trigger onboarding automatically
- Allow users to re-access guidelines on demand via help buttons

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| New User | Automatically sees guideline dialogs on first visit to each page |
| Any User | Clicks help buttons to view guidelines for the current page |

## 2. Functional Requirements

### 2.1 First Visit Detection

- **FR-GO-001**: The system shall detect when a user visits a page for the first time (using localStorage).
- **FR-GO-002**: On first visit, the system shall automatically display the relevant guideline dialog.
- **FR-GO-003**: First-visit state shall persist per page across browser sessions.

### 2.2 Guideline Dialogs

- **FR-GO-010**: Each major feature page shall have a corresponding guideline with structured help content.
- **FR-GO-011**: Guidelines shall be defined as static data objects with title, description, and step-by-step instructions.
- **FR-GO-012**: The system shall support guidelines for the following pages:
  - AI Chat
  - AI Search
  - Knowledge Bases (Datasets)
  - Knowledge Base Configuration
  - User Management
  - Team Management
  - Broadcast Messages
  - Audit Logs
  - Global Histories

### 2.3 Guided Tours

- **FR-GO-020**: The system shall support step-by-step guided tours that highlight UI elements in sequence.
- **FR-GO-021**: Each tour step shall include a target element selector, description text, and navigation controls (next/previous/finish).
- **FR-GO-022**: Tours shall visually highlight the target element while dimming the rest of the UI.

### 2.4 Help Buttons

- **FR-GO-030**: Each page with a guideline shall display a help button (e.g., question mark icon) for on-demand access.
- **FR-GO-031**: Clicking the help button shall open the guideline dialog regardless of first-visit state.

### 2.5 Guideline Context Provider

- **FR-GO-040**: A React context provider shall manage guideline state globally, enabling any component to trigger or dismiss guidelines.
- **FR-GO-041**: The provider shall be mounted in the root provider stack to ensure availability across all routes.

## 3. Implementation Architecture

### Frontend-Only Feature

This feature is implemented entirely in the frontend with no backend endpoints:

| Component | Location | Purpose |
|-----------|----------|---------|
| `GuidelineDialog` | `fe/src/features/guideline/components/` | Modal dialog displaying help content |
| `GuidedTour` | `fe/src/features/guideline/components/` | Step-by-step tour overlay |
| `GuidelineHelpButton` | `fe/src/features/guideline/components/` | On-demand help trigger button |
| `useGuideline` | `fe/src/features/guideline/hooks/` | Guideline display logic |
| `useFirstVisit` | `fe/src/features/guideline/hooks/` | localStorage first-visit detection |
| `useGuidedTour` | `fe/src/features/guideline/hooks/` | Tour step navigation state |
| `useGuidelineContext` | `fe/src/features/guideline/hooks/` | React context for global access |
| Guideline data files | `fe/src/features/guideline/data/` | Static content per page |

### Guideline Data Files

Each page's guideline content is defined in a separate data file:

| File | Page |
|------|------|
| `ai-chat.guideline.ts` | AI Chat |
| `ai-search.guideline.ts` | AI Search |
| `kb-prompts.guideline.ts` | Knowledge Bases |
| `kb-config.guideline.ts` | KB Configuration |
| `users.guideline.ts` | User Management |
| `teams.guideline.ts` | Team Management |
| `broadcast.guideline.ts` | Broadcast Messages |
| `audit.guideline.ts` | Audit Logs |
| `global-histories.guideline.ts` | Global Histories |

## 4. Non-Functional Requirements

- No backend storage required (localStorage-based first-visit tracking)
- Guideline content is bundled with the frontend (no API calls needed)
- Dark mode support for all guideline UI components
- i18n: Guideline content should follow the 3-locale convention (en, vi, ja)

## 5. Dependencies

- [Frontend Architecture](/basic-design/component/frontend-architecture) — React context, component patterns
- All feature pages listed in Section 2.2 — Guideline content references their UI elements

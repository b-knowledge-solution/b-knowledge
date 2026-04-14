# FR: Broadcast Messages

> Version 1.2 | Updated 2026-04-14
>
> System-wide notification messages that administrators can create, schedule, and push to all users, with per-user dismissal tracking.

## 1. Overview

The Broadcast Messages feature allows administrators to create and manage system-wide announcements displayed to all users. Messages can be activated on a schedule, and individual users can dismiss them. Active broadcasts appear as banners across the application.

### 1.1 Goals

- Enable admins to communicate system-wide announcements (maintenance windows, feature updates, policy changes)
- Support scheduling with active/inactive state management
- Track per-user dismissal to avoid re-showing dismissed broadcasts
- Provide both admin management and user-facing display endpoints

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Admin (with `broadcast.*` permissions) | Create, update, delete, and manage broadcast messages |
| Authenticated User | View active broadcasts, dismiss individual broadcasts |
| Unauthenticated User | View active broadcasts (without dismissal filtering) |

## 2. Functional Requirements

### 2.1 Broadcast CRUD

- **FR-BC-001**: Admins shall create broadcast messages with `message` (text), `color` (hex), `font_color` (hex), `starts_at`, `ends_at`, `is_active`, and `is_dismissible` fields.
- **FR-BC-002**: Admins shall update existing broadcast messages (all fields optional on update).
- **FR-BC-003**: Admins shall delete broadcast messages.
- **FR-BC-004**: Admins shall list all broadcasts (active and inactive) with metadata.

> **Important:** There is NO `title` field, NO `content` field, and NO `priority` field. The broadcast has a single `message` text field (max 5000 chars).

### 2.2 Active Broadcast Display

- **FR-BC-010**: The system shall return currently active broadcasts (where `is_active=true` and current time is between `starts_at` and `ends_at`) to any user.
- **FR-BC-011**: For authenticated users, dismissed broadcasts shall be filtered out of the active list (re-shown after 24 hours).
- **FR-BC-012**: Broadcasts shall be ordered by `created_at` descending (newest first). There is no priority-based ordering.

### 2.3 Dismissal

- **FR-BC-020**: Any user (including anonymous visitors) may dismiss individual broadcasts. The dismiss route is marked as public.
- **FR-BC-021**: Dismissal state is stored in the `user_dismissed_broadcasts` table per user-broadcast pair.
- **FR-BC-022**: Dismissed broadcasts re-appear after 24 hours (not permanently hidden).

## 3. Data Model

### broadcast_messages table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| message | TEXT | Broadcast message content (max 5000 chars) |
| starts_at | TIMESTAMP | When the broadcast becomes active |
| ends_at | TIMESTAMP | When the broadcast expires |
| color | VARCHAR | Optional hex color for banner background (e.g., `#FF0000`) |
| font_color | VARCHAR | Optional hex color for text |
| is_active | BOOLEAN | Whether the broadcast is currently enabled |
| is_dismissible | BOOLEAN | Whether users can dismiss this broadcast |
| created_by | UUID | User who created the record |
| updated_by | UUID | User who last updated the record |
| created_at | TIMESTAMP | Record creation timestamp |
| updated_at | TIMESTAMP | Record last update timestamp |

### user_dismissed_broadcasts table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User who dismissed |
| broadcast_id | UUID | Dismissed broadcast reference |
| dismissed_at | TIMESTAMP | When the dismissal occurred |

## 4. API Endpoints

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/api/broadcast-messages/active` | Public | — | Get active broadcasts (filtered by user dismissal if authenticated) |
| POST | `/api/broadcast-messages/:id/dismiss` | Public | — | Dismiss a broadcast for the current user |
| GET | `/api/broadcast-messages` | Yes | `broadcast.view` | List all broadcasts (active and inactive) |
| POST | `/api/broadcast-messages` | Yes | `broadcast.create` | Create broadcast (validated with Zod) |
| PUT | `/api/broadcast-messages/:id` | Yes | `broadcast.edit` | Update broadcast |
| DELETE | `/api/broadcast-messages/:id` | Yes | `broadcast.delete` | Delete broadcast |

## 5. Dependencies

- [Admin Operations](/srs/management/fr-admin-operations) — Admin dashboard integration
- [Authentication](/srs/core-platform/fr-authentication) — Session-based auth for dismissal tracking

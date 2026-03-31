# FR: Broadcast Messages

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
| Admin | Create, update, delete, and manage broadcast messages |
| Authenticated User | View active broadcasts, dismiss individual broadcasts |
| Unauthenticated User | View active broadcasts (without dismissal filtering) |

## 2. Functional Requirements

### 2.1 Broadcast CRUD

- **FR-BC-001**: Admins shall create broadcast messages with title, content, priority, and active status.
- **FR-BC-002**: Admins shall update existing broadcast messages.
- **FR-BC-003**: Admins shall delete broadcast messages.
- **FR-BC-004**: Admins shall list all broadcasts (active and inactive) with metadata.

### 2.2 Active Broadcast Display

- **FR-BC-010**: The system shall return currently active broadcasts to any user.
- **FR-BC-011**: For authenticated users, dismissed broadcasts shall be filtered out of the active list.
- **FR-BC-012**: Broadcasts shall be ordered by priority and creation date.

### 2.3 Dismissal

- **FR-BC-020**: Authenticated users shall dismiss individual broadcasts.
- **FR-BC-021**: Dismissal state shall persist per user-broadcast pair.
- **FR-BC-022**: Dismissed broadcasts shall not reappear unless the admin re-creates them.

## 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/broadcast-messages/active` | No | Get active broadcasts |
| POST | `/api/broadcast-messages/:id/dismiss` | Yes | Dismiss a broadcast |
| GET | `/api/broadcast-messages` | Admin | List all broadcasts |
| POST | `/api/broadcast-messages` | Admin | Create broadcast |
| PUT | `/api/broadcast-messages/:id` | Admin | Update broadcast |
| DELETE | `/api/broadcast-messages/:id` | Admin | Delete broadcast |

## 4. Dependencies

- [Admin Operations](/srs/management/fr-admin-operations) — Admin dashboard integration
- [Authentication](/srs/core-platform/fr-authentication) — Session-based auth for dismissal tracking

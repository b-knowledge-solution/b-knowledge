# Chat Dialog RBAC - Manual Test Plan

## Overview

This document covers manual testing scenarios for the Chat Dialog Role-Based Access Control (RBAC) feature. The feature controls who can view, create, edit, and delete chat dialog configurations, and who can access specific dialogs for chatting.

## Test Environment Prerequisites

- Three test accounts: **Admin**, **Leader**, **Regular User**
- At least two teams configured, with the regular user belonging to one team
- At least three knowledge bases available for dialog creation

---

## 1. RBAC Scenarios by Role

### 1.1 Admin Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Admin lists all dialogs | Login as admin, navigate to Chat Dialogs page | All dialogs visible regardless of ownership or access settings |
| 2 | Admin creates a dialog | Click "Create Dialog", fill form, submit | Dialog created successfully, appears in list |
| 3 | Admin edits any dialog | Click edit on another user's dialog, modify name, save | Dialog updated successfully |
| 4 | Admin deletes any dialog | Click delete on another user's dialog, confirm | Dialog removed from list |
| 5 | Admin views access settings | Open any dialog's access settings | Access entries displayed (users and teams) |
| 6 | Admin modifies access settings | Add/remove users and teams from a dialog's access list | Access entries updated, confirmed via re-opening access settings |

### 1.2 Leader Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 7 | Leader lists dialogs | Login as leader, navigate to Chat Dialogs page | Sees public dialogs, own dialogs, and dialogs with leader/team access |
| 8 | Leader creates a dialog | Click "Create Dialog", fill form, submit | Dialog created successfully |
| 9 | Leader edits own dialog | Edit a dialog they created | Update succeeds |
| 10 | Leader cannot edit others' dialogs | Attempt to edit a dialog created by another user without access | 403 Forbidden or edit button not shown |
| 11 | Leader deletes own dialog | Delete a dialog they created | Dialog removed |

### 1.3 Regular User Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 12 | User sees only accessible dialogs | Login as regular user, navigate to Chat page | Only sees: public dialogs, own dialogs, dialogs with direct user access, dialogs with team access |
| 13 | User cannot create dialogs | Check if "Create Dialog" button is visible | Button hidden or disabled for regular users |
| 14 | User cannot edit dialogs | Check if edit actions are available | Edit controls hidden or return 403 |
| 15 | User cannot delete dialogs | Check if delete actions are available | Delete controls hidden or return 403 |
| 16 | User cannot view access settings | Attempt to access dialog access settings via URL | 403 Forbidden |

---

## 2. Access Assignment Scenarios

### 2.1 User-Level Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 17 | Grant user access | Admin opens dialog access, adds a specific user | User now sees the dialog in their list |
| 18 | Revoke user access | Admin removes user from dialog access list | User no longer sees the dialog |
| 19 | Multiple users | Admin adds 3 users to dialog access | All 3 users can see and use the dialog |

### 2.2 Team-Level Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 20 | Grant team access | Admin adds a team to dialog access | All team members see the dialog |
| 21 | Revoke team access | Admin removes team from dialog access | Team members lose access (unless they have individual access) |
| 22 | Multiple teams | Admin adds 2 teams to dialog access | Members of both teams can see the dialog |

### 2.3 Public Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 23 | Set dialog as public | Admin toggles dialog to public | All authenticated users can see and use the dialog |
| 24 | Unset public flag | Admin toggles dialog to private | Only users/teams with explicit access can see it |

---

## 3. Edge Cases

### 3.1 No Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 25 | User with zero access entries | New user with no team membership, no explicit access | Only sees public dialogs |
| 26 | Direct URL access attempt | User navigates to /chat/dialogs/:id for a private dialog they lack access to | 403 or redirect to dialog list with error message |
| 27 | API access attempt | User calls GET /api/chat/dialogs/:id for inaccessible dialog | 403 Forbidden JSON response |

### 3.2 Removed Team Member

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 28 | User removed from team | User has team-based access, then is removed from the team | User loses access to dialogs granted via that team |
| 29 | User removed but has direct access | User has both team and direct access, removed from team | User retains access via direct user entry |

### 3.3 Deleted Dialog

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 30 | Access entries for deleted dialog | Admin deletes a dialog that has access entries | Access entries cascade-deleted, no orphan records |
| 31 | Active conversation on deleted dialog | User has open chat session, dialog is deleted | Graceful error message, session becomes read-only or closed |

### 3.4 Concurrent Access Changes

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 32 | Access revoked during active session | User is chatting, admin revokes access mid-session | Next API call returns 403, UI shows access revoked message |
| 33 | Bulk access replace race condition | Two admins update access simultaneously | Last write wins, no duplicate entries |

---

## 4. UI Flow Scenarios

### 4.1 Admin Dialog Management Page

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 34 | Dialog list with access indicators | View dialog list as admin | Each dialog shows access type (public/restricted) and count of access entries |
| 35 | Create dialog form | Open create dialog form | Form includes: name, description, icon, KB selection, LLM selection, prompt config |
| 36 | Edit dialog form | Open edit dialog form | Pre-populated with existing values, all fields editable |
| 37 | Delete confirmation | Click delete on a dialog | Confirmation dialog appears with dialog name |

### 4.2 Access Management Dialog

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 38 | Open access dialog | Click "Manage Access" on a dialog | Modal/drawer shows current access entries |
| 39 | Add user access | Search and select a user | User added to access list, save persists |
| 40 | Add team access | Search and select a team | Team added to access list, save persists |
| 41 | Remove access entry | Click remove on an access entry | Entry removed from list, save persists |
| 42 | Cancel without saving | Make changes, click cancel | No changes persisted, original access restored |

### 4.3 User Chat Page

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 43 | Dialog selector shows only accessible | Open dialog selector dropdown | Only accessible dialogs listed |
| 44 | Selected dialog persists | Select a dialog, refresh page | Previously selected dialog still active |
| 45 | Access revoked for selected dialog | Dialog access revoked while selected | UI shows error, prompts to select another dialog |

---

## 5. API Validation

| # | Endpoint | Scenario | Expected |
|---|----------|----------|----------|
| 46 | PUT /api/chat/dialogs/:id/access | Invalid dialog UUID | 400 with validation error |
| 47 | PUT /api/chat/dialogs/:id/access | Empty access array | 200, clears all access |
| 48 | PUT /api/chat/dialogs/:id/access | Duplicate entries | 400 or deduplicated |
| 49 | PUT /api/chat/dialogs/:id/access | Non-existent user/team target_id | 400 with "target not found" error |
| 50 | PUT /api/chat/dialogs/:id/access | Invalid access_type value | 400 with validation error |

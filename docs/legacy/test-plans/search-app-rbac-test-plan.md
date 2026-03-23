# Search App RBAC - Manual Test Plan

## Overview

This document covers manual testing scenarios for the Search App Role-Based Access Control (RBAC) feature. The feature controls who can view, create, edit, and delete search app configurations, and who can access specific search apps for querying.

## Test Environment Prerequisites

- Three test accounts: **Admin**, **Leader**, **Regular User**
- At least two teams configured, with the regular user belonging to one team
- At least two datasets available for search app creation

---

## 1. RBAC Scenarios by Role

### 1.1 Admin Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Admin lists all search apps | Login as admin, navigate to Search Apps page | All search apps visible regardless of ownership or access settings |
| 2 | Admin creates a search app | Click "Create Search App", fill form, submit | Search app created successfully, appears in list |
| 3 | Admin edits any search app | Click edit on another user's search app, modify name, save | Search app updated successfully |
| 4 | Admin deletes any search app | Click delete on another user's search app, confirm | Search app removed from list |
| 5 | Admin views access settings | Open any search app's access settings | Access entries displayed (users and teams) |
| 6 | Admin modifies access settings | Add/remove users and teams from a search app's access list | Access entries updated, confirmed via re-opening access settings |

### 1.2 Leader Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 7 | Leader lists search apps | Login as leader, navigate to Search Apps page | Sees public apps, own apps, and apps with leader/team access |
| 8 | Leader creates a search app | Click "Create Search App", fill form, submit | Search app created successfully |
| 9 | Leader edits own search app | Edit a search app they created | Update succeeds |
| 10 | Leader cannot edit others' apps | Attempt to edit a search app created by another user without access | 403 Forbidden or edit button not shown |
| 11 | Leader deletes own search app | Delete a search app they created | Search app removed |

### 1.3 Regular User Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 12 | User sees only accessible apps | Login as regular user, navigate to Search page | Only sees: public apps, own apps, apps with direct user access, apps with team access |
| 13 | User cannot create search apps | Check if "Create Search App" button is visible | Button hidden or disabled for regular users |
| 14 | User cannot edit search apps | Check if edit actions are available | Edit controls hidden or return 403 |
| 15 | User cannot delete search apps | Check if delete actions are available | Delete controls hidden or return 403 |
| 16 | User cannot view access settings | Attempt to access search app access settings via URL | 403 Forbidden |

---

## 2. Access Assignment Scenarios

### 2.1 User-Level Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 17 | Grant user access | Admin opens search app access, adds a specific user | User now sees the search app in their list |
| 18 | Revoke user access | Admin removes user from search app access list | User no longer sees the search app |
| 19 | Multiple users | Admin adds 3 users to search app access | All 3 users can see and use the search app |

### 2.2 Team-Level Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 20 | Grant team access | Admin adds a team to search app access | All team members see the search app |
| 21 | Revoke team access | Admin removes team from search app access | Team members lose access (unless they have individual access) |
| 22 | Multiple teams | Admin adds 2 teams to search app access | Members of both teams can see the search app |

### 2.3 Public Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 23 | Set search app as public | Admin toggles search app to public | All authenticated users can see and use the search app |
| 24 | Unset public flag | Admin toggles search app to private | Only users/teams with explicit access can see it |

---

## 3. Edge Cases

### 3.1 No Access

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 25 | User with zero access entries | New user with no team membership, no explicit access | Only sees public search apps |
| 26 | Direct URL access attempt | User navigates to /search/apps/:id for a private search app they lack access to | 403 or redirect to search list with error message |
| 27 | API access attempt | User calls GET /api/search/apps/:id for inaccessible app | 403 Forbidden JSON response |

### 3.2 Removed Team Member

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 28 | User removed from team | User has team-based access, then is removed from the team | User loses access to search apps granted via that team |
| 29 | User removed but has direct access | User has both team and direct access, removed from team | User retains access via direct user entry |

### 3.3 Deleted Search App

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 30 | Access entries for deleted app | Admin deletes a search app that has access entries | Access entries cascade-deleted, no orphan records |
| 31 | Active search on deleted app | User has open search session, search app is deleted | Graceful error message, search results become stale |

### 3.4 Concurrent Access Changes

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 32 | Access revoked during active session | User is searching, admin revokes access mid-session | Next API call returns 403, UI shows access revoked message |
| 33 | Bulk access replace race condition | Two admins update access simultaneously | Last write wins, no duplicate entries |

---

## 4. UI Flow Scenarios

### 4.1 Admin Search App Management Page

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 34 | Search app list with access indicators | View search app list as admin | Each app shows access type (public/restricted) and count of access entries |
| 35 | Create search app form | Open create search app form | Form includes: name, description, dataset selection, search config, LLM selection |
| 36 | Edit search app form | Open edit search app form | Pre-populated with existing values, all fields editable |
| 37 | Delete confirmation | Click delete on a search app | Confirmation dialog appears with search app name |

### 4.2 Access Management Dialog

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 38 | Open access dialog | Click "Manage Access" on a search app | Modal/drawer shows current access entries |
| 39 | Add user access | Search and select a user | User added to access list, save persists |
| 40 | Add team access | Search and select a team | Team added to access list, save persists |
| 41 | Remove access entry | Click remove on an access entry | Entry removed from list, save persists |
| 42 | Cancel without saving | Make changes, click cancel | No changes persisted, original access restored |

### 4.3 User Search Page

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 43 | Search app selector shows only accessible | Open search app selector dropdown | Only accessible search apps listed |
| 44 | Selected search app persists | Select a search app, refresh page | Previously selected search app still active |
| 45 | Access revoked for selected app | Search app access revoked while selected | UI shows error, prompts to select another search app |

---

## 5. API Validation

| # | Endpoint | Scenario | Expected |
|---|----------|----------|----------|
| 46 | PUT /api/search/apps/:id/access | Invalid app UUID | 400 with validation error |
| 47 | PUT /api/search/apps/:id/access | Empty access array | 200, clears all access |
| 48 | PUT /api/search/apps/:id/access | Duplicate entries | 400 or deduplicated |
| 49 | PUT /api/search/apps/:id/access | Non-existent user/team entity_id | 400 with "target not found" error |
| 50 | PUT /api/search/apps/:id/access | Invalid entity_type value | 400 with validation error |

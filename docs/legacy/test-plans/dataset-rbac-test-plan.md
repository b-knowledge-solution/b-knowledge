# Dataset RBAC - Manual Test Plan

## Overview

This document covers manual testing scenarios for the Dataset Role-Based Access Control (RBAC) feature. Datasets use a JSONB `access_control` column to store access rules (`public`, `user_ids`, `team_ids`) rather than a separate junction table.

## Test Environment Prerequisites

- Three test accounts: **Admin**, **Leader**, **Regular User**
- At least two teams configured, with the regular user belonging to one team
- At least three datasets with different access_control configurations
- One public dataset, one private dataset with user grants, one with team grants

---

## 1. RBAC Scenarios by Role

### 1.1 Admin Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Admin lists all datasets | Login as admin, navigate to Datasets page | All datasets visible regardless of ownership or access_control |
| 2 | Admin creates a dataset | Click "Create Dataset", fill form, submit | Dataset created with default access_control `{ public: false }` |
| 3 | Admin edits any dataset | Click edit on another user's dataset, modify name, save | Dataset updated successfully |
| 4 | Admin deletes any dataset | Click delete on another user's dataset, confirm | Dataset soft-deleted (status set to deleted) |
| 5 | Admin views access settings | Open any dataset's access settings | access_control displayed with current user_ids and team_ids |
| 6 | Admin modifies access settings | Add/remove users and teams from access_control | access_control JSONB updated, confirmed via re-opening settings |

### 1.2 Leader Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 7 | Leader lists datasets | Login as leader, navigate to Datasets page | Sees public datasets, own datasets, and datasets with leader/team access |
| 8 | Leader creates a dataset | Click "Create Dataset", fill form, submit | Dataset created successfully |
| 9 | Leader edits own dataset | Edit a dataset they created | Update succeeds |
| 10 | Leader cannot edit others' datasets | Attempt to edit a dataset created by another user without access | 403 Forbidden or edit button not shown |
| 11 | Leader deletes own dataset | Delete a dataset they created | Dataset removed |
| 12 | Leader can manage access on own datasets | Open access settings on own dataset | Can add/remove users and teams |

### 1.3 Regular User Role

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 13 | User sees only accessible datasets | Login as regular user, navigate to Datasets page | Only sees: public datasets, own datasets, datasets with user_ids match, datasets with team_ids match |
| 14 | User cannot create datasets | Check if "Create Dataset" button is visible | Button hidden or disabled for regular users |
| 15 | User cannot edit datasets | Check if edit actions are available | Edit controls hidden or return 403 |
| 16 | User cannot delete datasets | Check if delete actions are available | Delete controls hidden or return 403 |
| 17 | User cannot view access settings | Attempt to access dataset access settings via URL | 403 Forbidden |

---

## 2. Access via Public Flag

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 18 | Public dataset visible to all | Set dataset access_control to `{ public: true }` | All authenticated users can see and use the dataset |
| 19 | Remove public flag | Update access_control to `{ public: false }` | Only users/teams with explicit grants can see it |
| 20 | Public overrides user_ids/team_ids | Set `{ public: true, user_ids: ['u1'] }` | All users see it, not just u1 |

---

## 3. Access via user_ids

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 21 | Grant single user access | Admin sets access_control user_ids to `['u1']` | u1 now sees the dataset in their list |
| 22 | Grant multiple users | Admin sets user_ids to `['u1', 'u2', 'u3']` | All 3 users can see and use the dataset |
| 23 | Revoke user access | Admin removes u1 from user_ids array | u1 no longer sees the dataset |
| 24 | User not in user_ids cannot access | u4 not in user_ids, not owner, not in team_ids | u4 cannot see the dataset |

---

## 4. Access via team_ids

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 25 | Grant team access | Admin adds team-alpha to access_control team_ids | All team-alpha members see the dataset |
| 26 | Revoke team access | Admin removes team-alpha from team_ids | Team-alpha members lose access (unless they have user_ids access) |
| 27 | Multiple teams | Admin sets team_ids to `['team-alpha', 'team-beta']` | Members of both teams can see the dataset |
| 28 | User in team AND user_ids | User has both team and direct access | Access works, no duplicate listing |

---

## 5. Edge Cases

### 5.1 Empty or Null access_control

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 29 | Dataset with null access_control | Dataset row has access_control = NULL | Treated as private, only admin and owner can access |
| 30 | Dataset with empty object `{}` | access_control = `{}` | Treated as private (public defaults to false), only admin and owner |
| 31 | Dataset with empty arrays | access_control = `{ public: false, user_ids: [], team_ids: [] }` | Only admin and owner can access |
| 32 | Dataset with only public key | access_control = `{ public: false }` | Only admin and owner can access |

### 5.2 Removed Team Member

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 33 | User removed from team | User has team-based access, then is removed from the team | User loses access to datasets granted via that team |
| 34 | User removed but has direct access | User has both team and user_ids access, removed from team | User retains access via user_ids entry |
| 35 | User switches teams | User moves from team-alpha to team-beta | Loses team-alpha dataset access, gains team-beta dataset access |

### 5.3 User Not in Any Team

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 36 | User with no team membership | New user with no team, no user_ids grants | Only sees public datasets and own datasets |
| 37 | User removed from all teams | User had team access, removed from all teams | Falls back to public + own + user_ids grants only |

### 5.4 Concurrent and Race Conditions

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 38 | Access revoked during active session | User is browsing dataset, admin revokes access | Next API call returns 403, UI shows access revoked message |
| 39 | Two admins update access simultaneously | Both update access_control at same time | Last write wins, JSONB column is atomic |
| 40 | Dataset deleted while user has it open | User viewing dataset, admin deletes it | Graceful error, dataset marked as deleted |

---

## 6. Dataset Listing Filtered Correctly

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 41 | Mixed access types in list | User has: 1 public, 1 owned, 1 user_ids, 1 team_ids dataset | All 4 appear in list, no duplicates |
| 42 | Pagination with filtered results | User has access to 25 datasets, page size 10 | Correct pagination: 3 pages, counts match |
| 43 | Search within accessible datasets | User searches by name within their accessible datasets | Only matching accessible datasets returned |
| 44 | Sort order preserved | Datasets sorted by name/date | Sort applies to filtered (accessible) set only |

---

## 7. UI Flow Scenarios

### 7.1 DatasetsPage Access Button

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 45 | Access button visible for admin | Admin views dataset list | "Manage Access" button/icon visible on each dataset card |
| 46 | Access button hidden for regular user | Regular user views dataset list | No "Manage Access" button visible |

### 7.2 DatasetDetailPage Access Button

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 47 | Access settings on detail page | Admin opens dataset detail, clicks access settings | Access dialog opens with current access_control entries |

### 7.3 DatasetAccessDialog

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 48 | Add user via search | Admin opens access dialog, searches user by name, selects | User added to user_ids list, save persists to access_control JSONB |
| 49 | Add team via search | Admin searches team, selects | Team added to team_ids list, save persists |
| 50 | Toggle public flag | Admin toggles public switch | access_control.public updated, user_ids/team_ids section disabled when public |

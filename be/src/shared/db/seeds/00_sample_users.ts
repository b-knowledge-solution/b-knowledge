/**
 * @fileoverview Seed script for sample local-auth users, teams, and team memberships.
 *
 * Creates local accounts with bcrypt-hashed passwords for every system role:
 *   - admin  ×5   (full system access)
 *   - leader ×5   (team management access)
 *   - user   ×100 (basic access)
 *
 * Also creates 5 teams, each with all 5 leader accounts as members.
 *
 * Default password for every account: `password123`
 *
 * ─── E2E Testing with Browser Tool ───────────────────────────────────
 *
 * Prerequisites:
 *   1. Set `ENABLE_LOCAL_LOGIN=true` in `be/.env`
 *   2. Run `npm run db:seed` to populate accounts
 *   3. Start the dev server: `npm run dev`
 *
 * Recommended accounts for browser-based e2e tests:
 *
 * | Role   | Email              | Password      | Use case                                |
 * |--------|--------------------|---------------|-----------------------------------------|
 * | admin  | admin1@baoda.vn    | password123   | Full access — system settings, all CRUD |
 * | leader | leader1@baoda.vn   | password123   | Team management, knowledge bases, chat  |
 * | user   | user1@baoda.vn     | password123   | Basic view-only access                  |
 *
 * Login flow:
 *   1. Navigate to the app URL (default: http://localhost:5173)
 *   2. Click "Local Login" or navigate to the login page
 *   3. Enter email + password from the table above
 *   4. Submit the form
 *
 * @example
 * Run seed: npm run db:seed
 */

import { Knex } from 'knex'
import { v4 as uuidv4 } from 'uuid'
import bcryptjs from 'bcryptjs'

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Default plain-text password for all seeded accounts */
const DEFAULT_PASSWORD = 'password123'

/** Bcrypt salt rounds (matches auth.service.ts) */
const SALT_ROUNDS = 12

/** Departments that rotate across generated users */
const DEPARTMENTS = [
  'IT Department',
  'Development',
  'Quality Assurance',
  'Design',
  'Business Analysis',
  'Marketing',
  'Human Resources',
  'Finance',
  'Operations',
  'Support'
]

/** Admin-level permissions (full access) */
const ADMIN_PERMISSIONS = JSON.stringify(['*'])

/** Leader-level permissions (team management + resource access) */
const LEADER_PERMISSIONS = JSON.stringify([
  'team:manage',
  'team:view',
  'user:view',
  'bucket:view',
  'bucket:upload',
  'knowledge_base:manage',
  'chat:manage'
])

/** User-level permissions (basic view access) */
const USER_PERMISSIONS = JSON.stringify([
  'bucket:view',
  'knowledge_base:view',
  'chat:view'
])

/** Team definitions — each team will have all 5 leaders as members */
const TEAMS = [
  { name: 'Alpha Team', project_name: 'Project Alpha', description: 'Core product development team' },
  { name: 'Beta Team', project_name: 'Project Beta', description: 'Platform engineering team' },
  { name: 'Gamma Team', project_name: 'Project Gamma', description: 'Quality assurance & testing team' },
  { name: 'Delta Team', project_name: 'Project Delta', description: 'Data science & analytics team' },
  { name: 'Epsilon Team', project_name: 'Project Epsilon', description: 'Customer success & support team' }
]

// ──────────────────────────────────────────────
// User generators
// ──────────────────────────────────────────────

/**
 * @description Pick a department from the rotating list.
 * @param index - Zero-based index of the user
 * @returns string - Department name
 */
function pickDepartment(index: number): string {
  return DEPARTMENTS[index % DEPARTMENTS.length]!
}

/**
 * @description Build an array of user seed records for a given role.
 * @param role - System role ('admin' | 'leader' | 'user')
 * @param count - Number of accounts to create
 * @param permissions - JSON-stringified permission array
 * @param passwordHash - Pre-computed bcrypt hash
 * @returns Array of user row objects ready for DB insertion
 */
function generateUsers(
  role: string,
  count: number,
  permissions: string,
  passwordHash: string
) {
  const jobTitles: Record<string, string> = {
    admin: 'System Administrator',
    leader: 'Team Lead',
    user: 'Staff Member'
  }

  return Array.from({ length: count }, (_, i) => {
    const num = i + 1
    return {
      id: uuidv4(),
      email: `${role}${num}@baoda.vn`,
      display_name: `${role.charAt(0).toUpperCase() + role.slice(1)} User ${num}`,
      role,
      permissions,
      department: pickDepartment(i),
      job_title: jobTitles[role] ?? 'Staff Member',
      mobile_phone: `+84-${String(100 + num).padStart(3, '0')}-${String(200 + num).padStart(3, '0')}-${String(300 + num).padStart(3, '0')}`,
      password_hash: passwordHash
    }
  })
}

// ──────────────────────────────────────────────
// Seed entry-point
// ──────────────────────────────────────────────

/**
 * @description Seed function to insert sample local-auth users, teams, and
 *   team memberships into the database.
 * @param knex - Knex instance for database operations
 * @returns Promise<void> - Resolves when seeding is complete
 *
 * Operations:
 *   1. Hash the default password once (expensive operation).
 *   2. Generate admin ×5, leader ×5, user ×100.
 *   3. Upsert users (skip duplicates by email).
 *   4. Create 5 teams (skip duplicates by name).
 *   5. Assign all 5 leaders to every team with role = 'leader'.
 *   6. Log summary.
 */
export async function seed(knex: Knex): Promise<void> {
  console.log('Starting sample users & teams seed...')
  console.log('='.repeat(60))

  const startTime = Date.now()

  // ── 1. Hash password once ──────────────────────────────────────────────────
  console.log('[HASH] Computing bcrypt hash for default password...')
  const passwordHash = bcryptjs.hashSync(DEFAULT_PASSWORD, SALT_ROUNDS)

  // ── 2. Generate user arrays ────────────────────────────────────────────────
  const admins = generateUsers('admin', 5, ADMIN_PERMISSIONS, passwordHash)
  const leaders = generateUsers('leader', 5, LEADER_PERMISSIONS, passwordHash)
  const users = generateUsers('user', 100, USER_PERMISSIONS, passwordHash)

  const allUsers = [...admins, ...leaders, ...users]

  // ── 3. Upsert users ───────────────────────────────────────────────────────
  let usersInserted = 0
  let usersSkipped = 0

  for (const user of allUsers) {
    // Check if user with same email already exists
    const existing = await knex('users')
      .where({ email: user.email })
      .first()

    if (existing) {
      usersSkipped++
    } else {
      await knex('users').insert({
        ...user,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      usersInserted++
    }
  }

  console.log(`[USERS] Inserted: ${usersInserted}, Skipped: ${usersSkipped}, Total: ${allUsers.length}`)

  // ── 4. Create teams ───────────────────────────────────────────────────────
  // We need to look up actual leader IDs from the database (could be pre-existing)
  const leaderRows = await knex('users')
    .whereIn('email', leaders.map(l => l.email))
    .select('id', 'email')

  let teamsInserted = 0
  let teamsSkipped = 0
  const teamIds: { id: string; name: string }[] = []

  for (const teamDef of TEAMS) {
    // Check if team with same name already exists
    const existing = await knex('teams')
      .where({ name: teamDef.name })
      .first()

    if (existing) {
      teamsSkipped++
      teamIds.push({ id: existing.id, name: existing.name })
    } else {
      const teamId = uuidv4()
      await knex('teams').insert({
        id: teamId,
        ...teamDef,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      teamsInserted++
      teamIds.push({ id: teamId, name: teamDef.name })
    }
  }

  console.log(`[TEAMS] Inserted: ${teamsInserted}, Skipped: ${teamsSkipped}, Total: ${TEAMS.length}`)

  // ── 5. Assign leaders to teams ─────────────────────────────────────────────
  let membershipsInserted = 0
  let membershipsSkipped = 0

  for (const team of teamIds) {
    for (const leader of leaderRows) {
      // Check if membership already exists (composite PK: user_id + team_id)
      const existing = await knex('user_teams')
        .where({ user_id: leader.id, team_id: team.id })
        .first()

      if (existing) {
        membershipsSkipped++
      } else {
        await knex('user_teams').insert({
          user_id: leader.id,
          team_id: team.id,
          role: 'leader',
          joined_at: knex.fn.now()
        })
        membershipsInserted++
      }
    }
  }

  console.log(`[MEMBERSHIPS] Inserted: ${membershipsInserted}, Skipped: ${membershipsSkipped}, Total: ${teamIds.length * leaderRows.length}`)

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('='.repeat(60))
  console.log(`Sample seed completed in ${elapsed}s`)
  console.log('')
  console.log('Account Summary:')
  console.log(`  - Admin accounts:   5  (admin1@baoda.vn – admin5@baoda.vn)`)
  console.log(`  - Leader accounts:  5  (leader1@baoda.vn – leader5@baoda.vn)`)
  console.log(`  - User accounts:    100 (user1@baoda.vn – user100@baoda.vn)`)
  console.log(`  - Teams:            5  (Alpha, Beta, Gamma, Delta, Epsilon)`)
  console.log(`  - Team memberships: 25 (5 leaders × 5 teams)`)
  console.log('')
  console.log('Default password: password123')
  console.log('')
  console.log('Role Guide:')
  console.log('  ADMIN  — Full system access, can manage all resources')
  console.log('  LEADER — Team management, can manage team members and resources')
  console.log('  USER   — Basic access, can view and use assigned resources')
}

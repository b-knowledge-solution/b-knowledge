/**
 * Docker infrastructure setup script.
 *
 * @description Starts the base infrastructure services via Docker Compose:
 *   - PostgreSQL, Valkey (Redis-compatible), OpenSearch, RustFS
 *
 * For software setup (npm, Python), run: npm run setup
 */

import { spawnSync, execSync } from 'child_process'
import { resolve, join } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const dockerDir = join(rootDir, 'docker')

/** ANSI colors for terminal output */
const green = '\x1b[32m'
const yellow = '\x1b[33m'
const red = '\x1b[31m'
const reset = '\x1b[0m'

/**
 * Prints a section header to the console.
 *
 * @param {string} title - The section title
 */
function section(title) {
  console.log(`\n${green}━━━ ${title} ━━━${reset}\n`)
}

/**
 * Checks if a command is available in the system PATH.
 *
 * @param {string} cmd - The command to check
 * @returns {boolean} True if the command exists
 */
function commandExists(cmd) {
  const isWin = process.platform === 'win32'
  const result = isWin
    ? spawnSync('cmd', ['/c', 'where', cmd], { stdio: 'pipe' })
    : spawnSync('which', [cmd], { stdio: 'pipe' })
  return result.status === 0
}

// ==========================================================================
// Step 1 — Check Docker prerequisite
// ==========================================================================
section('Step 1: Checking Docker')

if (!commandExists('docker')) {
  console.log(`  ${red}✗ Docker not found.${reset}`)
  console.log(`  Please install Docker Desktop: ${yellow}https://docs.docker.com/get-docker/${reset}`)
  process.exit(1)
}

/** Check if Docker daemon is running */
const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe' })
if (dockerCheck.status !== 0) {
  console.log(`  ${red}✗ Docker daemon is not running.${reset}`)
  console.log(`  Start Docker Desktop, then run: ${green}npm run setup:infra${reset}`)
  process.exit(1)
}

console.log(`  ✓ Docker is running`)

// ==========================================================================
// Step 2 — Start Docker base infrastructure
// ==========================================================================
section('Step 2: Starting base infrastructure')

console.log('  Starting PostgreSQL, Valkey, OpenSearch, RustFS...')
execSync('docker compose -p b-knowledge -f docker-compose-base.yml up -d', {
  cwd: dockerDir,
  stdio: 'inherit',
})

// ==========================================================================
// Done
// ==========================================================================
section('Infrastructure setup complete!')

console.log(`  View running containers:  ${green}docker ps${reset}`)
console.log(`  Stop infrastructure:      ${green}npm run docker:down${reset}`)
console.log(`  Start development:        ${green}npm run dev${reset}`)
console.log('')

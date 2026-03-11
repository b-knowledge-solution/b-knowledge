/**
 * Full project setup script for new team members.
 *
 * @description Runs all setup steps in order:
 *   1. Check prerequisites (Node.js, Python, Docker)
 *   2. Install npm dependencies (workspaces)
 *   3. Set up centralized Python venv with all modules
 *   4. Start Docker base infrastructure (PostgreSQL, Valkey, OpenSearch, RustFS)
 *   5. Copy .env.example to .env if not present
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, copyFileSync } from 'fs'
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
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: 'pipe',
  })
  return result.status === 0
}

/**
 * Gets the version string of a command.
 *
 * @param {string} cmd - The command to run
 * @param {string[]} args - Arguments (default: ['--version'])
 * @returns {string} Version output or 'not found'
 */
function getVersion(cmd, args = ['--version']) {
  try {
    return spawnSync(cmd, args, { stdio: 'pipe' }).stdout.toString().trim().split('\n')[0]
  } catch {
    return 'not found'
  }
}

// ==========================================================================
// Step 1 — Check prerequisites
// ==========================================================================
section('Step 1: Checking prerequisites')

const prerequisites = [
  { cmd: 'node', label: 'Node.js' },
  { cmd: 'npm', label: 'npm' },
  { cmd: 'python', label: 'Python' },
  { cmd: 'docker', label: 'Docker' },
]

let missingPrereqs = false
for (const { cmd, label } of prerequisites) {
  if (commandExists(cmd)) {
    console.log(`  ✓ ${label}: ${getVersion(cmd)}`)
  } else {
    console.log(`  ${red}✗ ${label}: not found${reset}`)
    missingPrereqs = true
  }
}

if (missingPrereqs) {
  console.log(`\n${red}Please install missing prerequisites before continuing.${reset}`)
  process.exit(1)
}

// ==========================================================================
// Step 2 — Copy .env if needed
// ==========================================================================
section('Step 2: Environment files')

/** Copy .env.example → .env for root, docker, be, advance-rag if they exist */
const envLocations = [rootDir, dockerDir, join(rootDir, 'be'), join(rootDir, 'advance-rag')]

for (const dir of envLocations) {
  const envExample = join(dir, '.env.example')
  const envFile = join(dir, '.env')

  if (existsSync(envExample) && !existsSync(envFile)) {
    copyFileSync(envExample, envFile)
    console.log(`  Copied .env.example → .env in ${dir.replace(rootDir, '.')}`)
  } else if (existsSync(envFile)) {
    console.log(`  .env already exists in ${dir.replace(rootDir, '.')}`)
  }
}

// ==========================================================================
// Step 3 — Install npm dependencies
// ==========================================================================
section('Step 3: Installing npm dependencies')

execSync('npm install', { cwd: rootDir, stdio: 'inherit' })

// ==========================================================================
// Step 4 — Set up centralized Python venv
// ==========================================================================
section('Step 4: Setting up Python virtual environment')

execSync('node scripts/setup-python.js', { cwd: rootDir, stdio: 'inherit' })

// ==========================================================================
// Step 5 — Start Docker base infrastructure
// ==========================================================================
section('Step 5: Starting Docker base infrastructure')

if (!commandExists('docker')) {
  console.log(`${yellow}  Docker not found — skipping infrastructure setup.${reset}`)
  console.log('  You can start it later with: npm run docker:base')
} else {
  /** Check if Docker daemon is running */
  const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe' })
  if (dockerCheck.status !== 0) {
    console.log(`${yellow}  Docker daemon is not running — skipping infrastructure setup.${reset}`)
    console.log('  Start Docker Desktop, then run: npm run docker:base')
  } else {
    console.log('  Starting PostgreSQL, Valkey, OpenSearch, RustFS...')
    execSync('docker compose -p b-knowledge -f docker-compose-base.yml up -d', {
      cwd: dockerDir,
      stdio: 'inherit',
    })
  }
}

// ==========================================================================
// Done
// ==========================================================================
section('Setup complete!')

console.log(`  Start development:   ${green}npm run dev${reset}`)
console.log(`  Backend only:        ${green}npm run dev:be${reset}`)
console.log(`  Frontend only:       ${green}npm run dev:fe${reset}`)
console.log(`  Worker only:         ${green}npm run dev:worker${reset}`)
console.log(`  Converter only:      ${green}npm run dev:converter${reset}`)
console.log(`  Docker infra:        ${green}npm run docker:base${reset}`)
console.log(`  Docker stop:         ${green}npm run docker:down${reset}`)
console.log('')

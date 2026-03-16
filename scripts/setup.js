/**
 * Software setup script for new team members.
 *
 * @description Runs software setup steps in order:
 *   1. Check prerequisites (Node.js, npm, Python)
 *   2. Copy .env.example to .env if not present
 *   3. Install npm dependencies (workspaces)
 *   4. Set up centralized Python venv with all modules
 *
 * For Docker infrastructure, run: npm run setup:infra
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
 * On Windows, uses `cmd /c where` to ensure .cmd files are found.
 *
 * @param {string} cmd - The command to check
 * @returns {boolean} True if the command exists
 */
function commandExists(cmd) {
  const isWin = process.platform === 'win32'
  // Use cmd /c where on Windows to reliably find .cmd/.bat files like npm
  const result = isWin
    ? spawnSync('cmd', ['/c', 'where', cmd], { stdio: 'pipe' })
    : spawnSync('which', [cmd], { stdio: 'pipe' })
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
    // Use shell: true on Windows so .cmd files (like npm) execute correctly
    return spawnSync(cmd, args, { stdio: 'pipe', shell: true }).stdout.toString().trim().split('\n')[0]
  } catch {
    return 'not found'
  }
}

// ==========================================================================
// Step 1 — Check prerequisites (software only, no Docker)
// ==========================================================================
section('Step 1: Checking prerequisites')

const prerequisites = [
  { cmd: 'node', label: 'Node.js' },
  { cmd: 'npm', label: 'npm' },
  { cmd: 'python', label: 'Python' },
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

// Check C/C++ build tools (needed for advance-rag native extensions)
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

let hasBuildTools = false
let buildToolsName = ''

if (isWin) {
  buildToolsName = 'Visual C++ Build Tools'
  // Check via vswhere for MSVC
  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe',
  ]
  for (const vswhere of vswherePaths) {
    if (existsSync(vswhere)) {
      try {
        const result = spawnSync(vswhere, ['-products', '*', '-requires', 'Microsoft.VisualCpp.Tools.HostX64.TargetX64', '-property', 'installationPath'], { stdio: 'pipe', encoding: 'utf-8' })
        if (result.stdout && result.stdout.trim().length > 0) { hasBuildTools = true; break }
      } catch { /* ignore */ }
    }
  }
  if (!hasBuildTools) hasBuildTools = commandExists('cl')
} else if (isMac) {
  buildToolsName = 'Xcode Command Line Tools'
  hasBuildTools = spawnSync('xcode-select', ['-p'], { stdio: 'pipe' }).status === 0
} else {
  buildToolsName = 'GCC (build-essential)'
  hasBuildTools = commandExists('gcc')
}

if (hasBuildTools) {
  console.log(`  ✓ ${buildToolsName}: found`)
} else {
  console.log(`  ${yellow}⚠ ${buildToolsName}: not found (will attempt auto-install during Python setup)${reset}`)
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

let pythonSetupFailed = false
try {
  execSync('node scripts/setup-python.js', { cwd: rootDir, stdio: 'inherit' })
} catch {
  pythonSetupFailed = true
}

// ==========================================================================
// Done
// ==========================================================================
if (pythonSetupFailed) {
  section('Software setup completed with warnings')
  console.log(`  ${yellow}Python setup had errors (see above).${reset}`)
  console.log(`  Restart your terminal and run: ${green}npm run setup:python${reset}\n`)
} else {
  section('Software setup complete!')
}

console.log(`  Start development:     ${green}npm run dev${reset}`)
console.log(`  Backend only:          ${green}npm run dev:be${reset}`)
console.log(`  Frontend only:         ${green}npm run dev:fe${reset}`)
console.log(`  Worker only:           ${green}npm run dev:worker${reset}`)
console.log(`  Converter only:        ${green}npm run dev:converter${reset}`)
console.log('')
console.log(`  ${yellow}Docker infrastructure:${reset}`)
console.log(`  Setup infra (first):   ${green}npm run setup:infra${reset}`)
console.log(`  Start infra:           ${green}npm run docker:base${reset}`)
console.log(`  Stop infra:            ${green}npm run docker:down${reset}`)
console.log('')

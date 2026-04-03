/**
 * Sets up a centralized Python virtual environment at the project root.
 *
 * @description Creates a single .venv in the root directory and installs
 * all Python modules (advance-rag, converter) in editable mode.
 * Each module keeps its own pyproject.toml for independent Docker builds.
 *
 * If an existing .venv is broken (e.g. base Python was uninstalled),
 * it will be recreated automatically.
 *
 * Also checks for C/C++ build tools required by native Python extensions
 * (datrie, pyclipper, editdistance, xxhash, cryptography, etc.)
 * and attempts to install them if missing.
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const venvDir = join(rootDir, '.venv')

/** ANSI colors for terminal output */
const green = '\x1b[32m'
const yellow = '\x1b[33m'
const red = '\x1b[31m'
const reset = '\x1b[0m'

/**
 * Checks if a command is available in the system PATH.
 *
 * @param {string} cmd - The command to check
 * @returns {boolean} True if the command exists
 */
function commandExists(cmd) {
  const result = isWin
    ? spawnSync('cmd', ['/c', 'where', cmd], { stdio: 'pipe' })
    : spawnSync('which', [cmd], { stdio: 'pipe' })
  return result.status === 0
}

/**
 * Checks whether a Python binary at the given path can actually execute.
 *
 * @param {string} pythonPath - Absolute path to the Python executable
 * @returns {boolean} true if `python --version` succeeds
 */
function isPythonWorking(pythonPath) {
  try {
    execSync(`"${pythonPath}" --version`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the system Python interpreter path.
 * Uses `where python` on Windows or `which python3` on Unix.
 *
 * @returns {string} Absolute path to a working system Python
 */
function resolveSystemPython() {
  try {
    const cmd = isWin ? 'where python' : 'which python3 || which python'
    const candidates = execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')

    // Test each candidate until we find one that works
    for (const candidate of candidates) {
      const trimmed = candidate.trim()
      if (trimmed && isPythonWorking(trimmed)) return trimmed
    }
  } catch {
    // Ignore — handled below
  }

  console.error('[setup-python] No working Python interpreter found. Please install Python.')
  process.exit(1)
}

// ==========================================================================
// Build tools detection and installation
// ==========================================================================
// Several advance-rag dependencies contain C/C++ extensions that must be
// compiled from source when no pre-built wheel is available:
//   datrie, pyclipper, editdistance, xxhash, cryptography, etc.
//
// Windows  → Microsoft Visual C++ 14.0+ (VS Build Tools)
// macOS    → Xcode Command Line Tools
// Linux    → gcc, g++, make, python3-dev
// ==========================================================================

/**
 * Checks whether MSVC build tools are available on Windows.
 * Uses vswhere.exe to locate Visual Studio installations with C++ workload.
 *
 * @returns {boolean} True if MSVC build tools are found
 */
function hasMsvcBuildTools() {
  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe',
  ]

  for (const vswhere of vswherePaths) {
    if (!existsSync(vswhere)) continue
    try {
      const result = execSync(
        `"${vswhere}" -products * -requires Microsoft.VisualCpp.Tools.HostX64.TargetX64 -property installationPath`,
        { stdio: 'pipe', encoding: 'utf-8' },
      )
      if (result.trim().length > 0) return true
    } catch {
      // vswhere found but no matching installation
    }
  }

  // Fallback: check if cl.exe is in PATH
  return commandExists('cl')
}

/**
 * Checks whether C/C++ build tools are installed on the current platform.
 *
 * @returns {{ available: boolean, name: string }} Build tools status
 */
function checkBuildTools() {
  if (isWin) {
    return {
      available: hasMsvcBuildTools(),
      name: 'Microsoft Visual C++ Build Tools',
    }
  }

  if (isMac) {
    const result = spawnSync('xcode-select', ['-p'], { stdio: 'pipe' })
    return {
      available: result.status === 0,
      name: 'Xcode Command Line Tools',
    }
  }

  // Linux: check for gcc and python3-dev header
  const hasGcc = commandExists('gcc')
  const hasPythonDev = existsSync('/usr/include/python3') ||
    spawnSync('dpkg', ['-s', 'python3-dev'], { stdio: 'pipe' }).status === 0 ||
    spawnSync('rpm', ['-q', 'python3-devel'], { stdio: 'pipe' }).status === 0 ||
    hasGcc // Assume dev headers if gcc is present (best effort)

  return {
    available: hasGcc && hasPythonDev,
    name: 'GCC + python3-dev (build-essential)',
  }
}

/**
 * Attempts to install C/C++ build tools automatically.
 * - Windows: winget → Visual Studio 2022 Build Tools with C++ workload
 * - macOS: xcode-select --install
 * - Linux: apt / dnf / yum / pacman
 *
 * @returns {boolean} True if installation succeeded or was attempted
 */
function tryInstallBuildTools() {
  console.log(`\n  ${yellow}Attempting to install build tools...${reset}\n`)

  try {
    if (isWin) {
      if (commandExists('winget')) {
        console.log('  Using winget to install Visual Studio Build Tools with C++ workload...')
        console.log('  This may take several minutes. A UAC prompt may appear.\n')

        // Install VS Build Tools with C++ workload in a single step.
        // --override passes arguments directly to the VS bootstrapper,
        // which includes the VCTools workload during initial install.
        const wingetResult = spawnSync(
          'winget',
          [
            'install',
            '--id', 'Microsoft.VisualStudio.2022.BuildTools',
            '--silent',
            '--accept-source-agreements',
            '--accept-package-agreements',
            '--override', '"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait"',
          ],
          { stdio: 'inherit', shell: true },
        )

        if (wingetResult.status !== 0) {
          console.log(`\n  ${yellow}winget install returned non-zero (code ${wingetResult.status}).${reset}`)
          console.log('  Build Tools may already be installed, or a reboot may be needed.')
        }

        return true
      }

      console.log(`  ${red}winget not available.${reset}`)
      printManualInstallInstructions()
      return false
    }

    if (isMac) {
      console.log('  Running: xcode-select --install')
      spawnSync('xcode-select', ['--install'], { stdio: 'inherit' })
      return true
    }

    // Linux: detect package manager and install
    if (commandExists('apt-get')) {
      console.log('  Running: sudo apt-get install -y build-essential python3-dev')
      execSync('sudo apt-get update -qq && sudo apt-get install -y build-essential python3-dev', {
        stdio: 'inherit',
      })
      return true
    }

    if (commandExists('dnf')) {
      console.log('  Running: sudo dnf install gcc gcc-c++ make python3-devel')
      execSync('sudo dnf install -y gcc gcc-c++ make python3-devel', { stdio: 'inherit' })
      return true
    }

    if (commandExists('yum')) {
      console.log('  Running: sudo yum install gcc gcc-c++ make python3-devel')
      execSync('sudo yum install -y gcc gcc-c++ make python3-devel', { stdio: 'inherit' })
      return true
    }

    if (commandExists('pacman')) {
      console.log('  Running: sudo pacman -S --noconfirm base-devel')
      execSync('sudo pacman -S --noconfirm base-devel', { stdio: 'inherit' })
      return true
    }

    console.log(`  ${red}Could not detect package manager.${reset}`)
    console.log('  Please install gcc, g++, make, and python3-dev manually.\n')
    return false
  } catch (err) {
    console.log(`\n  ${red}Auto-install failed: ${err.message}${reset}`)
    printManualInstallInstructions()
    return false
  }
}

/**
 * Prints platform-specific manual installation instructions for build tools.
 */
function printManualInstallInstructions() {
  console.log(`\n  ${yellow}Manual installation instructions:${reset}\n`)

  if (isWin) {
    console.log('  1. Download Visual Studio Build Tools 2022:')
    console.log(`     ${yellow}https://visualstudio.microsoft.com/visual-cpp-build-tools/${reset}`)
    console.log('  2. Run the installer')
    console.log('  3. Select "Desktop development with C++" workload')
    console.log('  4. Click Install and restart your terminal when done\n')
  } else if (isMac) {
    console.log(`  Run: ${green}xcode-select --install${reset}\n`)
  } else {
    console.log('  Debian/Ubuntu:')
    console.log(`    ${green}sudo apt-get install build-essential python3-dev${reset}`)
    console.log('  Fedora/RHEL:')
    console.log(`    ${green}sudo dnf install gcc gcc-c++ make python3-devel${reset}`)
    console.log('  Arch Linux:')
    console.log(`    ${green}sudo pacman -S base-devel${reset}\n`)
  }
}

/** Resolve paths for venv python and pip */
const venvPython = isWin
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip.exe')
  : join(venvDir, 'bin', 'pip')

/** Python modules to install in editable mode */
const pythonModules = [
  { name: 'advance-rag', path: join(rootDir, 'advance-rag') },
  { name: 'converter', path: join(rootDir, 'converter') },
]

// ==========================================================================
// Step 1 — Check C/C++ build tools
// ==========================================================================

console.log('[setup-python] Checking C/C++ build tools...')

const buildTools = checkBuildTools()
if (buildTools.available) {
  console.log(`  ${green}✓${reset} ${buildTools.name}: found`)
} else {
  console.log(`  ${red}✗${reset} ${buildTools.name}: not found`)
  console.log('')
  console.log(`  ${yellow}Some advance-rag packages (datrie, pyclipper, editdistance, xxhash,`)
  console.log(`  cryptography) require C/C++ build tools to compile native extensions.${reset}`)

  const installed = tryInstallBuildTools()

  if (installed) {
    // Re-check after installation attempt
    const recheck = checkBuildTools()
    if (recheck.available) {
      console.log(`  ${green}✓${reset} ${recheck.name}: installed successfully`)
    } else {
      console.log(`  ${yellow}⚠${reset} Installation was attempted but build tools still not detected.`)
      console.log('  This often happens because VS Installer needs a terminal restart.')
      console.log(`  ${yellow}Continuing with venv setup — pip install may still succeed with pre-built wheels.${reset}`)
      console.log('  If pip install fails later, restart your terminal and run:')
      console.log(`  ${green}npm run setup:python${reset}\n`)
    }
  } else {
    console.log(`  ${yellow}⚠${reset} Could not install build tools automatically.`)
    console.log(`  ${yellow}Continuing with venv setup — pip install may still succeed with pre-built wheels.${reset}`)
    console.log('  If pip install fails later, install build tools manually and run:')
    console.log(`  ${green}npm run setup:python${reset}\n`)
  }
}

// ==========================================================================
// Step 2 — Create or recreate the centralized venv
// ==========================================================================

if (existsSync(venvDir)) {
  // Venv directory exists — check if the Python inside it actually works
  if (isPythonWorking(venvPython)) {
    console.log('[setup-python] Virtual environment exists and is healthy.')
  } else {
    // Venv is broken (base Python was uninstalled)
    console.log('[setup-python] Existing .venv is broken — recreating...')
    execSync(`${isWin ? 'rmdir /s /q' : 'rm -rf'} "${venvDir}"`, {
      cwd: rootDir,
      stdio: 'inherit',
    })
  }
}

if (!existsSync(venvDir)) {
  const systemPython = resolveSystemPython()
  console.log(`[setup-python] Creating virtual environment with ${systemPython}...`)
  execSync(`"${systemPython}" -m venv "${venvDir}"`, { cwd: rootDir, stdio: 'inherit' })
}

// ==========================================================================
// Step 3 — Upgrade pip to latest
// ==========================================================================

console.log('[setup-python] Upgrading pip...')
execSync(`"${venvPython}" -m pip install --upgrade pip`, { cwd: rootDir, stdio: 'inherit' })

// ==========================================================================
// Step 4 — Install each Python module in editable mode
// ==========================================================================

const failedModules = []

for (const mod of pythonModules) {
  if (!existsSync(mod.path)) {
    console.log(`[setup-python] Skipping ${mod.name} — directory not found.`)
    continue
  }

  console.log(`[setup-python] Installing ${mod.name} in editable mode...`)
  try {
    execSync(`"${pip}" install -e "${mod.path}"`, { cwd: rootDir, stdio: 'inherit' })
  } catch {
    console.log(`\n  ${yellow}⚠ Failed to install ${mod.name}.${reset}`)
    console.log('  This is usually caused by missing C/C++ build tools (e.g. datrie compilation).')
    console.log(`  Try restarting your terminal and running: ${green}npm run setup:python${reset}\n`)
    failedModules.push(mod.name)
  }
}

if (failedModules.length > 0) {
  console.log(`[setup-python] ${yellow}Setup completed with errors.${reset}`)
  console.log(`  Failed modules: ${failedModules.join(', ')}`)
  console.log(`  Restart your terminal (to pick up new build tools) and run:`)
  console.log(`  ${green}npm run setup:python${reset}\n`)
  process.exit(1)
} else {
  console.log('[setup-python] All Python modules installed successfully.')
}

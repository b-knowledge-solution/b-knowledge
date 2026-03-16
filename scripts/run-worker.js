/**
 * Runs the advance-rag Python worker using the centralized virtual environment.
 *
 * @description Launches executor_wrapper via .venv Python or falls back to system Python.
 *              Verifies the Python binary actually works before using it.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const ragDir = join(rootDir, 'advance-rag')
const isWin = process.platform === 'win32'

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
 * Resolves the Python interpreter from the project .venv.
 * Does NOT fall back to system Python — .venv is required.
 *
 * @returns {string} Absolute path to the .venv Python executable
 */
function resolvePython() {
  const venvPython = isWin
    ? join(rootDir, '.venv', 'Scripts', 'python.exe')
    : join(rootDir, '.venv', 'bin', 'python')

  // Check if .venv directory exists
  if (!existsSync(join(rootDir, '.venv'))) {
    console.error('')
    console.error('\x1b[31m[run-worker] ERROR: Python virtual environment not found.\x1b[0m')
    console.error('')
    console.error('  Expected .venv at:')
    console.error(`    ${join(rootDir, '.venv')}`)
    console.error('')
    console.error('  Run the following command to create it:')
    console.error('    \x1b[32mnpm run setup:python\x1b[0m')
    console.error('  Or run the full setup:')
    console.error('    \x1b[32mnpm run setup\x1b[0m')
    console.error('')
    process.exit(1)
  }

  // Check if the Python binary inside .venv actually works
  if (!isPythonWorking(venvPython)) {
    console.error('')
    console.error('\x1b[31m[run-worker] ERROR: Python in .venv is broken (base Python may have been uninstalled).\x1b[0m')
    console.error('')
    console.error(`  Tried: ${venvPython}`)
    console.error('')
    console.error('  Delete .venv and recreate it:')
    console.error(`    \x1b[33mrmdir /s /q .venv\x1b[0m   (Windows)`)
    console.error(`    \x1b[33mrm -rf .venv\x1b[0m         (macOS/Linux)`)
    console.error('  Then run:')
    console.error('    \x1b[32mnpm run setup:python\x1b[0m')
    console.error('')
    process.exit(1)
  }

  return venvPython
}

const python = resolvePython()
console.log(`[run-worker] Starting advance-rag worker with ${python}...`)
execSync(`"${python}" -m executor_wrapper`, { cwd: ragDir, stdio: 'inherit' })

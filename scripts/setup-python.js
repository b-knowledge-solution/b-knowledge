/**
 * Sets up a centralized Python virtual environment at the project root.
 *
 * @description Creates a single .venv in the root directory and installs
 * all Python modules (advance-rag, converter) in editable mode.
 * Each module keeps its own pyproject.toml for independent Docker builds.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const isWin = process.platform === 'win32'
const venvDir = join(rootDir, '.venv')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip')
  : join(venvDir, 'bin', 'pip')
const python = isWin
  ? join(venvDir, 'Scripts', 'python')
  : join(venvDir, 'bin', 'python')

/** Python modules to install in editable mode */
const pythonModules = [
  { name: 'advance-rag', path: join(rootDir, 'advance-rag') },
  { name: 'converter', path: join(rootDir, 'converter') },
]

/** Step 1 — Create the centralized venv if it doesn't exist */
if (!existsSync(venvDir)) {
  console.log('[setup-python] Creating centralized virtual environment at .venv/ ...')
  execSync(`python -m venv "${venvDir}"`, { cwd: rootDir, stdio: 'inherit' })
} else {
  console.log('[setup-python] Virtual environment already exists, skipping creation.')
}

/** Step 2 — Upgrade pip to latest */
console.log('[setup-python] Upgrading pip...')
execSync(`"${python}" -m pip install --upgrade pip`, { cwd: rootDir, stdio: 'inherit' })

/** Step 3 — Install each Python module in editable mode */
for (const mod of pythonModules) {
  if (!existsSync(mod.path)) {
    console.log(`[setup-python] Skipping ${mod.name} — directory not found.`)
    continue
  }

  console.log(`[setup-python] Installing ${mod.name} in editable mode...`)
  execSync(`"${pip}" install -e "${mod.path}"`, { cwd: rootDir, stdio: 'inherit' })
}

console.log('[setup-python] All Python modules installed successfully.')

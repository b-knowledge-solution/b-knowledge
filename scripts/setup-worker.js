/**
 * Sets up the advance-rag Python worker using the centralized virtual environment.
 *
 * @description Installs advance-rag in editable mode into the root .venv.
 * @deprecated Use `npm run setup:python` instead for centralized setup.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const ragDir = join(rootDir, 'advance-rag')
const isWin = process.platform === 'win32'
const venvDir = join(rootDir, '.venv')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip')
  : join(venvDir, 'bin', 'pip')

/** Create centralized venv if it doesn't exist */
if (!existsSync(venvDir)) {
  console.log('[setup-worker] Creating centralized virtual environment...')
  execSync(`python -m venv "${venvDir}"`, { cwd: rootDir, stdio: 'inherit' })
} else {
  console.log('[setup-worker] Virtual environment already exists, skipping creation.')
}

/** Install advance-rag in editable mode */
console.log('[setup-worker] Installing advance-rag dependencies...')
execSync(`"${pip}" install -e "${ragDir}"`, { cwd: rootDir, stdio: 'inherit' })

console.log('[setup-worker] Setup complete.')

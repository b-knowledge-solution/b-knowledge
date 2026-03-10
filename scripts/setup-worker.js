/**
 * Sets up the advance-rag Python worker virtual environment.
 *
 * @description Creates a .venv in advance-rag/ and installs the package in editable mode.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const ragDir = resolve(import.meta.dirname, '..', 'advance-rag')
const isWin = process.platform === 'win32'
const venvDir = join(ragDir, '.venv')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip')
  : join(venvDir, 'bin', 'pip')

/** Create venv if it doesn't exist */
if (!existsSync(venvDir)) {
  console.log('[setup-worker] Creating virtual environment...')
  execSync('python -m venv .venv', { cwd: ragDir, stdio: 'inherit' })
} else {
  console.log('[setup-worker] Virtual environment already exists, skipping creation.')
}

/** Install the package in editable mode */
console.log('[setup-worker] Installing dependencies...')
execSync(`"${pip}" install -e .`, { cwd: ragDir, stdio: 'inherit' })

console.log('[setup-worker] Setup complete.')

/**
 * Sets up the converter Python worker virtual environment.
 *
 * @description Creates a .venv in converter/ and installs dependencies from requirements.txt.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const converterDir = resolve(import.meta.dirname, '..', 'converter')
const isWin = process.platform === 'win32'
const venvDir = join(converterDir, '.venv')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip')
  : join(venvDir, 'bin', 'pip')

/** Create venv if it doesn't exist */
if (!existsSync(venvDir)) {
  console.log('[setup-converter] Creating virtual environment...')
  execSync('python -m venv .venv', { cwd: converterDir, stdio: 'inherit' })
} else {
  console.log('[setup-converter] Virtual environment already exists, skipping creation.')
}

/** Install dependencies from requirements.txt */
console.log('[setup-converter] Installing dependencies...')
execSync(`"${pip}" install -r requirements.txt`, { cwd: converterDir, stdio: 'inherit' })

console.log('[setup-converter] Setup complete.')

/**
 * Sets up the converter Python worker using the centralized virtual environment.
 *
 * @description Installs converter in editable mode into the root .venv.
 * @deprecated Use `npm run setup:python` instead for centralized setup.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const converterDir = join(rootDir, 'converter')
const isWin = process.platform === 'win32'
const venvDir = join(rootDir, '.venv')
const pip = isWin
  ? join(venvDir, 'Scripts', 'pip')
  : join(venvDir, 'bin', 'pip')

/** Create centralized venv if it doesn't exist */
if (!existsSync(venvDir)) {
  console.log('[setup-converter] Creating centralized virtual environment...')
  execSync(`python -m venv "${venvDir}"`, { cwd: rootDir, stdio: 'inherit' })
} else {
  console.log('[setup-converter] Virtual environment already exists, skipping creation.')
}

/** Install converter in editable mode */
console.log('[setup-converter] Installing converter dependencies...')
execSync(`"${pip}" install -e "${converterDir}"`, { cwd: rootDir, stdio: 'inherit' })

console.log('[setup-converter] Setup complete.')

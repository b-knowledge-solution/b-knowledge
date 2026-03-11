/**
 * Runs the document converter worker using the centralized virtual environment.
 *
 * @description Launches the converter worker via the root .venv Python interpreter.
 */

import { execSync } from 'child_process'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const converterDir = join(rootDir, 'converter')
const isWin = process.platform === 'win32'
const python = isWin
  ? join(rootDir, '.venv', 'Scripts', 'python')
  : join(rootDir, '.venv', 'bin', 'python')

console.log('[run-converter] Starting converter worker...')
execSync(`"${python}" -m src.worker`, { cwd: converterDir, stdio: 'inherit' })

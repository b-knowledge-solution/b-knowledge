/**
 * Runs the document converter worker using the project virtual environment.
 *
 * @description Launches the converter worker via the .venv Python interpreter.
 */

import { execSync } from 'child_process'
import { join, resolve } from 'path'

const converterDir = resolve(import.meta.dirname, '..', 'converter')
const isWin = process.platform === 'win32'
const python = isWin
  ? join(converterDir, '.venv', 'Scripts', 'python')
  : join(converterDir, '.venv', 'bin', 'python')

console.log('[run-converter] Starting converter worker...')
execSync(`"${python}" -m src.worker`, { cwd: converterDir, stdio: 'inherit' })

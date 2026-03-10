/**
 * Runs the advance-rag Python worker using the project virtual environment.
 *
 * @description Launches executor_wrapper via the .venv Python interpreter.
 */

import { execSync } from 'child_process'
import { join, resolve } from 'path'

const ragDir = resolve(import.meta.dirname, '..', 'advance-rag')
const isWin = process.platform === 'win32'
const python = isWin
  ? join(ragDir, '.venv', 'Scripts', 'python')
  : join(ragDir, '.venv', 'bin', 'python')

console.log('[run-worker] Starting advance-rag worker...')
execSync(`"${python}" -m executor_wrapper`, { cwd: ragDir, stdio: 'inherit' })

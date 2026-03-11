/**
 * Runs the advance-rag Python worker using the centralized virtual environment.
 *
 * @description Launches executor_wrapper via the root .venv Python interpreter.
 */

import { execSync } from 'child_process'
import { join, resolve } from 'path'

const rootDir = resolve(import.meta.dirname, '..')
const ragDir = join(rootDir, 'advance-rag')
const isWin = process.platform === 'win32'
const python = isWin
  ? join(rootDir, '.venv', 'Scripts', 'python')
  : join(rootDir, '.venv', 'bin', 'python')

console.log('[run-worker] Starting advance-rag worker...')
execSync(`"${python}" -m executor_wrapper`, { cwd: ragDir, stdio: 'inherit' })

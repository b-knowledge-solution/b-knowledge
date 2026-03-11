/**
 * Runs the document converter worker.
 *
 * @description Launches the converter worker using WSL on Windows
 *              or directly via bash on Linux/macOS.
 */

import { execSync } from 'child_process'
import { resolve } from 'path'

const converterDir = resolve(import.meta.dirname, '..', 'converter')
const isWin = process.platform === 'win32'

console.log('[run-converter] Starting converter worker...')

if (isWin) {
  // On Windows, run via WSL
  execSync('wsl bash ./start.sh', { cwd: converterDir, stdio: 'inherit' })
} else {
  // On Linux/macOS, run directly
  execSync('bash ./start.sh', { cwd: converterDir, stdio: 'inherit' })
}

/**
 * @fileoverview Safe subprocess execution utility that prevents shell injection.
 * Uses child_process.execFile (not exec) to avoid shell interpretation of arguments.
 * @module shared/utils/execFileNoThrow
 */
import { execFile as cpExecFile } from 'child_process'

/**
 * @description Result of a subprocess execution
 */
export interface ExecResult {
  /** Process exit code (0 = success) */
  code: number
  /** Captured stdout output */
  stdout: string
  /** Captured stderr output */
  stderr: string
}

/**
 * @description Execute a command safely without shell injection risk.
 *   Uses child_process.execFile which does NOT spawn a shell, so arguments
 *   are passed directly to the executable without interpretation.
 *   Never throws — returns exit code, stdout, and stderr.
 * @param {string} command - The executable to run (e.g., 'git', 'unzip')
 * @param {string[]} args - Array of arguments passed directly to the executable
 * @param {object} [options] - Optional execution options
 * @param {string} [options.cwd] - Working directory for the subprocess
 * @param {number} [options.timeout] - Timeout in milliseconds (default 300000 = 5min)
 * @param {number} [options.maxBuffer] - Max stdout/stderr buffer size in bytes (default 50MB)
 * @returns {Promise<ExecResult>} Execution result with code, stdout, stderr
 */
export function execFileNoThrow(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; maxBuffer?: number },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    cpExecFile(
      command,
      args,
      {
        cwd: options?.cwd,
        timeout: options?.timeout ?? 300_000,
        maxBuffer: options?.maxBuffer ?? 50 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        // Resolve with exit code regardless of success/failure — caller decides
        const exitCode = typeof error?.code === 'number' ? error.code : (error ? 1 : 0)
        resolve({
          code: exitCode,
          stdout: String(stdout),
          stderr: String(stderr),
        })
      },
    )
  })
}

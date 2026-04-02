/**
 * @fileoverview Docker sandbox service for safe code execution.
 *
 * Creates ephemeral Docker containers with strict resource limits:
 * - 256MB memory cap
 * - 1 CPU core
 * - No network access
 * - Read-only root filesystem
 * - Auto-remove on exit
 *
 * SECURITY: In production, use docker-socket-proxy (tecnativa/docker-socket-proxy)
 * to expose a limited Docker API surface instead of mounting /var/run/docker.sock directly.
 *
 * @module modules/agents/services/agent-sandbox
 */
import Dockerode from 'dockerode'
import { logger } from '@/shared/services/logger.service.js'

/** @description Default execution timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000

/** @description Memory limit for sandbox containers (256MB) */
const MEMORY_LIMIT = 256 * 1024 * 1024

/** @description CPU limit in NanoCPUs (1 core) */
const CPU_LIMIT = 1e9

/** @description Map from language name to Docker image and command prefix */
const LANGUAGE_CONFIG: Record<string, { image: string; cmd: string[] }> = {
  python: { image: 'python:3.11-slim', cmd: ['python', '-c'] },
  javascript: { image: 'node:22-slim', cmd: ['node', '-e'] },
  bash: { image: 'ubuntu:24.04', cmd: ['bash', '-c'] },
}

/** @description Supported sandbox execution languages */
export type SandboxLanguage = 'python' | 'javascript' | 'bash'

/** @description Result of a sandbox code execution */
export interface SandboxResult {
  /** Standard output from the code execution */
  stdout: string
  /** Standard error output from the code execution */
  stderr: string
  /** Process exit code (0 = success) */
  exitCode: number
}

/**
 * @description Singleton service managing ephemeral Docker containers for safe code execution.
 *   Containers are isolated with no network, read-only filesystem, and strict resource limits.
 */
class AgentSandboxService {
  /** Docker client instance */
  private docker: Dockerode

  constructor() {
    // Connect to Docker daemon via the default socket
    this.docker = new Dockerode()
  }

  /**
   * @description Execute code in an ephemeral Docker container with resource limits.
   *   Creates a container, runs the code, captures output, and removes the container.
   * @param {string} code - Source code to execute
   * @param {SandboxLanguage} language - Programming language ('python' | 'javascript' | 'bash')
   * @param {number} [timeout=30000] - Execution timeout in milliseconds
   * @returns {Promise<SandboxResult>} Stdout, stderr, and exit code from execution
   * @throws {Error} If Docker is unavailable or container creation fails
   */
  async executeCode(
    code: string,
    language: SandboxLanguage,
    timeout: number = DEFAULT_TIMEOUT_MS,
  ): Promise<SandboxResult> {
    // Look up image and command for the requested language
    const langConfig = LANGUAGE_CONFIG[language]
    if (!langConfig) {
      return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1 }
    }

    let container: Dockerode.Container | undefined

    try {
      // Create ephemeral container with strict security constraints
      container = await this.docker.createContainer({
        Image: langConfig.image,
        Cmd: [...langConfig.cmd, code],
        HostConfig: {
          Memory: MEMORY_LIMIT,
          NanoCpus: CPU_LIMIT,
          // No network access for sandbox isolation
          NetworkMode: 'none',
          // Prevent writing to the container filesystem
          ReadonlyRootfs: true,
          // Auto-remove container after it exits
          AutoRemove: true,
          // Mount /tmp as writable tmpfs for languages that need temp files
          Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' },
        },
        // Disable networking at container level as well
        NetworkDisabled: true,
        // Attach stdout and stderr for output capture
        AttachStdout: true,
        AttachStderr: true,
      })

      // Start the container
      await container.start()

      // Race execution against timeout to prevent indefinite hangs
      const result = await Promise.race([
        this.waitForResult(container),
        this.createTimeout(timeout, container),
      ])

      return result
    } catch (error) {
      logger.error(`Sandbox execution failed: language=${language}, error=${String(error)}`)

      // Attempt cleanup if container was created but didn't auto-remove
      if (container) {
        await this.forceRemove(container)
      }

      return {
        stdout: '',
        stderr: `Sandbox error: ${String(error)}`,
        exitCode: 1,
      }
    }
  }

  /**
   * @description Wait for a container to finish and collect its output.
   * @param {Dockerode.Container} container - Running Docker container
   * @returns {Promise<SandboxResult>} Execution result with captured output
   */
  private async waitForResult(container: Dockerode.Container): Promise<SandboxResult> {
    // Wait for the container to exit
    const waitResult = await container.wait()

    // Fetch logs after container exits (stdout and stderr separately)
    const stdoutStream = await container.logs({ stdout: true, stderr: false })
    const stderrStream = await container.logs({ stdout: false, stderr: true })

    return {
      stdout: stdoutStream.toString('utf-8').trim(),
      stderr: stderrStream.toString('utf-8').trim(),
      exitCode: waitResult.StatusCode,
    }
  }

  /**
   * @description Create a timeout promise that kills the container if exceeded.
   * @param {number} timeoutMs - Timeout duration in milliseconds
   * @param {Dockerode.Container} container - Container to kill on timeout
   * @returns {Promise<SandboxResult>} Timeout error result
   */
  private createTimeout(timeoutMs: number, container: Dockerode.Container): Promise<SandboxResult> {
    return new Promise((resolve) => {
      setTimeout(async () => {
        // Kill the container if it's still running past the deadline
        await this.forceRemove(container)
        resolve({
          stdout: '',
          stderr: `Execution timed out after ${timeoutMs}ms`,
          exitCode: 124,
        })
      }, timeoutMs)
    })
  }

  /**
   * @description Force-remove a container to prevent orphaned resources.
   *   Catches errors silently since the container may have already been removed.
   * @param {Dockerode.Container} container - Container to remove
   */
  private async forceRemove(container: Dockerode.Container): Promise<void> {
    try {
      await container.remove({ force: true })
    } catch {
      // Container may already be removed (AutoRemove) — ignore
    }
  }
}

/** @description Singleton sandbox service instance */
export const agentSandboxService = new AgentSandboxService()

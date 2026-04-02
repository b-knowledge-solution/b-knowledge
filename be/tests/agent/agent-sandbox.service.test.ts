/**
 * @fileoverview Unit tests for AgentSandboxService.
 *
 * Tests container creation config, code execution lifecycle,
 * timeout handling, unsupported language handling, and cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockContainer = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
  logs: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
}))

const mockDocker = vi.hoisted(() => ({
  createContainer: vi.fn().mockResolvedValue(mockContainer),
}))

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => mockDocker),
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentSandboxService } from '../../src/modules/agents/services/agent-sandbox.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentSandboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply mock implementations after clearAllMocks resets them
    mockContainer.start.mockResolvedValue(undefined)
    mockContainer.wait.mockResolvedValue({ StatusCode: 0 })
    mockContainer.remove.mockResolvedValue(undefined)
    mockContainer.logs.mockResolvedValue(Buffer.from('output text'))
    mockDocker.createContainer.mockResolvedValue(mockContainer)
  })

  // -----------------------------------------------------------------------
  // executeCode — container creation config
  // -----------------------------------------------------------------------

  describe('container configuration', () => {
    it('creates a container with network disabled', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from('Hello'))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('print("Hello")', 'python')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          NetworkDisabled: true,
          HostConfig: expect.objectContaining({
            NetworkMode: 'none',
          }),
        }),
      )
    })

    it('creates a container with memory limit (256MB)', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('print("hi")', 'python')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Memory: 256 * 1024 * 1024,
          }),
        }),
      )
    })

    it('creates a container with read-only root filesystem', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('print("hi")', 'python')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            ReadonlyRootfs: true,
          }),
        }),
      )
    })

    it('creates a container with tmpfs mount for /tmp', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('echo hi', 'bash')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' },
          }),
        }),
      )
    })

    it('creates a container with auto-remove enabled', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('console.log("hi")', 'javascript')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            AutoRemove: true,
          }),
        }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // executeCode — language selection
  // -----------------------------------------------------------------------

  describe('language selection', () => {
    it('uses python:3.11-slim image for Python', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('print("hi")', 'python')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'python:3.11-slim',
          Cmd: ['python', '-c', 'print("hi")'],
        }),
      )
    })

    it('uses node:22-slim image for JavaScript', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('console.log("hi")', 'javascript')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'node:22-slim',
          Cmd: ['node', '-e', 'console.log("hi")'],
        }),
      )
    })

    it('uses ubuntu:24.04 image for Bash', async () => {
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from(''))

      await agentSandboxService.executeCode('echo hi', 'bash')

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'ubuntu:24.04',
          Cmd: ['bash', '-c', 'echo hi'],
        }),
      )
    })

    it('returns error for unsupported language', async () => {
      const result = await agentSandboxService.executeCode('code', 'ruby' as any)

      expect(result).toEqual({
        stdout: '',
        stderr: 'Unsupported language: ruby',
        exitCode: 1,
      })
      expect(mockDocker.createContainer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // executeCode — result handling
  // -----------------------------------------------------------------------

  describe('result handling', () => {
    it('returns stdout and stderr from the container', async () => {
      mockContainer.wait.mockResolvedValue({ StatusCode: 0 })
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from('Hello World'))
        .mockResolvedValueOnce(Buffer.from(''))

      const result = await agentSandboxService.executeCode('print("Hello World")', 'python')

      expect(result.stdout).toBe('Hello World')
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
    })

    it('returns non-zero exit code on error', async () => {
      mockContainer.wait.mockResolvedValue({ StatusCode: 1 })
      mockContainer.logs
        .mockResolvedValueOnce(Buffer.from(''))
        .mockResolvedValueOnce(Buffer.from('SyntaxError: invalid syntax'))

      const result = await agentSandboxService.executeCode('invalid code!', 'python')

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBe('SyntaxError: invalid syntax')
    })
  })

  // -----------------------------------------------------------------------
  // executeCode — error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('returns error result when Docker creation fails', async () => {
      mockDocker.createContainer.mockRejectedValue(new Error('Docker daemon not available'))

      const result = await agentSandboxService.executeCode('print("hi")', 'python')

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Sandbox error')
      expect(result.stderr).toContain('Docker daemon not available')
    })

    it('attempts force-remove on creation failure', async () => {
      const container = { ...mockContainer, remove: vi.fn().mockResolvedValue(undefined) }
      mockDocker.createContainer.mockResolvedValue(container)
      container.start.mockRejectedValue(new Error('Start failed'))

      await agentSandboxService.executeCode('print("hi")', 'python')

      expect(container.remove).toHaveBeenCalledWith({ force: true })
    })
  })
})

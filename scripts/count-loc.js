/**
 * Counts total lines of code across project text files.
 *
 * @description Scans all git-visible, non-ignored files in the repository,
 * filters out binary files, and writes a Markdown report grouped by the
 * top-level project directory.
 */

import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, sep } from 'path'

const rootDir = resolve(import.meta.dirname, '..')

/** Common generated or vendor directories that should not be counted. */
const excludedDirectories = new Set([
  '.git',
  '.next',
  '.venv',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
])

/** Files that are too noisy or generated to include in the report. */
const excludedFileNames = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

/**
 * Returns the repository file list from git.
 *
 * @returns {string[]} Relative file paths visible to git
 */
function getProjectFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    },
  )

  if (result.error && !result.stdout) {
    throw result.error
  }

  return result.stdout.split('\0').filter(Boolean)
}

/**
 * Returns the current short git hash for naming the report file.
 *
 * @returns {string} Short git hash or `unknown` when unavailable
 */
function getGitHash() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  if (result.error && !result.stdout) {
    return 'unknown'
  }

  return result.stdout.trim() || 'unknown'
}

/**
 * Checks whether a path should be skipped before reading file contents.
 *
 * @param {string} relativePath - Repository-relative file path
 * @returns {boolean} True when the file should be excluded from the report
 */
function shouldSkipFile(relativePath) {
  const pathSegments = relativePath.split(/[\\/]/)
  const fileName = pathSegments[pathSegments.length - 1]

  if (excludedFileNames.has(fileName)) {
    return true
  }

  return pathSegments.some((segment) => excludedDirectories.has(segment))
}

/**
 * Detects whether a buffer is likely binary content.
 *
 * @param {Buffer} fileBuffer - File contents
 * @returns {boolean} True when the buffer contains binary data
 */
function isBinaryFile(fileBuffer) {
  const sampleSize = Math.min(fileBuffer.length, 8000)
  for (let index = 0; index < sampleSize; index += 1) {
    if (fileBuffer[index] === 0) {
      return true
    }
  }

  return false
}

/**
 * Counts physical lines in a text file buffer.
 *
 * @param {Buffer} fileBuffer - UTF-8 text file contents
 * @returns {number} Total number of lines in the file
 */
function countLines(fileBuffer) {
  if (fileBuffer.length === 0) {
    return 0
  }

  const fileContent = fileBuffer.toString('utf-8')
  return fileContent.split(/\r?\n/).length
}

/**
 * Resolves the reporting bucket for a repository-relative file path.
 *
 * @param {string} relativePath - Repository-relative file path
 * @returns {string} Top-level folder name or `root`
 */
function getBucket(relativePath) {
  const normalizedPath = relativePath.split(/[\\/]/).join(sep)
  const segments = normalizedPath.split(sep)
  return segments.length === 1 ? 'root' : segments[0]
}

/**
 * Formats a numeric line count for terminal output.
 *
 * @param {number} value - Numeric line count
 * @returns {string} Locale-formatted number string
 */
function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Builds the Markdown report content.
 *
 * @param {Object} params - Report values
 * @param {string} params.gitHash - Current repository git hash
 * @param {number} params.countedFiles - Total counted text files
 * @param {number} params.totalLines - Total physical lines across the project
 * @param {Array<[string, number]>} params.sortedBuckets - Line counts grouped by top-level directory
 * @returns {string} Markdown report content
 */
function buildMarkdownReport({ gitHash, countedFiles, totalLines, sortedBuckets }) {
  const generatedAt = new Date().toISOString()
  const lines = [
    '# Project LoC Report',
    '',
    '## Summary',
    '',
    `- Git hash: \`${gitHash}\``,
    `- Generated at: \`${generatedAt}\``,
    `- Files counted: \`${formatCount(countedFiles)}\``,
    `- Total lines: \`${formatCount(totalLines)}\``,
    '',
    '## Breakdown By Top-Level Directory',
    '',
    '| Directory | Lines |',
    '| --- | ---: |',
  ]

  if (sortedBuckets.length === 0) {
    lines.push('| No text files found | 0 |')
  } else {
    for (const [bucket, lineCount] of sortedBuckets) {
      lines.push(`| \`${bucket}\` | ${formatCount(lineCount)} |`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

const files = getProjectFiles()
const gitHash = getGitHash()
const totalsByBucket = new Map()
let countedFiles = 0
let totalLines = 0

for (const relativePath of files) {
  if (shouldSkipFile(relativePath)) {
    continue
  }

  const absolutePath = resolve(rootDir, relativePath)
  const fileBuffer = readFileSync(absolutePath)

  // Skip binary content so images, archives, and compiled assets do not inflate the total.
  if (isBinaryFile(fileBuffer)) {
    continue
  }

  const lineCount = countLines(fileBuffer)
  const bucket = getBucket(relativePath)

  totalsByBucket.set(bucket, (totalsByBucket.get(bucket) ?? 0) + lineCount)
  countedFiles += 1
  totalLines += lineCount
}

const sortedBuckets = [...totalsByBucket.entries()].sort((left, right) => right[1] - left[1])
const reportFileName = `loc_${gitHash}.md`
const reportFilePath = resolve(rootDir, reportFileName)
const reportContent = buildMarkdownReport({
  gitHash,
  countedFiles,
  totalLines,
  sortedBuckets,
})

writeFileSync(reportFilePath, reportContent, 'utf-8')

console.log(`LoC report written to ${reportFileName}`)
console.log(`Files counted: ${formatCount(countedFiles)}`)
console.log(`Total lines: ${formatCount(totalLines)}`)

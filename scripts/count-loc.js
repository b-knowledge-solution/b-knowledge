/**
 * Counts total lines of code across project text files.
 *
 * @description Scans all git-visible, non-ignored files in the repository,
 * filters out binary files, and reports total physical lines grouped by the
 * top-level project directory.
 */

import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
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

const files = getProjectFiles()
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

console.log('Project LoC Report')
console.log(`Files counted: ${formatCount(countedFiles)}`)
console.log(`Total lines: ${formatCount(totalLines)}`)
console.log('')
console.log('By top-level directory:')

for (const [bucket, lineCount] of sortedBuckets) {
  console.log(`- ${bucket}: ${formatCount(lineCount)}`)
}

if (sortedBuckets.length === 0) {
  console.log('- No text files found')
}

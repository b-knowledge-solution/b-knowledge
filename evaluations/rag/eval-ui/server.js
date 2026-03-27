'use strict'

/**
 * @file server.js
 * @description RAG Evaluation UI — Express server
 *
 * Runs on the HOST machine (not inside Docker) so it can execute
 * `docker compose run` commands and read results/ via the filesystem.
 *
 * Endpoints:
 *   GET  /                          → index.html (static)
 *   GET  /api/status                → readiness + run state
 *   GET  /api/eval/stream           → SSE: live log + run events
 *   POST /api/eval/start            → start a new evaluation run
 *   POST /api/eval/cancel           → kill the running process
 *   GET  /api/results/summary       → eval_summary.md as plain text
 *   GET  /api/results/files         → list files in results/
 *   GET  /api/results/download/:f   → download a result file
 *
 * Usage:
 *   cd evaluations/rag/eval-ui
 *   npm install
 *   node server.js
 *   → open http://localhost:4000
 */

const express = require('express')
const multer  = require('multer')
const { spawn } = require('child_process')
const fs        = require('fs')
const path      = require('path')

const app  = express()
const PORT = Number(process.env.EVAL_UI_PORT) || 4000

// evaluations/rag/ — one level up from this file's directory (eval-ui/)
const RAG_ROOT     = path.resolve(__dirname, '..')
const RESULTS_DIR  = path.join(RAG_ROOT, 'results')
const ENV_FILE     = path.join(RAG_ROOT, '.env')
const DATASET_FILE = path.join(RAG_ROOT, 'dataset', 'eval_dataset.yaml')
const DATASET_DIR  = path.join(RAG_ROOT, 'dataset')

// ---------------------------------------------------------------------------
// Multer — keep uploaded file in memory (datasets are typically < 10 MB)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },  // 50 MB hard cap
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.json') || file.mimetype === 'application/json') {
      cb(null, true)
    } else {
      cb(new Error('Only JSON files are accepted'))
    }
  }
})

// ---------------------------------------------------------------------------
// Dataset conversion helpers
// Converts Alpaca or ShareGPT JSON export from Easy Dataset → eval_dataset.yaml
// Runs entirely in-process — no Python or Docker required.
// ---------------------------------------------------------------------------

/**
 * @description Escape a string for use as a YAML double-quoted scalar.
 * Handles backslash, double-quote, and control characters.
 * @param {string} s
 * @returns {string}  The escaped string, ready to wrap in double quotes.
 */
function escapeYamlStr (s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

/**
 * @description Convert an array of {question, expected_answer} pairs to
 * the YAML format expected by promptfooconfig.yaml.
 * @param {Array<{question:string, expected_answer:string}>} pairs
 * @returns {string}  YAML content
 */
function pairsToYaml (pairs) {
  return pairs.map(p =>
    `- vars:\n    question: "${escapeYamlStr(p.question)}"\n    expected_answer: "${escapeYamlStr(p.expected_answer)}"`
  ).join('\n') + '\n'
}

/**
 * @description Detect format and extract Q&A pairs from Easy Dataset JSON export.
 * Supports Alpaca format (array of {instruction, output}) and ShareGPT format
 * (array of {conversations: [{from:'human',value},{from:'gpt',value}]}).
 * @param {Array} data  Parsed JSON array from the export file
 * @returns {{ pairs: Array<{question:string, expected_answer:string}>, format: string }}
 * @throws {Error} When the format is not recognised or required fields are missing
 */
function extractPairs (data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('JSON must be a non-empty array')
  }

  // Detect by first element
  const first = data[0]

  // ── Alpaca: { instruction, output, [input] } ─────────────────────────────
  if (typeof first.instruction === 'string') {
    const pairs = data
      .filter(r => r.instruction && r.output)
      .map(r => ({ question: r.instruction.trim(), expected_answer: r.output.trim() }))
    if (pairs.length === 0) throw new Error('No valid Alpaca records found (need instruction + output)')
    return { pairs, format: 'alpaca' }
  }

  // ── ShareGPT: { conversations: [{from, value}] } ────────────────────────
  if (Array.isArray(first.conversations)) {
    const pairs = []
    for (const rec of data) {
      const convs = rec.conversations || []
      const humanMsg = convs.find(c => c.from === 'human')
      const gptMsg   = convs.find(c => c.from === 'gpt' || c.from === 'assistant')
      if (humanMsg && gptMsg) {
        pairs.push({ question: humanMsg.value.trim(), expected_answer: gptMsg.value.trim() })
      }
    }
    if (pairs.length === 0) throw new Error('No valid ShareGPT records found (need human + gpt turns)')
    return { pairs, format: 'sharegpt' }
  }

  throw new Error(
    'Unrecognised format. Expected Alpaca ({instruction, output}) or ShareGPT ({conversations}).'
  )
}

// ---------------------------------------------------------------------------
// Run state — single evaluation at a time
// ---------------------------------------------------------------------------

/** @type {{ isRunning:boolean, startTime:string|null, endTime:string|null, exitCode:number|null, status:string|null }} */
let runState = {
  isRunning : false,
  startTime : null,
  endTime   : null,
  exitCode  : null,
  status    : null  // null | 'running' | 'success' | 'error'
}

/** Active child process handle */
let activeProcess = null

/**
 * Log buffer for the current run.
 * New SSE clients receive the buffered lines so they see the full log
 * even when they connect mid-run.
 * @type {Array<{text:string, stream:string}>}
 */
let logBuffer = []

/** Connected SSE response objects */
let sseClients = []

/** Cap log buffer at this many entries to prevent unbounded memory growth */
const LOG_BUFFER_MAX = 5000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Parse .env file into a Map<key, value>
 * @returns {Map<string, string>}
 */
function parseEnv () {
  const map = new Map()
  if (!fs.existsSync(ENV_FILE)) return map
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(raw => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const idx = line.indexOf('=')
    if (idx < 1) return
    const key   = line.slice(0, idx).trim()
    // Strip surrounding quotes from value
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    map.set(key, value)
  })
  return map
}

/**
 * @description Return true when all critical .env vars are non-empty
 * @returns {boolean}
 */
function envConfigured () {
  const env = parseEnv()
  return ['BKNOWLEDGE_API_URL', 'BKNOWLEDGE_CHAT_TOKEN', 'LLM_JUDGE_API_KEY']
    .every(k => env.has(k) && env.get(k).length > 0)
}

/**
 * @description Remove a file or directory if it exists (silent)
 * @param {string} p Absolute path
 */
function rmIfExists (p) {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch (_) {}
}

/**
 * @description Broadcast an SSE event to all connected clients.
 * Automatically removes closed connections.
 * @param {string} eventType
 * @param {object} payload
 */
function broadcast (eventType, payload) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`
  sseClients = sseClients.filter(res => !res.writableEnded)
  sseClients.forEach(res => res.write(msg))
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

// ---------------------------------------------------------------------------
// GET /api/status
// ---------------------------------------------------------------------------

/**
 * @description Returns current readiness flags and run state.
 * Called on page load and after each run completes.
 */
app.get('/api/status', (_req, res) => {
  const hasSummary = fs.existsSync(path.join(RESULTS_DIR, 'eval_summary.md'))
  const summaryModified = hasSummary
    ? fs.statSync(path.join(RESULTS_DIR, 'eval_summary.md')).mtime.toISOString()
    : null

  // Count questions in dataset if it exists
  let datasetCount = 0
  if (fs.existsSync(DATASET_FILE)) {
    const raw = fs.readFileSync(DATASET_FILE, 'utf8')
    datasetCount = (raw.match(/^- vars:/gm) || []).length
  }

  res.json({
    ...runState,
    hasSummary,
    summaryModified,
    hasDataset    : fs.existsSync(DATASET_FILE),
    datasetCount,
    envConfigured : envConfigured()
  })
})

// ---------------------------------------------------------------------------
// POST /api/dataset/upload
// ---------------------------------------------------------------------------

/**
 * @description Accepts an Alpaca or ShareGPT JSON file upload, converts it
 * to eval_dataset.yaml in-process (no Python required), and saves it.
 * Returns { ok, format, count } on success.
 */
app.post('/api/dataset/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file received' })
  }

  let parsed
  try {
    parsed = JSON.parse(req.file.buffer.toString('utf8'))
  } catch (_) {
    return res.status(400).json({ error: 'File is not valid JSON' })
  }

  let result
  try {
    result = extractPairs(parsed)
  } catch (err) {
    return res.status(422).json({ error: err.message })
  }

  const yaml = pairsToYaml(result.pairs)

  try {
    fs.mkdirSync(DATASET_DIR, { recursive: true })
    fs.writeFileSync(DATASET_FILE, yaml, 'utf8')
  } catch (err) {
    return res.status(500).json({ error: 'Could not write dataset file: ' + err.message })
  }

  // Broadcast so all connected clients update their readiness indicators
  broadcast('datasetUpdated', { count: result.pairs.length, format: result.format })
  res.json({ ok: true, format: result.format, count: result.pairs.length })
})

// Multer error handler (e.g. file too large, wrong type)
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Only JSON files are accepted') {
    return res.status(400).json({ error: err.message })
  }
  next(err)
})

// ---------------------------------------------------------------------------
// GET /api/eval/stream — SSE subscription
// ---------------------------------------------------------------------------

/**
 * @description Long-lived SSE connection.
 * On connect: sends current run state + replays buffered log for this run.
 * During run: receives 'log', 'start', 'done' events via broadcast().
 */
app.get('/api/eval/stream', (req, res) => {
  res.setHeader('Content-Type',       'text/event-stream')
  res.setHeader('Cache-Control',      'no-cache')
  res.setHeader('Connection',         'keep-alive')
  // Prevent Nginx from buffering SSE — without this the live log would stall
  res.setHeader('X-Accel-Buffering',  'no')
  res.flushHeaders()

  // Send current state immediately so the UI syncs on page load
  res.write(`event: status\ndata: ${JSON.stringify(runState)}\n\n`)

  // Replay buffered log if a run is in progress (or just finished)
  if (logBuffer.length > 0) {
    res.write(`event: replay\ndata: ${JSON.stringify({ lines: logBuffer })}\n\n`)
  }

  sseClients.push(res)
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res) })
})

// ---------------------------------------------------------------------------
// POST /api/eval/start
// ---------------------------------------------------------------------------

/**
 * @description Starts a new evaluation run inside the rag-evaluator container.
 * Cleans previous run artifacts, spawns docker compose run (no shell —
 * args are passed as an array to avoid any injection risk), streams output
 * to all SSE clients.
 */
app.post('/api/eval/start', (req, res) => {
  if (runState.isRunning) {
    return res.status(409).json({ error: 'Evaluation already running' })
  }

  // Clean previous run artifacts so the new run starts from a known state
  ;[
    path.join(RAG_ROOT, 'results', 'eval_output.json'),
    path.join(RAG_ROOT, 'results', 'eval_summary.md'),
    path.join(RAG_ROOT, 'results', 'report.html'),
    path.join(RAG_ROOT, '__pycache__'),
    path.join(RAG_ROOT, 'providers',  '__pycache__'),
    path.join(RAG_ROOT, 'metrics',    '__pycache__'),
    path.join(RAG_ROOT, 'scripts',    '__pycache__'),
    path.join(RAG_ROOT, '.promptfoo')
  ].forEach(rmIfExists)

  fs.mkdirSync(RESULTS_DIR, { recursive: true })

  // Reset run state and log buffer
  logBuffer = []
  runState  = {
    isRunning : true,
    startTime : new Date().toISOString(),
    endTime   : null,
    exitCode  : null,
    status    : 'running'
  }

  const evalDataset = 'dataset/eval_dataset.yaml'

  // Spawn docker without a shell — args array prevents any injection
  activeProcess = spawn(
    'docker',
    [
      'compose', 'run', '--rm',
      '-e', `PROMPTFOO_DATASET_PATH=${evalDataset}`,
      'rag-evaluator',
      'sh', '-c',
      'promptfoo eval -c promptfooconfig.yaml && python3 scripts/generate_summary.py'
    ],
    { cwd: RAG_ROOT, env: process.env }
  )

  // Stream stdout to all SSE clients and buffer for late-joiners
  activeProcess.stdout.on('data', chunk => {
    const text = chunk.toString()
    if (logBuffer.length < LOG_BUFFER_MAX) logBuffer.push({ text, stream: 'stdout' })
    broadcast('log', { text, stream: 'stdout' })
  })

  // Stream stderr (Docker and Python warnings appear here)
  activeProcess.stderr.on('data', chunk => {
    const text = chunk.toString()
    if (logBuffer.length < LOG_BUFFER_MAX) logBuffer.push({ text, stream: 'stderr' })
    broadcast('log', { text, stream: 'stderr' })
  })

  // Handle completion
  activeProcess.on('close', code => {
    runState.isRunning = false
    runState.endTime   = new Date().toISOString()
    runState.exitCode  = code
    runState.status    = code === 0 ? 'success' : 'error'
    activeProcess      = null
    broadcast('done', { ...runState })
  })

  broadcast('start', { startTime: runState.startTime })
  res.json({ ok: true, startTime: runState.startTime })
})

// ---------------------------------------------------------------------------
// POST /api/eval/cancel
// ---------------------------------------------------------------------------

/**
 * @description Terminates the currently running evaluation process.
 * Kills the local docker client process AND stops the container — otherwise the
 * container keeps running after the client is killed because it has no tty.
 */
app.post('/api/eval/cancel', (_req, res) => {
  if (!runState.isRunning || !activeProcess) {
    return res.status(400).json({ error: 'No evaluation running' })
  }
  // Kill the local docker client first
  activeProcess.kill()
  // Also stop the container — `docker compose run` names containers
  // <project>-<service>-run-<n>, so we stop by image label instead
  spawn('docker', ['compose', 'stop', 'rag-evaluator'], { cwd: RAG_ROOT })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// GET /api/results/summary
// ---------------------------------------------------------------------------

/**
 * @description Returns the markdown content of eval_summary.md.
 * The browser renders it using marked.js.
 */
app.get('/api/results/summary', (_req, res) => {
  const summaryPath = path.join(RESULTS_DIR, 'eval_summary.md')
  if (!fs.existsSync(summaryPath)) {
    return res.status(404).json({ error: 'No report yet. Run an evaluation first.' })
  }
  res.type('text/plain; charset=utf-8').sendFile(summaryPath)
})

// ---------------------------------------------------------------------------
// GET /api/results/files
// ---------------------------------------------------------------------------

/**
 * @description Lists files in results/, sorted newest first.
 * @returns {{ files: Array<{name, size, modified}> }}
 */
app.get('/api/results/files', (_req, res) => {
  if (!fs.existsSync(RESULTS_DIR)) return res.json({ files: [] })
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(name => !name.startsWith('.'))
    .map(name => {
      const stat = fs.statSync(path.join(RESULTS_DIR, name))
      return { name, size: stat.size, modified: stat.mtime.toISOString() }
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified))
  res.json({ files })
})

// ---------------------------------------------------------------------------
// GET /api/results/download/:filename
// ---------------------------------------------------------------------------

/**
 * @description Serves a file from results/ as a download.
 * Guards against path traversal using path.basename() + path.resolve() check.
 */
app.get('/api/results/download/:filename', (req, res) => {
  // path.basename strips any directory component the client might send
  const filename     = path.basename(req.params.filename)
  const filePath     = path.resolve(RESULTS_DIR, filename)
  const resolvedBase = path.resolve(RESULTS_DIR)

  // Ensure the resolved path stays inside results/
  if (!filePath.startsWith(resolvedBase + path.sep)) {
    return res.status(400).send('Invalid filename')
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found')
  }
  res.download(filePath)
})

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  RAG Eval UI  →  http://localhost:${PORT}\n`)
})

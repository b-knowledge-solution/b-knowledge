/**
 * Polls the backend health endpoint until it responds successfully.
 * Used by `npm run dev:worker` to ensure BE migrations complete before the worker starts.
 *
 * @description Waits for backend /health endpoint, retrying every 3s up to 90s.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const HEALTH_PATH = '/health'
const MAX_WAIT_MS = 90_000
const POLL_INTERVAL_MS = 3_000

async function waitForBackend() {
  const url = `${BACKEND_URL}${HEALTH_PATH}`
  const start = Date.now()

  console.log(`[wait-for-backend] Waiting for backend at ${url} ...`)

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        console.log(`[wait-for-backend] Backend is ready (${Date.now() - start}ms)`)
        process.exit(0)
      }
    } catch {
      // Backend not up yet — retry
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  console.error(`[wait-for-backend] Backend not ready after ${MAX_WAIT_MS / 1000}s — starting worker anyway`)
  process.exit(0)
}

waitForBackend()

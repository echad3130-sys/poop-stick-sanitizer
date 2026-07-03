// Minnow OS Runtime — Non-Blocking I/O
// runtime/io.js
//
// RULE: Any I/O you do MUST use the non-blocking version.
//       Blocking I/O kills the event loop and every managed Future.
//
// PAGI is not bound to a specific I/O backend.
// But we enforce: every operation yields to the loop.
//
// Bad (blocks the loop):
//   fs.readFileSync()
//   while(true) {}
//   crypto.pbkdf2Sync()
//   Atomics.wait()
//
// Good (yields to the loop):
//   await io.readFile()
//   await io.sleep()
//   await io.fetch()
//   await io.timeout()

// ─── Core: sleep / yield ──────────────────────────────────────

/**
 * Yield to the event loop for `ms` milliseconds.
 * Like Future::IO->sleep() — gives control back, never blocks.
 *
 * @param {number} ms - Milliseconds to yield
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Yield to the event loop immediately (next microtask).
 * Use when you need to give other Futures a chance to run
 * without an actual delay.
 *
 * @returns {Promise<void>}
 */
export function yield_() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Yield via queueMicrotask (tighter than setImmediate).
 *
 * @returns {Promise<void>}
 */
export function tick() {
  return new Promise(resolve => queueMicrotask(resolve));
}

// ─── File I/O (non-blocking) ──────────────────────────────────

/**
 * Read a file — non-blocking.
 * NEVER use fs.readFileSync() in the loop.
 *
 * @param {string} path
 * @param {string} [encoding='utf8']
 * @returns {Promise<string>}
 */
export async function readFile(path, encoding = 'utf8') {
  const fs = await import('node:fs/promises');
  return fs.readFile(path, { encoding });
}

/**
 * Write a file — non-blocking.
 *
 * @param {string} path
 * @param {string} data
 * @returns {Promise<void>}
 */
export async function writeFile(path, data) {
  const fs = await import('node:fs/promises');
  return fs.writeFile(path, data, 'utf8');
}

/**
 * Check if file exists — non-blocking.
 *
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export async function exists(path) {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// ─── Network I/O (non-blocking) ───────────────────────────────

/**
 * HTTP fetch — non-blocking.
 * Uses Node's built-in fetch (18+).
 *
 * @param {string} url
 * @param {Object} [options]
 * @returns {Promise<{status: number, headers: Object, body: string}>}
 */
export async function fetchUrl(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs || 10000),
    ...options
  });

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text()
  };
}

// ─── Timeout / Deadline ───────────────────────────────────────

/**
 * Race a Promise against a timeout.
 * If the promise doesn't resolve in `ms`, rejects with TimeoutError.
 *
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} [label='Operation']
 * @returns {Promise<*>}
 */
export function withTimeout(promise, ms, label = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

/**
 * Retry an async function with exponential backoff.
 * Each retry yields to the loop via sleep().
 *
 * @param {function(): Promise<*>} fn
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=3]
 * @param {number} [opts.baseDelayMs=100]
 * @param {number} [opts.maxDelayMs=5000]
 * @returns {Promise<*>}
 */
export async function retry(fn, opts = {}) {
  const maxRetries = opts.maxRetries || 3;
  const baseDelay = opts.baseDelayMs || 100;
  const maxDelay = opts.maxDelayMs || 5000;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await sleep(delay);  // yield to loop between retries
      }
    }
  }
  throw lastError;
}

// ─── Batched Processing (never blocks) ────────────────────────

/**
 * Process an array in chunks, yielding to the loop between chunks.
 * Prevents long-running array processing from blocking the loop.
 *
 * @param {Array} items
 * @param {function(*): Promise<*>} fn
 * @param {number} [chunkSize=50]
 * @returns {Promise<Array>}
 */
export async function batchProcess(items, fn, chunkSize = 50) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    await yield_();  // give the loop a chance between chunks
  }
  return results;
}

// ─── Guard: Detect Blocking ───────────────────────────────────

/**
 * Start a loop-block detector.
 * If the event loop is blocked for more than `thresholdMs`,
 * logs a warning. This is a diagnostic tool, not a fix.
 *
 * @param {number} [thresholdMs=100]
 * @returns {{ stop: function }}
 */
export function detectBlocking(thresholdMs = 100) {
  let lastTick = Date.now();

  const timer = setInterval(() => {
    const now = Date.now();
    const delta = now - lastTick;
    if (delta > thresholdMs) {
      console.warn(
        `[MINNOW] ⚠️ Event loop blocked for ${delta}ms ` +
        `(threshold: ${thresholdMs}ms). Check for sync I/O.`
      );
    }
    lastTick = now;
  }, Math.max(thresholdMs / 2, 50));

  return {
    stop() { clearInterval(timer); }
  };
}

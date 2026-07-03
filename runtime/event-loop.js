// Minnow OS Runtime — Event Loop
// runtime/event-loop.js
//
// The loop manages Futures separately.
// app(scope, receive, send) returns a Future.
// The loop does NOT await it inline — it tracks it.
// Each connection's Future runs independently via its receive/send callbacks.
//
// Architecture:
//   while running:
//     poll_io()         → accept new connections
//     fire app()        → get Future back (don't await)
//     track Future      → register in managed set
//     process settled   → clean up resolved/rejected Futures
//     schedule tasks    → run deferred work

import { buildHttpScope, buildHttpReceive, buildHttpSend } from './adapter.js';

let _connectionCounter = 0;

/**
 * Generate a unique connection ID.
 * @returns {string}
 */
function nextConnectionId() {
  return `conn-${++_connectionCounter}-${Date.now().toString(36)}`;
}

/**
 * @typedef {Object} ManagedFuture
 * @property {string}  connectionId
 * @property {Promise} future        - The app's returned Promise
 * @property {string}  scopeType     - 'http' | 'websocket' | 'sse' | 'lifespan'
 * @property {number}  startTime     - When the Future was created
 * @property {string}  status        - 'pending' | 'resolved' | 'rejected'
 * @property {*}       [result]      - Resolution value
 * @property {*}       [error]       - Rejection reason
 */

/**
 * The Minnow Event Loop.
 *
 * Manages app Futures separately from the I/O accept loop.
 * Each connection gets its own Future that lives independently.
 */
export class EventLoop {
  /**
   * @param {function} app      - The PAGI-style app: async (scope, receive, send) => void
   * @param {Object}   [config] - Loop configuration
   */
  constructor(app, config = {}) {
    this.app = app;
    this.config = {
      port: config.port || 8080,
      host: config.host || '0.0.0.0',
      maxConnections: config.maxConnections || 100000,
      futureTimeoutMs: config.futureTimeoutMs || 30000,  // 30s default for HTTP
      tickIntervalMs: config.tickIntervalMs || 100,
      ...config
    };

    /** @type {Map<string, ManagedFuture>} */
    this.futures = new Map();

    /** @type {function[]} */
    this.scheduledTasks = [];

    this.running = false;
    this.server = null;
    this.tickTimer = null;
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      resolvedFutures: 0,
      rejectedFutures: 0,
      startTime: null
    };

    // Callbacks for lifecycle hooks
    this._onFutureResolved = config.onFutureResolved || null;
    this._onFutureRejected = config.onFutureRejected || null;
    this._onConnection = config.onConnection || null;
  }

  /**
   * Start the event loop.
   * Creates the HTTP server and begins accepting connections.
   *
   * @returns {Promise<void>}
   */
  async start() {
    const http = await import('node:http');

    this.running = true;
    this.stats.startTime = Date.now();

    this.server = http.createServer((req, res) => {
      this._handleConnection(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[MINNOW] Event loop running on ${this.config.host}:${this.config.port}`);
        console.log(`[MINNOW] Max connections: ${this.config.maxConnections}`);

        // Start the tick loop — processes settled Futures and scheduled tasks
        this.tickTimer = setInterval(() => this._tick(), this.config.tickIntervalMs);

        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the event loop.
   * Waits for all pending Futures to settle (with timeout).
   */
  async stop() {
    this.running = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Give pending Futures a chance to settle
    const timeout = Date.now() + 5000;
    while (this.futures.size > 0 && Date.now() < timeout) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log(`[MINNOW] Event loop stopped. Stats: ${JSON.stringify(this.stats)}`);
          resolve();
        });
      });
    }
  }

  /**
   * Handle an incoming connection.
   * Builds scope, receive, send — fires app() — tracks the returned Future.
   *
   * The Future is NOT awaited here. It's tracked separately.
   *
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  _handleConnection(req, res) {
    if (this.futures.size >= this.config.maxConnections) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('Service Unavailable — connection limit reached');
      return;
    }

    const connectionId = nextConnectionId();

    // Build the 3 arguments
    const scope   = buildHttpScope(req, connectionId);
    const receive = buildHttpReceive(req);
    const send    = buildHttpSend(res);

    // Fire app() — get the Future back
    // DO NOT AWAIT — the event loop manages it separately
    const future = this.app(scope, receive, send);

    // Track the Future
    const managed = {
      connectionId,
      future,
      scopeType: scope.type,
      startTime: Date.now(),
      status: 'pending',
      result: null,
      error: null
    };

    this.futures.set(connectionId, managed);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    if (this._onConnection) {
      this._onConnection(connectionId, scope);
    }

    // When the Future settles, update status (but don't block the loop)
    future
      .then((result) => {
        managed.status = 'resolved';
        managed.result = result;
      })
      .catch((error) => {
        managed.status = 'rejected';
        managed.error = error;
        // If response hasn't been sent, send 500
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(`Internal Server Error: ${error.message}`);
        }
      });
  }

  /**
   * The tick. Runs periodically to:
   * 1. Clean up settled Futures
   * 2. Run scheduled tasks
   * 3. Check for timed-out Futures
   */
  _tick() {
    if (!this.running) return;

    const now = Date.now();

    // ─── Process settled Futures ────────────────────────
    for (const [id, managed] of this.futures) {
      if (managed.status === 'resolved') {
        this.stats.resolvedFutures++;
        this.stats.activeConnections--;
        if (this._onFutureResolved) {
          this._onFutureResolved(id, managed);
        }
        this.futures.delete(id);
      } else if (managed.status === 'rejected') {
        this.stats.rejectedFutures++;
        this.stats.activeConnections--;
        if (this._onFutureRejected) {
          this._onFutureRejected(id, managed);
        }
        this.futures.delete(id);
      } else if (now - managed.startTime > this.config.futureTimeoutMs) {
        // Timeout — force reject
        managed.status = 'rejected';
        managed.error = new Error('Future timed out');
        // Don't delete yet — let the next tick clean it up
      }
    }

    // ─── Run scheduled tasks ────────────────────────────
    const tasks = this.scheduledTasks.splice(0);
    for (const task of tasks) {
      try {
        task();
      } catch (e) {
        console.error(`[MINNOW] Scheduled task error:`, e);
      }
    }
  }

  /**
   * Schedule a task to run on the next tick.
   *
   * @param {function} fn
   */
  schedule(fn) {
    this.scheduledTasks.push(fn);
  }

  /**
   * Get current loop stats.
   */
  getStats() {
    return {
      ...this.stats,
      pendingFutures: this.futures.size,
      uptimeMs: Date.now() - (this.stats.startTime || Date.now()),
      scheduledTasks: this.scheduledTasks.length
    };
  }

  /**
   * Get all managed Futures (for the Connection Operator to inspect).
   *
   * @returns {Map<string, ManagedFuture>}
   */
  getManagedFutures() {
    return this.futures;
  }
}

// Minnow OS Runtime — Connection Operator
// runtime/connection-op.js
//
// Manages connection registry + state machine.
// Tracks: DISCONNECTED → CONNECTED → ACTIVE → QUIET → SUSPENDED → RESUME
// The Op notices when connections go quiet and triggers phase alignment.

import { FragmentQueue } from './reflection-loop.js';

/**
 * Connection states.
 */
export const STATE = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTED:    'CONNECTED',
  ACTIVE:       'ACTIVE',
  QUIET:        'QUIET',
  SUSPENDED:    'SUSPENDED',
  RESUME:       'RESUME'
};

/**
 * @typedef {Object} Connection
 * @property {string}        id
 * @property {string}        state
 * @property {Object}        scope
 * @property {number}        connectedAt
 * @property {number}        lastEventAt
 * @property {number}        eventCount
 * @property {FragmentQueue} fragmentQueue
 * @property {Object|null}   snapshot       - Phase snapshot for suspension
 */

/**
 * Connection Operator.
 * Registry + state machine for all connections.
 * Detects quiet/suspended states and manages lifecycle.
 */
export class ConnectionOp {
  /**
   * @param {Object} [config]
   * @param {number} [config.quietThresholdMs=60000]     - 60s to QUIET
   * @param {number} [config.suspendThresholdMs=300000]  - 5min to SUSPENDED
   * @param {number} [config.heartbeatIntervalMs=15000]  - 15s heartbeat
   * @param {number} [config.tickIntervalMs=5000]        - 5s state check
   */
  constructor(config = {}) {
    this.config = {
      quietThresholdMs:    config.quietThresholdMs || 60000,
      suspendThresholdMs:  config.suspendThresholdMs || 300000,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 15000,
      tickIntervalMs:      config.tickIntervalMs || 5000,
      ...config
    };

    /** @type {Map<string, Connection>} */
    this.connections = new Map();

    this.tickTimer = null;

    // Lifecycle hooks
    this._onStateChange = config.onStateChange || null;
    this._onSuspend = config.onSuspend || null;
    this._onResume = config.onResume || null;
  }

  /**
   * Start the connection operator tick loop.
   */
  start() {
    this.tickTimer = setInterval(() => this._tick(), this.config.tickIntervalMs);
  }

  /**
   * Stop the operator.
   */
  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Register a new connection.
   *
   * @param {string} id
   * @param {Object} scope
   * @returns {Connection}
   */
  connect(id, scope) {
    const conn = {
      id,
      state: STATE.CONNECTED,
      scope,
      connectedAt: Date.now(),
      lastEventAt: Date.now(),
      eventCount: 0,
      fragmentQueue: new FragmentQueue(id),
      snapshot: null
    };

    this.connections.set(id, conn);
    this._transition(conn, STATE.CONNECTED);
    return conn;
  }

  /**
   * Record an event on a connection.
   * Transitions CONNECTED→ACTIVE, QUIET→ACTIVE, RESUME→ACTIVE.
   *
   * @param {string} id
   */
  recordEvent(id) {
    const conn = this.connections.get(id);
    if (!conn) return;

    conn.lastEventAt = Date.now();
    conn.eventCount++;

    // Wake up from quiet/suspended/resume states
    if (conn.state === STATE.CONNECTED ||
        conn.state === STATE.QUIET ||
        conn.state === STATE.RESUME) {
      this._transition(conn, STATE.ACTIVE);
    }
  }

  /**
   * Disconnect a connection.
   *
   * @param {string} id
   */
  disconnect(id) {
    const conn = this.connections.get(id);
    if (!conn) return;

    this._transition(conn, STATE.DISCONNECTED);
    this.connections.delete(id);
  }

  /**
   * Get a connection.
   *
   * @param {string} id
   * @returns {Connection|undefined}
   */
  get(id) {
    return this.connections.get(id);
  }

  /**
   * Get connections by state.
   *
   * @param {string} state
   * @returns {Connection[]}
   */
  byState(state) {
    const result = [];
    for (const conn of this.connections.values()) {
      if (conn.state === state) result.push(conn);
    }
    return result;
  }

  /**
   * Get stats.
   */
  getStats() {
    const stats = { total: this.connections.size };
    for (const s of Object.values(STATE)) {
      stats[s] = 0;
    }
    for (const conn of this.connections.values()) {
      stats[conn.state]++;
    }
    return stats;
  }

  /**
   * Suspend a connection — store phase snapshot, release resources.
   *
   * @param {Connection} conn
   */
  _suspend(conn) {
    // Store phase snapshot
    conn.snapshot = conn.fragmentQueue.getSnapshot();
    this._transition(conn, STATE.SUSPENDED);

    if (this._onSuspend) {
      this._onSuspend(conn.id, conn.snapshot);
    }
  }

  /**
   * Begin resume — load snapshot, prepare for phase alignment.
   *
   * @param {string} id
   * @returns {Object|null} snapshot
   */
  beginResume(id) {
    const conn = this.connections.get(id);
    if (!conn || conn.state !== STATE.SUSPENDED) return null;

    this._transition(conn, STATE.RESUME);

    if (this._onResume) {
      this._onResume(id, conn.snapshot);
    }

    return conn.snapshot;
  }

  /**
   * Transition a connection to a new state.
   *
   * @param {Connection} conn
   * @param {string} newState
   */
  _transition(conn, newState) {
    const oldState = conn.state;
    conn.state = newState;

    if (this._onStateChange) {
      this._onStateChange(conn.id, oldState, newState);
    }
  }

  /**
   * Tick — check all connections for quiet/suspend transitions.
   * Runs periodically, never blocks.
   */
  _tick() {
    const now = Date.now();

    for (const conn of this.connections.values()) {
      const idle = now - conn.lastEventAt;

      // ACTIVE → QUIET
      if (conn.state === STATE.ACTIVE && idle > this.config.quietThresholdMs) {
        this._transition(conn, STATE.QUIET);
      }

      // QUIET → SUSPENDED
      if (conn.state === STATE.QUIET && idle > this.config.suspendThresholdMs) {
        this._suspend(conn);
      }
    }
  }
}

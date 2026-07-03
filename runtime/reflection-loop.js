// Minnow OS Runtime — Reflection Loop
// runtime/reflection-loop.js
//
// Sequential fragment processor. One at a time.
// Every event becomes a Fragment. Every Fragment must survive resistance.

/**
 * @typedef {Object} Fragment
 * @property {string}  id        - Unique fragment ID
 * @property {string}  source    - Origin node/client ID
 * @property {string}  event     - Event type
 * @property {*}       data      - Event payload
 * @property {number}  version   - Expected version sequence
 * @property {number}  timestamp - When it arrived
 * @property {string}  phase     - Phase signature at time of creation
 */

/**
 * @typedef {Object} ReflectionResult
 * @property {boolean}  accepted   - Did it pass?
 * @property {number}   coherence  - Final coherence score (0.0–1.0)
 * @property {string}   action     - 'COMMIT' | 'REPHASE' | 'REJECT'
 * @property {Fragment} fragment   - The original fragment
 * @property {string[]} logs       - Processing log entries
 */

let _fragmentCounter = 0;

/**
 * Wrap a raw event into a Fragment.
 *
 * @param {string} source  - Who sent it
 * @param {string} event   - Event type
 * @param {*}      data    - Payload
 * @param {number} version - Expected version
 * @returns {Fragment}
 */
export function createFragment(source, event, data, version) {
  return {
    id: `frag-${++_fragmentCounter}-${Date.now().toString(36)}`,
    source,
    event,
    data,
    version,
    timestamp: Date.now(),
    phase: computePhaseSignature(source, version)
  };
}

/**
 * Compute a simple phase signature.
 * In production this would be a cryptographic hash.
 *
 * @param {string} source
 * @param {number} version
 * @returns {string}
 */
function computePhaseSignature(source, version) {
  // Simple hash: source + version + salt
  const raw = `${source}:${version}:minnow`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `phase-${Math.abs(hash).toString(16)}`;
}

/**
 * The Reflection Loop.
 * Processes ONE fragment at a time. Sequential. No parallel commits.
 *
 *   Fragment → Reflect → Compare → Rephase → Validate → COMMIT/REJECT
 *
 * @param {Fragment}       fragment    - The incoming fragment
 * @param {Object}         localState  - Current known-good state for this connection
 * @param {ReflectionConfig} [config]  - Thresholds and weights
 * @returns {ReflectionResult}
 */
export function reflect(fragment, localState, config = DEFAULT_CONFIG) {
  const logs = [];
  logs.push(`[REFLECT] Fragment ${fragment.id} from ${fragment.source}`);

  // ─── Step 1: Temporal Check ─────────────────────────────
  const temporalScore = scoreTemporality(fragment, localState);
  logs.push(`  Temporal:  ${temporalScore.toFixed(3)}`);

  // ─── Step 2: Phase Check ────────────────────────────────
  const phaseScore = scorePhase(fragment, localState);
  logs.push(`  Phase:     ${phaseScore.toFixed(3)}`);

  // ─── Step 3: Structure Check ────────────────────────────
  const structureScore = scoreStructure(fragment, localState);
  logs.push(`  Structure: ${structureScore.toFixed(3)}`);

  // ─── Step 4: History Check ──────────────────────────────
  const historyScore = scoreHistory(fragment, localState);
  logs.push(`  History:   ${historyScore.toFixed(3)}`);

  // ─── Step 5: Weighted Coherence ─────────────────────────
  const coherence = (
    temporalScore  * config.weights.temporal +
    phaseScore     * config.weights.phase +
    structureScore * config.weights.structure +
    historyScore   * config.weights.history
  );
  logs.push(`  Coherence: ${coherence.toFixed(3)} (threshold: ${config.threshold})`);

  // ─── Step 6: Decide ─────────────────────────────────────
  let action;
  if (coherence >= config.threshold) {
    action = 'COMMIT';
    logs.push(`  ✅ COMMIT — coherence passed`);
  } else if (coherence >= config.rephaseThreshold) {
    action = 'REPHASE';
    logs.push(`  ⚠️ REPHASE — gap detected, requesting missing events`);
  } else {
    action = 'REJECT';
    logs.push(`  ❌ REJECT — coherence too low`);
  }

  return {
    accepted: action === 'COMMIT',
    coherence,
    action,
    fragment,
    logs
  };
}

// ─── Scoring Functions ────────────────────────────────────────

/**
 * Temporal: Is the timestamp in expected order?
 */
function scoreTemporality(fragment, state) {
  if (!state.lastTimestamp) return 1.0;
  const delta = fragment.timestamp - state.lastTimestamp;
  if (delta < 0) return 0.0;        // Time travel — reject
  if (delta < 50) return 0.8;       // Suspiciously fast
  if (delta > 3600000) return 0.7;  // Over an hour gap — mild concern
  return 1.0;
}

/**
 * Phase: Does the version match expected next version?
 */
function scorePhase(fragment, state) {
  if (!state.expectedVersion) return 1.0;
  const gap = fragment.version - state.expectedVersion;
  if (gap === 0) return 1.0;   // Exact match
  if (gap === 1) return 0.95;  // Off by one — acceptable
  if (gap < 0) return 0.2;    // Replay / duplicate
  if (gap <= 3) return 0.7;   // Small gap — rephase candidate
  return 0.3;                  // Large gap — likely corruption
}

/**
 * Structure: Does the data shape match expectations?
 */
function scoreStructure(fragment, state) {
  if (!fragment.data) return 0.5;          // No data — suspicious
  if (typeof fragment.data !== 'object' && typeof fragment.data !== 'string') return 0.6;
  if (!fragment.event) return 0.3;         // No event type — bad
  return 1.0;
}

/**
 * History: Is this source node trustworthy?
 */
function scoreHistory(fragment, state) {
  if (!state.nodeHistory) return 0.8;  // Unknown node — cautious trust
  const history = state.nodeHistory[fragment.source];
  if (!history) return 0.8;
  const ratio = history.accepted / (history.total || 1);
  return Math.max(0.1, ratio);
}

// ─── Configuration ────────────────────────────────────────────

/**
 * @typedef {Object} ReflectionConfig
 * @property {number} threshold        - Minimum coherence for COMMIT
 * @property {number} rephaseThreshold - Minimum coherence for REPHASE (below = REJECT)
 * @property {Object} weights          - Scoring weights (must sum to 1.0)
 */

export const DEFAULT_CONFIG = {
  threshold: 0.90,
  rephaseThreshold: 0.60,
  weights: {
    temporal:  0.25,
    phase:     0.30,
    structure: 0.25,
    history:   0.20
  }
};

// ─── Connection Fragment Queue ────────────────────────────────

/**
 * Per-connection sequential fragment queue.
 * Processes one fragment at a time. No parallel commits.
 */
export class FragmentQueue {
  constructor(connectionId) {
    this.connectionId = connectionId;
    this.queue = [];
    this.processing = false;
    this.state = {
      lastTimestamp: null,
      expectedVersion: 0,
      nodeHistory: {}
    };
    this.results = [];
  }

  /**
   * Enqueue a fragment for sequential processing.
   *
   * @param {Fragment} fragment
   * @returns {Promise<ReflectionResult>}
   */
  async enqueue(fragment) {
    return new Promise((resolve) => {
      this.queue.push({ fragment, resolve });
      this._processNext();
    });
  }

  /**
   * Process the next fragment in the queue. One at a time.
   */
  async _processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const { fragment, resolve } = this.queue.shift();
    const result = reflect(fragment, this.state);

    // Update state if committed
    if (result.accepted) {
      this.state.lastTimestamp = fragment.timestamp;
      this.state.expectedVersion = fragment.version + 1;

      // Update node history
      if (!this.state.nodeHistory[fragment.source]) {
        this.state.nodeHistory[fragment.source] = { total: 0, accepted: 0 };
      }
      this.state.nodeHistory[fragment.source].total++;
      this.state.nodeHistory[fragment.source].accepted++;
    } else {
      // Track rejection
      if (!this.state.nodeHistory[fragment.source]) {
        this.state.nodeHistory[fragment.source] = { total: 0, accepted: 0 };
      }
      this.state.nodeHistory[fragment.source].total++;
    }

    this.results.push(result);
    this.processing = false;
    resolve(result);

    // Process next in queue
    this._processNext();
  }

  /**
   * Get snapshot for suspension.
   */
  getSnapshot() {
    return {
      connectionId: this.connectionId,
      state: { ...this.state },
      pendingCount: this.queue.length,
      totalProcessed: this.results.length,
      timestamp: Date.now()
    };
  }
}

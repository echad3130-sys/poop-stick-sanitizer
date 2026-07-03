// Minnow OS Runtime — MAST Coherence Layer
// runtime/mast.js
//
// MAST = the commit gate.
// Sits above everything. Runtime-agnostic.
// Only knows: Temporal, Phase, Structure, History.
// Doesn't care about epoll, kqueue, IOCP, or which loop runs underneath.
//
// MAST Record:
//   { node, phase, hash, coherence, timestamp, state }
//
// The mast doesn't move the ship.
// The mast keeps everything oriented.

import { reflect, DEFAULT_CONFIG } from './reflection-loop.js';

/**
 * @typedef {Object} MastRecord
 * @property {string} node        - Node/connection ID
 * @property {number} phase       - Current phase/version
 * @property {string} hash        - State hash
 * @property {number} coherence   - Last coherence score
 * @property {number} timestamp   - Last update time
 * @property {string} state       - 'active' | 'suspended' | 'resuming'
 */

/**
 * MAST — Coherence ledger and commit gate.
 */
export class Mast {
  /**
   * @param {Object} [config]
   * @param {number} [config.commitThreshold=0.90]
   * @param {number} [config.rephaseThreshold=0.60]
   * @param {number} [config.maxLedgerSize=100000]
   */
  constructor(config = {}) {
    this.config = {
      commitThreshold: config.commitThreshold || 0.90,
      rephaseThreshold: config.rephaseThreshold || 0.60,
      maxLedgerSize: config.maxLedgerSize || 100000,
      ...config
    };

    /** @type {Map<string, MastRecord>} */
    this.ledger = new Map();

    /** @type {Array<Object>} */
    this.commitLog = [];

    this.stats = {
      commits: 0,
      rephases: 0,
      rejections: 0,
      totalFragments: 0
    };
  }

  /**
   * Register a node in the ledger.
   *
   * @param {string} nodeId
   * @param {number} [initialPhase=0]
   * @returns {MastRecord}
   */
  registerNode(nodeId, initialPhase = 0) {
    const record = {
      node: nodeId,
      phase: initialPhase,
      hash: this._computeHash(nodeId, initialPhase),
      coherence: 1.0,
      timestamp: Date.now(),
      state: 'active'
    };
    this.ledger.set(nodeId, record);
    return record;
  }

  /**
   * Process a fragment through the MAST commit gate.
   * This is the final decision point.
   *
   * @param {Object} fragment   - From reflection-loop.js
   * @param {Object} localState - Connection's local state
   * @returns {{ committed: boolean, record: MastRecord, action: string, coherence: number }}
   */
  processFragment(fragment, localState) {
    this.stats.totalFragments++;

    // Run through Reflection Loop
    const result = reflect(fragment, localState, {
      ...DEFAULT_CONFIG,
      threshold: this.config.commitThreshold,
      rephaseThreshold: this.config.rephaseThreshold
    });

    const nodeId = fragment.source;

    // Get or create ledger record
    let record = this.ledger.get(nodeId);
    if (!record) {
      record = this.registerNode(nodeId, fragment.version - 1);
    }

    if (result.action === 'COMMIT') {
      // Update ledger
      record.phase = fragment.version;
      record.hash = this._computeHash(nodeId, fragment.version);
      record.coherence = result.coherence;
      record.timestamp = Date.now();
      record.state = 'active';

      // Log commit
      this.commitLog.push({
        type: 'COMMIT',
        node: nodeId,
        fragment: fragment.id,
        phase: fragment.version,
        coherence: result.coherence,
        timestamp: Date.now()
      });

      this.stats.commits++;

      return {
        committed: true,
        record: { ...record },
        action: 'COMMIT',
        coherence: result.coherence
      };
    }

    if (result.action === 'REPHASE') {
      // Gap detected — record needs replay
      record.state = 'resuming';
      record.coherence = result.coherence;

      this.stats.rephases++;

      return {
        committed: false,
        record: { ...record },
        action: 'REPHASE',
        coherence: result.coherence,
        expectedPhase: localState.expectedVersion,
        actualPhase: fragment.version,
        gap: fragment.version - (localState.expectedVersion || 0)
      };
    }

    // REJECT
    this.stats.rejections++;

    return {
      committed: false,
      record: { ...record },
      action: 'REJECT',
      coherence: result.coherence
    };
  }

  /**
   * Suspend a node — preserve phase signature.
   *
   * @param {string} nodeId
   * @returns {MastRecord|null}
   */
  suspendNode(nodeId) {
    const record = this.ledger.get(nodeId);
    if (!record) return null;

    record.state = 'suspended';
    record.timestamp = Date.now();

    return { ...record };
  }

  /**
   * Begin resume — check phase alignment.
   *
   * @param {string} nodeId
   * @param {number} currentMeshPhase - Current phase of the mesh
   * @returns {{ aligned: boolean, gap: number, record: MastRecord }}
   */
  beginResume(nodeId, currentMeshPhase) {
    const record = this.ledger.get(nodeId);
    if (!record) {
      return {
        aligned: false,
        gap: currentMeshPhase,
        record: this.registerNode(nodeId, 0)
      };
    }

    const gap = currentMeshPhase - record.phase;
    record.state = 'resuming';

    return {
      aligned: gap === 0,
      gap,
      record: { ...record },
      replayFrom: record.phase + 1,
      replayTo: currentMeshPhase
    };
  }

  /**
   * Complete resume after replay.
   *
   * @param {string} nodeId
   * @param {number} newPhase
   * @param {number} coherence
   */
  completeResume(nodeId, newPhase, coherence) {
    const record = this.ledger.get(nodeId);
    if (!record) return;

    record.phase = newPhase;
    record.hash = this._computeHash(nodeId, newPhase);
    record.coherence = coherence;
    record.state = 'active';
    record.timestamp = Date.now();
  }

  /**
   * Get a node's record.
   *
   * @param {string} nodeId
   * @returns {MastRecord|undefined}
   */
  getRecord(nodeId) {
    return this.ledger.get(nodeId);
  }

  /**
   * Get all records.
   * @returns {MastRecord[]}
   */
  getAllRecords() {
    return [...this.ledger.values()];
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      ...this.stats,
      ledgerSize: this.ledger.size,
      commitLogSize: this.commitLog.length,
      activeNodes: [...this.ledger.values()].filter(r => r.state === 'active').length,
      suspendedNodes: [...this.ledger.values()].filter(r => r.state === 'suspended').length
    };
  }

  /**
   * Compute a simple state hash.
   * In production: use SHA-256 or similar.
   *
   * @param {string} nodeId
   * @param {number} phase
   * @returns {string}
   */
  _computeHash(nodeId, phase) {
    const raw = `${nodeId}:${phase}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

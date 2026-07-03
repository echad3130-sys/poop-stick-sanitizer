// Minnow OS Runtime — Token Velocity Matrix (TVM)
// runtime/tvm.js
//
// Observability layer for transaction/event throughput.
// Measures WHERE delays occur, doesn't claim to eliminate them.
//
// Role: Measure → Analyze → Visualize → Optimize
//
// Tracks per node:
//   TPS (transactions per second)
//   Latency (avg, p50, p95, p99)
//   Queue depth
//   Commit rate
//   Phase alignment
//   MAST coherence
//
// Velocity Score = Throughput × Coherence ÷ Latency

// ─── Sliding Window for Metrics ───────────────────────────────

class SlidingWindow {
  /**
   * @param {number} windowMs - Window size in ms (default 10s)
   */
  constructor(windowMs = 10000) {
    this.windowMs = windowMs;
    this.entries = [];
  }

  push(value) {
    const now = Date.now();
    this.entries.push({ time: now, value });
    this._prune(now);
  }

  _prune(now) {
    const cutoff = now - this.windowMs;
    while (this.entries.length > 0 && this.entries[0].time < cutoff) {
      this.entries.shift();
    }
  }

  values() {
    this._prune(Date.now());
    return this.entries.map(e => e.value);
  }

  count() {
    this._prune(Date.now());
    return this.entries.length;
  }

  rate() {
    this._prune(Date.now());
    return this.entries.length / (this.windowMs / 1000);
  }

  avg() {
    const vals = this.values();
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }

  percentile(p) {
    const vals = this.values().sort((a, b) => a - b);
    if (!vals.length) return 0;
    const idx = Math.ceil(vals.length * p / 100) - 1;
    return vals[Math.max(0, idx)];
  }
}

// ─── Node Metrics ─────────────────────────────────────────────

/**
 * Per-node metrics collector.
 */
class NodeMetrics {
  /**
   * @param {string} nodeId
   * @param {number} windowMs
   */
  constructor(nodeId, windowMs = 10000) {
    this.nodeId = nodeId;
    this.latencies = new SlidingWindow(windowMs);
    this.transactions = new SlidingWindow(windowMs);
    this.commits = new SlidingWindow(windowMs);
    this.errors = new SlidingWindow(windowMs);
    this.queueDepth = 0;
    this.phaseAlignment = 1.0;
    this.mastCoherence = 1.0;
    this.lastUpdate = Date.now();
  }

  /**
   * Record a transaction.
   * @param {number} latencyMs
   * @param {boolean} committed
   */
  recordTx(latencyMs, committed = true) {
    this.transactions.push(latencyMs);
    this.latencies.push(latencyMs);
    if (committed) {
      this.commits.push(1);
    } else {
      this.errors.push(1);
    }
    this.lastUpdate = Date.now();
  }

  /**
   * Get current metrics snapshot.
   */
  snapshot() {
    const tps = this.transactions.rate();
    const avgLatency = this.latencies.avg();
    const commitRate = this.commits.count() /
      (this.transactions.count() || 1);

    return {
      node: this.nodeId,
      tps: +tps.toFixed(1),
      avg_latency_ms: +avgLatency.toFixed(1),
      p50_latency_ms: +this.latencies.percentile(50).toFixed(1),
      p95_latency_ms: +this.latencies.percentile(95).toFixed(1),
      p99_latency_ms: +this.latencies.percentile(99).toFixed(1),
      queue_depth: this.queueDepth,
      commit_rate: +(commitRate * 100).toFixed(1),
      phase_alignment: this.phaseAlignment,
      mast_coherence: this.mastCoherence,
      velocity_score: this._velocityScore(tps, avgLatency),
      health: this._health(tps, avgLatency, commitRate),
      last_update: this.lastUpdate
    };
  }

  /**
   * Velocity Score = Throughput × Coherence ÷ Latency
   */
  _velocityScore(tps, avgLatency) {
    if (avgLatency === 0) return 0;
    return +((tps * this.mastCoherence) / (avgLatency / 1000)).toFixed(2);
  }

  /**
   * Health classification.
   */
  _health(tps, avgLatency, commitRate) {
    if (commitRate < 0.90 || this.mastCoherence < 0.80) return '🔴';
    if (avgLatency > 1000 || this.queueDepth > 50 || this.mastCoherence < 0.90) return '🟡';
    return '🟢';
  }
}

// ─── Token Velocity Matrix ────────────────────────────────────

/**
 * TVM — observability layer for transaction throughput.
 *
 * Usage:
 *   const tvm = new TokenVelocityMatrix();
 *   tvm.registerNode('SUI-01');
 *   tvm.registerNode('TRX-01');
 *   tvm.recordTx('SUI-01', 320, true);
 *   console.log(tvm.matrix());
 */
export class TokenVelocityMatrix {
  /**
   * @param {Object} [config]
   * @param {number} [config.windowMs=10000]
   */
  constructor(config = {}) {
    this.config = {
      windowMs: config.windowMs || 10000,
      ...config
    };

    /** @type {Map<string, NodeMetrics>} */
    this.nodes = new Map();
  }

  /**
   * Register a node.
   * @param {string} nodeId
   */
  registerNode(nodeId) {
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, new NodeMetrics(nodeId, this.config.windowMs));
    }
  }

  /**
   * Record a transaction on a node.
   * @param {string} nodeId
   * @param {number} latencyMs
   * @param {boolean} [committed=true]
   */
  recordTx(nodeId, latencyMs, committed = true) {
    let node = this.nodes.get(nodeId);
    if (!node) {
      this.registerNode(nodeId);
      node = this.nodes.get(nodeId);
    }
    node.recordTx(latencyMs, committed);
  }

  /**
   * Update queue depth for a node.
   */
  setQueueDepth(nodeId, depth) {
    const node = this.nodes.get(nodeId);
    if (node) node.queueDepth = depth;
  }

  /**
   * Update MAST scores for a node.
   */
  setCoherence(nodeId, phase, coherence) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.phaseAlignment = phase;
      node.mastCoherence = coherence;
    }
  }

  /**
   * Get the full velocity matrix.
   * @returns {Object[]}
   */
  matrix() {
    return [...this.nodes.values()].map(n => n.snapshot());
  }

  /**
   * Get delay breakdown — WHERE latency occurs.
   *
   * @param {string} nodeId
   * @param {Object} breakdown - { network, validator, consensus, storage, app }
   */
  recordDelayBreakdown(nodeId, breakdown) {
    const node = this.nodes.get(nodeId);
    if (node) node._delayBreakdown = breakdown;
  }

  /**
   * Get delay analysis for a node.
   */
  delayAnalysis(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || !node._delayBreakdown) return null;

    const bd = node._delayBreakdown;
    const total = Object.values(bd).reduce((s, v) => s + v, 0);

    return {
      node: nodeId,
      total_ms: total,
      breakdown: Object.fromEntries(
        Object.entries(bd).map(([k, v]) => [k, {
          ms: v,
          pct: +((v / total) * 100).toFixed(1)
        }])
      ),
      bottleneck: Object.entries(bd).sort((a, b) => b[1] - a[1])[0][0]
    };
  }

  /**
   * Display the matrix as a formatted table.
   * @returns {string}
   */
  display() {
    const rows = this.matrix();
    if (!rows.length) return '(no nodes registered)';

    const pad = (s, w) => String(s).padEnd(w);
    const padr = (s, w) => String(s).padStart(w);

    let out = '';
    out += pad('Node', 12) + padr('TPS', 8) + padr('Avg ms', 8) + padr('p95 ms', 8);
    out += padr('Queue', 7) + padr('Commit%', 9) + padr('Phase', 7) + padr('MAST', 7);
    out += padr('Velocity', 10) + '  Health\n';
    out += '─'.repeat(84) + '\n';

    for (const r of rows) {
      out += pad(r.node, 12);
      out += padr(r.tps, 8);
      out += padr(r.avg_latency_ms, 8);
      out += padr(r.p95_latency_ms, 8);
      out += padr(r.queue_depth, 7);
      out += padr(r.commit_rate + '%', 9);
      out += padr(r.phase_alignment, 7);
      out += padr(r.mast_coherence, 7);
      out += padr(r.velocity_score, 10);
      out += '  ' + r.health + '\n';
    }

    return out;
  }

  /**
   * Get aggregate stats across all nodes.
   */
  aggregate() {
    const rows = this.matrix();
    if (!rows.length) return null;

    const totalTps = rows.reduce((s, r) => s + r.tps, 0);
    const avgLatency = rows.reduce((s, r) => s + r.avg_latency_ms, 0) / rows.length;
    const avgCoherence = rows.reduce((s, r) => s + r.mast_coherence, 0) / rows.length;
    const avgPhase = rows.reduce((s, r) => s + r.phase_alignment, 0) / rows.length;
    const totalQueue = rows.reduce((s, r) => s + r.queue_depth, 0);

    const healthCounts = { '🟢': 0, '🟡': 0, '🔴': 0 };
    for (const r of rows) healthCounts[r.health]++;

    return {
      nodes: rows.length,
      total_tps: +totalTps.toFixed(1),
      avg_latency_ms: +avgLatency.toFixed(1),
      total_queue_depth: totalQueue,
      avg_coherence: +avgCoherence.toFixed(3),
      avg_phase: +avgPhase.toFixed(3),
      velocity_score: +((totalTps * avgCoherence) / (avgLatency / 1000)).toFixed(2),
      health: healthCounts
    };
  }
}

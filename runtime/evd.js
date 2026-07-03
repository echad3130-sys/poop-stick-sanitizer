// Minnow OS Runtime — Emoji Vectorized Data (EVD)
// runtime/evd.js
//
// Emoji-based vectorized data principle:
//   Each emoji = a semantic dimension (4 bytes, human-readable)
//   Vectorized ops = batch process columns, not row-by-row
//   Faster than JSON for wire + storage + comprehension
//
// Traditional:  { "status": "critical", "trend": "down", "load": "high" }
// EVD:          🔴📉🔥
//
// 3 dimensions, 12 bytes, instantly readable.

// ─── Semantic Emoji Codebooks ─────────────────────────────────

/**
 * Status codebook — operational state
 */
export const STATUS = {
  // Health
  '💚': 'healthy',
  '💛': 'degraded',
  '🔴': 'critical',
  '⚫': 'offline',
  '🔵': 'unknown',
  '⚪': 'idle',

  // Action required
  '✅': 'pass',
  '⚠️': 'warning',
  '❌': 'fail',
  '🔄': 'retry',
  '⏸️': 'paused',
  '▶️': 'running',

  // Reverse lookup
  healthy:  '💚',
  degraded: '💛',
  critical: '🔴',
  offline:  '⚫',
  unknown:  '🔵',
  idle:     '⚪',
  pass:     '✅',
  warning:  '⚠️',
  fail:     '❌',
  retry:    '🔄',
  paused:   '⏸️',
  running:  '▶️'
};

/**
 * Trend codebook — direction of change
 */
export const TREND = {
  '📈': 'up',
  '📉': 'down',
  '➡️': 'flat',
  '🚀': 'spike',
  '🕳️': 'crash',
  '〰️': 'oscillating',

  up:          '📈',
  down:        '📉',
  flat:        '➡️',
  spike:       '🚀',
  crash:       '🕳️',
  oscillating: '〰️'
};

/**
 * Load codebook — resource pressure
 */
export const LOAD = {
  '🧊': 'cold',
  '🌤️': 'light',
  '☀️': 'moderate',
  '🔥': 'high',
  '💥': 'overload',

  cold:     '🧊',
  light:    '🌤️',
  moderate: '☀️',
  high:     '🔥',
  overload: '💥'
};

/**
 * Phase codebook — MAST coherence
 */
export const PHASE = {
  '🎯': 'aligned',
  '🌀': 'drifting',
  '💫': 'rephasing',
  '🪞': 'reflecting',
  '⚓': 'anchored',
  '🧭': 'seeking',

  aligned:    '🎯',
  drifting:   '🌀',
  rephasing:  '💫',
  reflecting: '🪞',
  anchored:   '⚓',
  seeking:    '🧭'
};

/**
 * Connection codebook — state machine
 */
export const CONNECTION = {
  '🟢': 'active',
  '🟡': 'quiet',
  '🔵': 'suspended',
  '🟣': 'resuming',
  '⚫': 'disconnected',
  '🟠': 'connecting',

  active:       '🟢',
  quiet:        '🟡',
  suspended:    '🔵',
  resuming:     '🟣',
  disconnected: '⚫',
  connecting:   '🟠'
};

// ─── EVD Vector ───────────────────────────────────────────────

/**
 * An EVD vector — a row of emoji-encoded dimensions.
 *
 * Example:
 *   vec("grafana", STATUS, TREND, LOAD, PHASE)
 *     → { id: "grafana", v: [💚, 📈, 🌤️, 🎯], raw: "💚📈🌤️🎯" }
 *
 * @param {string} id
 * @param  {...string} emojis - One emoji per dimension
 * @returns {Object}
 */
export function vec(id, ...emojis) {
  return {
    id,
    v: emojis,
    raw: emojis.join(''),
    dims: emojis.length,
    bytes: Buffer.byteLength(emojis.join(''))
  };
}

/**
 * Create a vectorized table — columns of emoji vectors.
 *
 * @param {string[]} columns  - Dimension names
 * @param {Object[]} rows     - Array of { id, ...dimensionValues }
 * @param {Object}   codebooks - Map of column → codebook
 * @returns {Object}
 */
export function vectorize(columns, rows, codebooks = {}) {
  const table = {
    columns,
    rowCount: rows.length,
    ids: [],
    vectors: [],   // raw emoji strings
    data: {},      // column-oriented storage (vectorized)
    _encoded: {}   // emoji-encoded columns
  };

  // Initialize column arrays
  for (const col of columns) {
    table.data[col] = [];
    table._encoded[col] = [];
  }

  for (const row of rows) {
    table.ids.push(row.id);
    const emojis = [];

    for (const col of columns) {
      const val = row[col];
      const book = codebooks[col];
      const emoji = book && book[val] ? book[val] : val;

      table.data[col].push(val);
      table._encoded[col].push(emoji);
      emojis.push(emoji);
    }

    table.vectors.push(emojis.join(''));
  }

  return table;
}

// ─── Vectorized Operations ────────────────────────────────────

/**
 * Filter rows where a column matches an emoji value.
 * Vectorized: scans the column array, not row-by-row.
 *
 * @param {Object} table
 * @param {string} column
 * @param {string} emoji
 * @returns {Object} filtered table
 */
export function vFilter(table, column, emoji) {
  const colIdx = table.columns.indexOf(column);
  if (colIdx === -1) throw new Error(`Unknown column: ${column}`);

  const indices = [];
  const encoded = table._encoded[column];

  // Vectorized scan — single column, no object access
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === emoji) indices.push(i);
  }

  return _subset(table, indices);
}

/**
 * Count occurrences of each emoji in a column.
 *
 * @param {Object} table
 * @param {string} column
 * @returns {Map<string, number>}
 */
export function vCount(table, column) {
  const counts = new Map();
  const encoded = table._encoded[column];

  for (let i = 0; i < encoded.length; i++) {
    const e = encoded[i];
    counts.set(e, (counts.get(e) || 0) + 1);
  }

  return counts;
}

/**
 * Group rows by emoji value in a column.
 *
 * @param {Object} table
 * @param {string} column
 * @returns {Map<string, Object>}
 */
export function vGroupBy(table, column) {
  const groups = new Map();
  const encoded = table._encoded[column];

  for (let i = 0; i < encoded.length; i++) {
    const e = encoded[i];
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(i);
  }

  const result = new Map();
  for (const [emoji, indices] of groups) {
    result.set(emoji, _subset(table, indices));
  }

  return result;
}

/**
 * Compare two EVD snapshots — produce delta vector.
 * Only emits dimensions that changed.
 *
 * @param {string[]} before - Emoji vector
 * @param {string[]} after  - Emoji vector
 * @param {string[]} columns
 * @returns {Object[]} changes
 */
export function vDiff(before, after, columns) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changes.push({
        dim: columns[i],
        was: before[i],
        now: after[i]
      });
    }
  }
  return changes;
}

// ─── Display ──────────────────────────────────────────────────

/**
 * head() — display first N rows of an EVD table.
 * Like R's head(df) but with emoji vectors.
 *
 * @param {Object} table
 * @param {number} [n=6]
 * @returns {string}
 */
export function head(table, n = 6) {
  const show = Math.min(n, table.rowCount);
  const pad = (s, w) => String(s).padEnd(w);

  // Header
  let out = pad('ID', 16) + table.columns.map(c => pad(c, 12)).join('') + '  VEC\n';
  out += '─'.repeat(16 + table.columns.length * 12 + 20) + '\n';

  // Rows
  for (let i = 0; i < show; i++) {
    out += pad(table.ids[i], 16);
    for (const col of table.columns) {
      out += pad(table._encoded[col][i], 12);
    }
    out += '  ' + table.vectors[i] + '\n';
  }

  if (table.rowCount > show) {
    out += `\n# ... ${table.rowCount - show} more rows\n`;
  }

  out += `\n# ${table.rowCount} rows × ${table.columns.length} dims`;
  out += ` (${Buffer.byteLength(table.vectors.join(''))} bytes emoji vs ~${table.rowCount * table.columns.length * 10} bytes JSON)`;

  return out;
}

/**
 * Compact wire format — one line per row, emoji only.
 * Much smaller than JSON for dashboards and SSE.
 *
 * @param {Object} table
 * @returns {string}
 */
export function toWire(table) {
  return table.ids.map((id, i) => `${id}\t${table.vectors[i]}`).join('\n');
}

/**
 * Parse wire format back to table.
 *
 * @param {string} wire
 * @param {string[]} columns
 * @param {Object} codebooks
 * @returns {Object}
 */
export function fromWire(wire, columns, codebooks = {}) {
  const rows = wire.split('\n').filter(Boolean).map(line => {
    const [id, vecStr] = line.split('\t');
    // Split emoji string into individual emojis
    const emojis = [...vecStr];
    const row = { id };
    for (let i = 0; i < columns.length && i < emojis.length; i++) {
      const book = codebooks[columns[i]];
      row[columns[i]] = book ? (book[emojis[i]] || emojis[i]) : emojis[i];
    }
    return row;
  });

  return vectorize(columns, rows, codebooks);
}

// ─── Internal Helpers ─────────────────────────────────────────

function _subset(table, indices) {
  const sub = {
    columns: table.columns,
    rowCount: indices.length,
    ids: [],
    vectors: [],
    data: {},
    _encoded: {}
  };

  for (const col of table.columns) {
    sub.data[col] = [];
    sub._encoded[col] = [];
  }

  for (const i of indices) {
    sub.ids.push(table.ids[i]);
    sub.vectors.push(table.vectors[i]);
    for (const col of table.columns) {
      sub.data[col].push(table.data[col][i]);
      sub._encoded[col].push(table._encoded[col][i]);
    }
  }

  return sub;
}

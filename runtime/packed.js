// Minnow OS Runtime — Packed Numeric Buffers
// runtime/packed.js
//
// Sort::DJB "great fit" path for JS.
// Keep data in TypedArrays — no object churn.
//
// Great fit:
//   ✅ Homogeneous numeric arrays (telemetry, sensors, timestamps)
//   ✅ Fixed-schema record IDs (uint32/uint64)
//   ✅ Time-series buckets (epoch-milli)
//   ✅ PDL / packed number arrays
//   ✅ Crypto / post-quantum code (constant-time)
//   ✅ Percentile / median calculations
//
// Bad fit:
//   ❌ Sort by arbitrary comparator ({ $a->{name} cmp $b->{name} })
//   ❌ Arrays of strings, mixed types, blessed refs
//   ❌ Schwartzian-transform workloads
//
// Philosophy: "Don't optimize the sort. Optimize getting data to the sort."

// ─── Packed Column Store ──────────────────────────────────────

/**
 * PackedColumns — column-oriented numeric storage.
 * Like PDL for JS. Data stays in TypedArrays as long as possible.
 *
 * Usage:
 *   const cols = new PackedColumns({
 *     tps:     'uint32',
 *     latency: 'uint32',
 *     score:   'float64',
 *     time:    'float64'    // epoch-milli int64 → float64
 *   });
 *
 *   cols.push({ tps: 2450, latency: 320, score: 0.95, time: Date.now() });
 *   cols.topN('tps', 5);
 */
export class PackedColumns {
  static TYPES = {
    int32:   { ArrayType: Int32Array,     bytes: 4 },
    uint32:  { ArrayType: Uint32Array,    bytes: 4 },
    float32: { ArrayType: Float32Array,   bytes: 4 },
    float64: { ArrayType: Float64Array,   bytes: 8 },
    int16:   { ArrayType: Int16Array,     bytes: 2 },
    uint16:  { ArrayType: Uint16Array,    bytes: 2 },
    uint8:   { ArrayType: Uint8Array,     bytes: 1 },
  };

  /**
   * @param {Object<string, string>} schema - { columnName: typeName }
   * @param {number} [initialCapacity=1024]
   */
  constructor(schema, initialCapacity = 1024) {
    this.schema = schema;
    this.columns = {};
    this.labels = [];        // String labels (node IDs etc)
    this.length = 0;
    this.capacity = initialCapacity;

    for (const [name, type] of Object.entries(schema)) {
      const spec = PackedColumns.TYPES[type];
      if (!spec) throw new Error(`Unknown type: ${type}`);
      this.columns[name] = {
        type,
        data: new spec.ArrayType(initialCapacity),
        spec
      };
    }
  }

  /**
   * Push a row. Only numeric fields go into typed arrays.
   * @param {Object} row
   * @param {string} [label]
   */
  push(row, label) {
    if (this.length >= this.capacity) this._grow();

    for (const [name, col] of Object.entries(this.columns)) {
      col.data[this.length] = row[name] || 0;
    }
    this.labels[this.length] = label || `row-${this.length}`;
    this.length++;
  }

  /**
   * Bulk load from AoH. Marshal once.
   * @param {Object[]} rows
   * @param {string} [labelKey='id']
   */
  load(rows, labelKey = 'id') {
    for (const row of rows) {
      this.push(row, row[labelKey]);
    }
  }

  /**
   * Get a column slice (zero-copy view when possible).
   * @param {string} name
   * @returns {TypedArray}
   */
  col(name) {
    return this.columns[name].data.subarray(0, this.length);
  }

  /**
   * Sort indices by a column — no data movement.
   * Returns ranked index array.
   *
   * @param {string} colName
   * @param {boolean} [ascending=true]
   * @returns {Uint32Array}
   */
  rankIndices(colName, ascending = true) {
    const data = this.col(colName);
    const indices = new Uint32Array(this.length);
    for (let i = 0; i < this.length; i++) indices[i] = i;

    // Bitonic sort on indices (compare via data[idx])
    bitonicSortIndices(indices, data, ascending);
    return indices;
  }

  /**
   * Top-N by column — returns labels and values.
   * The hot path: no object creation until output.
   *
   * @param {string} colName
   * @param {number} n
   * @param {boolean} [ascending=false]
   * @returns {{ labels: string[], values: TypedArray }}
   */
  topN(colName, n, ascending = false) {
    const indices = this.rankIndices(colName, ascending);
    const take = Math.min(n, this.length);
    const labels = [];
    const values = new (this.columns[colName].spec.ArrayType)(take);

    for (let i = 0; i < take; i++) {
      labels[i] = this.labels[indices[i]];
      values[i] = this.columns[colName].data[indices[i]];
    }

    return { labels, values };
  }

  /**
   * Percentile calculation — sort once, index everywhere.
   * @param {string} colName
   * @param {number} p - Percentile (0-100)
   * @returns {number}
   */
  percentile(colName, p) {
    const indices = this.rankIndices(colName, true);
    const idx = Math.ceil(this.length * p / 100) - 1;
    return this.columns[colName].data[indices[Math.max(0, idx)]];
  }

  /**
   * Summary stats for a column — computed from packed buffer.
   */
  summary(colName) {
    const data = this.col(colName);
    const n = this.length;
    let sum = 0, min = Infinity, max = -Infinity;

    for (let i = 0; i < n; i++) {
      sum += data[i];
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }

    const mean = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      variance += (data[i] - mean) ** 2;
    }
    variance /= (n - 1);

    return {
      n, min, max, mean,
      sd: Math.sqrt(variance),
      p50: this.percentile(colName, 50),
      p95: this.percentile(colName, 95),
      p99: this.percentile(colName, 99)
    };
  }

  /**
   * Materialize to AoH — only when you need Perl/JS objects.
   * "Only inflate back into structures when presentation requires it."
   *
   * @param {Uint32Array} [indices] - Optional: only materialize these rows
   * @returns {Object[]}
   */
  toAoH(indices) {
    const rows = [];
    const idxs = indices || Array.from({ length: this.length }, (_, i) => i);

    for (const i of idxs) {
      const row = { id: this.labels[i] };
      for (const [name, col] of Object.entries(this.columns)) {
        row[name] = col.data[i];
      }
      rows.push(row);
    }

    return rows;
  }

  /**
   * Display as formatted table.
   */
  display(limit = 10) {
    const colNames = Object.keys(this.schema);
    const pad = (s, w) => String(s).padEnd(w);
    const padr = (s, w) => String(s).padStart(w);

    let out = `PackedColumns: ${this.length} rows × ${colNames.length} cols (${this._bytes()} bytes)\n\n`;
    out += pad('Label', 14) + colNames.map(c => padr(c, 12)).join('') + '\n';
    out += '─'.repeat(14 + colNames.length * 12) + '\n';

    const show = Math.min(limit, this.length);
    for (let i = 0; i < show; i++) {
      out += pad(this.labels[i], 14);
      for (const name of colNames) {
        const v = this.columns[name].data[i];
        out += padr(Number.isInteger(v) ? v : v.toFixed(2), 12);
      }
      out += '\n';
    }

    if (this.length > show) {
      out += `\n... ${this.length - show} more rows\n`;
    }

    return out;
  }

  _bytes() {
    let total = 0;
    for (const col of Object.values(this.columns)) {
      total += col.spec.bytes * this.capacity;
    }
    return total;
  }

  _grow() {
    this.capacity *= 2;
    for (const [name, col] of Object.entries(this.columns)) {
      const newData = new col.spec.ArrayType(this.capacity);
      newData.set(col.data);
      col.data = newData;
    }
  }
}

// ─── Bitonic Sort on Index Array ──────────────────────────────

/**
 * Bitonic sort indices by comparing via data[idx].
 * The choreography is fixed. Data stays in place.
 *
 * @param {Uint32Array} indices
 * @param {TypedArray} data
 * @param {boolean} ascending
 */
function bitonicSortIndices(indices, data, ascending) {
  const n = indices.length;
  if (n <= 1) return;

  _bitonicSort(indices, data, 0, n, ascending);
}

function _bitonicSort(indices, data, lo, cnt, ascending) {
  if (cnt <= 1) return;
  const mid = cnt >> 1;
  _bitonicSort(indices, data, lo, mid, true);
  _bitonicSort(indices, data, lo + mid, cnt - mid, false);
  _bitonicMerge(indices, data, lo, cnt, ascending);
}

function _bitonicMerge(indices, data, lo, cnt, ascending) {
  if (cnt <= 1) return;
  const k = _gpow2(cnt);

  for (let i = lo; i < lo + cnt - k; i++) {
    // Compare-and-swap valve
    const a = data[indices[i]];
    const b = data[indices[i + k]];
    if (ascending ? a > b : a < b) {
      const tmp = indices[i];
      indices[i] = indices[i + k];
      indices[i + k] = tmp;
    }
  }

  _bitonicMerge(indices, data, lo, k, ascending);
  _bitonicMerge(indices, data, lo + k, cnt - k, ascending);
}

function _gpow2(n) {
  let k = 1;
  while (k < n) k <<= 1;
  return k >> 1;
}

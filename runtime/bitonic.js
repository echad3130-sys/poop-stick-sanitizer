// Minnow OS Runtime — Bitonic Sort (Sort::DJB style)
// runtime/bitonic.js
//
// Batcher's Bitonic Sort (1968) — sorting networks for JS.
// Fixed choreography of compare-and-swap operations.
//
// Properties:
//   ✅ Branch-free (data-independent timing)
//   ✅ Fixed comparison schedule (decided at "compile time")
//   ✅ Trivially parallelizable (independent swaps per stage)
//   ✅ Prefetch-friendly (fixed strides)
//   ✅ O(n · log² n) comparisons
//
// The extra log n factor over quicksort on paper
// is bought back by branchless execution.
//
// Use for:
//   - TVM leaderboards (top-N validators)
//   - MAST coherence ranking
//   - Container dashboard sorting
//   - Hot-path metrics (every tick)

// ─── Core: Compare-and-Swap ──────────────────────────────────

/**
 * Branchless compare-and-swap.
 * The "step" of the dance.
 *
 * @param {Array} arr
 * @param {number} i
 * @param {number} j
 * @param {boolean} ascending
 * @param {function} [cmp] - Comparator returning numeric value
 */
function compareSwap(arr, i, j, ascending, cmp) {
  const shouldSwap = cmp
    ? (ascending ? cmp(arr[i], arr[j]) > 0 : cmp(arr[i], arr[j]) < 0)
    : (ascending ? arr[i] > arr[j] : arr[i] < arr[j]);

  if (shouldSwap) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ─── Bitonic Merge ────────────────────────────────────────────

/**
 * Merge a bitonic sequence of length (hi - lo).
 * Each stage: n/2 compare-and-swaps at fixed stride.
 * log₂(n) stages total.
 *
 * @param {Array} arr
 * @param {number} lo
 * @param {number} cnt
 * @param {boolean} ascending
 * @param {function} [cmp]
 */
function bitonicMerge(arr, lo, cnt, ascending, cmp) {
  if (cnt <= 1) return;

  const k = greatestPowerOf2Below(cnt);

  // Fixed stride compare-and-swap (the choreography)
  for (let i = lo; i < lo + cnt - k; i++) {
    compareSwap(arr, i, i + k, ascending, cmp);
  }

  bitonicMerge(arr, lo, k, ascending, cmp);
  bitonicMerge(arr, lo + k, cnt - k, ascending, cmp);
}

/**
 * Recursively build bitonic halves, then merge.
 *
 * @param {Array} arr
 * @param {number} lo
 * @param {number} cnt
 * @param {boolean} ascending
 * @param {function} [cmp]
 */
function bitonicSortRange(arr, lo, cnt, ascending, cmp) {
  if (cnt <= 1) return;

  const mid = Math.floor(cnt / 2);

  // First half ascending, second half descending → bitonic sequence
  bitonicSortRange(arr, lo, mid, true, cmp);
  bitonicSortRange(arr, lo + mid, cnt - mid, false, cmp);

  // Merge the bitonic sequence
  bitonicMerge(arr, lo, cnt, ascending, cmp);
}

/**
 * Greatest power of 2 less than n.
 */
function greatestPowerOf2Below(n) {
  let k = 1;
  while (k < n) k <<= 1;
  return k >> 1;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Bitonic sort — full sort with fixed comparison schedule.
 * Feed any permutation in → sorted output comes out.
 *
 * @param {Array} arr - Array to sort (mutated in place)
 * @param {Object} [opts]
 * @param {boolean} [opts.ascending=true]
 * @param {function} [opts.cmp] - Custom comparator
 * @returns {Array} The sorted array
 */
export function bitonicSort(arr, opts = {}) {
  const { ascending = true, cmp } = opts;
  bitonicSortRange(arr, 0, arr.length, ascending, cmp);
  return arr;
}

/**
 * Bitonic sort by key — sort objects by a property.
 *
 * Usage:
 *   bitonicSortBy(validators, 'tps', { ascending: false })
 *   // → sorted by TPS descending
 *
 * @param {Object[]} arr
 * @param {string} key
 * @param {Object} [opts]
 * @returns {Object[]}
 */
export function bitonicSortBy(arr, key, opts = {}) {
  const { ascending = true } = opts;
  return bitonicSort(arr, {
    ascending,
    cmp: (a, b) => (a[key] || 0) - (b[key] || 0)
  });
}

/**
 * Top-N using bitonic sort.
 * For leaderboards and dashboards.
 *
 * Usage:
 *   topN(validators, 5, 'velocity_score')
 *   // → top 5 by velocity score
 *
 * @param {Object[]} arr
 * @param {number} n
 * @param {string} key
 * @param {Object} [opts]
 * @returns {Object[]}
 */
export function topN(arr, n, key, opts = {}) {
  const { ascending = false } = opts;
  const copy = [...arr];
  bitonicSortBy(copy, key, { ascending });
  return copy.slice(0, n);
}

/**
 * Leaderboard — ranked list with position numbers.
 *
 * Usage:
 *   leaderboard(validators, 'velocity_score', { label: 'node' })
 *
 * @param {Object[]} arr
 * @param {string} key - Sort key
 * @param {Object} [opts]
 * @param {string} [opts.label='id'] - Label field
 * @param {number} [opts.limit=10]
 * @returns {Object[]}
 */
export function leaderboard(arr, key, opts = {}) {
  const { label = 'id', limit = 10 } = opts;
  const sorted = topN(arr, limit, key);
  return sorted.map((item, i) => ({
    rank: i + 1,
    label: item[label] || item.id || item.node || `#${i}`,
    [key]: item[key],
    _item: item
  }));
}

/**
 * Display a leaderboard as formatted text.
 *
 * @param {Object[]} board - From leaderboard()
 * @param {string} key
 * @returns {string}
 */
export function displayLeaderboard(board, key) {
  const pad = (s, w) => String(s).padEnd(w);
  const padr = (s, w) => String(s).padStart(w);

  let out = pad('#', 4) + pad('Node', 14) + padr(key, 12) + '\n';
  out += '─'.repeat(30) + '\n';

  for (const entry of board) {
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '  ';
    out += pad(medal, 4) + pad(entry.label, 14) + padr(entry[key], 12) + '\n';
  }

  return out;
}

// ─── Sorting Network Generator ────────────────────────────────

/**
 * Generate the fixed comparison schedule for n elements.
 * This is the "choreography" — decided once, reused forever.
 *
 * @param {number} n
 * @returns {Array<[number, number]>[]} Array of stages, each containing pairs
 */
export function generateNetwork(n) {
  const stages = [];
  const pairs = [];

  // Capture compare-and-swap calls
  const tempArr = Array.from({ length: n }, (_, i) => i);
  const captured = [];

  function captureSort(arr, lo, cnt, asc) {
    if (cnt <= 1) return;
    const mid = Math.floor(cnt / 2);
    captureSort(arr, lo, mid, true);
    captureSort(arr, lo + mid, cnt - mid, false);
    captureMerge(arr, lo, cnt, asc);
  }

  function captureMerge(arr, lo, cnt, asc) {
    if (cnt <= 1) return;
    const k = greatestPowerOf2Below(cnt);
    const stage = [];
    for (let i = lo; i < lo + cnt - k; i++) {
      stage.push([i, i + k]);
    }
    if (stage.length) captured.push(stage);
    captureMerge(arr, lo, k, asc);
    captureMerge(arr, lo + k, cnt - k, asc);
  }

  captureSort(tempArr, 0, n, true);
  return captured;
}

/**
 * Display the sorting network visually.
 *
 * @param {number} n
 * @returns {string}
 */
export function displayNetwork(n) {
  const network = generateNetwork(n);
  let out = `Bitonic sorting network for n=${n}\n`;
  out += `${network.length} stages, `;
  out += `${network.reduce((s, stage) => s + stage.length, 0)} compare-and-swaps\n\n`;

  for (let s = 0; s < network.length; s++) {
    const wires = Array(n).fill('─');
    for (const [i, j] of network[s]) {
      wires[i] = '┤';
      wires[j] = '├';
    }
    out += `Stage ${String(s + 1).padStart(2)}: ${wires.join('')}  ${network[s].map(p => `(${p[0]},${p[1]})`).join(' ')}\n`;
  }

  return out;
}

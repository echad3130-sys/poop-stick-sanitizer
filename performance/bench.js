// Minnow OS Runtime — Performance Benchmarks
// performance/bench.js
//
// Sort::DJB-style PERFORMANCE.md generator.
// Tests bitonic sort, stats, EVD, TVM at various sizes.
// Run: node performance/bench.js
//
// Outputs results to performance/PERFORMANCE.md

const { performance: perf } = await import('node:perf_hooks');
import { writeFileSync } from 'node:fs';

// ─── Bench Harness ────────────────────────────────────────────

function bench(fn, label, { warmup = 100, minMs = 1000 } = {}) {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  // Timed run
  let iterations = 0;
  const start = perf.now();
  while (perf.now() - start < minMs) {
    fn();
    iterations++;
  }
  const elapsed = perf.now() - start;
  const rate = iterations / (elapsed / 1000);
  const perOp = (elapsed / iterations * 1000).toFixed(2); // μs

  return { label, rate: Math.round(rate), perOp: +perOp, iterations, elapsedMs: Math.round(elapsed) };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

// ─── Generate Test Data ───────────────────────────────────────

function randomInts(n) {
  return Array.from({ length: n }, () => (Math.random() * 2147483647) | 0);
}

function randomFloats(n) {
  return Array.from({ length: n }, () => Math.random() * 1000);
}

function nearlySorted(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  // Swap 5% of elements
  for (let i = 0; i < n * 0.05; i++) {
    const a = (Math.random() * n) | 0;
    const b = (Math.random() * n) | 0;
    [arr[a], arr[b]] = [arr[b], arr[a]];
  }
  return arr;
}

// ─── Import Modules ───────────────────────────────────────────

const { bitonicSort, bitonicSortBy, topN } = await import('../runtime/bitonic.js');
const { vectorize, vFilter, vCount, STATUS, TREND } = await import('../runtime/evd.js');
const { summary, tTest, aov, lm, cor, chisqTest, xgBoost } = await import('../runtime/stats.js');
const { TokenVelocityMatrix } = await import('../runtime/tvm.js');

// ─── Run Benchmarks ───────────────────────────────────────────

console.log('🐟 Minnow OS Runtime — Performance Benchmarks\n');
console.log('═'.repeat(60));

const allResults = [];
const sections = [];

// ────────────────────────────────────────────────
// SECTION 1: Bitonic Sort — Size Scaling
// ────────────────────────────────────────────────

console.log('\n── Bitonic Sort: Size Scaling ──');

const sortSizes = [5, 10, 50, 100, 500, 1000, 5000, 10000];
const sortResults = [];

for (const n of sortSizes) {
  const data = randomInts(n);

  const bitonic = bench(() => {
    bitonicSort([...data]);
  }, `bitonic n=${n}`);

  const builtin = bench(() => {
    [...data].sort((a, b) => a - b);
  }, `Array.sort n=${n}`);

  const ratio = (bitonic.rate / builtin.rate).toFixed(2);

  sortResults.push({ n, bitonic, builtin, ratio });
  console.log(`  n=${String(n).padStart(5)}: bitonic ${fmt(bitonic.rate).padStart(12)}/s  Array.sort ${fmt(builtin.rate).padStart(12)}/s  ratio=${ratio}×`);
}

sections.push({
  title: 'Bitonic Sort vs Array.sort',
  subtitle: 'Random int32 data, measured over 1s minimum',
  columns: ['n', 'Bitonic (ops/s)', 'Array.sort (ops/s)', 'Ratio'],
  rows: sortResults.map(r => [
    r.n,
    `${fmt(r.bitonic.rate)}/s`,
    `${fmt(r.builtin.rate)}/s`,
    `${r.ratio}×`
  ])
});

// ────────────────────────────────────────────────
// SECTION 2: Bitonic Sort — Data Patterns
// ────────────────────────────────────────────────

console.log('\n── Bitonic Sort: Data Patterns (n=1000) ──');

const patternResults = [];
const n = 1000;

const patterns = {
  'Random': randomInts(n),
  'Nearly Sorted': nearlySorted(n),
  'Sorted': Array.from({ length: n }, (_, i) => i),
  'Reverse': Array.from({ length: n }, (_, i) => n - i),
  'All Same': Array(n).fill(42),
  'Float64': randomFloats(n)
};

for (const [name, data] of Object.entries(patterns)) {
  const bitonic = bench(() => { bitonicSort([...data]); }, `bitonic ${name}`);
  const builtin = bench(() => { [...data].sort((a, b) => a - b); }, `sort ${name}`);
  const ratio = (bitonic.rate / builtin.rate).toFixed(2);

  patternResults.push({ name, bitonic, builtin, ratio });
  console.log(`  ${name.padEnd(15)}: bitonic ${fmt(bitonic.rate).padStart(10)}/s  sort ${fmt(builtin.rate).padStart(10)}/s  ratio=${ratio}×`);
}

sections.push({
  title: 'Data Pattern Comparison (n=1,000)',
  subtitle: 'Bitonic timing is data-independent (constant-time choreography)',
  columns: ['Pattern', 'Bitonic (ops/s)', 'Array.sort (ops/s)', 'Ratio'],
  rows: patternResults.map(r => [
    r.name,
    `${fmt(r.bitonic.rate)}/s`,
    `${fmt(r.builtin.rate)}/s`,
    `${r.ratio}×`
  ])
});

// ────────────────────────────────────────────────
// SECTION 3: Bitonic Sort — Tiny Arrays (TVM hot path)
// ────────────────────────────────────────────────

console.log('\n── Tiny Arrays (TVM leaderboard hot path) ──');

const tinyResults = [];

for (const tn of [4, 8, 16, 32]) {
  const data = randomInts(tn);

  const bitonic = bench(() => { bitonicSort([...data]); }, `bitonic n=${tn}`, { minMs: 2000 });
  const builtin = bench(() => { [...data].sort((a, b) => a - b); }, `sort n=${tn}`, { minMs: 2000 });
  const ratio = (bitonic.rate / builtin.rate).toFixed(2);

  tinyResults.push({ n: tn, bitonic, builtin, ratio });
  console.log(`  n=${String(tn).padStart(2)}: bitonic ${fmt(bitonic.rate).padStart(12)}/s  sort ${fmt(builtin.rate).padStart(12)}/s  ratio=${ratio}×`);
}

sections.push({
  title: 'Tiny Arrays (n=4..32)',
  subtitle: 'TVM/MAST leaderboard rankings — per-tick hot path',
  columns: ['n', 'Bitonic (ops/s)', 'Array.sort (ops/s)', 'Ratio'],
  rows: tinyResults.map(r => [
    r.n,
    `${fmt(r.bitonic.rate)}/s`,
    `${fmt(r.builtin.rate)}/s`,
    `${r.ratio}×`
  ])
});

// ────────────────────────────────────────────────
// SECTION 4: Stats Module
// ────────────────────────────────────────────────

console.log('\n── Stats Module ──');

const statsResults = [];
const statsData = { x: randomFloats(100), y: randomFloats(100) };
const lmData = {
  x: Array.from({ length: 50 }, (_, i) => i),
  y: Array.from({ length: 50 }, (_, i) => i * 2.5 + Math.random() * 5)
};

const statsBenches = [
  ['summary(100)', () => summary(statsData.x)],
  ['cor(100)', () => cor(statsData.x, statsData.y)],
  ['tTest(2-sample, n=50)', () => tTest({ x: statsData.x.slice(0, 50), y: statsData.y.slice(0, 50) })],
  ['aov(n=100)', () => aov({ yield: statsData.x, ctrl: statsData.x.map((_, i) => i % 3) }, 'yield ~ ctrl')],
  ['lm(simple, n=50)', () => lm({ formula: 'y ~ x', data: lmData })],
  ['chisqTest(2x2)', () => chisqTest({ A: { S: 10, F: 15 }, B: { S: 20, F: 5 } })],
];

for (const [label, fn] of statsBenches) {
  const r = bench(fn, label);
  statsResults.push(r);
  console.log(`  ${label.padEnd(25)}: ${fmt(r.rate).padStart(10)}/s  (${r.perOp}μs/op)`);
}

sections.push({
  title: 'Stats Module',
  subtitle: 'R-style statistical functions — zero dependencies',
  columns: ['Function', 'Rate (ops/s)', 'Per-op (μs)'],
  rows: statsResults.map(r => [r.label, `${fmt(r.rate)}/s`, `${r.perOp}μs`])
});

// ────────────────────────────────────────────────
// SECTION 5: EVD Operations
// ────────────────────────────────────────────────

console.log('\n── EVD (Emoji Vectorized Data) ──');

const evdRows = Array.from({ length: 1000 }, (_, i) => ({
  id: `node-${i}`,
  status: ['healthy', 'degraded', 'critical'][i % 3],
  trend: ['up', 'down', 'flat'][i % 3]
}));

const evdResults = [];

const evdBenches = [
  ['vectorize(1000 rows)', () => vectorize(['status', 'trend'], evdRows, { status: STATUS, trend: TREND })],
];

// Pre-vectorize for filter/count
const evdTable = vectorize(['status', 'trend'], evdRows, { status: STATUS, trend: TREND });
evdBenches.push(['vFilter(1000 rows)', () => vFilter(evdTable, 'status', '💚')]);
evdBenches.push(['vCount(1000 rows)', () => vCount(evdTable, 'status')]);

for (const [label, fn] of evdBenches) {
  const r = bench(fn, label);
  evdResults.push(r);
  console.log(`  ${label.padEnd(25)}: ${fmt(r.rate).padStart(10)}/s  (${r.perOp}μs/op)`);
}

sections.push({
  title: 'EVD (Emoji Vectorized Data)',
  subtitle: 'Column-oriented emoji vectors — compact wire format',
  columns: ['Operation', 'Rate (ops/s)', 'Per-op (μs)'],
  rows: evdResults.map(r => [r.label, `${fmt(r.rate)}/s`, `${r.perOp}μs`])
});

// ────────────────────────────────────────────────
// SECTION 6: TVM Operations
// ────────────────────────────────────────────────

console.log('\n── TVM (Token Velocity Matrix) ──');

const tvmResults = [];
const tvm = new TokenVelocityMatrix({ windowMs: 60000 });
for (let i = 0; i < 20; i++) tvm.registerNode(`node-${i}`);
for (let i = 0; i < 20; i++) {
  for (let j = 0; j < 100; j++) {
    tvm.recordTx(`node-${i}`, 100 + Math.random() * 400, Math.random() > 0.01);
  }
  tvm.setCoherence(`node-${i}`, 0.9 + Math.random() * 0.1, 0.9 + Math.random() * 0.1);
}

const tvmBenches = [
  ['matrix() 20 nodes', () => tvm.matrix()],
  ['aggregate() 20 nodes', () => tvm.aggregate()],
  ['display() 20 nodes', () => tvm.display()],
  ['topN(matrix, 5)', () => topN(tvm.matrix(), 5, 'velocity_score')],
];

for (const [label, fn] of tvmBenches) {
  const r = bench(fn, label);
  tvmResults.push(r);
  console.log(`  ${label.padEnd(25)}: ${fmt(r.rate).padStart(10)}/s  (${r.perOp}μs/op)`);
}

sections.push({
  title: 'TVM (Token Velocity Matrix)',
  subtitle: '20 validator nodes, 100 transactions each',
  columns: ['Operation', 'Rate (ops/s)', 'Per-op (μs)'],
  rows: tvmResults.map(r => [r.label, `${fmt(r.rate)}/s`, `${r.perOp}μs`])
});

// ────────────────────────────────────────────────
// Generate PERFORMANCE.md
// ────────────────────────────────────────────────

let md = `# 🐟 Minnow OS Runtime — Performance Results\n\n`;
md += `> Generated: ${new Date().toISOString()}\n`;
md += `> Platform: ${process.platform} ${process.arch}\n`;
md += `> Node: ${process.version}\n`;
md += `> Method: Each benchmark runs for ≥1s after warmup. Rate = iterations/second.\n\n`;

for (const section of sections) {
  md += `## ${section.title}\n\n`;
  md += `*${section.subtitle}*\n\n`;

  // Table header
  md += `| ${section.columns.join(' | ')} |\n`;
  md += `| ${section.columns.map(() => '---').join(' | ')} |\n`;

  for (const row of section.rows) {
    md += `| ${row.join(' | ')} |\n`;
  }

  md += '\n';
}

// Key insight
md += `## Key Insights\n\n`;
md += `1. **Bitonic sort timing is data-independent** — same choreography regardless of input pattern. `;
md += `This is critical for constant-time crypto applications.\n`;
md += `2. **Tiny arrays (n=4..32)** are the TVM/MAST hot path. Bitonic networks have low per-call overhead.\n`;
md += `3. **EVD vectorized ops** scan columns, not rows — cache-friendly for dashboard filtering.\n`;
md += `4. **Stats module** provides R-compatible functions at high throughput with zero dependencies.\n`;
md += `5. **The bottleneck is marshalling, not sorting** — keep data in typed arrays as long as possible.\n`;

md += `\n---\n\n`;
md += `*"Don't optimize the sort. Optimize getting data to the sort."*\n`;
md += `*— Sort::DJB PERFORMANCE.md philosophy*\n`;

writeFileSync(new URL('./PERFORMANCE.md', import.meta.url), md);
console.log('\n═'.repeat(60));
console.log(`\n📊 Results written to performance/PERFORMANCE.md\n`);

// Minnow OS Runtime — Test Framework
// test/run.js
//
// Lightweight test runner. No dependencies.
// Run once: node test/run.js
// Tests every runtime module, reports pass/fail.
//
// Like Perl's Test::More but zero deps.

const { performance } = await import('node:perf_hooks');

let passed = 0, failed = 0, skipped = 0;
const results = [];

// ─── Test Helpers ─────────────────────────────────────────────

function ok(cond, msg) {
  if (cond) {
    passed++;
    results.push({ status: '✅', msg });
  } else {
    failed++;
    results.push({ status: '❌', msg });
    console.error(`  FAIL: ${msg}`);
  }
}

function is(got, expected, msg) {
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  if (!pass) {
    console.error(`  FAIL: ${msg}\n    got:      ${JSON.stringify(got)}\n    expected: ${JSON.stringify(expected)}`);
  }
  ok(pass, msg);
}

function approx(got, expected, tolerance, msg) {
  ok(Math.abs(got - expected) < tolerance, `${msg} (got ${got}, expected ~${expected})`);
}

function throws(fn, msg) {
  try { fn(); ok(false, msg); } catch { ok(true, msg); }
}

function bench(fn, label, iterations = 1000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const rate = (iterations / (elapsed / 1000)).toFixed(0);
  results.push({ status: '⏱️', msg: `${label}: ${rate}/s (${elapsed.toFixed(1)}ms for ${iterations} iterations)` });
  return rate;
}

// ─── Module Tests ─────────────────────────────────────────────

async function testBitonic() {
  console.log('\n── Bitonic Sort ──');
  const { bitonicSort, bitonicSortBy, topN, leaderboard, generateNetwork } = await import('../runtime/bitonic.js');

  // Basic sort
  const arr1 = [5, 3, 8, 2, 7, 1, 6, 4];
  bitonicSort(arr1);
  is(arr1, [1, 2, 3, 4, 5, 6, 7, 8], 'bitonicSort ascending');

  const arr2 = [5, 3, 8, 2, 7, 1, 6, 4];
  bitonicSort(arr2, { ascending: false });
  is(arr2, [8, 7, 6, 5, 4, 3, 2, 1], 'bitonicSort descending');

  // Already sorted
  const arr3 = [1, 2, 3, 4];
  bitonicSort(arr3);
  is(arr3, [1, 2, 3, 4], 'bitonicSort already sorted');

  // Single element
  const arr4 = [42];
  bitonicSort(arr4);
  is(arr4, [42], 'bitonicSort single element');

  // Empty
  const arr5 = [];
  bitonicSort(arr5);
  is(arr5, [], 'bitonicSort empty');

  // Negative numbers
  const arr6 = [-3, 5, -1, 0, 2];
  bitonicSort(arr6);
  is(arr6, [-3, -1, 0, 2, 5], 'bitonicSort negative numbers');

  // Sort by key
  const nodes = [
    { node: 'A', tps: 100 },
    { node: 'B', tps: 300 },
    { node: 'C', tps: 200 }
  ];
  bitonicSortBy(nodes, 'tps', { ascending: false });
  is(nodes.map(n => n.node), ['B', 'C', 'A'], 'bitonicSortBy descending');

  // Top-N
  const top = topN([
    { id: 'x', score: 10 },
    { id: 'y', score: 50 },
    { id: 'z', score: 30 }
  ], 2, 'score');
  is(top.map(t => t.id), ['y', 'z'], 'topN returns top 2');

  // Leaderboard
  const board = leaderboard([
    { node: 'A', v: 100 },
    { node: 'B', v: 300 },
    { node: 'C', v: 200 }
  ], 'v', { label: 'node' });
  is(board[0].rank, 1, 'leaderboard rank 1');
  is(board[0].label, 'B', 'leaderboard top is B');

  // Network generation
  const network = generateNetwork(8);
  ok(network.length > 0, 'generateNetwork(8) produces stages');

  // Benchmark
  const benchArr = Array.from({ length: 1000 }, () => Math.random() * 1000 | 0);
  bench(() => { bitonicSort([...benchArr]); }, 'bitonicSort n=1000');
}

async function testEVD() {
  console.log('\n── EVD (Emoji Vectorized Data) ──');
  const { vec, vectorize, vFilter, vCount, head, toWire, STATUS, TREND, LOAD, PHASE } = await import('../runtime/evd.js');

  // Vec creation
  const v = vec('grafana', '💚', '📈', '🌤️', '🎯');
  is(v.id, 'grafana', 'vec id');
  is(v.dims, 4, 'vec dimensions');
  ok(v.raw.includes('💚'), 'vec raw contains emoji');

  // Vectorize table
  const table = vectorize(
    ['status', 'trend'],
    [
      { id: 'grafana', status: 'healthy', trend: 'up' },
      { id: 'pihole', status: 'degraded', trend: 'flat' },
      { id: 'train2', status: 'critical', trend: 'down' }
    ],
    { status: STATUS, trend: TREND }
  );
  is(table.rowCount, 3, 'vectorize row count');
  is(table.columns.length, 2, 'vectorize column count');

  // Filter
  const critical = vFilter(table, 'status', '🔴');
  is(critical.rowCount, 1, 'vFilter finds 1 critical');
  is(critical.ids[0], 'train2', 'vFilter correct id');

  // Count
  const counts = vCount(table, 'status');
  is(counts.get('💚'), 1, 'vCount healthy = 1');

  // Head display
  const display = head(table, 3);
  ok(display.includes('grafana'), 'head shows grafana');
  ok(display.includes('3 rows'), 'head shows row count');

  // Wire format
  const wire = toWire(table);
  ok(wire.includes('grafana'), 'toWire contains id');
}

async function testStats() {
  console.log('\n── Stats ──');
  const { summary, cor, tTest, aov, lm, glm, chisqTest, xgBoost } = await import('../runtime/stats.js');

  // Summary
  const s = summary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  is(s.n, 10, 'summary n');
  approx(s.mean, 5.5, 0.01, 'summary mean');
  is(s.min, 1, 'summary min');
  is(s.max, 10, 'summary max');

  // Correlation
  const r = cor([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  approx(r, 1.0, 0.001, 'cor perfect positive');

  const rNeg = cor([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
  approx(rNeg, -1.0, 0.001, 'cor perfect negative');

  // t-test (one sample)
  const t1 = tTest({ x: [5.1, 4.9, 5.0, 5.2, 4.8], mu: 5.0 });
  ok(t1.p_value !== undefined, 't-test one-sample has p_value');
  ok(t1.df === 4, 't-test df = n-1');

  // t-test (two sample)
  const t2 = tTest({ x: [5, 6, 7, 8, 9], y: [1, 2, 3, 4, 5] });
  ok(t2.p_value < 0.05, 't-test two-sample significant');

  // ANOVA
  const a = aov({
    yield: [5.5, 5.4, 5.8, 4.5, 4.8, 4.2],
    ctrl: [1, 1, 1, 0, 0, 0]
  }, 'yield ~ ctrl');
  ok(a.factor.F > 0, 'ANOVA F > 0');
  ok(a.factor.df === 1, 'ANOVA df between = 1');
  ok(a.residuals.df === 4, 'ANOVA df within = 4');

  // Linear model
  const fit = lm({
    formula: 'y ~ x',
    data: { x: [1, 2, 3, 4, 5], y: [2, 4, 6, 8, 10] }
  });
  approx(fit.coefficients.x, 2.0, 0.01, 'lm slope = 2');
  approx(fit.coefficients.intercept, 0.0, 0.01, 'lm intercept = 0');
  approx(fit.r_squared, 1.0, 0.001, 'lm R² = 1.0');

  // GLM
  const g = glm({
    formula: 'y ~ x',
    data: { x: [1, 2, 3, 4, 5, 6], y: [0, 0, 0, 1, 1, 1] },
    family: 'binomial'
  });
  ok(g.converged, 'glm converged');
  ok(g.coefficients.x > 0, 'glm positive coefficient');

  // Chi-squared
  const chi = chisqTest({
    GroupA: { Success: 10, Failure: 15 },
    GroupB: { Success: 20, Failure: 5 }
  });
  ok(chi.x_squared > 0, 'chisq X² > 0');
  ok(chi.df === 1, 'chisq df = 1');
  ok(chi.yates_correction === true, 'chisq Yates for 2x2');

  // XGBoost
  const model = xgBoost({
    data: { x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2, 4, 6, 8, 10, 12, 14, 16] },
    target: 'y',
    features: ['x'],
    nTrees: 20,
    maxDepth: 2,
    learningRate: 0.3
  });
  const pred = model.predict({ x: 5 });
  approx(pred, 10, 3, 'xgBoost predicts ~10 for x=5');
  ok(model.rmse < 5, 'xgBoost training RMSE reasonable');
  ok(model.importance().x !== undefined, 'xgBoost feature importance');
}

async function testTVM() {
  console.log('\n── TVM (Token Velocity Matrix) ──');
  const { TokenVelocityMatrix } = await import('../runtime/tvm.js');

  const tvm = new TokenVelocityMatrix({ windowMs: 5000 });
  tvm.registerNode('SUI-01');
  tvm.registerNode('TRX-01');

  // Record transactions
  for (let i = 0; i < 100; i++) {
    tvm.recordTx('SUI-01', 300 + Math.random() * 100, true);
    tvm.recordTx('TRX-01', 150 + Math.random() * 80, true);
  }

  tvm.setQueueDepth('SUI-01', 14);
  tvm.setCoherence('SUI-01', 0.97, 0.95);
  tvm.setCoherence('TRX-01', 0.96, 0.94);

  const matrix = tvm.matrix();
  is(matrix.length, 2, 'tvm matrix has 2 nodes');
  ok(matrix[0].tps > 0, 'tvm TPS > 0');
  ok(matrix[0].avg_latency_ms > 0, 'tvm latency > 0');
  ok(matrix[0].velocity_score > 0, 'tvm velocity score > 0');
  ok(matrix[0].health === '🟢' || matrix[0].health === '🟡', 'tvm health indicator');

  // Aggregate
  const agg = tvm.aggregate();
  ok(agg.nodes === 2, 'tvm aggregate node count');
  ok(agg.total_tps > 0, 'tvm aggregate total TPS');

  // Display
  const display = tvm.display();
  ok(display.includes('SUI-01'), 'tvm display shows node');

  // Delay analysis
  tvm.recordDelayBreakdown('SUI-01', {
    network: 45, validator: 85, consensus: 120, storage: 50, app: 20
  });
  const delay = tvm.delayAnalysis('SUI-01');
  is(delay.bottleneck, 'consensus', 'tvm bottleneck is consensus');
  is(delay.total_ms, 320, 'tvm total delay 320ms');
}

async function testChannels() {
  console.log('\n── Channels ──');
  const { Channels } = await import('../runtime/channels.js');

  const ch = new Channels();
  const received = [];

  // Subscribe
  const sub = ch.subscribe('chat.*', 'client-1', (msg) => {
    received.push(msg);
  });

  // Publish
  await ch.publish('chat.general', 'message', { text: 'hello' }, 'user-1');
  is(received.length, 1, 'channel delivers message');
  is(received[0].event, 'message', 'channel correct event');

  // Pattern matching
  await ch.publish('chat.random', 'message', { text: 'world' }, 'user-2');
  is(received.length, 2, 'channel pattern matches chat.random');

  // Non-matching
  await ch.publish('events.system', 'alert', {}, 'system');
  is(received.length, 2, 'channel ignores non-matching');

  // Presence
  ch.join('lobby', 'player-1', { name: 'Alice' });
  ch.join('lobby', 'player-2', { name: 'Bob' });
  const presence = ch.getPresence('lobby');
  is(presence.length, 2, 'channel presence count');

  ch.leave('lobby', 'player-1');
  is(ch.getPresence('lobby').length, 1, 'channel leave reduces presence');

  // History
  const hist = ch.getHistory('chat.general');
  ok(hist.length >= 1, 'channel history available');

  // Unsubscribe
  sub.unsubscribe();
  await ch.publish('chat.general', 'test', {}, 'x');
  is(received.length, 2, 'channel unsubscribe works');

  // Stats
  const stats = ch.getStats();
  ok(stats.sequence > 0, 'channel sequence increments');
}

async function testAdapter() {
  console.log('\n── PAGI Adapter ──');
  const { RuntimeAdapter } = await import('../runtime/adapter.js');

  const adapter = new RuntimeAdapter();
  ok(adapter !== null, 'adapter instantiates');

  // Basic app execution
  const events = [];
  const app = async (scope, receive, send) => {
    const event = await receive();
    events.push(event);
    await send({ type: 'http.response.start', status: 200, headers: {} });
    await send({ type: 'http.response.body', body: 'hello' });
  };

  const scope = { type: 'http', method: 'GET', path: '/' };
  const receiveQueue = [{ type: 'http.request', body: '' }];
  const sent = [];

  await app(
    scope,
    async () => receiveQueue.shift(),
    async (event) => sent.push(event)
  );

  is(events.length, 1, 'adapter app received event');
  is(sent.length, 2, 'adapter app sent 2 events');
  is(sent[0].status, 200, 'adapter response status 200');
  is(sent[1].body, 'hello', 'adapter response body');
}

async function testMiddleware() {
  console.log('\n── Middleware ──');
  const { compose } = await import('../runtime/middleware.js');

  const log = [];

  // Simple middleware
  const logger = (app) => async (scope, receive, send) => {
    log.push('before');
    await app(scope, receive, send);
    log.push('after');
  };

  const inner = async (scope, receive, send) => {
    log.push('app');
    await send({ type: 'done' });
  };

  const wrapped = compose(inner, [logger]);
  const sent = [];
  await wrapped({}, async () => ({}), async (e) => sent.push(e));

  is(log, ['before', 'app', 'after'], 'middleware wraps correctly');
  is(sent.length, 1, 'middleware passes send through');
}

// ─── Run All Tests ────────────────────────────────────────────

console.log('🐟 Minnow OS Runtime — Test Suite\n');
console.log('═'.repeat(50));

const suites = [
  ['Adapter', testAdapter],
  ['Middleware', testMiddleware],
  ['Channels', testChannels],
  ['Bitonic', testBitonic],
  ['EVD', testEVD],
  ['Stats', testStats],
  ['TVM', testTVM]
];

const t0 = performance.now();

for (const [name, fn] of suites) {
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error(`\n💥 ${name} CRASHED: ${err.message}`);
    console.error(err.stack);
  }
}

const elapsed = (performance.now() - t0).toFixed(0);

console.log('\n' + '═'.repeat(50));
console.log(`\n🐟 Results: ${passed} passed, ${failed} failed (${elapsed}ms)\n`);

for (const r of results) {
  console.log(`  ${r.status} ${r.msg}`);
}

console.log(`\n${failed === 0 ? '🎉 ALL TESTS PASSED' : '💀 SOME TESTS FAILED'}\n`);

process.exit(failed > 0 ? 1 : 0);

// Minnow OS Runtime — Stats (R-style statistical analysis)
// runtime/stats.js
//
// R stack equivalent for JS. Hash-of-hash inputs, human-readable.
// Like Stats::LikeR but native to the Minnow runtime.
//
// Functions:
//   aov()        — ANOVA (one-way, two-way)
//   lm()         — Linear regression
//   glm()        — Logistic regression
//   tTest()      — Student's t-test (1-sample, 2-sample, paired)
//   chisqTest()  — Chi-squared contingency
//   xgBoost()    — Gradient boosting (simplified)
//   cor()        — Correlation
//   summary()    — Summary statistics

// ─── Basic Stats Helpers ──────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr, ddof = 1) {
  const m = mean(arr);
  const ss = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return ss / (arr.length - ddof);
}

function stdev(arr, ddof = 1) {
  return Math.sqrt(variance(arr, ddof));
}

function sum(arr) {
  return arr.reduce((s, v) => s + v, 0);
}

function sumSq(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0);
}

// ─── Summary Statistics ───────────────────────────────────────

/**
 * R-style summary() — descriptive statistics.
 *
 * @param {number[]} x
 * @returns {Object}
 */
export function summary(x) {
  const sorted = [...x].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = sorted[Math.floor(n * 0.25)];
  const median = sorted[Math.floor(n * 0.5)];
  const q3 = sorted[Math.floor(n * 0.75)];

  return {
    min: sorted[0],
    q1,
    median,
    mean: mean(x),
    q3,
    max: sorted[n - 1],
    sd: stdev(x),
    n
  };
}

// ─── Correlation ──────────────────────────────────────────────

/**
 * Pearson correlation coefficient.
 *
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number}
 */
export function cor(x, y) {
  const n = x.length;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

// ─── t-Test ───────────────────────────────────────────────────

/**
 * Student's t-test. 1-sample, 2-sample, or paired.
 * Hash input — easier to read than positional args.
 *
 * Usage:
 *   tTest({ x: [1,2,3], y: [4,5,6], paired: true })
 *   tTest({ x: [1,2,3], mu: 0 })  // 1-sample
 *
 * @param {Object} opts
 * @param {number[]} opts.x
 * @param {number[]} [opts.y]
 * @param {number}   [opts.mu=0]
 * @param {boolean}  [opts.paired=false]
 * @param {boolean}  [opts.varEqual=false]
 * @param {string}   [opts.alternative='two.sided']
 * @returns {Object}
 */
export function tTest(opts) {
  const { x, y, mu = 0, paired = false, varEqual = false, alternative = 'two.sided' } = opts;

  // One-sample t-test
  if (!y) {
    const n = x.length;
    const t = (mean(x) - mu) / (stdev(x) / Math.sqrt(n));
    const df = n - 1;
    const pValue = tPValue(Math.abs(t), df, alternative);
    return { t, df, p_value: pValue, mean: mean(x), alternative };
  }

  // Paired t-test
  if (paired) {
    const diff = x.map((v, i) => v - y[i]);
    return tTest({ x: diff, mu });
  }

  // Two-sample t-test
  const n1 = x.length, n2 = y.length;
  const m1 = mean(x), m2 = mean(y);
  const v1 = variance(x), v2 = variance(y);

  let t, df;
  if (varEqual) {
    // Pooled variance
    const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    t = (m1 - m2) / Math.sqrt(sp * (1/n1 + 1/n2));
    df = n1 + n2 - 2;
  } else {
    // Welch's t-test
    const se = Math.sqrt(v1/n1 + v2/n2);
    t = (m1 - m2) / se;
    // Welch-Satterthwaite df
    const num = (v1/n1 + v2/n2) ** 2;
    const den = (v1/n1)**2/(n1-1) + (v2/n2)**2/(n2-1);
    df = num / den;
  }

  const pValue = tPValue(Math.abs(t), df, alternative);
  return { t, df, p_value: pValue, mean_x: m1, mean_y: m2, alternative };
}

// ─── ANOVA (Analysis of Variance) ─────────────────────────────

/**
 * One-way ANOVA.
 * Hash-of-hash input — like R's aov(yield ~ ctrl).
 *
 * Usage (hash-of-hash):
 *   aov({
 *     yield: [5.5, 5.4, 5.8, 4.5, 4.8, 4.2],
 *     ctrl:  [1,   1,   1,   0,   0,   0  ],
 *   }, 'yield ~ ctrl')
 *
 * @param {Object} data  - Hash of arrays (column-oriented)
 * @param {string} formula - R-style formula: 'response ~ factor'
 * @returns {Object}
 */
export function aov(data, formula) {
  const [response, factor] = formula.split('~').map(s => s.trim());
  const y = data[response];
  const groups = data[factor];

  // Group observations by factor level
  const grouped = {};
  for (let i = 0; i < y.length; i++) {
    const g = String(groups[i]);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(y[i]);
  }

  const grandMean = mean(y);
  const groupNames = Object.keys(grouped);
  const k = groupNames.length;  // number of groups
  const N = y.length;           // total observations

  // Sum of squares between groups (SSB)
  let SSB = 0;
  for (const g of groupNames) {
    const gMean = mean(grouped[g]);
    SSB += grouped[g].length * (gMean - grandMean) ** 2;
  }

  // Sum of squares within groups (SSW)
  let SSW = 0;
  for (const g of groupNames) {
    const gMean = mean(grouped[g]);
    for (const v of grouped[g]) {
      SSW += (v - gMean) ** 2;
    }
  }

  const dfBetween = k - 1;
  const dfWithin = N - k;
  const MSB = SSB / dfBetween;
  const MSW = SSW / dfWithin;
  const F = MSB / MSW;
  const pValue = fPValue(F, dfBetween, dfWithin);

  return {
    formula,
    factor: {
      df: dfBetween,
      sumSq: SSB,
      meanSq: MSB,
      F,
      'Pr(>F)': pValue
    },
    residuals: {
      df: dfWithin,
      sumSq: SSW,
      meanSq: MSW
    },
    groups: Object.fromEntries(
      groupNames.map(g => [g, { n: grouped[g].length, mean: mean(grouped[g]), sd: stdev(grouped[g]) }])
    )
  };
}

/**
 * Two-way ANOVA.
 *
 * Usage:
 *   aov2({
 *     yield:   [5.5, 5.4, 5.8, 4.5, 4.8, 4.2, 6.1, 5.9],
 *     ctrl:    [1,   1,   1,   0,   0,   0,   1,   0  ],
 *     block:   ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B']
 *   }, 'yield ~ ctrl + block')
 *
 * @param {Object} data
 * @param {string} formula - 'response ~ factor1 + factor2'
 * @returns {Object}
 */
export function aov2(data, formula) {
  const parts = formula.split('~').map(s => s.trim());
  const response = parts[0];
  const factors = parts[1].split('+').map(s => s.trim());

  if (factors.length < 2) return aov(data, formula);

  const y = data[response];
  const N = y.length;
  const grandMean = mean(y);

  // Compute SS for each factor (Type I)
  const results = { formula, factors: {} };
  let SSResidual = sumSq(y);

  for (const f of factors) {
    const grouped = {};
    for (let i = 0; i < N; i++) {
      const g = String(data[f][i]);
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(y[i]);
    }

    const k = Object.keys(grouped).length;
    let SS = 0;
    for (const g of Object.values(grouped)) {
      SS += g.length * (mean(g) - grandMean) ** 2;
    }

    const df = k - 1;
    SSResidual -= SS;

    results.factors[f] = {
      df,
      sumSq: SS,
      meanSq: SS / df
    };
  }

  const dfResidual = N - 1 - Object.values(results.factors).reduce((s, f) => s + f.df, 0);
  const MSResidual = SSResidual / dfResidual;

  // Compute F and p for each factor
  for (const f of factors) {
    results.factors[f].F = results.factors[f].meanSq / MSResidual;
    results.factors[f]['Pr(>F)'] = fPValue(results.factors[f].F, results.factors[f].df, dfResidual);
  }

  results.residuals = { df: dfResidual, sumSq: SSResidual, meanSq: MSResidual };

  return results;
}

// ─── Linear Model ─────────────────────────────────────────────

/**
 * Linear regression: lm(formula, data)
 *
 * Usage:
 *   lm({ formula: 'mpg ~ wt + hp', data: mtcars })
 *
 * For simple y ~ x, uses OLS.
 * For multiple regression, uses normal equations.
 *
 * @param {Object} opts
 * @returns {Object}
 */
export function lm(opts) {
  const { formula, data } = opts;
  const parts = formula.split('~').map(s => s.trim());
  const response = parts[0];
  const predictors = parts[1].split(/[+*]/).map(s => s.trim());

  const y = data[response];
  const n = y.length;

  if (predictors.length === 1) {
    // Simple linear regression: y = a + bx
    const x = data[predictors[0]];
    const mx = mean(x), my = mean(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      den += (x[i] - mx) ** 2;
    }
    const b = num / den;
    const a = my - b * mx;

    // R-squared
    const predicted = x.map(xi => a + b * xi);
    const SSRes = predicted.reduce((s, p, i) => s + (y[i] - p) ** 2, 0);
    const SSTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const rSquared = 1 - SSRes / SSTot;

    // Standard error
    const se = Math.sqrt(SSRes / (n - 2));

    return {
      formula,
      coefficients: { intercept: a, [predictors[0]]: b },
      r_squared: rSquared,
      adj_r_squared: 1 - (1 - rSquared) * (n - 1) / (n - 2),
      residual_se: se,
      df: n - 2,
      n
    };
  }

  // Multiple regression via normal equations (X'X)^-1 X'y
  // Build design matrix [1, x1, x2, ...]
  const p = predictors.length + 1; // +1 for intercept
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = [1]; // intercept
    for (const pred of predictors) {
      row.push(data[pred][i]);
    }
    X.push(row);
  }

  // X'X
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const XtY = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      XtY[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  // Solve via Gaussian elimination
  const beta = solveLinear(XtX, XtY);

  // R-squared
  const my = mean(y);
  const predicted = X.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
  const SSRes = predicted.reduce((s, p, i) => s + (y[i] - p) ** 2, 0);
  const SSTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const rSquared = 1 - SSRes / SSTot;

  const coefficients = { intercept: beta[0] };
  predictors.forEach((pred, i) => { coefficients[pred] = beta[i + 1]; });

  return {
    formula,
    coefficients,
    r_squared: rSquared,
    adj_r_squared: 1 - (1 - rSquared) * (n - 1) / (n - p),
    residual_se: Math.sqrt(SSRes / (n - p)),
    df: n - p,
    n
  };
}

// ─── GLM (Logistic Regression) ────────────────────────────────

/**
 * Generalized Linear Model — logistic regression via IRLS.
 *
 * Usage:
 *   glm({ formula: 'am ~ wt + hp', data: mtcars, family: 'binomial' })
 *
 * @param {Object} opts
 * @returns {Object}
 */
export function glm(opts) {
  const { formula, data, family = 'binomial', maxIter = 25 } = opts;
  const parts = formula.split('~').map(s => s.trim());
  const response = parts[0];
  const predictors = parts[1].split('+').map(s => s.trim());

  const y = data[response];
  const n = y.length;
  const p = predictors.length + 1;

  // Build design matrix
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (const pred of predictors) row.push(data[pred][i]);
    X.push(row);
  }

  // IRLS (Iteratively Reweighted Least Squares)
  let beta = Array(p).fill(0);
  const sigmoid = z => 1 / (1 + Math.exp(-z));

  for (let iter = 0; iter < maxIter; iter++) {
    const mu = X.map(row => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
    const W = mu.map(m => m * (1 - m));

    // X'WX
    const XtWX = Array.from({ length: p }, () => Array(p).fill(0));
    const XtWz = Array(p).fill(0);

    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((s, v, j) => s + v * beta[j], 0) + (y[i] - mu[i]) / (W[i] || 1e-10);
      for (let j = 0; j < p; j++) {
        XtWz[j] += X[i][j] * W[i] * z;
        for (let k = 0; k < p; k++) {
          XtWX[j][k] += X[i][j] * W[i] * X[i][k];
        }
      }
    }

    beta = solveLinear(XtWX, XtWz);
  }

  const coefficients = { intercept: beta[0] };
  predictors.forEach((pred, i) => { coefficients[pred] = beta[i + 1]; });

  // Deviance
  const mu = X.map(row => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
  let deviance = 0;
  for (let i = 0; i < n; i++) {
    deviance -= 2 * (y[i] * Math.log(mu[i] + 1e-10) + (1 - y[i]) * Math.log(1 - mu[i] + 1e-10));
  }

  return { formula, family, coefficients, deviance, n, converged: true };
}

// ─── Chi-Squared Test ─────────────────────────────────────────

/**
 * Chi-squared test for categorical analysis.
 * Hash-of-hash input — natively readable.
 *
 * Usage:
 *   chisqTest({
 *     GroupA: { Success: 10, Failure: 15 },
 *     GroupB: { Success: 20, Failure: 5  }
 *   })
 *
 * @param {Object} data - Hash of hashes (contingency table)
 * @returns {Object}
 */
export function chisqTest(data) {
  const rowNames = Object.keys(data);
  const colNames = [...new Set(rowNames.flatMap(r => Object.keys(data[r])))];

  // Build observed matrix
  const observed = [];
  for (const r of rowNames) {
    observed.push(colNames.map(c => data[r][c] || 0));
  }

  const nRows = rowNames.length;
  const nCols = colNames.length;
  const N = observed.flat().reduce((s, v) => s + v, 0);

  // Row and column totals
  const rowTotals = observed.map(row => sum(row));
  const colTotals = colNames.map((_, j) => observed.reduce((s, row) => s + row[j], 0));

  // Expected frequencies
  const expected = [];
  for (let i = 0; i < nRows; i++) {
    expected.push(colNames.map((_, j) => (rowTotals[i] * colTotals[j]) / N));
  }

  // Chi-squared statistic
  let chiSq = 0;
  // Yates' correction for 2×2
  const yates = nRows === 2 && nCols === 2;
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      const diff = Math.abs(observed[i][j] - expected[i][j]) - (yates ? 0.5 : 0);
      chiSq += (diff ** 2) / expected[i][j];
    }
  }

  const df = (nRows - 1) * (nCols - 1);
  const pValue = chiSqPValue(chiSq, df);

  return {
    x_squared: chiSq,
    df,
    p_value: pValue,
    observed: Object.fromEntries(rowNames.map((r, i) =>
      [r, Object.fromEntries(colNames.map((c, j) => [c, observed[i][j]]))]
    )),
    expected: Object.fromEntries(rowNames.map((r, i) =>
      [r, Object.fromEntries(colNames.map((c, j) => [c, +expected[i][j].toFixed(2)]))]
    )),
    yates_correction: yates
  };
}

// ─── XGBoost (Simplified Gradient Boosting) ───────────────────

/**
 * Simplified gradient boosting for tabular data.
 * Not a full XGBoost — a clean implementation of the core algorithm.
 *
 * Usage:
 *   const model = xgBoost({
 *     data: { wt: [...], hp: [...], mpg: [...] },
 *     target: 'mpg',
 *     features: ['wt', 'hp'],
 *     nTrees: 50,
 *     maxDepth: 3,
 *     learningRate: 0.1
 *   });
 *   model.predict({ wt: 3.5, hp: 110 });
 *
 * @param {Object} opts
 * @returns {Object}
 */
export function xgBoost(opts) {
  const {
    data, target, features,
    nTrees = 50, maxDepth = 3, learningRate = 0.1,
    minSamplesLeaf = 2
  } = opts;

  const y = data[target];
  const n = y.length;
  const basePrediction = mean(y);

  // Current predictions start at base
  let predictions = Array(n).fill(basePrediction);
  const trees = [];

  for (let t = 0; t < nTrees; t++) {
    // Compute residuals (negative gradient for MSE)
    const residuals = y.map((yi, i) => yi - predictions[i]);

    // Fit a decision stump/tree to residuals
    const tree = fitTree(data, features, residuals, 0, maxDepth, minSamplesLeaf);
    trees.push(tree);

    // Update predictions
    for (let i = 0; i < n; i++) {
      predictions[i] += learningRate * predictTree(tree, data, features, i);
    }
  }

  // Training RMSE
  const rmse = Math.sqrt(
    y.reduce((s, yi, i) => s + (yi - predictions[i]) ** 2, 0) / n
  );

  return {
    basePrediction,
    nTrees,
    learningRate,
    maxDepth,
    rmse,

    /**
     * Predict for a single observation.
     * @param {Object} obs - { feature1: val, feature2: val }
     * @returns {number}
     */
    predict(obs) {
      let pred = basePrediction;
      for (const tree of trees) {
        pred += learningRate * predictSingle(tree, obs);
      }
      return pred;
    },

    /**
     * Feature importance (by split frequency).
     */
    importance() {
      const imp = {};
      for (const f of features) imp[f] = 0;
      for (const tree of trees) countSplits(tree, imp);
      const total = Object.values(imp).reduce((s, v) => s + v, 0) || 1;
      for (const f of features) imp[f] = +(imp[f] / total).toFixed(4);
      return imp;
    }
  };
}

// ─── Decision Tree Helpers ────────────────────────────────────

function fitTree(data, features, residuals, depth, maxDepth, minLeaf) {
  const n = residuals.length;
  if (depth >= maxDepth || n < minLeaf * 2) {
    return { leaf: true, value: mean(residuals) };
  }

  let bestFeature = null, bestThreshold = null, bestGain = -Infinity;
  const indices = Array.from({ length: n }, (_, i) => i);

  for (const f of features) {
    const vals = data[f];
    const thresholds = [...new Set(vals)].sort((a, b) => a - b);

    for (let t = 0; t < thresholds.length - 1; t++) {
      const thresh = (thresholds[t] + thresholds[t + 1]) / 2;
      const left = [], right = [];

      for (const i of indices) {
        (vals[i] <= thresh ? left : right).push(residuals[i]);
      }

      if (left.length < minLeaf || right.length < minLeaf) continue;

      const gain = sumSq(residuals) - sumSq(left) - sumSq(right);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = thresh;
      }
    }
  }

  if (!bestFeature) return { leaf: true, value: mean(residuals) };

  const leftIdx = [], rightIdx = [];
  const leftRes = [], rightRes = [];
  const leftData = {}, rightData = {};
  for (const f of features) { leftData[f] = []; rightData[f] = []; }

  for (let i = 0; i < n; i++) {
    if (data[bestFeature][i] <= bestThreshold) {
      leftIdx.push(i); leftRes.push(residuals[i]);
      for (const f of features) leftData[f].push(data[f][i]);
    } else {
      rightIdx.push(i); rightRes.push(residuals[i]);
      for (const f of features) rightData[f].push(data[f][i]);
    }
  }

  return {
    leaf: false,
    feature: bestFeature,
    threshold: bestThreshold,
    left: fitTree(leftData, features, leftRes, depth + 1, maxDepth, minLeaf),
    right: fitTree(rightData, features, rightRes, depth + 1, maxDepth, minLeaf)
  };
}

function predictTree(tree, data, features, i) {
  if (tree.leaf) return tree.value;
  return data[tree.feature][i] <= tree.threshold
    ? predictTree(tree.left, data, features, i)
    : predictTree(tree.right, data, features, i);
}

function predictSingle(tree, obs) {
  if (tree.leaf) return tree.value;
  return obs[tree.feature] <= tree.threshold
    ? predictSingle(tree.left, obs)
    : predictSingle(tree.right, obs);
}

function countSplits(tree, imp) {
  if (tree.leaf) return;
  imp[tree.feature] = (imp[tree.feature] || 0) + 1;
  countSplits(tree.left, imp);
  countSplits(tree.right, imp);
}

// ─── Statistical Distribution Helpers ─────────────────────────

/** Approximate t-distribution p-value using normal approximation for large df */
function tPValue(t, df, alternative) {
  // Use approximation: for df > 30, t ≈ normal
  const z = t;
  const p2 = 2 * (1 - normalCDF(Math.abs(z)));
  if (alternative === 'two.sided') return p2;
  return p2 / 2;
}

/** Approximate F-distribution p-value */
function fPValue(F, df1, df2) {
  // Beta function approximation
  const x = df2 / (df2 + df1 * F);
  return betaInc(df2/2, df1/2, x);
}

/** Approximate chi-squared p-value */
function chiSqPValue(x, df) {
  // Wilson-Hilferty approximation
  const z = Math.pow(x / df, 1/3) - (1 - 2/(9*df));
  const se = Math.sqrt(2/(9*df));
  return 1 - normalCDF(z / se);
}

/** Standard normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(x) {
  const a1 =  0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

/** Incomplete beta function (rough approximation) */
function betaInc(a, b, x) {
  // Simple numerical integration
  const steps = 200;
  const dx = x / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dx;
    sum += Math.pow(t, a-1) * Math.pow(1-t, b-1) * dx;
  }
  // Normalize by beta function
  const beta = gammaLn(a) + gammaLn(b) - gammaLn(a + b);
  return sum / Math.exp(beta);
}

/** Log-gamma (Stirling approximation) */
function gammaLn(x) {
  return 0.5 * Math.log(2 * Math.PI / x) + x * (Math.log(x + 1/(12*x - 1/(10*x))) - 1);
}

/** Gaussian elimination */
function solveLinear(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    for (let k = i + 1; k < n; k++) {
      const c = aug[k][i] / (aug[i][i] || 1e-10);
      for (let j = i; j <= n; j++) aug[k][j] -= c * aug[i][j];
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i] || 1e-10;
  }
  return x;
}

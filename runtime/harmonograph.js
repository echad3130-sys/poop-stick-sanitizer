// Minnow OS Runtime — Harmonograph / Lissajous Generator
// runtime/harmonograph.js
//
// "Something math and also beautiful."
// The opposite of an LLM — pure deterministic parametric curves.
//
// Data → Constraint → Choreography → Shape
//
// Like sorting networks create order from simple min/max,
// harmonographs create beauty from simple sin/cos.
//
// Parameters → Equations → SVG
// No randomness. No AI. Just math.

/**
 * Generate a Lissajous curve.
 * x(t) = A * sin(a*t + δ)
 * y(t) = B * sin(b*t)
 *
 * @param {Object} opts
 * @param {number} opts.freqX - X frequency (e.g., 3)
 * @param {number} opts.freqY - Y frequency (e.g., 4)
 * @param {number} [opts.phase=0] - Phase offset (radians)
 * @param {number} [opts.dampX=0] - X damping
 * @param {number} [opts.dampY=0] - Y damping
 * @param {number} [opts.radiusX=100] - X amplitude
 * @param {number} [opts.radiusY=100] - Y amplitude
 * @param {number} [opts.steps=2000] - Resolution
 * @param {number} [opts.duration=2*Math.PI] - Time range
 * @returns {Array<[number, number]>}
 */
export function lissajous(opts) {
  const {
    freqX = 3, freqY = 4,
    phase = 0,
    dampX = 0, dampY = 0,
    radiusX = 100, radiusY = 100,
    steps = 2000,
    duration = Math.PI * 2 * 10
  } = opts;

  const points = [];
  const dt = duration / steps;

  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const x = radiusX * Math.sin(freqX * t + phase) * Math.exp(-dampX * t);
    const y = radiusY * Math.sin(freqY * t) * Math.exp(-dampY * t);
    points.push([x, y]);
  }

  return points;
}

/**
 * Generate a rotary pendulum (two-pendulum harmonograph).
 * More complex, monk-sand-like patterns.
 *
 * @param {Object} opts
 * @returns {Array<[number, number]>}
 */
export function rotaryPendulum(opts) {
  const {
    f1 = 3, f2 = 4, f3 = 1, f4 = 2,
    p1 = 0, p2 = 0, p3 = Math.PI / 4, p4 = 0,
    d1 = 0.002, d2 = 0.003, d3 = 0.001, d4 = 0.002,
    a1 = 100, a2 = 100, a3 = 50, a4 = 50,
    steps = 5000,
    duration = Math.PI * 2 * 40
  } = opts;

  const points = [];
  const dt = duration / steps;

  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const x = a1 * Math.sin(f1 * t + p1) * Math.exp(-d1 * t)
            + a3 * Math.sin(f3 * t + p3) * Math.exp(-d3 * t);
    const y = a2 * Math.sin(f2 * t + p2) * Math.exp(-d2 * t)
            + a4 * Math.sin(f4 * t + p4) * Math.exp(-d4 * t);
    points.push([x, y]);
  }

  return points;
}

/**
 * Wobble — the W. Small frequency perturbation
 * that creates organic-looking drift.
 *
 * @param {Object} opts
 * @param {number} opts.baseFreqX
 * @param {number} opts.baseFreqY
 * @param {number} [opts.wobble=0.01] - Frequency deviation
 * @returns {Array<[number, number]>}
 */
export function wobble(opts) {
  const {
    baseFreqX = 3, baseFreqY = 4,
    wobbleAmount = 0.01,
    ...rest
  } = opts;

  return lissajous({
    ...rest,
    freqX: baseFreqX + wobbleAmount,
    freqY: baseFreqY,
  });
}

// ─── Color ────────────────────────────────────────────────────

/**
 * HSL color generation — opposite of LLM randomness.
 * Deterministic palette from parameters.
 *
 * @param {number} index - Position in palette
 * @param {number} total - Total colors needed
 * @param {Object} [opts]
 * @returns {string} HSL color string
 */
export function paletteColor(index, total, opts = {}) {
  const { saturation = 70, lightness = 55, alpha = 1.0 } = opts;
  const hue = (index / total) * 360;
  if (alpha < 1) {
    return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, ${alpha})`;
  }
  return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
}

/**
 * LCARS color palette.
 */
export const LCARS_COLORS = {
  gold:     '#f1df6f',
  orange:   '#ff9944',
  blue:     '#9999ff',
  lavender: '#cc99cc',
  peach:    '#ffcc99',
  tan:      '#cc6633',
  red:      '#cc6666',
  salmon:   '#ff9966',
  bg:       '#000000',
  text:     '#ff9944',
};

/**
 * Velocity-to-color mapping for TVM dashboards.
 *
 * @param {number} value - 0.0 to 1.0
 * @returns {string} CSS color
 */
export function velocityColor(value) {
  // Green → Yellow → Red
  const hue = value * 120; // 0=red, 60=yellow, 120=green
  return `hsl(${hue.toFixed(0)}, 85%, 50%)`;
}

// ─── SVG Generation ───────────────────────────────────────────

/**
 * Convert points to SVG path data.
 *
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
function toPathD(points) {
  if (!points.length) return '';
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  return d;
}

/**
 * Generate SVG from curve points.
 *
 * @param {Array<[number, number]>} points
 * @param {Object} [opts]
 * @returns {string} SVG markup
 */
export function toSVG(points, opts = {}) {
  const {
    width = 500, height = 500,
    stroke = LCARS_COLORS.gold,
    strokeWidth = 1.2,
    background = LCARS_COLORS.bg,
    title = '',
    padding = 20
  } = opts;

  // Find bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scaleX = (width - padding * 2) / rangeX;
  const scaleY = (height - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  // Center and scale
  const scaled = points.map(([x, y]) => [
    (x - minX) * scale + padding + (width - rangeX * scale) / 2 - padding,
    (y - minY) * scale + padding + (height - rangeY * scale) / 2 - padding
  ]);

  const pathD = toPathD(scaled);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${title ? `<text x="${width/2}" y="20" text-anchor="middle" fill="${LCARS_COLORS.text}" font-family="monospace" font-size="14">${title}</text>` : ''}
  <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
</svg>`;
}

/**
 * Generate multi-layer SVG with color progression.
 * Each layer is a slightly different wobble — monk sand.
 *
 * @param {Object} opts
 * @param {number} [opts.layers=5]
 * @returns {string}
 */
export function harmonographSVG(opts = {}) {
  const {
    layers = 5,
    freqX = 3, freqY = 4,
    baseWobble = 0.005,
    width = 500, height = 500,
    title = `Harmonograph ${freqX}:${freqY}`,
    damping = 0.003
  } = opts;

  let paths = '';
  for (let i = 0; i < layers; i++) {
    const w = baseWobble * (i + 1);
    const color = paletteColor(i, layers, { saturation: 80, lightness: 60 });
    const pts = lissajous({
      freqX: freqX + w,
      freqY: freqY,
      phase: (i / layers) * Math.PI * 0.1,
      dampX: damping * (i + 1) * 0.5,
      dampY: damping * (i + 1) * 0.3,
      steps: 3000,
      duration: Math.PI * 2 * 20
    });

    // Scale points
    const pad = 30;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((width - pad * 2) / rangeX, (height - pad * 2) / rangeY);

    const scaled = pts.map(([x, y]) => [
      (x - minX) * scale + pad + (width - rangeX * scale) / 2 - pad,
      (y - minY) * scale + pad + (height - rangeY * scale) / 2 - pad
    ]);

    const d = toPathD(scaled);
    paths += `  <path d="${d}" fill="none" stroke="${color}" stroke-width="0.8" opacity="${0.7 - i * 0.08}"/>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${LCARS_COLORS.bg}"/>
  <text x="${width/2}" y="22" text-anchor="middle" fill="${LCARS_COLORS.text}" font-family="monospace" font-size="13">${title}</text>
${paths}</svg>`;
}

// ─── Presets: Elements 1-10 ───────────────────────────────────

/**
 * 10 preset harmonograph configurations.
 * Like the periodic table — each element has a signature shape.
 */
export const ELEMENTS = [
  { name: 'Unison',     freqX: 1, freqY: 1, phase: Math.PI / 4 },
  { name: 'Octave',     freqX: 1, freqY: 2, phase: 0 },
  { name: 'Fifth',      freqX: 2, freqY: 3, phase: 0 },
  { name: 'Fourth',     freqX: 3, freqY: 4, phase: 0 },
  { name: 'Triton',     freqX: 3, freqY: 5, phase: Math.PI / 6 },
  { name: 'Hex',        freqX: 5, freqY: 6, phase: 0 },
  { name: 'Sept',       freqX: 5, freqY: 7, phase: Math.PI / 8 },
  { name: 'Octant',     freqX: 7, freqY: 8, phase: 0 },
  { name: 'Enneagon',   freqX: 7, freqY: 9, phase: Math.PI / 10 },
  { name: 'Decagon',    freqX: 9, freqY: 10, phase: 0 },
];

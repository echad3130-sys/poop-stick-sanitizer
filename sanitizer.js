// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// sanitizer.js — Main Pipeline Orchestrator

import { checkSinkhole } from './layer1-sinkhole.js';
import { stripParams } from './layer2-param-strip.js';
import { appendTag, generateSourceTag } from './layer3-tagger.js';
import { buildCatalogItem, buildAdPayload, buildCreativeVariant } from './layer4-meta-upload.js';

/**
 * Run a single URL through the full sanitization pipeline.
 *
 * Pipeline: Layer 1 (Sinkhole) → Layer 2 (Strip) → Layer 3 (Tag) → Layer 4 (Meta)
 *
 * @param {string} urlString - Raw input URL
 * @param {{
 *   title?: string,
 *   imageUrl?: string,
 *   price?: string,
 *   brand?: string,
 *   platform?: string
 * }} [productMeta] - Optional product metadata for Layer 4
 * @returns {{
 *   input: string,
 *   sinkhole: Object,
 *   sanitized: Object | null,
 *   tagged: Object | null,
 *   metaPayload: Object | null,
 *   logs: string[],
 *   blocked: boolean,
 *   timestamp: string
 * }}
 */
export function sanitize(urlString, productMeta) {
  const logs = [];
  const ts = new Date().toISOString();

  // --- Layer 1: Sinkhole Check ---
  const sinkholeResult = checkSinkhole(urlString);
  logs.push(sinkholeResult.logEntry);

  if (sinkholeResult.blocked) {
    return {
      input: urlString,
      sinkhole: sinkholeResult,
      sanitized: null,
      tagged: null,
      metaPayload: null,
      logs,
      blocked: true,
      timestamp: ts
    };
  }

  // --- Layer 2: Param Stripping ---
  const stripResult = stripParams(urlString);
  logs.push(stripResult.logEntry);

  // --- Layer 3: Anigravity Tag ---
  const tagResult = appendTag(stripResult.cleanUrl);
  logs.push(tagResult.logEntry);

  // --- Layer 4: Meta Payload (if product metadata provided) ---
  let metaResult = null;
  if (productMeta) {
    const catalogItem = buildCatalogItem({
      title: productMeta.title || 'Untitled Product',
      cleanUrl: tagResult.taggedUrl,
      imageUrl: productMeta.imageUrl || '',
      price: productMeta.price || '0.00 USD',
      brand: productMeta.brand || sinkholeResult.domain,
      sourcePost: urlString,
      platform: productMeta.platform || tagResult.platform
    });

    metaResult = buildAdPayload([catalogItem]);
    logs.push(metaResult.logEntry);
  }

  return {
    input: urlString,
    sinkhole: sinkholeResult,
    sanitized: stripResult,
    tagged: tagResult,
    metaPayload: metaResult,
    logs,
    blocked: false,
    timestamp: ts
  };
}

/**
 * Process multiple URLs through the pipeline.
 *
 * @param {string[]} urls - Array of raw URLs
 * @returns {Array<Object>} Array of sanitize() results
 */
export function sanitizeBatch(urls) {
  return urls.map(url => sanitize(url.trim())).filter(Boolean);
}

/**
 * Format a pipeline result as a terminal-style HUD log block.
 *
 * @param {Object} result - Output from sanitize()
 * @returns {string} Formatted log block
 */
export function printHudLog(result) {
  const lines = [
    `╔══════════════════════════════════════════════════════╗`,
    `║  INPUT: ${result.input.slice(0, 46).padEnd(46)}║`,
    `╠══════════════════════════════════════════════════════╣`,
  ];

  for (const log of result.logs) {
    lines.push(`║  ${log.padEnd(52)}║`);
  }

  if (result.blocked) {
    lines.push(`║  ❌ BLOCKED — ${result.sinkhole.reason.padEnd(38)}║`);
  } else {
    lines.push(`║  ✅ CLEAN: ${(result.tagged?.taggedUrl || '').slice(0, 41).padEnd(41)}║`);
  }

  lines.push(`╚══════════════════════════════════════════════════════╝`);
  return lines.join('\n');
}

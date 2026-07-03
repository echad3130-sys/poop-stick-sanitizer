// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// layer2-param-strip.js — Tracking Parameter Stripping Engine

import {
  TRACKING_PARAM_REGEX,
  DOMAIN_SPECIFIC_PARAMS,
  PRESERVED_PARAMS
} from './config.js';

/**
 * Format a timestamp as HH:MM:SS
 * @returns {string}
 */
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Get the base domain from a hostname for domain-specific param matching.
 * @param {string} hostname
 * @returns {string}
 */
function getBaseDomain(hostname) {
  const parts = hostname.replace(/\.$/, '').split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

/**
 * Check if a parameter should be stripped.
 * Tests against the master regex, domain-specific lists, and preservation list.
 *
 * @param {string} paramName - The query parameter name
 * @param {string} hostname - The URL's hostname
 * @returns {boolean} true if the param should be stripped
 */
function shouldStrip(paramName, hostname) {
  // Never strip preserved params
  if (PRESERVED_PARAMS.includes(paramName.toLowerCase())) {
    return false;
  }

  // Check master regex (universal tracking params)
  if (TRACKING_PARAM_REGEX.test(paramName)) {
    return true;
  }

  // Check domain-specific params
  const baseDomain = getBaseDomain(hostname);
  const domainParams = DOMAIN_SPECIFIC_PARAMS[baseDomain];
  if (domainParams && domainParams.includes(paramName)) {
    return true;
  }

  return false;
}

/**
 * Strip tracking parameters from a URL.
 *
 * Layer 2 processing:
 *   1. Parse URL
 *   2. Test each query param against TRACKING_PARAM_REGEX
 *   3. Apply domain-specific stripping rules
 *   4. Preserve legitimate params (variant, size, color, v, etc.)
 *   5. Reconstruct clean URL
 *
 * @param {string} urlString - The URL to sanitize
 * @returns {{
 *   cleanUrl: string,
 *   strippedParams: Array<{name: string, value: string}>,
 *   strippedCount: number,
 *   preservedParams: Array<{name: string, value: string}>,
 *   timestamp: string,
 *   logEntry: string
 * }}
 */
export function stripParams(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return {
      cleanUrl: urlString,
      strippedParams: [],
      strippedCount: 0,
      preservedParams: [],
      timestamp: new Date().toISOString(),
      logEntry: `[${timestamp()}] DEFENSE: unknown STRIP_FAILED — invalid URL`
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const stripped = [];
  const preserved = [];

  // Collect all params, then rebuild
  const allParams = Array.from(parsed.searchParams.entries());

  // Clear existing params
  parsed.search = '';

  for (const [name, value] of allParams) {
    if (shouldStrip(name, hostname)) {
      stripped.push({ name, value });
    } else {
      preserved.push({ name, value });
      parsed.searchParams.set(name, value);
    }
  }

  // Remove trailing ? if no params remain
  let cleanUrl = parsed.toString();
  if (cleanUrl.endsWith('?')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  const strippedNames = stripped.map(p => p.name).join(', ');
  const logDetail = stripped.length > 0
    ? `${stripped.length} params stripped: ${strippedNames}`
    : 'no tracking params found';

  return {
    cleanUrl,
    strippedParams: stripped,
    strippedCount: stripped.length,
    preservedParams: preserved,
    timestamp: new Date().toISOString(),
    logEntry: `[${timestamp()}] DEFENSE: ${hostname} SANITIZED — ${logDetail}`
  };
}

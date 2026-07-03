// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// layer1-sinkhole.js — DNS Sinkhole / Domain Blocker

import { SINKHOLE_DOMAINS, PHISHING_PATH_PATTERNS } from './config.js';

/**
 * Format a timestamp as HH:MM:SS
 * @returns {string}
 */
function timestamp() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

/**
 * Format a HUD log entry.
 * @param {string} action - SINKHOLED | PASSED | PHISHING_BLOCKED
 * @param {string} domain - The domain being checked
 * @param {string} detail - Human-readable detail
 * @returns {string}
 */
export function formatLog(action, domain, detail) {
  return `[${timestamp()}] DEFENSE: ${domain} ${action} — ${detail}`;
}

/**
 * Extract the registrable domain from a hostname.
 * e.g. 'sub.gieset.org' → 'gieset.org'
 * @param {string} hostname
 * @returns {string}
 */
function getBaseDomain(hostname) {
  const parts = hostname.replace(/\.$/, '').split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

/**
 * Check if a URL should be sinkholed (blocked).
 *
 * Layer 1 checks:
 *   1. Domain against SINKHOLE_DOMAINS (including subdomains)
 *   2. URL path against PHISHING_PATH_PATTERNS
 *
 * @param {string} urlString - The raw URL to check
 * @returns {{
 *   blocked: boolean,
 *   reason: 'sinkhole_domain' | 'phishing_path' | 'clean',
 *   domain: string,
 *   fullUrl: string,
 *   timestamp: string,
 *   logEntry: string
 * }}
 */
export function checkSinkhole(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return {
      blocked: true,
      reason: 'invalid_url',
      domain: 'unknown',
      fullUrl: urlString,
      timestamp: new Date().toISOString(),
      logEntry: formatLog('BLOCKED', 'unknown', `invalid URL: ${urlString.slice(0, 60)}`)
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const baseDomain = getBaseDomain(hostname);

  // Check 1: Is the domain in the sinkhole list?
  const isSinkholed = SINKHOLE_DOMAINS.some(blocked => {
    return hostname === blocked || hostname.endsWith('.' + blocked);
  });

  if (isSinkholed) {
    return {
      blocked: true,
      reason: 'sinkhole_domain',
      domain: hostname,
      fullUrl: urlString,
      timestamp: new Date().toISOString(),
      logEntry: formatLog('SINKHOLED', hostname, 'redirect/tracking domain blocked')
    };
  }

  // Check 2: Does the URL path match phishing patterns?
  const phishingMatch = PHISHING_PATH_PATTERNS.find(pattern => pattern.test(parsed.pathname));
  if (phishingMatch) {
    return {
      blocked: true,
      reason: 'phishing_path',
      domain: hostname,
      fullUrl: urlString,
      timestamp: new Date().toISOString(),
      logEntry: formatLog('PHISHING_BLOCKED', hostname, `suspicious path pattern: ${parsed.pathname.slice(0, 40)}`)
    };
  }

  // Clean — passed all checks
  return {
    blocked: false,
    reason: 'clean',
    domain: hostname,
    fullUrl: urlString,
    timestamp: new Date().toISOString(),
    logEntry: formatLog('PASSED', hostname, 'domain cleared')
  };
}

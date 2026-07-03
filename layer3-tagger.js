// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// layer3-tagger.js — Anigravity Attribution Tag Appender

import { ANIGRAVITY_TAG, PLATFORM_TAGS } from './config.js';

/**
 * Format a timestamp as HH:MM:SS
 * @returns {string}
 */
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Detect the platform from a URL hostname and return the appropriate tag.
 *
 * @param {string} hostname - The URL's hostname
 * @returns {string} Platform-specific Anigravity tag
 */
export function generateSourceTag(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');

  // Check exact domain match first
  if (PLATFORM_TAGS[host]) {
    return PLATFORM_TAGS[host];
  }

  // Check if hostname ends with a known domain
  for (const [domain, tag] of Object.entries(PLATFORM_TAGS)) {
    if (host === domain || host.endsWith('.' + domain)) {
      return tag;
    }
  }

  return ANIGRAVITY_TAG;
}

/**
 * Append an Anigravity attribution tag to a clean URL.
 *
 * Layer 3 processing:
 *   1. Auto-detect platform from URL domain
 *   2. Select platform-specific tag (or use custom tag)
 *   3. Append as utm_content parameter
 *
 * @param {string} cleanUrl - Already-sanitized URL from Layer 2
 * @param {string} [customTag] - Override the auto-detected tag
 * @returns {{
 *   taggedUrl: string,
 *   tag: string,
 *   platform: string,
 *   timestamp: string,
 *   logEntry: string
 * }}
 */
export function appendTag(cleanUrl, customTag) {
  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return {
      taggedUrl: cleanUrl,
      tag: '',
      platform: 'unknown',
      timestamp: new Date().toISOString(),
      logEntry: `[${timestamp()}] ANIGRAVITY: TAG_FAILED — invalid URL`
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const tag = customTag || generateSourceTag(hostname);

  // Append the tag
  parsed.searchParams.set('utm_content', tag);

  return {
    taggedUrl: parsed.toString(),
    tag,
    platform: hostname,
    timestamp: new Date().toISOString(),
    logEntry: `[${timestamp()}] ANIGRAVITY: Tagged → utm_content=${tag}`
  };
}

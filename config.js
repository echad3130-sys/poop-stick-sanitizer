// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// config.js — Central Configuration

/**
 * Domains that get sinkholed (blocked at perimeter).
 * These are redirect/tracking domains, NOT final destinations.
 * @type {string[]}
 */
export const SINKHOLE_DOMAINS = [
  'gieset.org',
  'go.mediagotechnology.com',
  'equvaxiw.sbs',           // malware landing page (YouTube ad overlay scam)
  'omokeh.org',             // redirect tracker found in equvaxiw.sbs trkd param
  'prf.hn',                 // Partnerize affiliate redirect (Expedia, etc.)
  'bit.ly',
  'tinyurl.com',
  'ow.ly',
  'rb.gy',
  'shorturl.at',
  'cutt.ly',
  'is.gd',
  'v.gd',
  'shorte.st',
  'adf.ly'
];

/**
 * Top-level domains commonly used for scam/phishing/malware.
 * Any URL with these TLDs triggers an automatic sinkhole.
 * @type {string[]}
 */
export const DANGEROUS_TLDS = [
  '.sbs',       // scam/phishing favorite
  '.xyz',       // high abuse rate (check context)
  '.top',       // high abuse rate
  '.buzz',      // spam/scam
  '.cfd',       // cloudflare-abused scam TLD
  '.icu',       // scam/phishing
  '.rest',      // scam/phishing
  '.beauty',    // scam ads
  '.hair',      // scam ads
  '.skin'       // scam ads
];

/**
 * URL path patterns that indicate phishing/credential harvesting.
 * If any of these match the URL path, the URL is blocked regardless of domain.
 * @type {RegExp[]}
 */
export const PHISHING_PATH_PATTERNS = [
  /\/checkpoint\//i,
  /\/confirm\//i,
  /\/verify\//i,
  /\/login\//i,
  /\/auth\//i,
  /\/secure\//i,
  /\/account\/recover/i
];

/**
 * Domains allowed through the sinkhole. These are real product/content sites.
 * @type {string[]}
 */
export const WHITELIST_DOMAINS = [
  'urbanbrim.com',
  'royaura.com',
  'meta.ai',
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'grok.com',
  'twitch.tv',
  'gemini.google',
  'amazon.com'
];

/**
 * Master regex for universal tracking parameters.
 * Matches: ALL utm_* (source, medium, campaign, content, term, id, adgroup, banner, etc.),
 * fbclid, gclid, dclid, msclkid, twclid, ttclid, clickid,
 * IRID, _ga, _gl, mc_cid, mc_eid, yclid, _openstat, ref, referrer, tracking_id,
 * Google Ads: gad_source, gad_campaignid, wbraid, gbraid,
 * Attribution platforms: singular_click_id, sl_id, pcn, adjust_*, branch_*,
 * Mobile redirects: _fallback_redirect, android_dl, deeplink,
 * plus the 8 custom Urban Brim obfuscated params.
 * @type {RegExp}
 */
export const TRACKING_PARAM_REGEX = /^(utm_\w+|fbclid|gclid|dclid|msclkid|twclid|ttclid|clickid|IRID|_ga|_gl|mc_[ce]id|yclid|_openstat|ref|referrer|tracking_id|gad_\w+|wbraid|gbraid|singular_click_id|sl_id|pcn|_fallback_redirect|android_dl|deeplink|adjust_\w+|branch_\w+|af_\w+|mfadid|adid|admclid|partner|veh|camref|creativeref|pubref|ir_\w+|irgwc|afsrc|sharedid|sid|cc4d76fdaf5|a0v5la7bquf89|uy3ubftvh0u6o8|cusduxj27i|xnfrr0ncac|zsmoi87pih9|lzzgnpz8d|Q09ORklH|igshid|share_id|share_source|share_app_id)$/i;

/**
 * Domain-specific tracking params. Only stripped when the URL matches the domain.
 * Prevents false positives (e.g. stripping 's' from a URL where it means 'size').
 * @type {Object<string, string[]>}
 */
export const DOMAIN_SPECIFIC_PARAMS = {
  'x.com':        ['s'],
  'twitter.com':  ['s'],
  'youtube.com':  ['si', 'feature'],
  'youtu.be':     ['si', 'feature'],
  'facebook.com': ['app_id', 'display', 'next'],
  'pinterest.com': ['share_source'],
  'tiktok.com':   ['enter_method', 'enter_from', 'source', 'sender_device', 'is_from_webapp', 'share_item_id', 'share_app_id'],
  'amazon.com':   ['aref', 'tag', 'linkCode', 'linkId', 'ref_', 'pd_rd_i', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pf_rd_i', 'pf_rd_m', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'cv_ct_cx', 'content-id', 'dib', 'dib_tag', 'sprefix', 'crid', 'aaxitk'],
  'walmart.com':  ['wmlspartner', 'wl0', 'wl1', 'wl2', 'wl3', 'wl4', 'wl5', 'wl6', 'wl7', 'wl8', 'wl9', 'wl10', 'wl11', 'wl12', 'wl13'],
  'accuweather.com': ['partner'],
  'google.com':   ['client', 'fbs', 'aep', 'ntc', 'mstk', 'aioh', 'csuir', 'mtid', 'ei', 'ved', 'uact', 'gs_l', 'gs_lcrp', 'sclient', 'sourceid', 'oq', 'sca_esv', 'sxsrf', 'udm'],
};

/**
 * Params that must NEVER be stripped regardless of regex match.
 * These are legitimate product/content params.
 * @type {string[]}
 */
export const PRESERVED_PARAMS = [
  'v',          // YouTube video ID
  'id',         // generic content ID
  'variant',    // product variant
  'size',       // product size
  'color',      // product color
  'q',          // search query
  'p',          // page number
  'page',       // page number
  'sort',       // sort order
  'list',       // YouTube playlist
  't',          // timestamp
  'start',      // start time
  'end'         // end time
];

/**
 * Default Anigravity attribution tag.
 * @type {string}
 */
export const ANIGRAVITY_TAG = 'anigravity_dark_grok';

/**
 * Platform-specific Anigravity tags.
 * @type {Object<string, string>}
 */
export const PLATFORM_TAGS = {
  'x.com':        'anigravity_dark_x',
  'twitter.com':  'anigravity_dark_x',
  'youtube.com':  'anigravity_dark_yt',
  'youtu.be':     'anigravity_dark_yt',
  'pinterest.com':'anigravity_dark_pin',
  'facebook.com': 'anigravity_dark_fb',
  'instagram.com':'anigravity_dark_ig',
  'tiktok.com':   'anigravity_dark_tt',
  'twitch.tv':    'anigravity_dark_twitch'
};

/**
 * Meta Ads API default campaign settings.
 * @type {Object}
 */
export const META_DEFAULTS = {
  campaign_budget_optimization: true,
  daily_budget_cents: 10000,         // $100/day
  placements: 'advantage_plus',
  cpa_pause_threshold_cents: 1500,   // €15 CPA pause rule
  cpa_currency: 'EUR',
  attribution_setting: '7d_click_1d_view',
  objective: 'OUTCOME_SALES'
};

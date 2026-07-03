// Poop Stick Kingdom Link Sanitizer v1.0 — Defense Module
// layer4-meta-upload.js — Meta Ads API Upload Scaffold

import { META_DEFAULTS } from './config.js';

/**
 * Format a timestamp as HH:MM:SS
 * @returns {string}
 */
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Generate a deterministic item ID from URL + title.
 * @param {string} url
 * @param {string} title
 * @returns {string}
 */
function generateItemId(url, title) {
  const slug = (title || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  const hash = Array.from(url)
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    .toString(36)
    .replace('-', 'n');
  return `psk_${slug}_${hash}`;
}

/**
 * Build a single Meta Product Catalog item.
 *
 * @param {{
 *   title: string,
 *   cleanUrl: string,
 *   imageUrl?: string,
 *   price?: string,
 *   brand?: string,
 *   availability?: string,
 *   sourcePost?: string,
 *   platform?: string
 * }} productMeta
 * @returns {Object} Meta catalog item
 */
export function buildCatalogItem(productMeta) {
  const {
    title,
    cleanUrl,
    imageUrl = '',
    price = '0.00 USD',
    brand = 'Unknown',
    availability = 'in stock',
    sourcePost = '',
    platform = ''
  } = productMeta;

  return {
    id: generateItemId(cleanUrl, title),
    title,
    description: `${title} — sourced via Poop Stick Kingdom pipeline`,
    link: cleanUrl,
    image_link: imageUrl,
    price,
    availability,
    condition: 'new',
    brand,
    custom_label_0: platform,          // source platform
    custom_label_1: 'anigravity',      // pipeline marker
    custom_label_2: sourcePost ? sourcePost.slice(0, 100) : ''
  };
}

/**
 * Build a creative variant from base content.
 *
 * @param {string} baseHeadline - Original product/post title
 * @param {number} variantIndex - Variant number (0-49)
 * @param {{
 *   aesthetic?: string,
 *   persona?: string,
 *   tag?: string
 * }} [config]
 * @returns {Object} Creative variant
 */
export function buildCreativeVariant(baseHeadline, variantIndex, config = {}) {
  const {
    aesthetic = 'Belgian brick street, golden hour',
    persona = 'comedy-to-edge',
    tag = 'anigravity_dark_grok'
  } = config;

  const hooks = [
    'You need this.',
    'Stop scrolling.',
    'This changes everything.',
    'Your wardrobe called.',
    'Found it.',
    'You\'re welcome.',
    'This is the one.',
    'No caption needed.',
    'Main character energy.',
    'Built different.'
  ];

  const ctas = [
    'SHOP_NOW',
    'LEARN_MORE',
    'GET_OFFER',
    'SHOP_NOW',
    'SIGN_UP'
  ];

  return {
    variant_id: `v${String(variantIndex).padStart(3, '0')}`,
    headline: `${hooks[variantIndex % hooks.length]} ${baseHeadline}`,
    body: `${baseHeadline} — ${aesthetic} | ${persona} angle #${variantIndex + 1}`,
    call_to_action: ctas[variantIndex % ctas.length],
    tracking_specs: {
      utm_content: tag,
      variant: `v${variantIndex}`
    },
    overlay_metadata: {
      aesthetic,
      persona_shift: persona,
      highway_ref: 'highway-two-7334'
    }
  };
}

/**
 * Build the full Meta Marketing API batch upload payload.
 *
 * @param {Object[]} catalogItems - Array of catalog items from buildCatalogItem()
 * @param {string} [campaignName] - Campaign name override
 * @returns {{
 *   payload: Object,
 *   timestamp: string,
 *   logEntry: string
 * }}
 */
export function buildAdPayload(catalogItems, campaignName) {
  const name = campaignName || `Anigravity_Dark_${new Date().toISOString().slice(0, 10)}`;

  const payload = {
    // ⚠️  PLACEHOLDER — replace with your actual credentials before going live
    access_token: 'YOUR_META_ACCESS_TOKEN_HERE',
    catalog_id: 'YOUR_CATALOG_ID_HERE',

    // Campaign config
    campaign: {
      name,
      objective: META_DEFAULTS.objective,
      special_ad_categories: [],
      buying_type: 'AUCTION',
      budget_optimization: {
        campaign_budget_optimization: META_DEFAULTS.campaign_budget_optimization,
        daily_budget: META_DEFAULTS.daily_budget_cents,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
      }
    },

    // Ad set config
    adset: {
      name: `${name}_AdSet`,
      targeting: {
        // Advantage+ handles targeting automatically
        advantage_plus: true
      },
      placements: META_DEFAULTS.placements,
      attribution_spec: META_DEFAULTS.attribution_setting,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS'
    },

    // Automated rules
    rules: [
      {
        name: 'CPA Pause Guard',
        evaluation_spec: {
          evaluation_type: 'SCHEDULE',
          trigger: {
            type: 'STATS_CHANGE',
            field: 'cost_per_action_type:offsite_conversion',
            value: META_DEFAULTS.cpa_pause_threshold_cents,
            operator: 'GREATER_THAN'
          }
        },
        execution_spec: {
          execution_type: 'PAUSE_CAMPAIGN'
        }
      }
    ],

    // Product catalog items
    catalog_items: catalogItems,

    // Batch metadata
    batch_metadata: {
      pipeline: 'poop_stick_kingdom_v1',
      generated_at: new Date().toISOString(),
      item_count: catalogItems.length
    }
  };

  return {
    payload,
    timestamp: new Date().toISOString(),
    logEntry: `[${timestamp()}] META: Upload payload built — ${catalogItems.length} items, CBO $${META_DEFAULTS.daily_budget_cents / 100}/day, Advantage+ armed`
  };
}

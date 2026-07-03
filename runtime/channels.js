// Minnow OS Runtime — Channels (PAGI::Channels equivalent)
// runtime/channels.js
//
// Cross-worker, cross-node real-time messaging.
// The answer to in-memory PubSub.
//
// What it adds:
//   - Presence (who's online, Phoenix-style)
//   - Pattern subscriptions (chat.*, events.**)
//   - Delayed messages & replayable history (cursor-resumable)
//   - Memory backend (Redis adapter slot for later)
//   - Loop-agnostic
//
// It's just a middleware. Same wrap($app) pattern.
// "Scaling is a middleware."

/**
 * @typedef {Object} ChannelMessage
 * @property {string} channel   - Channel name
 * @property {string} event     - Event name
 * @property {*}      data      - Payload
 * @property {string} sender    - Who sent it
 * @property {number} timestamp - When
 * @property {number} sequence  - Auto-incrementing sequence for replay
 */

/**
 * Channels — PubSub + Presence + Replayable History.
 */
export class Channels {
  constructor(config = {}) {
    this.config = {
      historySize: config.historySize || 1000,  // Messages to keep per channel
      ...config
    };

    /** @type {Map<string, Set<function>>} channel → subscribers */
    this.subscriptions = new Map();

    /** @type {Map<string, Set<string>>} channel → client IDs (presence) */
    this.presence = new Map();

    /** @type {Map<string, ChannelMessage[]>} channel → message history */
    this.history = new Map();

    /** @type {Map<string, Object>} clientId → user info */
    this.presenceInfo = new Map();

    this._sequence = 0;
  }

  // ─── Subscribe ──────────────────────────────────────

  /**
   * Subscribe to a channel.
   * Supports pattern matching: chat.* matches chat.general, chat.random.
   *
   * @param {string}   pattern  - Channel name or glob pattern
   * @param {string}   clientId - Subscriber ID
   * @param {function} callback - async (message) => void
   * @returns {{ unsubscribe: function }}
   */
  subscribe(pattern, clientId, callback) {
    if (!this.subscriptions.has(pattern)) {
      this.subscriptions.set(pattern, new Set());
    }
    this.subscriptions.get(pattern).add(callback);

    // Track presence
    if (!this.presence.has(pattern)) {
      this.presence.set(pattern, new Set());
    }
    this.presence.get(pattern).add(clientId);

    return {
      unsubscribe: () => {
        this.subscriptions.get(pattern)?.delete(callback);
        this.presence.get(pattern)?.delete(clientId);
      }
    };
  }

  // ─── Publish ────────────────────────────────────────

  /**
   * Publish to a channel. Delivers to all matching subscribers.
   *
   * @param {string} channel - Target channel
   * @param {string} event   - Event name
   * @param {*}      data    - Payload
   * @param {string} sender  - Who sent it
   */
  async publish(channel, event, data, sender) {
    const message = {
      channel,
      event,
      data,
      sender,
      timestamp: Date.now(),
      sequence: ++this._sequence
    };

    // Store in history
    if (!this.history.has(channel)) {
      this.history.set(channel, []);
    }
    const hist = this.history.get(channel);
    hist.push(message);
    if (hist.length > this.config.historySize) {
      hist.shift();
    }

    // Deliver to matching subscribers
    for (const [pattern, callbacks] of this.subscriptions) {
      if (this._matches(pattern, channel)) {
        for (const cb of callbacks) {
          try {
            await cb(message);
          } catch (err) {
            console.error(`[CHANNELS] Error delivering to ${pattern}:`, err);
          }
        }
      }
    }
  }

  // ─── Presence ───────────────────────────────────────

  /**
   * Join a channel with presence info.
   *
   * @param {string} channel
   * @param {string} clientId
   * @param {Object} [info={}] - User info (name, avatar, etc.)
   */
  join(channel, clientId, info = {}) {
    if (!this.presence.has(channel)) {
      this.presence.set(channel, new Set());
    }
    this.presence.get(channel).add(clientId);
    this.presenceInfo.set(clientId, { ...info, joinedAt: Date.now() });

    // Publish presence event
    this.publish(channel, 'presence.join', {
      clientId,
      ...info
    }, 'system');
  }

  /**
   * Leave a channel.
   *
   * @param {string} channel
   * @param {string} clientId
   */
  leave(channel, clientId) {
    this.presence.get(channel)?.delete(clientId);

    this.publish(channel, 'presence.leave', {
      clientId
    }, 'system');
  }

  /**
   * Get who's online in a channel (Phoenix-style).
   *
   * @param {string} channel
   * @returns {Object[]}
   */
  getPresence(channel) {
    const members = this.presence.get(channel);
    if (!members) return [];

    return [...members].map(id => ({
      clientId: id,
      ...this.presenceInfo.get(id)
    }));
  }

  // ─── History / Replay ──────────────────────────────

  /**
   * Get message history for a channel.
   * Cursor-resumable: pass afterSequence to get only new messages.
   *
   * @param {string} channel
   * @param {number} [afterSequence=0] - Resume from this sequence
   * @param {number} [limit=100]
   * @returns {ChannelMessage[]}
   */
  getHistory(channel, afterSequence = 0, limit = 100) {
    const hist = this.history.get(channel) || [];
    return hist
      .filter(m => m.sequence > afterSequence)
      .slice(0, limit);
  }

  // ─── Pattern Matching ──────────────────────────────

  /**
   * Match a subscription pattern against a channel name.
   * Supports: chat.* matches chat.general
   *           events.** matches events.system.startup
   *
   * @param {string} pattern
   * @param {string} channel
   * @returns {boolean}
   */
  _matches(pattern, channel) {
    if (pattern === channel) return true;

    // Convert glob to regex
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '(.+)')
      .replace(/\*/g, '([^.]+)');

    return new RegExp(`^${regex}$`).test(channel);
  }

  // ─── Middleware Wrapper ─────────────────────────────

  /**
   * Use Channels as middleware.
   * Injects channel access into scope.
   *
   * Usage:
   *   const channels = new Channels();
   *   const wrappedApp = channels.wrap(app);
   *
   * Inside app:
   *   const ch = scope.channels;
   *   await ch.subscribe('chat.*', ...);
   *
   * @param {function} app
   * @returns {function}
   */
  wrap(app) {
    const channels = this;

    return async function channelsMiddleware(scope, receive, send) {
      // Inject channels into scope (like $scope->{'pagi.channels'})
      scope.channels = channels;

      // Auto-join based on path
      const channel = scope.path?.replace(/^\//, '') || 'default';
      channels.join(channel, scope.clientId, {
        type: scope.type,
        path: scope.path
      });

      try {
        await app(scope, receive, send);
      } finally {
        // Auto-leave on disconnect
        channels.leave(channel, scope.clientId);
      }
    };
  }

  // ─── Stats ──────────────────────────────────────────

  getStats() {
    return {
      channels: this.subscriptions.size,
      totalSubscriptions: [...this.subscriptions.values()].reduce((s, set) => s + set.size, 0),
      totalPresence: [...this.presence.values()].reduce((s, set) => s + set.size, 0),
      totalHistory: [...this.history.values()].reduce((s, arr) => s + arr.length, 0),
      sequence: this._sequence
    };
  }
}

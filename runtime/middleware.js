// Minnow OS Runtime — Middleware
// runtime/middleware.js
//
// A middleware is an app that wraps an app.
// Same contract: async function(scope, receive, send)
//
// wrap(app) → new app
//
// "One contract, every layer":
//   An application — is that contract
//   A middleware — an app that wraps an app
//   A framework — apps, assembled
//   Scaling out — a middleware
//   Beyond the web — just a new event source

/**
 * Compose middleware around an app.
 * Each middleware is a function: (app) => wrappedApp
 * Applied right-to-left (innermost first).
 *
 * @param {function} app         - The inner application
 * @param {...function} wrappers - Middleware wrappers
 * @returns {function}           - The fully wrapped app
 */
export function compose(app, ...wrappers) {
  return wrappers.reduceRight((inner, wrapper) => wrapper(inner), app);
}

// ─── Logger Middleware ────────────────────────────────────────

/**
 * Logs before/after each request.
 *
 * @param {function} app
 * @returns {function}
 */
export function logger(app) {
  return async function loggerMiddleware(scope, receive, send) {
    const start = Date.now();
    console.log(`[LOG] → ${scope.method} ${scope.path} (${scope.type}) [${scope.clientId}]`);

    await app(scope, receive, send);

    const elapsed = Date.now() - start;
    console.log(`[LOG] ← ${scope.method} ${scope.path} ${elapsed}ms`);
  };
}

// ─── Metrics Middleware ───────────────────────────────────────

/**
 * Records request timing and status.
 *
 * @param {Object} [store] - Metrics store (default: in-memory)
 * @returns {function}     - Middleware wrapper
 */
export function metrics(store = null) {
  const _store = store || {
    requests: 0,
    totalMs: 0,
    errors: 0,
    byScopeType: {},
    getStats() {
      return {
        requests: this.requests,
        avgMs: this.requests ? (this.totalMs / this.requests).toFixed(1) : 0,
        errors: this.errors,
        byScopeType: { ...this.byScopeType }
      };
    }
  };

  function wrapper(app) {
    return async function metricsMiddleware(scope, receive, send) {
      _store.requests++;
      _store.byScopeType[scope.type] = (_store.byScopeType[scope.type] || 0) + 1;

      const start = Date.now();
      try {
        await app(scope, receive, send);
      } catch (err) {
        _store.errors++;
        throw err;
      } finally {
        _store.totalMs += Date.now() - start;
      }
    };
  }

  wrapper.store = _store;
  return wrapper;
}

// ─── Reflection Middleware ────────────────────────────────────

import { createFragment, FragmentQueue } from './reflection-loop.js';

/**
 * Reflection middleware — wraps receive() to create fragments
 * and validate coherence before passing to the app.
 *
 * The app never sees raw events. It sees validated fragments.
 *
 * @param {Object} [config]
 * @returns {function}
 */
export function reflection(config = {}) {
  const queues = new Map();

  return function reflectionWrapper(app) {
    return async function reflectionMiddleware(scope, receive, send) {
      // Get or create fragment queue for this connection
      let queue = queues.get(scope.clientId);
      if (!queue) {
        queue = new FragmentQueue(scope.clientId);
        queues.set(scope.clientId, queue);
      }

      let version = 0;

      // Wrap receive() — fragment + reflect before passing through
      const reflectedReceive = async function () {
        const event = await receive();

        // Create fragment from raw event
        const fragment = createFragment(
          scope.clientId,
          event.type,
          event.body || event,
          version++
        );

        // Process through reflection loop
        const result = await queue.enqueue(fragment);

        if (!result.accepted) {
          // Log but don't block — the app gets the event
          // but MAST will gate the commit
          console.warn(
            `[REFLECT] ⚠️ Fragment ${fragment.id} from ${scope.clientId}: ` +
            `${result.action} (coherence: ${result.coherence.toFixed(3)})`
          );
        }

        // Attach reflection metadata to the event
        event._reflection = {
          fragmentId: fragment.id,
          coherence: result.coherence,
          action: result.action,
          accepted: result.accepted
        };

        return event;
      };

      await app(scope, reflectedReceive, send);

      // Cleanup on disconnect
      if (scope.type === 'http') {
        queues.delete(scope.clientId);
      }
    };
  };
}

// ─── MAST Middleware ──────────────────────────────────────────

import { Mast } from './mast.js';

/**
 * MAST middleware — wraps send() to gate commits through coherence scoring.
 *
 * @param {Mast} [mastInstance]
 * @returns {function}
 */
export function mastGate(mastInstance = null) {
  const mast = mastInstance || new Mast();

  function wrapper(app) {
    return async function mastMiddleware(scope, receive, send) {
      // Wrap send() — gate through MAST before sending
      const gatedSend = async function (event) {
        // Response events always pass (they're outbound, not state changes)
        if (event.type?.startsWith('http.response') ||
            event.type?.startsWith('sse.') ||
            event.type?.startsWith('ws.')) {
          return send(event);
        }

        // State-changing events go through MAST
        // (Custom event types like agent.*, queue.*, etc.)
        const fragment = createFragment(
          scope.clientId,
          event.type,
          event,
          Date.now()
        );

        const result = mast.processFragment(fragment, {
          lastTimestamp: null,
          expectedVersion: 0,
          nodeHistory: {}
        });

        if (result.committed) {
          return send(event);
        }

        console.warn(
          `[MAST] ⛔ Blocked send from ${scope.clientId}: ` +
          `${result.action} (coherence: ${result.coherence.toFixed(3)})`
        );
      };

      await app(scope, receive, gatedSend);
    };
  }

  wrapper.mast = mast;
  return wrapper;
}

// ─── Auth Middleware ──────────────────────────────────────────

/**
 * Simple auth middleware — checks for a token in headers.
 *
 * @param {function} verifyToken - async (token) => user|null
 * @returns {function}
 */
export function auth(verifyToken) {
  return function authWrapper(app) {
    return async function authMiddleware(scope, receive, send) {
      // Extract token from headers
      const authHeader = Array.isArray(scope.headers)
        ? scope.headers.find(([k]) => k.toLowerCase() === 'authorization')?.[1]
        : scope.headers?.authorization;

      if (!authHeader) {
        await send({ type: 'http.response.start', status: 401, headers: [] });
        await send({ type: 'http.response.body', body: 'Unauthorized', more: 0 });
        return;
      }

      const token = authHeader.replace(/^Bearer\s+/i, '');
      const user = await verifyToken(token);

      if (!user) {
        await send({ type: 'http.response.start', status: 403, headers: [] });
        await send({ type: 'http.response.body', body: 'Forbidden', more: 0 });
        return;
      }

      // Attach user to scope
      scope.user = user;
      await app(scope, receive, send);
    };
  };
}

// ─── Rate Limiter Middleware ──────────────────────────────────

/**
 * Simple rate limiter.
 *
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs   - Window in ms
 * @returns {function}
 */
export function rateLimit(maxRequests = 100, windowMs = 60000) {
  const clients = new Map();

  return function rateLimitWrapper(app) {
    return async function rateLimitMiddleware(scope, receive, send) {
      const now = Date.now();
      let record = clients.get(scope.clientId);

      if (!record || now - record.windowStart > windowMs) {
        record = { windowStart: now, count: 0 };
        clients.set(scope.clientId, record);
      }

      record.count++;

      if (record.count > maxRequests) {
        await send({ type: 'http.response.start', status: 429, headers: [] });
        await send({ type: 'http.response.body', body: 'Too Many Requests', more: 0 });
        return;
      }

      await app(scope, receive, send);
    };
  };
}

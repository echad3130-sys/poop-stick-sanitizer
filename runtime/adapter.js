// Minnow OS Runtime — Adapter Interface (PAGI-style)
// runtime/adapter.js
//
// The ENTIRE contract:
//   async function app(scope, receive, send)
//
// send() is event-based, not return-based.
// PSGI returns one value and is done.
// PAGI sends events — so the same handler can stream, push, and stay open.
//
// Send protocol:
//   await send({ type: 'http.response.start', status: 200, headers: [...] })
//   await send({ type: 'http.response.body',  body: '...', more: 0 })
//
// more=1 means more data coming (streaming)
// more=0 means done

/**
 * @typedef {'http' | 'websocket' | 'sse' | 'lifespan'} ScopeType
 *
 * @typedef {Object} Scope
 * @property {ScopeType} type
 * @property {string}    method
 * @property {string}    path
 * @property {Array}     headers   - Array of [name, value] pairs (PAGI style)
 * @property {Object}    query
 * @property {string}    protocol
 * @property {string}    clientId
 * @property {number}    timestamp
 */

/**
 * Receive event types:
 *   { type: 'http.request',    body: Buffer|string, more: 0|1 }
 *   { type: 'http.disconnect' }
 *   { type: 'ws.connect' }
 *   { type: 'ws.message',      body: string|Buffer }
 *   { type: 'ws.disconnect',   code: number }
 *   { type: 'lifespan.startup' }
 *   { type: 'lifespan.shutdown' }
 *
 * Send event types:
 *   { type: 'http.response.start',  status: 200, headers: [['content-type','text/plain']] }
 *   { type: 'http.response.body',   body: '...', more: 0|1 }
 *   { type: 'ws.accept',            headers: [...] }
 *   { type: 'ws.send',              body: '...' }
 *   { type: 'ws.close',             code: 1000 }
 *   { type: 'lifespan.startup.complete' }
 *   { type: 'lifespan.shutdown.complete' }
 */

// ─── Scope Builders ───────────────────────────────────────────

/**
 * Build HTTP scope from Node.js IncomingMessage.
 * Headers are PAGI-style: array of [name, value] pairs.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string} clientId
 * @returns {Scope}
 */
export function buildHttpScope(req, clientId) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Convert Node headers object to PAGI-style array pairs
  const headerPairs = [];
  for (const [key, val] of Object.entries(req.headers)) {
    if (Array.isArray(val)) {
      for (const v of val) headerPairs.push([key, v]);
    } else {
      headerPairs.push([key, val]);
    }
  }

  return {
    type: 'http',
    method: req.method,
    path: url.pathname,
    headers: headerPairs,
    query: Object.fromEntries(url.searchParams),
    protocol: req.socket.encrypted ? 'https' : 'http',
    clientId,
    timestamp: Date.now()
  };
}

/**
 * Build WebSocket scope.
 */
export function buildWsScope(path, headers, clientId) {
  const headerPairs = Array.isArray(headers)
    ? headers
    : Object.entries(headers);

  return {
    type: 'websocket',
    method: 'WS',
    path,
    headers: headerPairs,
    query: {},
    protocol: 'wss',
    clientId,
    timestamp: Date.now()
  };
}

/**
 * Build SSE scope (server-sent events).
 */
export function buildSseScope(path, headers, clientId) {
  return {
    type: 'sse',
    method: 'GET',
    path,
    headers: Array.isArray(headers) ? headers : Object.entries(headers),
    query: {},
    protocol: 'https',
    clientId,
    timestamp: Date.now()
  };
}

/**
 * Build lifespan scope (startup/shutdown).
 */
export function buildLifespanScope(phase) {
  return {
    type: 'lifespan',
    method: phase,
    path: '/',
    headers: [],
    query: {},
    protocol: 'internal',
    clientId: 'system',
    timestamp: Date.now()
  };
}

// ─── Receive Builder ──────────────────────────────────────────

/**
 * Create a receive() function from a Node.js request stream.
 * Returns a future that resolves when data arrives.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {function(): Promise<Object>}
 */
export function buildHttpReceive(req) {
  let bodyRead = false;
  return async function receive() {
    if (bodyRead) {
      return { type: 'http.disconnect' };
    }
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        bodyRead = true;
        resolve({
          type: 'http.request',
          body: Buffer.concat(chunks).toString('utf8'),
          more: 0
        });
      });
      req.on('error', () => {
        bodyRead = true;
        resolve({ type: 'http.disconnect' });
      });
    });
  };
}

// ─── Send Builder ─────────────────────────────────────────────

/**
 * Create a send() callback that writes events to a Node.js response.
 * Supports streaming via more=1.
 *
 * The PAGI protocol:
 *   First call:  { type: 'http.response.start', status, headers }
 *   Then:        { type: 'http.response.body',  body, more }
 *   more=1 keeps the connection open for streaming.
 *   more=0 ends the response.
 *
 * @param {import('http').ServerResponse} res
 * @returns {function(Object): Promise<void>}
 */
export function buildHttpSend(res) {
  let started = false;
  return async function send(event) {
    // ─── Response Start (headers) ───────────────────────
    if (event.type === 'http.response.start') {
      if (started) throw new Error('Response already started');
      started = true;

      // Convert PAGI-style header pairs to Node headers
      const headers = {};
      if (Array.isArray(event.headers)) {
        for (const [key, val] of event.headers) {
          if (headers[key]) {
            // Multiple values for same header
            headers[key] = Array.isArray(headers[key])
              ? [...headers[key], val]
              : [headers[key], val];
          } else {
            headers[key] = val;
          }
        }
      }

      res.writeHead(event.status || 200, headers);
      return;
    }

    // ─── Response Body (streaming) ──────────────────────
    if (event.type === 'http.response.body') {
      if (!started) {
        // Auto-start with 200 if they forgot
        res.writeHead(200, { 'content-type': 'text/plain' });
        started = true;
      }

      if (event.body) {
        res.write(event.body);
      }

      // more=0 (or undefined) means done
      if (!event.more) {
        res.end();
      }
      return;
    }

    throw new Error(`Unknown send event type: ${event.type}`);
  };
}

// ─── Hello World App (PAGI-style) ─────────────────────────────

/**
 * The simplest possible Minnow app.
 * Uses PAGI event protocol: send headers first, then body.
 *
 * Compare to PSGI:
 *   return [200, ['Content-Type','text/plain'], ['Hello, world!']];
 *
 * PAGI sends events — can stream, push, and stay open.
 *
 * @param {Scope} scope
 * @param {function(): Promise<Object>} receive
 * @param {function(Object): Promise<void>} send
 */
export async function helloApp(scope, receive, send) {
  // ─── Lifespan ───────────────────────────────────────
  if (scope.type === 'lifespan') {
    const event = await receive();
    if (event.type === 'lifespan.startup') {
      await send({ type: 'lifespan.startup.complete' });
    } else if (event.type === 'lifespan.shutdown') {
      await send({ type: 'lifespan.shutdown.complete' });
    }
    return;
  }

  // ─── HTTP ───────────────────────────────────────────
  if (scope.type === 'http') {
    // Read body if POST/PUT
    let body = '';
    if (scope.method === 'POST' || scope.method === 'PUT') {
      const event = await receive();
      body = event.body || '';
    }

    // Send headers first
    await send({
      type: 'http.response.start',
      status: 200,
      headers: [
        ['content-type', 'text/plain; charset=utf-8'],
        ['x-minnow-phase', 'active'],
        ['x-minnow-client', scope.clientId]
      ]
    });

    // Then body — more=0 means done
    await send({
      type: 'http.response.body',
      body: [
        'Hello from Minnow OS 🐟\n',
        `Path: ${scope.path}\n`,
        `Method: ${scope.method}\n`,
        `Client: ${scope.clientId}\n`,
        `Time: ${new Date(scope.timestamp).toISOString()}\n`,
        body ? `Body: ${body}\n` : ''
      ].join(''),
      more: 0
    });
    return;
  }

  // ─── WebSocket ──────────────────────────────────────
  if (scope.type === 'websocket') {
    // Accept the connection
    await send({ type: 'ws.accept', headers: [] });

    // Echo loop — reflect messages back (Reflection Loop style)
    while (true) {
      const event = await receive();
      if (event.type === 'ws.disconnect') {
        await send({ type: 'ws.close', code: 1000 });
        break;
      }
      await send({ type: 'ws.send', body: `echo: ${event.body}` });
    }
    return;
  }

  // ─── SSE ────────────────────────────────────────────
  if (scope.type === 'sse') {
    // Start streaming headers
    await send({
      type: 'http.response.start',
      status: 200,
      headers: [
        ['content-type', 'text/event-stream'],
        ['cache-control', 'no-cache'],
        ['connection', 'keep-alive']
      ]
    });

    // Stream events — more=1 keeps connection open
    await send({
      type: 'http.response.body',
      body: 'data: connected to Minnow OS\n\n',
      more: 1  // ← keep alive, more data coming
    });
    return;
  }

  // Unknown scope — raise (PAGI spec)
  throw new Error(`Unhandled scope type: ${scope.type}`);
}

// ─── Streaming Example ────────────────────────────────────────

/**
 * Streaming app example. Sends chunks with more=1,
 * then final chunk with more=0.
 */
export async function streamingApp(scope, receive, send) {
  if (scope.type !== 'http') {
    throw new Error(`Unhandled scope type: ${scope.type}`);
  }

  // Headers first
  await send({
    type: 'http.response.start',
    status: 200,
    headers: [['content-type', 'text/plain; charset=utf-8']]
  });

  // Stream 5 chunks
  for (let i = 1; i <= 5; i++) {
    await send({
      type: 'http.response.body',
      body: `Chunk ${i} of 5\n`,
      more: i < 5 ? 1 : 0  // more=1 keeps it open, more=0 closes
    });

    // Simulate delay between chunks
    await new Promise(r => setTimeout(r, 100));
  }
}

// Minnow OS Runtime — Server-Sent Events Example
// runtime/sse-app.js
//
// SSE scope type: same contract, two new events.
//   sse.start  → headers (content-type: text/event-stream)
//   sse.send   → event + data
//
// Future::IO->sleep(1) yields to the loop — never blocks.
// In JS: await sleep(1000) yields the Promise back to the event loop.
//
// This is a top-level event stream, just like Twitch/YouTube live chat.
// Small apps = raw protocol + helpers. No framework needed.

/**
 * Yield to the event loop for `ms` milliseconds.
 * Like Future::IO->sleep() — gives control back, never blocks.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── SSE App (Twitch/YouTube-style event stream) ──────────────

/**
 * Server-Sent Events app.
 * Same three-argument contract. Only the events change.
 *
 * PAGI equivalent:
 *   async sub app ($scope, $receive, $send) {
 *     die unless $scope->{type} eq 'sse';
 *     await $send->({ type => 'sse.start', status => 200, headers => [...] });
 *     for my $n (1 .. 3) {
 *       await Future::IO->sleep(1);
 *       await $send->({ type => 'sse.send', event => 'tick', data => $n });
 *     }
 *   }
 *
 * @param {Object} scope
 * @param {function} receive
 * @param {function} send
 */
export async function sseApp(scope, receive, send) {
  // Scope check — raise if not SSE
  if (scope.type !== 'sse' && scope.type !== 'http') {
    throw new Error(`Unsupported: ${scope.type}`);
  }

  // ─── Start the event stream ───────────────────────────
  await send({
    type: 'sse.start',
    status: 200,
    headers: [
      ['content-type', 'text/event-stream'],
      ['cache-control', 'no-cache'],
      ['connection', 'keep-alive'],
      ['x-minnow-scope', 'sse'],
      ['x-minnow-client', scope.clientId]
    ]
  });

  // ─── Stream ticks (yields to loop each second) ────────
  for (let n = 1; n <= 3; n++) {
    await sleep(1000);  // ← yields to the event loop, never blocks
    await send({
      type: 'sse.send',
      event: 'tick',
      data: n
    });
  }

  // Future resolves — event loop cleans up
}

// ─── Live Chat Stream (Twitch/YouTube-style) ──────────────────

/**
 * Long-running SSE stream — like Twitch chat or YouTube live.
 * The Future stays pending as long as the client is connected.
 * The event loop manages it separately.
 *
 * @param {Object} scope
 * @param {function} receive
 * @param {function} send
 */
export async function liveChatStream(scope, receive, send) {
  if (scope.type !== 'sse' && scope.type !== 'http') {
    throw new Error(`Unsupported: ${scope.type}`);
  }

  await send({
    type: 'sse.start',
    status: 200,
    headers: [
      ['content-type', 'text/event-stream'],
      ['cache-control', 'no-cache'],
      ['connection', 'keep-alive']
    ]
  });

  // Connected event
  await send({
    type: 'sse.send',
    event: 'connected',
    data: JSON.stringify({
      client: scope.clientId,
      time: new Date().toISOString(),
      message: 'Connected to Minnow OS live stream 🐟'
    })
  });

  // Heartbeat loop — yields every 15 seconds
  // The Future lives independently in the event loop
  let tick = 0;
  while (true) {
    await sleep(15000);  // yield to loop — not blocking
    tick++;

    await send({
      type: 'sse.send',
      event: 'heartbeat',
      data: JSON.stringify({
        tick,
        uptime: tick * 15,
        active: true
      })
    });

    // Check if client disconnected (receive returns disconnect event)
    // In a real impl, the receive() would resolve on disconnect
  }
}

// ─── SSE Send Builder (for event-loop.js integration) ─────────

/**
 * Create an SSE-aware send() callback for Node.js responses.
 * Handles both sse.start and sse.send event types.
 *
 * @param {import('http').ServerResponse} res
 * @returns {function(Object): Promise<void>}
 */
export function buildSseSend(res) {
  let started = false;

  return async function send(event) {
    // ─── SSE Start ──────────────────────────────────────
    if (event.type === 'sse.start') {
      if (started) throw new Error('SSE already started');
      started = true;

      const headers = {};
      if (Array.isArray(event.headers)) {
        for (const [key, val] of event.headers) {
          headers[key] = val;
        }
      }

      res.writeHead(event.status || 200, headers);
      return;
    }

    // ─── SSE Send ───────────────────────────────────────
    if (event.type === 'sse.send') {
      if (!started) {
        // Auto-start
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive'
        });
        started = true;
      }

      // Format as SSE protocol:
      //   event: <name>\n
      //   data: <payload>\n\n
      let chunk = '';
      if (event.event) {
        chunk += `event: ${event.event}\n`;
      }

      const data = typeof event.data === 'string'
        ? event.data
        : JSON.stringify(event.data);

      chunk += `data: ${data}\n\n`;

      res.write(chunk);
      return;
    }

    // ─── SSE Close ──────────────────────────────────────
    if (event.type === 'sse.close') {
      res.end();
      return;
    }

    // Fallback to HTTP events
    if (event.type === 'http.response.start' || event.type === 'http.response.body') {
      // Delegate to HTTP handler (adapter.js handles this)
      throw new Error(`Use HTTP send for ${event.type} events`);
    }

    throw new Error(`Unknown SSE event type: ${event.type}`);
  };
}

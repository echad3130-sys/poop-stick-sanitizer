// Minnow OS Runtime — Context (PAGI::Context equivalent)
// runtime/context.js
//
// Raw PAGI is powerful but verbose:
//   await send({ type: 'http.response.start', status: 200, headers: [...] })
//   await send({ type: 'http.response.body', body: '...', more: 0 })
//
// Context wraps scope/receive/send into one object:
//   const ctx = new Context(scope, receive, send);
//   await ctx.json({ hello: 'world' });
//
// One ctx — request, response, JSON, forms, WebSocket, SSE.
// The parser & encoding come free.

/**
 * Context — wraps scope/receive/send into a friendly API.
 * Same thing underneath, easier to work with.
 *
 * PAGI::Context equivalent:
 *   my $ctx = PAGI::Context->new($scope, $receive, $send)
 *       ->assert_http;
 *   await $ctx->respond( $ctx->json({ hello => 'world' }) );
 */
export class Context {
  /**
   * @param {Object}   scope
   * @param {function} receive
   * @param {function} send
   */
  constructor(scope, receive, send) {
    this.scope   = scope;
    this._receive = receive;
    this._send    = send;
    this._started = false;
    this._body    = null;
    this._form    = null;
  }

  // ─── Assertions ─────────────────────────────────────

  /** Assert this is an HTTP connection. Throw if not. */
  assertHttp() {
    if (this.scope.type !== 'http') {
      throw new Error(`Expected http, got ${this.scope.type}`);
    }
    return this;
  }

  /** Assert this is a WebSocket connection. */
  assertWebSocket() {
    if (this.scope.type !== 'websocket') {
      throw new Error(`Expected websocket, got ${this.scope.type}`);
    }
    return this;
  }

  /** Assert this is an SSE connection. */
  assertSse() {
    if (this.scope.type !== 'sse' && this.scope.type !== 'http') {
      throw new Error(`Expected sse/http, got ${this.scope.type}`);
    }
    return this;
  }

  // ─── Request Helpers ────────────────────────────────

  /** Get request method. */
  get method() { return this.scope.method; }

  /** Get request path. */
  get path() { return this.scope.path; }

  /** Get query params. */
  get query() { return this.scope.query; }

  /** Get request headers as object. */
  get headers() {
    if (Array.isArray(this.scope.headers)) {
      const obj = {};
      for (const [k, v] of this.scope.headers) obj[k] = v;
      return obj;
    }
    return this.scope.headers;
  }

  /** Get a specific header value. */
  header(name) {
    const lower = name.toLowerCase();
    if (Array.isArray(this.scope.headers)) {
      const pair = this.scope.headers.find(([k]) => k.toLowerCase() === lower);
      return pair ? pair[1] : null;
    }
    return this.scope.headers[lower] || null;
  }

  /**
   * Read the full request body (collects chunks).
   * Like the PAGI HTML form slide — loops on receive() until more=0.
   *
   * @returns {Promise<string>}
   */
  async body() {
    if (this._body !== null) return this._body;

    let body = '';
    while (true) {
      const event = await this._receive();
      if (event.type === 'http.disconnect') break;
      if (event.body) body += event.body;
      if (!event.more) break;
    }

    this._body = body;
    return body;
  }

  /**
   * Parse body as JSON.
   *
   * @returns {Promise<*>}
   */
  async json_body() {
    const raw = await this.body();
    return JSON.parse(raw);
  }

  /**
   * Parse URL-encoded form params (like PAGI::Context->req->form_params).
   *
   * @returns {Promise<Object>}
   */
  async formParams() {
    if (this._form !== null) return this._form;

    const raw = await this.body();
    const params = {};
    for (const pair of raw.split('&')) {
      const [key, val] = pair.split('=').map(decodeURIComponent);
      if (key) params[key] = val || '';
    }

    this._form = params;
    return params;
  }

  // ─── Response Helpers (HTTP) ────────────────────────

  /**
   * Send a JSON response. One-liner.
   *
   * PAGI equivalent:
   *   await $ctx->respond( $ctx->json({ hello => 'world' }) );
   *
   * @param {*}      data     - Data to JSON-encode
   * @param {number} [status=200]
   * @param {Array}  [extraHeaders=[]]
   */
  async json(data, status = 200, extraHeaders = []) {
    const body = JSON.stringify(data);
    await this._send({
      type: 'http.response.start',
      status,
      headers: [
        ['content-type', 'application/json; charset=utf-8'],
        ['content-length', String(Buffer.byteLength(body))],
        ...extraHeaders
      ]
    });
    await this._send({
      type: 'http.response.body',
      body,
      more: 0
    });
  }

  /**
   * Send a plain text response.
   *
   * @param {string} text
   * @param {number} [status=200]
   */
  async text(text, status = 200) {
    await this._send({
      type: 'http.response.start',
      status,
      headers: [['content-type', 'text/plain; charset=utf-8']]
    });
    await this._send({
      type: 'http.response.body',
      body: text,
      more: 0
    });
  }

  /**
   * Send an HTML response.
   *
   * @param {string} html
   * @param {number} [status=200]
   */
  async html(html, status = 200) {
    await this._send({
      type: 'http.response.start',
      status,
      headers: [['content-type', 'text/html; charset=utf-8']]
    });
    await this._send({
      type: 'http.response.body',
      body: html,
      more: 0
    });
  }

  /**
   * Send a redirect.
   *
   * @param {string} url
   * @param {number} [status=302]
   */
  async redirect(url, status = 302) {
    await this._send({
      type: 'http.response.start',
      status,
      headers: [['location', url]]
    });
    await this._send({
      type: 'http.response.body',
      body: '',
      more: 0
    });
  }

  // ─── WebSocket Helpers ──────────────────────────────

  /** Accept a WebSocket connection. */
  async wsAccept(headers = []) {
    await this._send({ type: 'ws.accept', headers });
  }

  /** Send a WebSocket message. */
  async wsSend(data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    await this._send({ type: 'ws.send', body });
  }

  /** Receive a WebSocket message. */
  async wsReceive() {
    return this._receive();
  }

  /** Close a WebSocket. */
  async wsClose(code = 1000) {
    await this._send({ type: 'ws.close', code });
  }

  // ─── SSE Helpers ────────────────────────────────────

  /** Start an SSE stream. */
  async sseStart() {
    await this._send({
      type: 'sse.start',
      status: 200,
      headers: [
        ['content-type', 'text/event-stream'],
        ['cache-control', 'no-cache'],
        ['connection', 'keep-alive']
      ]
    });
  }

  /** Send an SSE event. */
  async sseSend(event, data) {
    await this._send({
      type: 'sse.send',
      event,
      data: typeof data === 'string' ? data : JSON.stringify(data)
    });
  }
}

// ─── Sample Apps (with Context) ─────────────────────────────

/**
 * JSON response — one-liner.
 * Compare raw PAGI (4 lines) vs Context (2 lines).
 */
export async function jsonApp(scope, receive, send) {
  const ctx = new Context(scope, receive, send).assertHttp();
  await ctx.json({ hello: 'world' });
}

/**
 * HTML form — parse form params, respond with greeting.
 * Like the PAGI slide: $form->get('name') // 'stranger'
 */
export async function formApp(scope, receive, send) {
  const ctx = new Context(scope, receive, send).assertHttp();
  const form = await ctx.formParams();
  const name = form.name || 'stranger';
  await ctx.text(`Thanks, ${name}!`);
}

/**
 * WebSocket echo — cleaner than raw events.
 */
export async function wsEchoApp(scope, receive, send) {
  const ctx = new Context(scope, receive, send).assertWebSocket();
  await ctx.wsAccept();

  while (true) {
    const msg = await ctx.wsReceive();
    if (msg.type === 'ws.disconnect') break;
    await ctx.wsSend(`Echo: ${msg.body}`);
  }
}

/**
 * SSE heartbeat — clean stream.
 */
export async function sseHeartbeatApp(scope, receive, send) {
  const ctx = new Context(scope, receive, send);
  await ctx.sseStart();

  for (let n = 1; n <= 5; n++) {
    await new Promise(r => setTimeout(r, 1000));
    await ctx.sseSend('tick', { n, time: Date.now() });
  }
}

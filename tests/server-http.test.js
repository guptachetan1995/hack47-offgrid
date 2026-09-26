// Drives the actual Express app (src/server.js) over a real loopback socket — the HTTP
// layer is where the actor-required check actually lives, and no other test in this
// suite exercises it; everything else calls invoke() in-process.
const http = require('http');
const { app } = require('../src/server');
const store = require('../src/store');

let server;
let baseUrl;

beforeAll((done) => {
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => store.reset());

function postInvoke(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${baseUrl}/api/invoke`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

describe('POST /api/invoke over a real socket', () => {
  test('refuses a request missing actor, no silent default', async () => {
    const { status, body } = await postInvoke({ tool: 'list_subscriptions', args: {} });
    expect(status).toBe(400);
    expect(body.error).toMatch(/actor required/i);
  });

  test('refuses a request missing tool', async () => {
    const { status, body } = await postInvoke({ args: {}, actor: 'owner' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/tool required/i);
  });

  test('a full draft-then-approve cycle over the real socket', async () => {
    const review = await postInvoke({ tool: 'review_subscriptions', args: {}, actor: 'agent' });
    const flagged = review.body.result.find((r) => r.id === 'sub_streamvault');
    const token = flagged.firedRules[0].tokens[0];

    const drafted = await postInvoke({
      tool: 'apply_action',
      args: { id: 'sub_streamvault', action: 'renegotiate', note: `Price is now ${token}.` },
      actor: 'agent'
    });
    expect(drafted.body.success).toBe(true);
    expect(drafted.body.result.draftAction).toBe('renegotiate');

    // approve_action is reachable over the same endpoint (the one chokepoint every
    // caller shares) but refuses any actor but owner — the gate is the actor check
    // inside invoke(), not endpoint-level hiding.
    const deniedApprove = await postInvoke({ tool: 'approve_action', args: { id: 'sub_streamvault' }, actor: 'agent' });
    expect(deniedApprove.body.success).toBe(false);

    const approved = await postInvoke({ tool: 'approve_action', args: { id: 'sub_streamvault' }, actor: 'owner' });
    expect(approved.body.success).toBe(true);
    expect(approved.body.result.status).toBe('renegotiation_sent');
  });

  test('GET /api/tools never lists approve_action or reject_action', async () => {
    const { body } = await getJson('/api/tools');
    const names = body.map((t) => t.name);
    expect(names).not.toContain('approve_action');
    expect(names).not.toContain('reject_action');
  });

  test('GET /api/state reflects the current store', async () => {
    const { body } = await getJson('/api/state');
    expect(body.subscriptions.length).toBe(5);
  });

  test('GET /api/activity-log records the calls made above', async () => {
    await postInvoke({ tool: 'list_subscriptions', args: {}, actor: 'owner' });
    const { body } = await getJson('/api/activity-log');
    expect(body.length).toBeGreaterThan(0);
    expect(body[body.length - 1].tool).toBe('list_subscriptions');
  });
});

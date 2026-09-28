// Drives the actual Express app (src/server.js) over a real loopback socket — the HTTP
// layer is where the actor-required and owner-token checks live, and no other test in
// this suite exercises them; everything else calls invoke() in-process.
const http = require('http');
const { createApp, OWNER_HEADER } = require('../src/server');
const store = require('../src/store');

const OWNER_TOKEN = 'test-owner-token-0123456789';
const AS_OWNER = { [OWNER_HEADER]: OWNER_TOKEN };

let server;
let baseUrl;

beforeAll((done) => {
  server = http.createServer(createApp({ ownerToken: OWNER_TOKEN }));
  server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => store.reset());

function postInvoke(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${baseUrl}/api/invoke`,
      { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers) },
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

function getRaw(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, raw }));
    }).on('error', reject);
  });
}

async function getJson(path) {
  const { status, raw } = await getRaw(path);
  return { status, body: JSON.parse(raw) };
}

describe('POST /api/invoke over a real socket', () => {
  test('refuses a request missing actor, no silent default', async () => {
    const { status, body } = await postInvoke({ tool: 'list_subscriptions', args: {} });
    expect(status).toBe(400);
    expect(body.error).toMatch(/actor required/i);
  });

  test('refuses a request missing tool', async () => {
    const { status, body } = await postInvoke({ args: {}, actor: 'owner' }, AS_OWNER);
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

    const approved = await postInvoke({ tool: 'approve_action', args: { id: 'sub_streamvault' }, actor: 'owner' }, AS_OWNER);
    expect(approved.body.success).toBe(true);
    expect(approved.body.result.status).toBe('renegotiation_sent');
  });

  test('an owner action without this run\'s owner token is a 403 and changes nothing', async () => {
    await postInvoke({
      tool: 'apply_action',
      args: { id: 'sub_streamvault', action: 'cancel', note: 'Not worth $12.99.' },
      actor: 'agent'
    });
    for (const headers of [{}, { [OWNER_HEADER]: 'wrong-token' }, { [OWNER_HEADER]: `${OWNER_TOKEN}x` }]) {
      const { status, body } = await postInvoke({ tool: 'approve_action', args: { id: 'sub_streamvault' }, actor: 'owner' }, headers);
      expect(status).toBe(403);
      expect(body.error).toMatch(/owner link/);
    }
    const sub = store.getSubscription('sub_streamvault');
    expect(sub.status).toBe('active');
    expect(sub.draftAction).toBe('cancel');
    // Refused before invoke(): it never reached the chokepoint, so nothing was logged for it.
    expect(store.activityLog.getAll().map((l) => l.tool)).toEqual(['apply_action']);
  });

  test('an import without the owner token is a 403 too', async () => {
    const { status } = await postInvoke({
      tool: 'import_subscriptions', args: { rows: [{ service: 'Planted Row', prices: '9.99@2026-01-01' }] }, actor: 'owner'
    });
    expect(status).toBe(403);
    expect(store.listSubscriptions()).toHaveLength(5);
  });

  test('the served page never carries the owner token', async () => {
    for (const path of ['/', '/index.html', '/app.js']) {
      const { status, raw } = await getRaw(path);
      expect(status).toBe(200);
      expect(raw).not.toContain(OWNER_TOKEN);
    }
  });

  test('GET /api/import-sample returns CSV that imports with the owner token', async () => {
    const { body: sample } = await getJson('/api/import-sample');
    const imported = await postInvoke({ tool: 'import_subscriptions', args: { csv: sample.csv }, actor: 'owner' }, AS_OWNER);
    expect(imported.body.success).toBe(true);
    expect(imported.body.result.added).toHaveLength(4);
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
    await postInvoke({ tool: 'list_subscriptions', args: {}, actor: 'owner' }, AS_OWNER);
    const { body } = await getJson('/api/activity-log');
    expect(body.length).toBeGreaterThan(0);
    expect(body[body.length - 1].tool).toBe('list_subscriptions');
  });
});

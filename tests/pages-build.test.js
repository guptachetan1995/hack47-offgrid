// Builds the static live demo for real and runs its bundle in a bare vm realm — no Node
// APIs, no Express — so what ships to GitHub Pages is proven to be the same invoke()
// chokepoint, refusals included, and not a re-implementation.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { build, MARKER, APP_TAG } = require('../scripts/build-pages');

const ROOT = path.join(__dirname, '..');
const SOURCE_HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const SOURCE_APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const OUTPUTS = ['index.html', 'app.js', 'guard.bundle.js', '.nojekyll'];
const SV = 'sub_streamvault';

let outDir;
let hash;
let html;
let bundle;

beforeAll(() => {
  ({ outDir, hash } = build(fs.mkdtempSync(path.join(os.tmpdir(), 'hack47-pages-'))));
  html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  bundle = fs.readFileSync(path.join(outDir, 'guard.bundle.js'), 'utf8');
});

// Removes exactly the files build() wrote, then the now-empty directory.
afterAll(() => {
  OUTPUTS.forEach((f) => fs.unlinkSync(path.join(outDir, f)));
  fs.rmdirSync(outDir);
});

// Each evaluation seeds its own store, the same as each browser page load.
function loadDemo() {
  const context = vm.createContext({});
  vm.runInContext(bundle, context);
  const demo = context.GuardLocal;
  const as = (actor) => (tool, args) => demo.post('/api/invoke', { tool, args, actor });
  const statusOf = async (id) => (await demo.get('/api/state')).subscriptions.find((s) => s.id === id).status;
  return { demo, agent: as('agent'), owner: as('owner'), statusOf };
}

describe('static build output', () => {
  test('writes the page, its script, the bundle and .nojekyll', () => {
    OUTPUTS.forEach((f) => expect(fs.existsSync(path.join(outDir, f))).toBe(true));
  });

  test('injects the bundle exactly once, after React and before the app script', () => {
    const tag = `<script src="guard.bundle.js?v=${hash}"></script>`;
    expect(html.split('guard.bundle.js').length - 1).toBe(1);
    expect(html).not.toContain(MARKER);
    const reactDom = html.indexOf('react-dom.production.min.js');
    const bundleAt = html.indexOf(tag);
    expect(reactDom).toBeGreaterThan(-1);
    expect(bundleAt).toBeGreaterThan(reactDom);
    expect(html.indexOf(`<script src="app.js?v=${hash}"></script>`)).toBeGreaterThan(bundleAt);
  });

  test('stamps the build hash in <head> for a deploy to poll for', () => {
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    const meta = html.indexOf(`<meta name="guard-build" content="${hash}">`);
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(html.indexOf('</head>'));
  });

  test('the Express-served page keeps the marker and never loads the bundle', () => {
    expect(SOURCE_HTML.split(MARKER).length - 1).toBe(1);
    expect(SOURCE_HTML).not.toContain('guard.bundle.js');
    expect(SOURCE_HTML).toContain(APP_TAG);
  });

  test('the dashboard script ships unchanged, parses, and the page has no inline script', () => {
    const shipped = fs.readFileSync(path.join(outDir, 'app.js'), 'utf8');
    expect(shipped).toBe(SOURCE_APP);
    expect(() => new vm.Script(shipped)).not.toThrow();
    expect(html).not.toMatch(/<script>/);
  });

  test('the bundle references nothing Node-only', () => {
    expect(bundle).not.toMatch(/\bprocess\.|__dirname|__filename/);
  });
});

describe('a bad template fails before anything is written', () => {
  test.each([
    ['no marker', SOURCE_HTML.replace(MARKER, ''), /exactly one <!-- pages:bundle -->, found 0/],
    ['a duplicated marker', SOURCE_HTML.replace(MARKER, MARKER + MARKER), /exactly one <!-- pages:bundle -->, found 2/],
    ['a duplicated </head>', SOURCE_HTML.replace('</head>', '</head></head>'), /exactly one <\/head>, found 2/],
    ['no dashboard script tag', SOURCE_HTML.replace(APP_TAG, ''), /exactly one <script src="app.js"><\/script>, found 0/]
  ])('%s', (_label, bad, message) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hack47-badtpl-'));
    const template = path.join(dir, 'index.html');
    const out = path.join(dir, 'out');
    fs.writeFileSync(template, bad);
    try {
      expect(() => build(out, { template })).toThrow(message);
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      fs.unlinkSync(template);
      fs.rmdirSync(dir);
    }
  });
});

describe('the bundled demo runs the real chokepoint in-page', () => {
  test('the 3-of-5 story end to end, with both refusals and no reopening after approve', async () => {
    const { demo, agent, owner, statusOf } = loadDemo();

    expect((await demo.get('/api/state')).subscriptions).toHaveLength(5);

    const review = await agent('review_subscriptions', {});
    expect(review.success).toBe(true);
    expect(review.result.map((r) => r.id).sort()).toEqual(['sub_cloudbackup', 'sub_designtool', SV]);

    const smuggled = await agent('apply_action', { id: SV, action: 'cancel', note: 'Cancel at $12.99.', status: 'cancelled' });
    expect(smuggled.success).toBe(false);
    expect(smuggled.error).toMatch(/cannot set status/);
    expect(await statusOf(SV)).toBe('active');

    const drafted = await agent('apply_action', { id: SV, action: 'renegotiate', note: 'Ask for the old rate, not $12.99.' });
    expect(drafted.success).toBe(true);
    expect(drafted.result.draftAction).toBe('renegotiate');
    expect(drafted.result.status).toBe('active');

    const agentApprove = await agent('approve_action', { id: SV });
    expect(agentApprove.success).toBe(false);
    expect(agentApprove.error).toMatch(/owner-only/);
    expect(await statusOf(SV)).toBe('active');

    const approved = await owner('approve_action', { id: SV });
    expect(approved.success).toBe(true);
    expect(approved.result.status).toBe('renegotiation_sent');

    const reopened = await agent('apply_action', { id: SV, action: 'keep', note: 'Keep it at $12.99.' });
    expect(reopened.success).toBe(false);
    expect(reopened.error).toMatch(/renegotiation_sent, not active\/trial/);
    expect(await statusOf(SV)).toBe('renegotiation_sent');

    const log = await demo.get('/api/activity-log');
    expect(log.map((l) => `${l.actor} ${l.tool} ${l.result.error ? 'refused' : 'ok'}`)).toEqual([
      'agent review_subscriptions ok',
      'agent apply_action refused',
      'agent apply_action ok',
      'agent approve_action refused',
      'owner approve_action ok',
      'agent apply_action refused'
    ]);
    // The logged draft still shows the draft it made, though approve has since cleared it.
    expect(log[2].result.draftAction).toBe('renegotiate');
  });

  test('reject clears a draft and leaves status alone', async () => {
    const { agent, owner, statusOf } = loadDemo();
    const review = await agent('review_subscriptions', {});
    const token = review.result.find((r) => r.id === 'sub_cloudbackup').firedRules[0].tokens[0];
    expect((await agent('apply_action', { id: 'sub_cloudbackup', action: 'cancel', note: `Unused since ${token}.` })).success).toBe(true);

    const rejected = await owner('reject_action', { id: 'sub_cloudbackup', reason: 'owner declined' });
    expect(rejected.success).toBe(true);
    expect(rejected.result.draftAction).toBeNull();
    expect(await statusOf('sub_cloudbackup')).toBe('active');
  });

  test('the owner imports the sample in-page; the agent cannot import at all', async () => {
    const { demo, agent, owner } = loadDemo();
    const { csv } = await demo.get('/api/import-sample');

    const planted = await agent('import_subscriptions', { csv });
    expect(planted.success).toBe(false);
    expect(planted.error).toMatch(/owner-only/);
    expect((await demo.get('/api/state')).subscriptions).toHaveLength(5);

    const imported = await owner('import_subscriptions', { csv, replace: true });
    expect(imported.success).toBe(true);
    expect((await demo.get('/api/state')).subscriptions.map((s) => s.service)).toEqual([
      'Fernhill Meal Box', 'Orbitalk Language Club', 'Lumen Notebook Pro', 'Tidewire VPN'
    ]);

    const review = await agent('review_subscriptions', {});
    expect(review.result.map((r) => [r.service, r.firedRules.map((f) => f.rule)])).toEqual([
      ['Fernhill Meal Box', ['price_jump']],
      ['Orbitalk Language Club', ['quiet_usage']],
      ['Lumen Notebook Pro', ['trial_converting']]
    ]);
  });

  test('an approved keep stays quiet on the next review in the built bundle too', async () => {
    const { agent, owner } = loadDemo();
    expect((await agent('apply_action', { id: SV, action: 'keep', note: 'Worth it even at $12.99.' })).success).toBe(true);
    expect((await owner('approve_action', { id: SV })).success).toBe(true);
    const review = await agent('review_subscriptions', {});
    expect(review.result.map((r) => r.id)).not.toContain(SV);
  });

  test('/api/tools lists exactly the four agent tools, never approve or reject', async () => {
    const { demo } = loadDemo();
    const names = (await demo.get('/api/tools')).map((t) => t.name);
    expect(names).toEqual(['list_subscriptions', 'review_subscriptions', 'get_subscription', 'apply_action']);
    expect(names).not.toContain('import_subscriptions');
  });

  test('a missing actor or tool gets the same 400 body HTTP returns', async () => {
    const { demo } = loadDemo();
    expect(await demo.post('/api/invoke', { tool: 'list_subscriptions', args: {} })).toEqual({ error: 'actor required' });
    expect(await demo.post('/api/invoke', { args: {}, actor: 'owner' })).toEqual({ error: 'tool required' });
  });

  test('every response is a fresh copy: React sees new identities and edits never reach the store', async () => {
    const { demo, agent } = loadDemo();
    const first = await demo.get('/api/state');
    first.subscriptions[0].status = 'tampered';
    const second = await demo.get('/api/state');
    expect(second.subscriptions).not.toBe(first.subscriptions);
    expect(second.subscriptions[0].status).toBe('active');

    const listed = await agent('list_subscriptions', {});
    listed.result[0].status = 'tampered';
    expect((await demo.get('/api/state')).subscriptions[0].status).toBe('active');
  });

  test('an unknown route rejects instead of guessing', async () => {
    const { demo } = loadDemo();
    await expect(demo.get('/api/nope')).rejects.toThrow(/No route: GET \/api\/nope/);
    await expect(demo.post('/api/state', {})).rejects.toThrow(/No route: POST \/api\/state/);
  });
});

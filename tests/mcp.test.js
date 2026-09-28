// The MCP server (src/mcp.js) against the real Express app on a loopback socket: the
// model's calls must land on the same /api/invoke chokepoint and the same store the
// dashboard shows, always as actor "agent", with no way to reach an owner action.
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { createApp } = require('../src/server');
const { createHandler, PROTOCOL_VERSIONS } = require('../src/mcp');
const store = require('../src/store');

const AGENT_TOOLS = ['list_subscriptions', 'review_subscriptions', 'get_subscription', 'apply_action'];

let server;
let guardUrl;
let handle;

beforeAll((done) => {
  server = http.createServer(createApp({ ownerToken: 'mcp-test-owner-token-0123' }));
  server.listen(0, '127.0.0.1', () => {
    guardUrl = `http://127.0.0.1:${server.address().port}`;
    handle = createHandler({ guardUrl });
    done();
  });
});

// fetch keeps its connections alive; drop them so close() doesn't wait out the idle timeout.
afterAll((done) => {
  server.closeAllConnections();
  server.close(done);
});

beforeEach(() => store.reset());

let nextId = 1;
const request = (method, params) => handle({ jsonrpc: '2.0', id: nextId++, method, params });
const callTool = (name, args) => request('tools/call', { name, arguments: args });

describe('MCP handshake', () => {
  test('initialize answers with the asked protocol version when supported, and offers tools', async () => {
    const res = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    expect(res.result.protocolVersion).toBe('2025-06-18');
    expect(res.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(res.result.serverInfo.name).toBe('subscription-renewal-guard');
    expect(res.result.instructions).toMatch(/cannot approve, reject or import/);
  });

  test('an unknown protocol version gets the newest one this server speaks', async () => {
    const res = await request('initialize', { protocolVersion: '1999-01-01' });
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  test('notifications get no response; ping gets an empty result', async () => {
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect((await request('ping')).result).toEqual({});
  });

  test('an unknown method and a malformed message get JSON-RPC errors', async () => {
    expect((await request('resources/list')).error.code).toBe(-32601);
    expect((await handle({ id: 9, method: 'ping' })).error.code).toBe(-32600);
    expect((await handle([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).error.code).toBe(-32600);
  });
});

describe('the agent seat over MCP', () => {
  test('tools/list is exactly the four-tool registry, each saying what it does not do', async () => {
    const { result } = await request('tools/list');
    expect(result.tools.map((t) => t.name)).toEqual(AGENT_TOOLS);
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description).toMatch(/owner-only dashboard actions/);
    }
  });

  test.each(['approve_action', 'reject_action', 'import_subscriptions'])(
    '%s is not a tool: refused before it reaches invoke(), and nothing changes',
    async (name) => {
      await callTool('apply_action', { id: 'sub_streamvault', action: 'cancel', note: 'Not worth $12.99.' });
      const res = await callTool(name, { id: 'sub_streamvault', csv: 'service,prices\nX,1@2026-01-01\n' });
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toMatch(new RegExp(`^Unknown tool: ${name}\\. This server has exactly these tools: ${AGENT_TOOLS.join(', ')}\\.`));
      expect(res.error.message).toMatch(/owner-only action on the dashboard/);
      const sub = store.getSubscription('sub_streamvault');
      expect(sub.status).toBe('active');
      expect(sub.draftAction).toBe('cancel');
      expect(store.listSubscriptions()).toHaveLength(5);
      expect(store.activityLog.getAll().map((l) => l.tool)).toEqual(['apply_action']);
    }
  );

  test('the actor is always "agent": an actor or status in the arguments changes nothing', async () => {
    const res = await callTool('apply_action', {
      id: 'sub_streamvault', action: 'cancel', note: 'Not worth $12.99.', actor: 'owner', status: 'cancelled'
    });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe('apply_action cannot set status directly — only approve_action can.');
    expect(store.activityLog.getAll().map((l) => l.actor)).toEqual(['agent']);
    expect(store.getSubscription('sub_streamvault').status).toBe('active');
  });

  test('a refusal inside invoke() comes back as a tool error the model can read', async () => {
    const res = await callTool('apply_action', { id: 'sub_designtool', action: 'cancel', note: 'cancel this trial' });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/note must cite the specific evidence/);
  });

  test('a successful call returns the result as JSON text', async () => {
    const res = await callTool('review_subscriptions', {});
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(res.result.content[0].text).map((r) => r.id).sort()).toEqual(['sub_cloudbackup', 'sub_designtool', 'sub_streamvault']);
  });

  test('the model\'s draft lands in the store the dashboard reads, waiting for the owner', async () => {
    await callTool('apply_action', { id: 'sub_cloudbackup', action: 'cancel', note: 'Untouched since 116 days ago; 116 days is long.' });
    const state = await (await fetch(`${guardUrl}/api/state`)).json();
    const sub = state.subscriptions.find((s) => s.id === 'sub_cloudbackup');
    expect(sub.draftAction).toBe('cancel');
    expect(sub.status).toBe('active');
  });

  test('arguments that are not an object are refused as invalid params', async () => {
    expect((await callTool('list_subscriptions', ['active'])).error.code).toBe(-32602);
  });

  test('with the dashboard server down, the model is told to start it', async () => {
    const offline = createHandler({ guardUrl: 'http://127.0.0.1:9' });
    const res = await offline({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.error.code).toBe(-32603);
    expect(res.error.message).toMatch(/not reachable at http:\/\/127\.0\.0\.1:9 .*Start it with npm start/);
  });
});

describe('the stdio transport', () => {
  test('one JSON-RPC message per line in, one response per line out', async () => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'mcp.js')], {
      env: Object.assign({}, process.env, { GUARD_URL: guardUrl }),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    const exited = new Promise((resolve) => child.on('close', resolve));

    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'approve_action', arguments: { id: 'sub_streamvault' } } }
    ];
    child.stdin.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n');
    child.stdin.end();
    await exited;

    const responses = out.trim().split('\n').map((l) => JSON.parse(l));
    const byId = Object.fromEntries(responses.map((r) => [String(r.id), r]));
    expect(responses).toHaveLength(4);
    expect(byId['1'].result.protocolVersion).toBe('2025-06-18');
    expect(byId['2'].result.tools.map((t) => t.name)).toEqual(AGENT_TOOLS);
    expect(byId['3'].error.message).toMatch(/^Unknown tool: approve_action/);
    expect(byId.null.error.code).toBe(-32700);
  });
});

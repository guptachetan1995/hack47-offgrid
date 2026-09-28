#!/usr/bin/env node
// A stdio MCP server that puts any tool-calling model (Claude Desktop, Claude Code, any MCP
// client) in the agent's seat. It is a thin front on the running dashboard server, not a
// second copy of the app: tools/list is GET /api/tools (the four-tool registry in
// src/tools.js) and tools/call is POST /api/invoke with the actor fixed to "agent" here.
// So the model's calls go through the same invoke() chokepoint, the same store and the same
// activity log the owner is watching on the dashboard, and its drafts wait there for the
// owner's Approve. Nothing a client sends can change the actor, and no owner action
// (approve, reject, import) is in the registry for it to call.
//
// Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout (the MCP stdio transport).
// stdout carries protocol messages only; diagnostics go to stderr.

const readline = require('readline');
const { version } = require('../package.json');

// Newest first. A client asking for one of these gets it back; any other gets the newest.
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ACTOR = 'agent';

const INSTRUCTIONS =
  'You are in the agent seat of Subscription/Renewal Guard. Call review_subscriptions, then ' +
  'draft at most one action per flagged subscription with apply_action, quoting the evidence ' +
  'figures the review returned. You cannot approve, reject or import anything: those are the ' +
  'owner\'s clicks on the dashboard, and no tool on this server does them. Your drafts wait ' +
  'there for the owner.';

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

function createHandler({ guardUrl, fetchImpl = fetch }) {
  async function call(path, init) {
    let res;
    try {
      res = await fetchImpl(`${guardUrl}${path}`, init);
    } catch (err) {
      throw new Error(`Subscription/Renewal Guard is not reachable at ${guardUrl} (${err.message}). Start it with npm start.`);
    }
    return { status: res.status, body: await res.json() };
  }

  const listTools = async () => (await call('/api/tools')).body;

  async function callTool(id, params) {
    const { name } = params;
    const args = params.arguments === undefined ? {} : params.arguments;
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return rpcError(id, -32602, 'tools/call arguments must be an object.');
    }
    const tools = await listTools();
    const names = tools.map((t) => t.name);
    if (!names.includes(name)) {
      return rpcError(
        id,
        -32602,
        `Unknown tool: ${name}. This server has exactly these tools: ${names.join(', ')}. ` +
        'Approving, rejecting or importing is an owner-only action on the dashboard; no tool here can do it.'
      );
    }
    const { status, body } = await call('/api/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: name, args, actor: ACTOR })
    });
    const ok = status === 200 && body.success === true;
    const text = ok ? JSON.stringify(body.result, null, 2) : String(body.error);
    return rpcResult(id, { content: [{ type: 'text', text }], isError: !ok });
  }

  // One parsed message in, the response to write out (or null: notifications and stray
  // responses get none).
  return async function handle(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') {
      return rpcError(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid Request: expected one JSON-RPC 2.0 object.');
    }
    const { id, method, params = {} } = msg;
    if (typeof method !== 'string') {
      return null;
    }
    if (id === undefined) {
      return null;
    }
    try {
      switch (method) {
        case 'initialize': {
          const asked = params.protocolVersion;
          return rpcResult(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'subscription-renewal-guard', version },
            instructions: INSTRUCTIONS
          });
        }
        case 'ping':
          return rpcResult(id, {});
        case 'tools/list':
          return rpcResult(id, {
            tools: (await listTools()).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
          });
        case 'tools/call':
          return await callTool(id, params);
        default:
          return rpcError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      return rpcError(id, -32603, err.message);
    }
  };
}

// Reads one message per line, writes one response per line. Responses to concurrent
// requests may interleave in any order; each carries its request's id.
function serveStdio({ guardUrl, input = process.stdin, output = process.stdout }) {
  const handle = createHandler({ guardUrl });
  const write = (msg) => output.write(`${JSON.stringify(msg)}\n`);
  const rl = readline.createInterface({ input });
  rl.on('line', (line) => {
    if (!line.trim()) {
      return;
    }
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      write(rpcError(null, -32700, 'Parse error: each line must be one JSON-RPC message.'));
      return;
    }
    handle(msg).then((res) => res && write(res));
  });
  return rl;
}

module.exports = { createHandler, serveStdio, PROTOCOL_VERSIONS, ACTOR };

if (require.main === module) {
  const guardUrl = (process.env.GUARD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
  // eslint-disable-next-line no-console
  console.error(`subscription-renewal-guard MCP server: agent seat on ${guardUrl}`);
  serveStdio({ guardUrl });
}

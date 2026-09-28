// docs/mcp-transcript.md must be exactly what scripts/mcp-relay.js renders from the recorded
// log, so no line of it can have been written or edited by hand; and the log must show the
// session the README describes.
const fs = require('fs');
const path = require('path');
const { renderMarkdown, digest } = require('../scripts/mcp-relay');

const DOCS = path.join(__dirname, '..', 'docs');
const entries = fs.readFileSync(path.join(DOCS, 'mcp-transcript.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const md = fs.readFileSync(path.join(DOCS, 'mcp-transcript.md'), 'utf8');
const messages = entries.filter((e) => e.dir !== 'stderr').map((e) => Object.assign({ dir: e.dir }, JSON.parse(e.line)));
const responseTo = (id) => messages.find((m) => m.dir === 'server' && m.id === id);

test('the markdown is the relay\'s rendering of the log, byte for byte', () => {
  const label = /^\*\*(.+)\*\*$/m.exec(md)[1];
  const [, startedAt, guard] = /^Session recorded (\S+) against the dashboard server at `([^`]+)`/m.exec(md);
  expect(renderMarkdown(entries, { label, guard, startedAt })).toBe(md);
});

test('the log is numbered in order with no gaps', () => {
  expect(entries.map((e) => e.seq)).toEqual(entries.map((_, i) => i + 1));
});

test('the model saw four tools, drafted, and its approve attempt was refused', () => {
  const list = messages.find((m) => m.dir === 'client' && m.method === 'tools/list');
  expect(responseTo(list.id).result.tools.map((t) => t.name)).toEqual(
    ['list_subscriptions', 'review_subscriptions', 'get_subscription', 'apply_action']
  );

  const calls = messages.filter((m) => m.dir === 'client' && m.method === 'tools/call');
  const drafts = calls.filter((m) => m.params.name === 'apply_action');
  expect(drafts.length).toBeGreaterThan(0);
  drafts.forEach((m) => expect(responseTo(m.id).result.isError).toBe(false));

  const approve = calls.find((m) => m.params.name === 'approve_action');
  expect(responseTo(approve.id).error.code).toBe(-32602);
  expect(responseTo(approve.id).error.message).toMatch(/^Unknown tool: approve_action/);
});

test('the digest has one line per message and keeps the refusal word for word', () => {
  const lines = digest(entries);
  expect(lines).toHaveLength(messages.length);
  expect(lines).toContain(`← error -32602: ${responseTo(messages.find((m) => m.dir === 'client' && m.params && m.params.name === 'approve_action').id).error.message}`);
  expect(lines.filter((l) => l.startsWith('→ tools/call apply_action ')).length).toBe(3);
});

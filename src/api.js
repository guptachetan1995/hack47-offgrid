const { invoke } = require('./invoke');
const store = require('./store');
const { tools } = require('./tools');
const { sampleCsv } = require('./import');

// The dashboard's routes as plain functions, so the Express server and the
// in-browser static demo (src/browser-entry.js) answer from the exact same code.

function getState() {
  return { subscriptions: store.listSubscriptions() };
}

function getActivityLog() {
  return store.activityLog.getAll();
}

function getTools() {
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

// Example CSV for the dashboard's import box, dated relative to today so it always trips
// the rules. Only text: importing it is still the owner's import_subscriptions call.
function getImportSample() {
  return { csv: sampleCsv(new Date()) };
}

// No silent default: a caller that omits `actor` gets nothing, never the most privileged
// identity. The dashboard always sends its actor explicitly — this is deliberate friction
// for anything else.
async function postInvoke(body = {}) {
  const { tool, args, actor } = body;
  if (!tool) {
    return { status: 400, body: { error: 'tool required' } };
  }
  if (!actor) {
    return { status: 400, body: { error: 'actor required' } };
  }
  return { status: 200, body: await invoke(tool, args || {}, actor) };
}

module.exports = { getState, getActivityLog, getTools, getImportSample, postInvoke };

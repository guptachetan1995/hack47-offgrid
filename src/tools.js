const { invoke } = require('./invoke');

// Appended verbatim to every tool's description (asserted by tests/approval-gate.test.js)
// so an agent reading any single tool description sees the thesis stated: changing a
// subscription's real state is owner-only, and it is nobody's registered tool.
const OWNER_ONLY_CLAUSE =
  'Approve and Reject are owner-only dashboard actions; no registered tool, including this one, can move a subscription out of its drafted state.';

const tools = [
  {
    name: 'list_subscriptions',
    description:
      'List tracked subscriptions, optionally filtered by status (active/trial/downgraded/cancelled/renegotiation_sent). Read-only. ' +
      OWNER_ONLY_CLAUSE,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Optional status to filter by' }
      }
    },
    async execute(input, actor = 'agent') {
      return await invoke('list_subscriptions', input, actor);
    }
  },
  {
    name: 'review_subscriptions',
    description:
      'Run the three review rules (price jump over 15%, no usage in 60+ days, a trial converting within 7 days) against every active/trial subscription, and return only the ones that currently trip at least one rule, with the evidence for each. Does NOT: draft an action, change any subscription, or return anything for a subscription nothing is wrong with. ' +
      OWNER_ONLY_CLAUSE,
    inputSchema: { type: 'object', properties: {} },
    async execute(input, actor = 'agent') {
      return await invoke('review_subscriptions', input, actor);
    }
  },
  {
    name: 'get_subscription',
    description: 'Full record for one subscription, including price history, usage, and any current draft. Read-only. ' + OWNER_ONLY_CLAUSE,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Subscription id' } },
      required: ['id']
    },
    async execute(input, actor = 'agent') {
      return await invoke('get_subscription', input, actor);
    }
  },
  {
    name: 'apply_action',
    description:
      'Draft one action (keep/downgrade/renegotiate/cancel) for a subscription that review_subscriptions actually flagged, with a note citing the specific evidence (the exact price figures, the quiet-usage date, or the trial date) that rule produced. Does NOT: change the subscription\'s real status, apply to a subscription that is no longer active or on trial (already cancelled, downgraded or renegotiated) or has no currently-fired rule, or accept a note that doesn\'t cite real evidence — a bare "cancel this" is refused. ' +
      OWNER_ONLY_CLAUSE,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Subscription id' },
        action: { type: 'string', enum: ['keep', 'downgrade', 'renegotiate', 'cancel'] },
        note: { type: 'string', description: 'Reasoned note citing the specific evidence a fired rule produced' }
      },
      required: ['id', 'action', 'note']
    },
    async execute(input, actor = 'agent') {
      return await invoke('apply_action', input, actor);
    }
  }
];

module.exports = { tools };

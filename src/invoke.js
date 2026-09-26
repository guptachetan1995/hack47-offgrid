const store = require('./store');
const { reviewSubscription } = require('./rules');

const VALID_ACTIONS = ['keep', 'downgrade', 'renegotiate', 'cancel'];

async function invoke(tool, args, actor) {
  if (!actor) {
    throw new Error('actor required');
  }

  let result;
  try {
    switch (tool) {
      case 'list_subscriptions':
        result = store.listSubscriptions(args && args.status);
        break;
      case 'review_subscriptions':
        result = reviewAll();
        break;
      case 'get_subscription':
        result = store.getSubscription(args.id);
        break;
      case 'apply_action':
        result = applyAction(args);
        break;
      case 'approve_action':
        result = approveAction(args, actor);
        break;
      case 'reject_action':
        result = rejectAction(args, actor);
        break;
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    store.activityLog.log(tool, args, actor, result);
    return {
      success: true,
      result,
      activity: store.activityLog.getAll()[store.activityLog.getAll().length - 1]
    };
  } catch (error) {
    const errorResult = { error: error.message };
    store.activityLog.log(tool, args, actor, errorResult);
    return {
      success: false,
      error: error.message,
      activity: store.activityLog.getAll()[store.activityLog.getAll().length - 1]
    };
  }
}

// Only a subscription still active or on trial is under review. Once an approve has moved
// it to cancelled/downgraded/renegotiation_sent, nothing the agent drafts may reopen it.
function isReviewable(sub) {
  return sub.status === 'active' || sub.status === 'trial';
}

// Every reviewable subscription with whichever rules currently fire on it — nothing is
// returned for a subscription with no fired rule, so the agent doesn't manufacture work
// where there isn't any.
function reviewAll() {
  const now = new Date();
  return store
    .listSubscriptions()
    .filter(isReviewable)
    .map((s) => ({ id: s.id, service: s.service, firedRules: reviewSubscription(s, now) }))
    .filter((r) => r.firedRules.length > 0);
}

// Drafts an action. Never touches `status` — that's approve_action's only job. Refuses a
// note that doesn't cite the evidence a currently-fired rule actually produced, so a bare
// "cancel this" can't stand in for looking at the subscription.
function applyAction({ id, action, note, status } = {}) {
  if (status !== undefined) {
    throw new Error('apply_action cannot set status directly — only approve_action can.');
  }
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`action must be one of ${VALID_ACTIONS.join('/')}, got "${action}"`);
  }
  const sub = store.getSubscription(id);
  if (!isReviewable(sub)) {
    throw new Error(`${id} is ${sub.status}, not active/trial — nothing to draft.`);
  }
  const fired = reviewSubscription(sub, new Date());
  if (fired.length === 0) {
    throw new Error(
      `${id} has no currently-fired rule (no price jump, no quiet usage, no trial converting) ` +
      '— apply_action only drafts against a subscription review_subscriptions actually flagged.'
    );
  }
  const allTokens = fired.flatMap((f) => f.tokens);
  const noteText = String(note || '');
  const citesEvidence = allTokens.some((token) => noteText.includes(token));
  if (!citesEvidence) {
    throw new Error(
      `note must cite the specific evidence a fired rule produced (one of: ${allTokens.join(', ')}) ` +
      '— a note that doesn\'t reference what was actually found is refused.'
    );
  }
  return store.updateSubscription(id, {
    draftAction: action,
    draftNote: note,
    draftedAt: new Date().toISOString()
  });
}

// Owner-only. Never a registered tool (see tools.js) — the only place `status` may
// change. Turns the current draft into the subscription's real state and clears it.
function approveAction({ id } = {}, actor) {
  if (actor !== 'owner') {
    throw new Error('approve_action is an owner-only action; no agent tool can approve a draft.');
  }
  const sub = store.getSubscription(id);
  if (!sub.draftAction) {
    throw new Error(`${id} has no draft to approve.`);
  }
  const nextStatus = {
    keep: 'active',
    downgrade: 'downgraded',
    renegotiate: 'renegotiation_sent',
    cancel: 'cancelled'
  }[sub.draftAction];
  return store.updateSubscription(id, {
    status: nextStatus,
    draftAction: null,
    draftNote: null,
    draftedAt: null
  });
}

// Owner-only. Never a registered tool. Clears the draft without ever touching `status` —
// rejecting a suggestion is not itself a decision about the subscription. `reason` isn't
// a subscription field; it's logged as part of this call's own activity-log entry, the
// same way every other tool's args are, so nothing extra needs to be written here.
function rejectAction({ id } = {}, actor) {
  if (actor !== 'owner') {
    throw new Error('reject_action is an owner-only action; no agent tool can reject a draft.');
  }
  const sub = store.getSubscription(id);
  if (!sub.draftAction) {
    throw new Error(`${id} has no draft to reject.`);
  }
  return store.updateSubscription(id, { draftAction: null, draftNote: null, draftedAt: null });
}

module.exports = { invoke };

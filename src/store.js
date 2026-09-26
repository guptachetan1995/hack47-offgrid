const seed = require('../fake-data/seed-subscriptions.json');

// The seed's date fields are day-offsets from "now", not absolute timestamps — so the
// demo story (one price jump, one gone quiet, one trial converting soon) stays true
// whenever this actually runs, instead of going stale the day after it was written.
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS).toISOString();

function materialize(entry) {
  return {
    id: entry.id,
    service: entry.service,
    status: entry.status,
    priceHistory: entry.priceHistory.map((p) => ({
      amount: p.amount,
      currency: p.currency,
      effectiveFrom: daysAgo(p.effectiveFromDaysAgo).slice(0, 10)
    })),
    renewalDate: entry.renewalInDays == null ? null : daysFromNow(entry.renewalInDays).slice(0, 10),
    lastUsedAt: entry.lastUsedAtDaysAgo == null ? null : daysAgo(entry.lastUsedAtDaysAgo),
    trialEndsAt: entry.trialEndsInDays == null ? null : daysFromNow(entry.trialEndsInDays),
    draftAction: null,
    draftNote: null,
    draftedAt: null
  };
}

const state = {
  subscriptions: seed.map(materialize),
  activityLog: []
};

// Test-only: re-seed from scratch so mutations in one test never leak into the next.
// Never called from application code — the server holds one long-lived state for its
// whole process lifetime, same as every other entry in this repo.
function reset() {
  state.subscriptions = seed.map(materialize);
  state.activityLog = [];
}

function listSubscriptions(status) {
  return status ? state.subscriptions.filter((s) => s.status === status) : state.subscriptions;
}

function getSubscription(id) {
  const sub = state.subscriptions.find((s) => s.id === id);
  if (!sub) {
    throw new Error(`Subscription ${id} not found`);
  }
  return sub;
}

function updateSubscription(id, updates) {
  const sub = getSubscription(id);
  Object.assign(sub, updates);
  return sub;
}

// A log entry must record what a call looked like at the time, not a live reference to a
// subscription that a later approve keeps mutating. `undefined` passes through because a
// tool can be executed with no input at all.
const snapshot = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

class ActivityLog {
  log(tool, args, actor, result) {
    const entry = { timestamp: new Date().toISOString(), actor, tool, args: snapshot(args), result: snapshot(result) };
    state.activityLog.push(entry);
    return entry;
  }

  getAll() {
    return state.activityLog;
  }
}

const activityLog = new ActivityLog();

module.exports = { listSubscriptions, getSubscription, updateSubscription, activityLog, state, reset };

// The three signals review_subscriptions checks, each with its own threshold so the
// evidence in a draft's note is always traceable to one named rule.
// Every check takes an explicit `now` so it's deterministic under test — nothing here
// ever reads the real clock itself.

const PRICE_JUMP_THRESHOLD = 0.15; // > 15% increase
const QUIET_USAGE_DAYS = 60; // no usage seen in > 60 days
const TRIAL_SOON_DAYS = 7; // trial converts within <= 7 days

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);
const money = (n) => `$${n.toFixed(2)}`;

// A price jump since the last renewal. Needs at least two price-history entries — a
// subscription with only its original price has nothing to compare against.
function checkPriceJump(sub) {
  const hist = sub.priceHistory;
  if (!Array.isArray(hist) || hist.length < 2) {
    return null;
  }
  const [prev, latest] = hist.slice(-2);
  if (!prev.amount) {
    return null;
  }
  const pct = (latest.amount - prev.amount) / prev.amount;
  if (pct <= PRICE_JUMP_THRESHOLD) {
    return null;
  }
  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    rule: 'price_jump',
    message: `Price rose ${pctStr} (${money(prev.amount)}→${money(latest.amount)}) at the ${latest.effectiveFrom} renewal.`,
    tokens: [money(prev.amount), money(latest.amount), pctStr]
  };
}

// Active but not touched in a while — the renewal keeps happening whether or not
// anyone's using it.
function checkQuietUsage(sub, now) {
  if (sub.status !== 'active' || !sub.lastUsedAt) {
    return null;
  }
  const days = daysBetween(now, new Date(sub.lastUsedAt));
  if (days < QUIET_USAGE_DAYS) {
    return null;
  }
  return {
    rule: 'quiet_usage',
    message: `No usage seen since ${sub.lastUsedAt.slice(0, 10)} (${days} days).`,
    tokens: [sub.lastUsedAt.slice(0, 10), `${days} days`]
  };
}

// A free trial about to become a real charge.
function checkTrialConverting(sub, now) {
  if (sub.status !== 'trial' || !sub.trialEndsAt) {
    return null;
  }
  const msLeft = new Date(sub.trialEndsAt).getTime() - now.getTime();
  // Rounded up: a trial ending 3 days out is still "3 days away" a moment later, not 2.
  const days = Math.ceil(msLeft / DAY_MS);
  if (msLeft < 0 || days > TRIAL_SOON_DAYS) {
    return null;
  }
  return {
    rule: 'trial_converting',
    message: `Trial converts to paid on ${sub.trialEndsAt.slice(0, 10)} (${days} day${days === 1 ? '' : 's'} away).`,
    tokens: [sub.trialEndsAt.slice(0, 10), 'trial']
  };
}

const CHECKS = [checkPriceJump, checkQuietUsage, checkTrialConverting];

// Every rule that currently fires for one subscription — never fewer signals than are
// actually true, so a subscription can trip more than one rule at once.
function reviewSubscription(sub, now = new Date()) {
  return CHECKS.map((check) => check(sub, now)).filter(Boolean);
}

module.exports = {
  reviewSubscription,
  checkPriceJump,
  checkQuietUsage,
  checkTrialConverting,
  PRICE_JUMP_THRESHOLD,
  QUIET_USAGE_DAYS,
  TRIAL_SOON_DAYS
};

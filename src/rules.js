// The three signals review_subscriptions checks, each with its own threshold so the
// evidence in a draft's note is always traceable to one named rule.
// Every check takes an explicit `now` so it's deterministic under test — nothing here
// ever reads the real clock itself.
//
// Each fired rule carries:
//   message       the evidence line shown to the owner and the agent
//   tokens        the figures a draft's note may cite (see citesEvidence)
//   key           what stays the same about this finding from day to day, so an approved
//                 "keep" can acknowledge it without silencing a later, different finding
//   annualImpact  dollars a year this finding is about, or null when the data can't say

const PRICE_JUMP_THRESHOLD = 0.15; // > 15% increase
const QUIET_USAGE_DAYS = 60; // no usage seen in > 60 days
const TRIAL_SOON_DAYS = 7; // trial converts within <= 7 days

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);
const money = (n) => `$${n.toFixed(2)}`;
const dayCount = (n) => `${n} day${n === 1 ? '' : 's'}`;

// A subscription with no `billing` is monthly, like every seeded one.
const chargesPerYear = (sub) => (sub.billing === 'yearly' ? 1 : 12);
const perYear = (sub, amount) => Math.round(amount * chargesPerYear(sub) * 100) / 100;
const latestPrice = (sub) => sub.priceHistory[sub.priceHistory.length - 1].amount;

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
  const annualImpact = perYear(sub, latest.amount - prev.amount);
  return {
    rule: 'price_jump',
    message: `Price rose ${pctStr} (${money(prev.amount)}→${money(latest.amount)}) at the ${latest.effectiveFrom} renewal (+${money(annualImpact)}/yr).`,
    tokens: [money(prev.amount), money(latest.amount), pctStr],
    key: `${prev.amount}->${latest.amount}@${latest.effectiveFrom}`,
    annualImpact
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
  const lastUsed = sub.lastUsedAt.slice(0, 10);
  const annualImpact = perYear(sub, latestPrice(sub));
  return {
    rule: 'quiet_usage',
    message: `No usage seen since ${lastUsed} (${days} days); it costs ${money(annualImpact)}/yr.`,
    tokens: [lastUsed, dayCount(days)],
    key: lastUsed,
    annualImpact
  };
}

// A free trial about to become a real charge. The day count, not the word "trial", is the
// citable figure: a note that says "cancel this trial" has looked at nothing.
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
  const endsOn = sub.trialEndsAt.slice(0, 10);
  const hasPrice = typeof sub.trialPrice === 'number';
  const annualImpact = hasPrice ? perYear(sub, sub.trialPrice) : null;
  return {
    rule: 'trial_converting',
    message: `Trial converts to paid on ${endsOn} (${dayCount(days)} away)${hasPrice ? `, then ${money(annualImpact)}/yr` : ''}.`,
    tokens: hasPrice ? [endsOn, dayCount(days), money(sub.trialPrice)] : [endsOn, dayCount(days)],
    key: endsOn,
    annualImpact
  };
}

const CHECKS = [checkPriceJump, checkQuietUsage, checkTrialConverting];

// Every rule that currently fires for one subscription — never fewer signals than are
// actually true, so a subscription can trip more than one rule at once.
function reviewSubscription(sub, now = new Date()) {
  return CHECKS.map((check) => check(sub, now)).filter(Boolean);
}

// The money one subscription's findings are about. Findings overlap (a quiet subscription
// whose price also rose is one charge, not two), so this is the largest, never the sum.
function annualAtStake(findings) {
  return findings.reduce((max, f) => Math.max(max, f.annualImpact || 0), 0);
}

// Whether a draft's note quotes one of the fired rules' own figures as a whole token:
// "$8.99" is not cited by "$8.999", and "3 days" is not cited by "13 days".
function citesEvidence(note, tokens) {
  const text = String(note || '');
  return tokens.some((token) => {
    for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
      const before = text[at - 1] || '';
      const after = text[at + token.length] || '';
      if (!/[\w.]/.test(before) && !/\w/.test(after)) {
        return true;
      }
    }
    return false;
  });
}

module.exports = {
  reviewSubscription,
  annualAtStake,
  citesEvidence,
  checkPriceJump,
  checkQuietUsage,
  checkTrialConverting,
  PRICE_JUMP_THRESHOLD,
  QUIET_USAGE_DAYS,
  TRIAL_SOON_DAYS
};

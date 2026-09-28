const {
  checkPriceJump,
  checkQuietUsage,
  checkTrialConverting,
  reviewSubscription,
  annualAtStake,
  citesEvidence
} = require('../src/rules');

const PRICE_999 = [{ amount: 9.99, effectiveFrom: '2025-01-01' }];

describe('checkPriceJump', () => {
  test('fires just above the 15% threshold', () => {
    const sub = { priceHistory: [{ amount: 10, effectiveFrom: '2026-01-01' }, { amount: 11.51, effectiveFrom: '2026-09-01' }] };
    expect(checkPriceJump(sub)).not.toBeNull();
  });

  test('does not fire just below the 15% threshold', () => {
    const sub = { priceHistory: [{ amount: 10, effectiveFrom: '2026-01-01' }, { amount: 11.49, effectiveFrom: '2026-09-01' }] };
    expect(checkPriceJump(sub)).toBeNull();
  });

  test('does not fire with only one price on record', () => {
    const sub = { priceHistory: [{ amount: 10, effectiveFrom: '2026-01-01' }] };
    expect(checkPriceJump(sub)).toBeNull();
  });

  test('evidence carries both prices and the percentage', () => {
    const sub = { priceHistory: [{ amount: 8.99, effectiveFrom: '2025-06-01' }, { amount: 12.99, effectiveFrom: '2026-09-01' }] };
    const fired = checkPriceJump(sub);
    expect(fired.rule).toBe('price_jump');
    expect(fired.tokens).toEqual(expect.arrayContaining(['$8.99', '$12.99', '44%']));
  });

  test('says what the rise costs a year, monthly unless billed yearly', () => {
    const hist = [{ amount: 8.99, effectiveFrom: '2025-06-01' }, { amount: 12.99, effectiveFrom: '2026-09-01' }];
    const monthly = checkPriceJump({ priceHistory: hist });
    expect(monthly.annualImpact).toBe(48);
    expect(monthly.message).toBe('Price rose 44% ($8.99→$12.99) at the 2026-09-01 renewal (+$48.00/yr).');
    expect(checkPriceJump({ billing: 'yearly', priceHistory: hist }).annualImpact).toBe(4);
  });

  test('its key names the exact change, so a later rise is a different finding', () => {
    const first = checkPriceJump({ priceHistory: [{ amount: 10, effectiveFrom: '2025-01-01' }, { amount: 12, effectiveFrom: '2026-01-01' }] });
    const later = checkPriceJump({ priceHistory: [{ amount: 12, effectiveFrom: '2026-01-01' }, { amount: 15, effectiveFrom: '2026-09-01' }] });
    expect(first.key).not.toBe(later.key);
  });
});

describe('checkQuietUsage', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  test('fires just past 60 days quiet', () => {
    const sub = { status: 'active', priceHistory: PRICE_999, lastUsedAt: '2026-07-26T00:00:00Z' }; // 61 days
    expect(checkQuietUsage(sub, now)).not.toBeNull();
  });

  test('does not fire just under 60 days quiet', () => {
    const sub = { status: 'active', priceHistory: PRICE_999, lastUsedAt: '2026-07-28T00:00:00Z' }; // 59 days
    expect(checkQuietUsage(sub, now)).toBeNull();
  });

  test('quotes the date and day count, and what the idle subscription costs a year', () => {
    const fired = checkQuietUsage({ status: 'active', priceHistory: PRICE_999, lastUsedAt: '2026-06-01T00:00:00Z' }, now);
    expect(fired.message).toBe('No usage seen since 2026-06-01 (116 days); it costs $119.88/yr.');
    expect(fired.tokens).toEqual(['2026-06-01', '116 days']);
    expect(fired.annualImpact).toBe(119.88);
  });

  test('its key is the last-used date, which does not move while it stays quiet', () => {
    const sub = { status: 'active', priceHistory: PRICE_999, lastUsedAt: '2026-06-01T00:00:00Z' };
    expect(checkQuietUsage(sub, now).key).toBe(checkQuietUsage(sub, new Date('2026-10-25T00:00:00Z')).key);
  });

  test('does not fire for a subscription that is not active', () => {
    const sub = { status: 'cancelled', priceHistory: PRICE_999, lastUsedAt: '2026-01-01T00:00:00Z' };
    expect(checkQuietUsage(sub, now)).toBeNull();
  });
});

describe('checkTrialConverting', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  test('fires exactly at the 7-day boundary', () => {
    const sub = { status: 'trial', trialEndsAt: '2026-10-02T00:00:00Z' }; // 7 days
    expect(checkTrialConverting(sub, now)).not.toBeNull();
  });

  test('does not fire at 8 days out', () => {
    const sub = { status: 'trial', trialEndsAt: '2026-10-03T00:00:00Z' }; // 8 days
    expect(checkTrialConverting(sub, now)).toBeNull();
  });

  test('does not fire for a trial that already ended', () => {
    const sub = { status: 'trial', trialEndsAt: '2026-09-20T00:00:00Z' };
    expect(checkTrialConverting(sub, now)).toBeNull();
  });

  test('does not fire for a trial that ended less than a day ago', () => {
    const sub = { status: 'trial', trialEndsAt: '2026-09-24T23:00:00Z' };
    expect(checkTrialConverting(sub, now)).toBeNull();
  });

  test('a trial seeded 3 days out still reads 3 days a moment later', () => {
    const sub = { status: 'trial', trialEndsAt: '2026-09-28T00:00:00.000Z' };
    const fired = checkTrialConverting(sub, new Date('2026-09-25T00:00:00.050Z'));
    expect(fired.message).toBe('Trial converts to paid on 2026-09-28 (3 days away).');
  });

  test('the citable figures are the end date and the days left, never the word "trial"', () => {
    const fired = checkTrialConverting({ status: 'trial', trialEndsAt: '2026-09-28T00:00:00Z' }, now);
    expect(fired.tokens).toEqual(['2026-09-28', '3 days']);
    expect(fired.tokens).not.toContain('trial');
  });

  test('one day away reads "1 day", singular', () => {
    const fired = checkTrialConverting({ status: 'trial', trialEndsAt: '2026-09-26T00:00:00Z' }, now);
    expect(fired.tokens).toContain('1 day');
    expect(fired.message).toBe('Trial converts to paid on 2026-09-26 (1 day away).');
  });

  test('with a known price after the trial, says what the first year costs', () => {
    const fired = checkTrialConverting({ status: 'trial', trialEndsAt: '2026-09-28T00:00:00Z', trialPrice: 14.99 }, now);
    expect(fired.message).toBe('Trial converts to paid on 2026-09-28 (3 days away), then $179.88/yr.');
    expect(fired.annualImpact).toBe(179.88);
    expect(fired.tokens).toContain('$14.99');
  });

  test('with no known price after the trial, claims no yearly figure', () => {
    expect(checkTrialConverting({ status: 'trial', trialEndsAt: '2026-09-28T00:00:00Z' }, now).annualImpact).toBeNull();
  });

  test('does not fire for a non-trial subscription', () => {
    const sub = { status: 'active', trialEndsAt: '2026-09-30T00:00:00Z' };
    expect(checkTrialConverting(sub, now)).toBeNull();
  });
});

describe('annualAtStake', () => {
  test('is the largest finding, not the sum, since overlapping findings are one charge', () => {
    expect(annualAtStake([{ annualImpact: 48 }, { annualImpact: 155.88 }])).toBe(155.88);
  });

  test('is 0 when no finding can put a figure on it', () => {
    expect(annualAtStake([{ annualImpact: null }])).toBe(0);
    expect(annualAtStake([])).toBe(0);
  });
});

describe('citesEvidence', () => {
  const tokens = ['$8.99', '$12.99', '44%', '2026-09-28', '3 days'];

  test.each([
    ['Renegotiate: it went from $8.99 to $12.99.', true],
    ['Up 44%, ask for the old rate.', true],
    ['Converts on 2026-09-28.', true],
    ['Decide within 3 days.', true],
    ['(3 days)', true]
  ])('cites: %s', (note, expected) => {
    expect(citesEvidence(note, tokens)).toBe(expected);
  });

  test.each([
    ['cancel this trial', false],
    ['cancel this', false],
    ['It has been 13 days.', false],
    ['Paid $8.999 by mistake.', false],
    ['Up 1.44% only.', false],
    ['Up 144% overall.', false],
    ['', false]
  ])('does not cite: %s', (note, expected) => {
    expect(citesEvidence(note, tokens)).toBe(expected);
  });

  test('a note that is not a string cites nothing', () => {
    expect(citesEvidence(undefined, tokens)).toBe(false);
  });
});

describe('reviewSubscription', () => {
  test('returns every rule that fires, not just the first', () => {
    const now = new Date('2026-09-25T00:00:00Z');
    const sub = {
      status: 'active',
      priceHistory: [{ amount: 10, effectiveFrom: '2026-01-01' }, { amount: 15, effectiveFrom: '2026-09-01' }],
      lastUsedAt: '2026-06-01T00:00:00Z'
    };
    const fired = reviewSubscription(sub, now);
    expect(fired.map((f) => f.rule).sort()).toEqual(['price_jump', 'quiet_usage']);
  });

  test('returns nothing for a healthy subscription', () => {
    const now = new Date('2026-09-25T00:00:00Z');
    const sub = {
      status: 'active',
      priceHistory: [{ amount: 10, effectiveFrom: '2026-01-01' }],
      lastUsedAt: '2026-09-24T00:00:00Z'
    };
    expect(reviewSubscription(sub, now)).toEqual([]);
  });
});

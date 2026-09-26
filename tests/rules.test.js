const {
  checkPriceJump,
  checkQuietUsage,
  checkTrialConverting,
  reviewSubscription
} = require('../src/rules');

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
});

describe('checkQuietUsage', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  test('fires just past 60 days quiet', () => {
    const sub = { status: 'active', lastUsedAt: '2026-07-26T00:00:00Z' }; // 61 days
    expect(checkQuietUsage(sub, now)).not.toBeNull();
  });

  test('does not fire just under 60 days quiet', () => {
    const sub = { status: 'active', lastUsedAt: '2026-07-28T00:00:00Z' }; // 59 days
    expect(checkQuietUsage(sub, now)).toBeNull();
  });

  test('does not fire for a subscription that is not active', () => {
    const sub = { status: 'cancelled', lastUsedAt: '2026-01-01T00:00:00Z' };
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

  test('does not fire for a non-trial subscription', () => {
    const sub = { status: 'active', trialEndsAt: '2026-09-30T00:00:00Z' };
    expect(checkTrialConverting(sub, now)).toBeNull();
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

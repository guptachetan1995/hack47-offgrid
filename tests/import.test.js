const { parseCsv, csvToRows, importRecords, sampleCsv, COLUMNS, MAX_ROWS } = require('../src/import');
const { reviewSubscription } = require('../src/rules');

describe('parseCsv', () => {
  test('handles quoted commas, doubled quotes, CRLF and a byte-order mark', () => {
    const text = '﻿service,prices\r\n"Acme, Inc ""Pro""",9.99@2026-01-01\r\n';
    expect(parseCsv(text)).toEqual([['service', 'prices'], ['Acme, Inc "Pro"', '9.99@2026-01-01']]);
  });

  test('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  test('refuses an unclosed quote instead of guessing', () => {
    expect(() => parseCsv('service\n"never closed')).toThrow(/unclosed double quote/);
  });
});

describe('csvToRows', () => {
  test('matches header names case-insensitively, in any order', () => {
    expect(csvToRows('PRICES,Service\n4.99@2026-01-01,Tea Club\n')).toEqual([{ prices: '4.99@2026-01-01', service: 'Tea Club' }]);
  });

  test('names the unknown column and lists the real ones', () => {
    expect(() => csvToRows('service,cost\nX,1\n')).toThrow(`Unknown CSV column "cost". Columns: ${COLUMNS.join(', ')}.`);
  });

  test('refuses a header that names a column twice, whatever its case', () => {
    expect(() => csvToRows('service,prices,Service\nA,1@2026-01-01,B\n')).toThrow('CSV column "service" appears more than once in the header.');
  });
});

describe('importRecords', () => {
  const NOW = new Date('2026-09-28T12:00:00Z');
  const one = (row) => importRecords({ rows: [row] }, [], NOW)[0];

  test('builds a store record: sorted price history, trial status from trialEndsAt, monthly by default', () => {
    const rec = one({
      service: 'Lumen Notebook Pro',
      prices: '$12.99@2026-09-01; 8.99@2025-06-01',
      trialEndsAt: '2026-10-01',
      trialPrice: '14.99',
      lastUsedAt: '2026-09-20'
    });
    expect(rec).toEqual({
      id: 'sub_lumen_notebook_pro',
      service: 'Lumen Notebook Pro',
      status: 'trial',
      billing: 'monthly',
      priceHistory: [
        { amount: 8.99, currency: 'USD', effectiveFrom: '2025-06-01' },
        { amount: 12.99, currency: 'USD', effectiveFrom: '2026-09-01' }
      ],
      renewalDate: null,
      lastUsedAt: '2026-09-20T00:00:00.000Z',
      trialEndsAt: '2026-10-01T00:00:00.000Z',
      trialPrice: 14.99,
      draftAction: null,
      draftNote: null,
      draftedAt: null,
      acknowledged: [],
      decision: null
    });
  });

  test('a trial ending today is still a trial', () => {
    expect(one({ service: 'X', prices: '0@2026-09-01', trialEndsAt: '2026-09-28' }).status).toBe('trial');
  });

  test('ids never collide with existing ones or with each other', () => {
    const recs = importRecords({ rows: [{ service: 'Tea Club', prices: '1@2026-01-01' }, { service: 'tea club!', prices: '1@2026-01-01' }] }, ['sub_tea_club']);
    expect(recs.map((r) => r.id)).toEqual(['sub_tea_club_2', 'sub_tea_club_3']);
  });

  test.each([
    [{ prices: '1@2026-01-01' }, /Row 1: service is required/],
    [{ service: 'X' }, /Row 1: prices is required/],
    [{ service: 'X', prices: '1.999@2026-01-01' }, /each price must look like 12\.99@2026-09-01/],
    [{ service: 'X', prices: '1@2026-02-30' }, /a price date must be a YYYY-MM-DD date, got "2026-02-30"/],
    [{ service: 'X', prices: '1@2026-01-01', lastUsedAt: 'yesterday' }, /lastUsedAt must be a YYYY-MM-DD date/],
    [{ service: 'X', prices: '1@2026-01-01', billing: 'weekly' }, /billing must be monthly or yearly/],
    [{ service: 'X', prices: '1@2026-01-01', trialPrice: 'free' }, /trialPrice must be an amount/],
    [{ service: 'X', prices: '0@2026-09-01', trialEndsAt: '2026-09-27' }, 'Row 1: trialEndsAt 2026-09-27 has already passed. If the trial became a paid plan, leave trialEndsAt empty and put the paid price in prices.']
  ])('refuses %j', (row, message) => {
    expect(() => one(row)).toThrow(message);
  });

  test('takes exactly one of csv or rows', () => {
    expect(() => importRecords({})).toThrow(/exactly one of csv/);
    expect(() => importRecords({ csv: 'service,prices\n', rows: [] })).toThrow(/exactly one of csv/);
  });

  test('refuses an empty import and one over the row cap', () => {
    expect(() => importRecords({ csv: 'service,prices\n' })).toThrow(/no data rows/);
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ service: `S${i}`, prices: '1@2026-01-01' }));
    expect(() => importRecords({ rows })).toThrow(`At most ${MAX_ROWS} subscriptions per import, got ${MAX_ROWS + 1}.`);
  });
});

describe('sampleCsv', () => {
  test('whatever day it is loaded, three of its four rows trip a rule and the yearly plan does not', () => {
    for (const day of ['2026-01-15T09:00:00Z', '2026-09-28T23:59:00Z', '2027-03-01T00:00:00Z']) {
      const now = new Date(day);
      const recs = importRecords({ csv: sampleCsv(now) }, [], now);
      const fired = recs.map((r) => [r.service, reviewSubscription(r, now).map((f) => f.rule)]);
      expect(fired).toEqual([
        ['Fernhill Meal Box', ['price_jump']],
        ['Orbitalk Language Club', ['quiet_usage']],
        ['Lumen Notebook Pro', ['trial_converting']],
        ['Tidewire VPN', []]
      ]);
    }
  });
});

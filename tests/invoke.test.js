const { invoke } = require('../src/invoke');
const store = require('../src/store');

// sub_streamvault is seeded with a 44% price jump (see fake-data/seed-subscriptions.json)
// and is always active/trial-eligible regardless of when the suite runs, because the
// seed's dates are relative offsets materialized at load time.
const PRICE_JUMP_SUB = 'sub_streamvault';
const QUIET_USAGE_SUB = 'sub_cloudbackup';
const TRIAL_SUB = 'sub_designtool';
const HEALTHY_SUB = 'sub_musicapp';

const reviewedIds = async () => (await invoke('review_subscriptions', {}, 'agent')).result.map((r) => r.id);

describe('invoke chokepoint', () => {
  beforeEach(() => store.reset());

  test('list_subscriptions returns every seeded subscription', async () => {
    const { result } = await invoke('list_subscriptions', {}, 'agent');
    expect(result.length).toBe(5);
  });

  test('review_subscriptions flags only subscriptions with a fired rule', async () => {
    const { result } = await invoke('review_subscriptions', {}, 'agent');
    const ids = result.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([PRICE_JUMP_SUB, QUIET_USAGE_SUB]));
    expect(ids).not.toContain(HEALTHY_SUB);
  });

  test('apply_action drafts an action with evidence-citing note', async () => {
    const review = await invoke('review_subscriptions', {}, 'agent');
    const flagged = review.result.find((r) => r.id === PRICE_JUMP_SUB);
    const token = flagged.firedRules[0].tokens[0];
    const { success, result } = await invoke(
      'apply_action',
      { id: PRICE_JUMP_SUB, action: 'renegotiate', note: `Price jumped to ${token}, still worth using.` },
      'agent'
    );
    expect(success).toBe(true);
    expect(result.draftAction).toBe('renegotiate');
    expect(result.status).toBe('active'); // unchanged — drafting never touches status
  });

  test('apply_action refuses a smuggled status field', async () => {
    const { success, error } = await invoke(
      'apply_action',
      { id: PRICE_JUMP_SUB, action: 'cancel', note: '$8.99', status: 'cancelled' },
      'agent'
    );
    expect(success).toBe(false);
    expect(error).toMatch(/cannot set status/i);
    expect(store.getSubscription(PRICE_JUMP_SUB).status).toBe('active');
  });

  test('apply_action refuses a note that does not cite real evidence', async () => {
    const { success, error } = await invoke(
      'apply_action',
      { id: PRICE_JUMP_SUB, action: 'cancel', note: 'cancel this' },
      'agent'
    );
    expect(success).toBe(false);
    expect(error).toMatch(/cite the specific evidence/i);
  });

  test('apply_action refuses a subscription with no currently-fired rule', async () => {
    const { success, error } = await invoke(
      'apply_action',
      { id: HEALTHY_SUB, action: 'cancel', note: 'no reason' },
      'agent'
    );
    expect(success).toBe(false);
    expect(error).toMatch(/no currently-fired rule/i);
  });

  test('apply_action refuses an invalid action enum', async () => {
    const { success, error } = await invoke(
      'apply_action',
      { id: PRICE_JUMP_SUB, action: 'delete-everything', note: '$8.99' },
      'agent'
    );
    expect(success).toBe(false);
    expect(error).toMatch(/action must be one of/i);
  });

  test('every call is logged with its actor', async () => {
    await invoke('list_subscriptions', {}, 'agent');
    const { result: log } = await invoke('list_subscriptions', {}, 'owner');
    void log;
    const entries = store.activityLog.getAll();
    expect(entries[0].actor).toBe('agent');
    expect(entries[1].actor).toBe('owner');
  });

  test('invoke refuses a call with no actor', async () => {
    await expect(invoke('list_subscriptions', {}, undefined)).rejects.toThrow(/actor required/);
  });

  test('apply_action refuses a subscription an approve already moved out of active/trial', async () => {
    await invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'cancel', note: 'Not worth $12.99.' }, 'agent');
    await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    expect(store.getSubscription(PRICE_JUMP_SUB).status).toBe('cancelled');

    const { success, error } = await invoke(
      'apply_action',
      { id: PRICE_JUMP_SUB, action: 'keep', note: 'Keep it at $12.99.' },
      'agent'
    );
    expect(success).toBe(false);
    expect(error).toMatch(/cancelled, not active\/trial/);

    // With no draft left, a second approve can't flip the cancellation back to active.
    const reapproved = await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    expect(reapproved.success).toBe(false);
    expect(store.getSubscription(PRICE_JUMP_SUB).status).toBe('cancelled');

    const review = await invoke('review_subscriptions', {}, 'agent');
    expect(review.result.map((r) => r.id)).not.toContain(PRICE_JUMP_SUB);
  });

  test('the activity log keeps what each call returned at the time, not a live reference', async () => {
    await invoke('list_subscriptions', {}, 'agent');
    await invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'cancel', note: 'Not worth $12.99.' }, 'agent');
    await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');

    const [listed, drafted] = store.activityLog.getAll();
    expect(listed.result).not.toBe(store.state.subscriptions);
    expect(listed.result.find((s) => s.id === PRICE_JUMP_SUB).status).toBe('active');
    expect(drafted.result.draftAction).toBe('cancel');
    expect(drafted.result.status).toBe('active');
  });

  test('review reports the yearly money each flagged subscription is about', async () => {
    const { result } = await invoke('review_subscriptions', {}, 'agent');
    const atStake = Object.fromEntries(result.map((r) => [r.id, r.annualAtStake]));
    expect(atStake).toEqual({ [PRICE_JUMP_SUB]: 48, [QUIET_USAGE_SUB]: 119.88, [TRIAL_SUB]: 179.88 });
  });

  test('"cancel this trial" cites nothing and is refused; the days left or the date is accepted', async () => {
    const vague = await invoke('apply_action', { id: TRIAL_SUB, action: 'cancel', note: 'cancel this trial' }, 'agent');
    expect(vague.success).toBe(false);
    expect(vague.error).toMatch(/cite the specific evidence/);
    expect(store.getSubscription(TRIAL_SUB).draftAction).toBeNull();

    const cited = await invoke('apply_action', { id: TRIAL_SUB, action: 'cancel', note: 'It turns paid in 3 days.' }, 'agent');
    expect(cited.success).toBe(true);
  });

  test('a day count only counts as a whole token: "13 days" does not cite "3 days"', async () => {
    const { success } = await invoke('apply_action', { id: TRIAL_SUB, action: 'cancel', note: 'Barely used in 13 days.' }, 'agent');
    expect(success).toBe(false);
  });

  test('an approved keep sticks: the next review stays quiet and no new draft is accepted', async () => {
    await invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'keep', note: 'Still worth it at $12.99.' }, 'agent');
    const approved = await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    expect(approved.result.status).toBe('active');
    expect(approved.result.acknowledged).toEqual([expect.objectContaining({ rule: 'price_jump' })]);

    expect(await reviewedIds()).not.toContain(PRICE_JUMP_SUB);
    const again = await invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'cancel', note: 'Not worth $12.99.' }, 'agent');
    expect(again.success).toBe(false);
    expect(again.error).toMatch(/no currently-fired rule/);
  });

  test('a kept subscription flags again when its price changes again', async () => {
    await invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'keep', note: 'Still worth it at $12.99.' }, 'agent');
    await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    store.getSubscription(PRICE_JUMP_SUB).priceHistory.push({ amount: 16.99, currency: 'USD', effectiveFrom: '2099-01-01' });

    const { result } = await invoke('review_subscriptions', {}, 'agent');
    const flagged = result.find((r) => r.id === PRICE_JUMP_SUB);
    expect(flagged.firedRules[0].message).toMatch(/\$12\.99→\$16\.99/);
  });

  test('a rejected draft is not a keep: the flag stays open', async () => {
    await invoke('apply_action', { id: QUIET_USAGE_SUB, action: 'cancel', note: 'Unused for 116 days.' }, 'agent');
    await invoke('reject_action', { id: QUIET_USAGE_SUB }, 'owner');
    expect(await reviewedIds()).toContain(QUIET_USAGE_SUB);
  });

  test('approve records the decision and the yearly money it concerned', async () => {
    await invoke('apply_action', { id: QUIET_USAGE_SUB, action: 'cancel', note: 'Unused for 116 days.' }, 'agent');
    const { result } = await invoke('approve_action', { id: QUIET_USAGE_SUB }, 'owner');
    expect(result.decision).toEqual({ action: 'cancel', annualAtStake: 119.88, decidedAt: expect.any(String) });
  });

  test('import_subscriptions is owner-only: an agent cannot plant a subscription', async () => {
    const rows = [{ service: 'Planted Service', prices: '1.00@2026-01-01;9.00@2026-09-01' }];
    const { success, error } = await invoke('import_subscriptions', { rows }, 'agent');
    expect(success).toBe(false);
    expect(error).toBe('import_subscriptions is an owner-only action; no agent tool can add subscriptions.');
    expect(store.listSubscriptions()).toHaveLength(5);
  });

  test('the owner imports rows next to the seed, and review checks them the same way', async () => {
    const { success, result } = await invoke('import_subscriptions', {
      rows: [{ service: 'StreamVault Plus', prices: '10@2025-01-01;15@2026-09-01' }]
    }, 'owner');
    expect(success).toBe(true);
    expect(result).toEqual({ added: ['sub_streamvault_plus'], replaced: false, total: 6 });
    expect(await reviewedIds()).toContain('sub_streamvault_plus');
  });

  test('replace swaps the list out and keeps the activity log', async () => {
    await invoke('list_subscriptions', {}, 'agent');
    const { result } = await invoke('import_subscriptions', {
      csv: 'service,prices\nOnly One,4.99@2026-01-01\n', replace: true
    }, 'owner');
    expect(result).toEqual({ added: ['sub_only_one'], replaced: true, total: 1 });
    expect(store.listSubscriptions().map((s) => s.service)).toEqual(['Only One']);
    expect(store.activityLog.getAll().map((l) => l.tool)).toEqual(['list_subscriptions', 'import_subscriptions']);
  });

  test('a bad row refuses the whole import, so nothing is half-added', async () => {
    const { success, error } = await invoke('import_subscriptions', {
      csv: 'service,prices\nGood One,4.99@2026-01-01\nBad One,four dollars\n'
    }, 'owner');
    expect(success).toBe(false);
    expect(error).toMatch(/^Row 3: each price must look like/);
    expect(store.listSubscriptions()).toHaveLength(5);
  });

  test('a call with no input at all is still logged', async () => {
    const { success } = await invoke('list_subscriptions', undefined, 'agent');
    expect(success).toBe(true);
    expect(store.activityLog.getAll()[0].args).toBeUndefined();
  });
});

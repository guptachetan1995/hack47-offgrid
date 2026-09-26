const { invoke } = require('../src/invoke');
const store = require('../src/store');

// sub_streamvault is seeded with a 44% price jump (see fake-data/seed-subscriptions.json)
// and is always active/trial-eligible regardless of when the suite runs, because the
// seed's dates are relative offsets materialized at load time.
const PRICE_JUMP_SUB = 'sub_streamvault';
const QUIET_USAGE_SUB = 'sub_cloudbackup';
const HEALTHY_SUB = 'sub_musicapp';

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

  test('a call with no input at all is still logged', async () => {
    const { success } = await invoke('list_subscriptions', undefined, 'agent');
    expect(success).toBe(true);
    expect(store.activityLog.getAll()[0].args).toBeUndefined();
  });
});

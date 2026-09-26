const { invoke } = require('../src/invoke');
const { tools } = require('../src/tools');
const store = require('../src/store');

const PRICE_JUMP_SUB = 'sub_streamvault';

async function draftSomething() {
  const review = await invoke('review_subscriptions', {}, 'agent');
  const flagged = review.result.find((r) => r.id === PRICE_JUMP_SUB);
  const token = flagged.firedRules[0].tokens[0];
  return invoke('apply_action', { id: PRICE_JUMP_SUB, action: 'cancel', note: `Not worth it at ${token}.` }, 'agent');
}

describe('the approval gate is structural, not a convention', () => {
  beforeEach(() => store.reset());

  test('approve_action and reject_action are not in the agent tool registry', () => {
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('approve_action');
    expect(names).not.toContain('reject_action');
  });

  test('every tool description states the owner-only clause', () => {
    for (const tool of tools) {
      expect(tool.description).toMatch(/owner-only dashboard actions/);
    }
  });

  test('approve_action refuses any actor but owner, even called directly on invoke()', async () => {
    await draftSomething();
    const { success, error } = await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'agent');
    expect(success).toBe(false);
    expect(error).toMatch(/owner-only/i);
    expect(store.getSubscription(PRICE_JUMP_SUB).status).toBe('active');
  });

  test('reject_action refuses any actor but owner, even called directly on invoke()', async () => {
    await draftSomething();
    const { success, error } = await invoke('reject_action', { id: PRICE_JUMP_SUB }, 'agent');
    expect(success).toBe(false);
    expect(error).toMatch(/owner-only/i);
    expect(store.getSubscription(PRICE_JUMP_SUB).draftAction).toBe('cancel');
  });

  test('status is reachable only through approve_action — a full draft/approve/reject cycle', async () => {
    await draftSomething();
    expect(store.getSubscription(PRICE_JUMP_SUB).status).toBe('active');

    const { success, result } = await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    expect(success).toBe(true);
    expect(result.status).toBe('cancelled');
    expect(result.draftAction).toBeNull();
  });

  test('reject_action clears the draft without ever touching status', async () => {
    await draftSomething();
    const { success, result } = await invoke('reject_action', { id: PRICE_JUMP_SUB, reason: 'still using it' }, 'owner');
    expect(success).toBe(true);
    expect(result.status).toBe('active');
    expect(result.draftAction).toBeNull();
  });

  test('approve_action refuses a subscription with no draft', async () => {
    const { success, error } = await invoke('approve_action', { id: PRICE_JUMP_SUB }, 'owner');
    expect(success).toBe(false);
    expect(error).toMatch(/no draft to approve/i);
  });
});

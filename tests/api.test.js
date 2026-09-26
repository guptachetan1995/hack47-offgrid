const api = require('../src/api');
const store = require('../src/store');

describe('api.postInvoke — the one handler behind POST /api/invoke, in either transport', () => {
  beforeEach(() => store.reset());

  test('400 with no tool', async () => {
    expect(await api.postInvoke({ args: {}, actor: 'owner' })).toEqual({ status: 400, body: { error: 'tool required' } });
  });

  test('400 with no actor — never a silent default identity', async () => {
    expect(await api.postInvoke({ tool: 'list_subscriptions', args: {} })).toEqual({ status: 400, body: { error: 'actor required' } });
    expect(store.activityLog.getAll()).toHaveLength(0);
  });

  test('200 with the invoke() result when tool and actor are present', async () => {
    const { status, body } = await api.postInvoke({ tool: 'list_subscriptions', actor: 'owner' });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result).toHaveLength(5);
  });

  test('a refusal inside invoke() is still a 200 carrying success: false', async () => {
    const { status, body } = await api.postInvoke({ tool: 'approve_action', args: { id: 'sub_streamvault' }, actor: 'agent' });
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/owner-only/);
  });
});

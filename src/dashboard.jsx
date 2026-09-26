import React, { useState, useEffect } from 'react';

// Readable-JSX mirror of public/index.html's inline React.createElement dashboard —
// kept in sync by hand. Drafting is free; approving is the only thing that ever changes a
// subscription's real state, and it's owner-only.

// Present only in the static live demo (scripts/build-pages.js injects the bundle before
// the app script): the same src/ domain code answering in-page instead of over HTTP.
const local = window.GuardLocal;
const SOURCE_URL = 'https://github.com/guptachetan1995/hack47-offgrid';

const api = {
  get: (path) => (local ? local.get(path) : fetch(path).then((r) => r.json())),
  invoke: (tool, args, actor) => (local
    ? local.post('/api/invoke', { tool, args, actor })
    : fetch('/api/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args, actor })
    }).then((r) => r.json()))
};

const isReviewable = (sub) => sub.status === 'active' || sub.status === 'trial';

const STATUS_LABELS = {
  active: 'Active',
  trial: 'Trial',
  downgraded: 'Downgraded',
  cancelled: 'Cancelled',
  renegotiation_sent: 'Renegotiation sent'
};
const STATUS_COLORS = {
  active: '#28a745',
  trial: '#17a2b8',
  downgraded: '#ff9f1c',
  cancelled: '#dc3545',
  renegotiation_sent: '#007bff'
};
const ACTIONS = ['keep', 'downgrade', 'renegotiate', 'cancel'];
const ACTION_LABELS = { keep: 'Keep', downgrade: 'Downgrade', renegotiate: 'Renegotiate', cancel: 'Cancel' };

function buttonStyle(bg) {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 4,
    padding: '6px 12px', marginRight: 6, cursor: 'pointer', fontSize: 13
  };
}

function Badge({ status }) {
  return (
    <span style={{ background: STATUS_COLORS[status] || '#999', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, marginLeft: 8 }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// One card per subscription. Drafting (the four ACTIONS buttons) calls apply_action as
// the agent would — it only ever writes draftAction/draftNote, never status. Approve and
// Reject are the only buttons that send actor: 'owner', matching how the real gate works:
// nothing about the UI hides approve_action/reject_action, the actor check inside
// invoke() is what refuses them for anyone else.
function SubscriptionCard({ sub, review, onInvoke, loading }) {
  const fired = review && review.firedRules;
  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: 16, marginBottom: 12, border: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong>{sub.service}</strong>
        <Badge status={sub.status} />
      </div>
      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
        {`Latest price: $${sub.priceHistory[sub.priceHistory.length - 1].amount.toFixed(2)}`}
        {sub.renewalDate ? ` · renews ${sub.renewalDate}` : ''}
        {sub.lastUsedAt ? ` · last used ${sub.lastUsedAt.slice(0, 10)}` : ''}
        {sub.trialEndsAt ? ` · trial ends ${sub.trialEndsAt.slice(0, 10)}` : ''}
      </div>

      {fired && fired.length > 0 && isReviewable(sub) && !sub.draftAction && (
        <div style={{ marginTop: 10 }}>
          {fired.map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: '#a15c00', marginBottom: 4 }}>⚠️ {f.message}</div>
          ))}
          <div style={{ marginTop: 6 }}>
            {ACTIONS.map((a) => (
              <button
                key={a}
                disabled={loading}
                style={buttonStyle('#6c757d')}
                onClick={() => onInvoke('apply_action', {
                  id: sub.id,
                  action: a,
                  note: `${ACTION_LABELS[a]} — ${fired[0].message}`
                }, 'agent')}
              >
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      )}

      {sub.draftAction && (
        <div style={{ marginTop: 10, background: '#fff8e6', padding: 10, borderRadius: 4 }}>
          <div style={{ fontSize: 13 }}><strong>Draft: {ACTION_LABELS[sub.draftAction]}</strong></div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{sub.draftNote}</div>
          <div style={{ marginTop: 8 }}>
            <button disabled={loading} style={buttonStyle('#28a745')} onClick={() => onInvoke('approve_action', { id: sub.id }, 'owner')}>
              Approve
            </button>
            <button disabled={loading} style={buttonStyle('#dc3545')} onClick={() => onInvoke('reject_action', { id: sub.id, reason: 'owner declined' }, 'owner')}>
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sends, as actor 'agent', two calls an over-reaching agent might make — through the same
// invoke() every other button uses, so the refusal a judge sees is the real gate.
function AgentProbe({ onInvoke, loading }) {
  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: 16, marginTop: 16, border: '1px dashed #6f42c1' }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Try it as the agent</h2>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
        Two calls an over-reaching agent might make, sent as actor &quot;agent&quot; through the same invoke() every button above uses. Both are refused, and the refusal lands in the activity log.
      </p>
      <button
        disabled={loading}
        style={buttonStyle('#6f42c1')}
        onClick={() => onInvoke('apply_action', {
          id: 'sub_streamvault', action: 'cancel', note: 'Cancel — price rose to $12.99.', status: 'cancelled'
        }, 'agent')}
      >
        Agent: set status directly
      </button>
      <button
        disabled={loading}
        style={buttonStyle('#6f42c1')}
        onClick={() => onInvoke('approve_action', { id: 'sub_streamvault' }, 'agent')}
      >
        Agent: approve a draft
      </button>
    </div>
  );
}

export default function App() {
  const [subs, setSubs] = useState([]);
  const [reviews, setReviews] = useState({});
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(null);

  const refresh = () => {
    api.get('/api/state').then((d) => setSubs(d.subscriptions)).catch((err) => setLastError(String(err)));
    api.get('/api/activity-log').then(setLog).catch((err) => setLastError(String(err)));
  };

  useEffect(refresh, []);

  // The one function every button calls — the owner's half of the shared /api/invoke
  // chokepoint every agent tool call also goes through. Refreshes after a refusal too, so
  // the refused call shows up in the activity log.
  const invoke = (tool, args, actor) => {
    setLoading(true);
    api.invoke(tool, args, actor)
      .then((res) => {
        setLoading(false);
        setLastError(res.success ? null : `${tool} refused: ${res.error}`);
        refresh();
      })
      .catch((err) => { setLoading(false); setLastError(String(err)); });
  };

  const runReview = () => {
    setLoading(true);
    api.invoke('review_subscriptions', {}, 'agent')
      .then((res) => {
        setLoading(false);
        refresh();
        if (!res.success) {
          setLastError(`review_subscriptions refused: ${res.error}`);
          return;
        }
        const byId = {};
        res.result.forEach((r) => { byId[r.id] = r; });
        setReviews(byId);
      })
      .catch((err) => { setLoading(false); setLastError(String(err)); });
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      {local && (
        <div role="note" style={{ background: '#e8f4fd', border: '1px solid #b6dcf7', color: '#0b4f7c', padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          Live demo: runs entirely in your browser on fictional, seeded data — nothing is sent anywhere. Reload to reset.{' '}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#0b4f7c' }}>Source on GitHub</a>
        </div>
      )}

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Subscription/Renewal Guard</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
        Drafting is free. Nothing about a subscription changes until you click Approve.
      </p>

      {lastError && (
        <div role="alert" style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fdecea', border: '1px solid #f5c2c0', color: '#611a15', padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {lastError}
          <button onClick={() => setLastError(null)} style={{ marginLeft: 12, cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      <button disabled={loading} style={buttonStyle('#343a40')} onClick={runReview}>Run Review</button>

      <div style={{ marginTop: 16 }}>
        {subs.map((sub) => (
          <SubscriptionCard key={sub.id} sub={sub} review={reviews[sub.id]} onInvoke={invoke} loading={loading} />
        ))}
      </div>

      <AgentProbe onInvoke={invoke} loading={loading} />

      <h2 style={{ fontSize: 16, marginTop: 28, marginBottom: 8 }}>Activity log</h2>
      <div style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>
        {log.slice().reverse().slice(0, 20).map((entry, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            {`${entry.timestamp} ${entry.actor} ${entry.tool} ${entry.result && entry.result.error ? '— refused: ' + entry.result.error : ''}`}
          </div>
        ))}
      </div>
    </div>
  );
}

/* global React, ReactDOM */
// The dashboard: plain React.createElement with no JSX build step, served as-is by Express
// and copied unchanged into the static live demo. It is the only UI source, and it is
// linted with the rest of the code.
const e = React.createElement;

// Present only in the static live demo (scripts/build-pages.js injects the bundle before
// this script): the same src/ domain code answering in-page instead of over HTTP.
const local = window.GuardLocal;
const SOURCE_URL = 'https://github.com/guptachetan1995/hack47-offgrid';
const TRANSCRIPT_URL = `${SOURCE_URL}/blob/main/docs/mcp-transcript.md`;
const TOKEN_KEY = 'guard-owner-token';

// npm start prints an owner link, http://localhost:3100/#owner=<token>. The fragment never
// reaches the server; the page keeps the token for this tab and sends it with owner
// actions only. The static demo has no server and needs none.
function readOwnerToken() {
  const match = /(?:^#|&)owner=([^&]+)/.exec(window.location.hash);
  try {
    if (match) {
      window.sessionStorage.setItem(TOKEN_KEY, match[1]);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return match[1];
    }
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return match ? match[1] : null;
  }
}
const ownerToken = local ? null : readOwnerToken();

const api = {
  get: (path) => (local ? local.get(path) : fetch(path).then((r) => r.json())),
  invoke: (tool, args, actor) => (local
    ? local.post('/api/invoke', { tool, args, actor })
    : fetch('/api/invoke', {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        actor === 'owner' && ownerToken ? { 'X-Owner-Token': ownerToken } : {}
      ),
      body: JSON.stringify({ tool, args, actor })
    }).then((r) => r.json()))
};

const isReviewable = (sub) => sub.status === 'active' || sub.status === 'trial';
const money = (n) => `$${n.toFixed(2)}`;

const STATUS_LABELS = {
  active: 'Active',
  trial: 'Trial',
  downgraded: 'Downgraded',
  cancelled: 'Cancelled',
  renegotiation_sent: 'Renegotiation sent'
};
const STATUS_COLORS = {
  active: '#1e7e34',
  trial: '#117a8b',
  downgraded: '#b35900',
  cancelled: '#c82333',
  renegotiation_sent: '#0062cc'
};
const ACTIONS = ['keep', 'downgrade', 'renegotiate', 'cancel'];
const ACTION_LABELS = { keep: 'Keep', downgrade: 'Downgrade', renegotiate: 'Renegotiate', cancel: 'Cancel' };

const panelStyle = { background: '#fff', borderRadius: 6, padding: 16, border: '1px solid #e0e0e0' };
const inputStyle = { width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4 };

function buttonStyle(bg) {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 4,
    padding: '6px 12px', marginRight: 6, marginTop: 4, cursor: 'pointer', fontSize: 13
  };
}

function badge(status) {
  return e('span', {
    style: {
      background: STATUS_COLORS[status] || '#666', color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontSize: 12, marginLeft: 8
    }
  }, STATUS_LABELS[status] || status);
}

function MoneyStrip({ subs, reviews }) {
  const byId = Object.fromEntries(subs.map((s) => [s.id, s]));
  const open = Object.values(reviews).filter((r) => byId[r.id] && isReviewable(byId[r.id]));
  const decided = subs.filter((s) => s.decision);
  if (open.length === 0 && decided.length === 0) {
    return null;
  }
  const sum = (xs, f) => xs.reduce((total, x) => total + f(x), 0);
  const cell = (label, amount, count) => e('div', { style: { flex: '1 1 200px', padding: '8px 12px' } },
    e('div', { style: { fontSize: 12, color: '#555' } }, label),
    e('div', { style: { fontSize: 22, fontWeight: 600 } }, `${money(amount)}/yr`),
    e('div', { style: { fontSize: 12, color: '#555' } }, `${count} subscription${count === 1 ? '' : 's'}`)
  );
  return e('div', {
    'aria-label': 'Money at stake',
    title: 'Yearly figures assume monthly billing unless a subscription is marked yearly.',
    style: { display: 'flex', flexWrap: 'wrap', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, marginTop: 16 }
  },
  cell('At stake in open flags', sum(open, (r) => r.annualAtStake || 0), open.length),
  cell('Decided by you', sum(decided, (s) => s.decision.annualAtStake || 0), decided.length)
  );
}

function SubscriptionCard({ sub, review, onInvoke, loading }) {
  const fired = review && review.firedRules;
  const latest = sub.priceHistory[sub.priceHistory.length - 1].amount;
  return e('div', { style: Object.assign({}, panelStyle, { marginBottom: 12 }) },
    e('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' } },
      e('strong', null, sub.service), badge(sub.status)
    ),
    e('div', { style: { fontSize: 13, color: '#555', marginTop: 4 } },
      `Latest price: ${money(latest)}${sub.billing === 'yearly' ? '/yr' : ''}`,
      sub.renewalDate ? ` · renews ${sub.renewalDate}` : '',
      sub.lastUsedAt ? ` · last used ${sub.lastUsedAt.slice(0, 10)}` : '',
      sub.trialEndsAt ? ` · trial ends ${sub.trialEndsAt.slice(0, 10)}` : ''
    ),
    sub.decision && !sub.draftAction && e('div', { style: { fontSize: 12, color: '#555', marginTop: 4 } },
      `Decided by you: ${ACTION_LABELS[sub.decision.action]} (${money(sub.decision.annualAtStake)}/yr at stake)`
    ),
    fired && fired.length > 0 && isReviewable(sub) && !sub.draftAction && e('div', { style: { marginTop: 10 } },
      fired.map((f, i) => e('div', { key: i, style: { fontSize: 13, color: '#8a4b00', marginBottom: 4 } }, '⚠️ ' + f.message)),
      e('div', { style: { marginTop: 6 } },
        ACTIONS.map((a) => e('button', {
          key: a, disabled: loading, style: buttonStyle('#5a6268'),
          onClick: () => onInvoke('apply_action', {
            id: sub.id, action: a,
            note: `${ACTION_LABELS[a]} — ${fired[0].message}`
          }, 'agent')
        }, ACTION_LABELS[a]))
      )
    ),
    sub.draftAction && e('div', { style: { marginTop: 10, background: '#fff8e6', padding: 10, borderRadius: 4 } },
      e('div', { style: { fontSize: 13 } }, e('strong', null, 'Draft: ' + ACTION_LABELS[sub.draftAction])),
      e('div', { style: { fontSize: 13, color: '#555', marginTop: 2 } }, sub.draftNote),
      e('div', { style: { marginTop: 8 } },
        e('button', { disabled: loading, style: buttonStyle('#1e7e34'), onClick: () => onInvoke('approve_action', { id: sub.id }, 'owner') }, 'Approve'),
        e('button', { disabled: loading, style: buttonStyle('#c82333'), onClick: () => onInvoke('reject_action', { id: sub.id, reason: 'owner declined' }, 'owner') }, 'Reject')
      )
    )
  );
}

const EMPTY_ROW = { service: '', prices: '', renewalDate: '', lastUsedAt: '', trialEndsAt: '', trialPrice: '', billing: 'monthly' };
const ROW_FIELDS = [
  ['service', 'Service', 'text', 'Name on the bill'],
  ['prices', 'Price history', 'text', '8.99@2025-06-01;12.99@2026-09-01'],
  ['renewalDate', 'Renews on', 'date'],
  ['lastUsedAt', 'Last used', 'date'],
  ['trialEndsAt', 'Trial ends', 'date'],
  ['trialPrice', 'Price after trial', 'text', '14.99']
];

function ImportPanel({ onInvoke, loading }) {
  const [row, setRow] = React.useState(EMPTY_ROW);
  const [csv, setCsv] = React.useState('');
  const [replace, setReplace] = React.useState(false);
  const set = (key) => (ev) => setRow(Object.assign({}, row, { [key]: ev.target.value }));
  const loadSample = () => api.get('/api/import-sample').then((d) => setCsv(d.csv));
  const addRow = () => {
    const filled = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ''));
    onInvoke('import_subscriptions', { rows: [filled] }, 'owner', () => setRow(EMPTY_ROW));
  };

  return e('details', { style: Object.assign({}, panelStyle, { marginTop: 16 }) },
    e('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 14 } }, 'Add or import your own subscriptions'),
    e('p', { style: { fontSize: 13, color: '#555', margin: '8px 0' } },
      local
        ? 'Stays in this page: nothing is uploaded, and a reload resets it. '
        : 'Goes only to this local server on 127.0.0.1. ',
      'Adding subscriptions is an owner action, sent through the same invoke() as Approve, and not one of the agent\'s tools. Then click Run Review.'
    ),
    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 } },
      ROW_FIELDS.map(([key, label, type, placeholder]) => e('label', { key, style: { fontSize: 12, color: '#333' } },
        label,
        e('input', { type, value: row[key], placeholder, onChange: set(key), 'aria-label': label, style: inputStyle })
      )),
      e('label', { style: { fontSize: 12, color: '#333' } },
        'Billing',
        e('select', { value: row.billing, onChange: set('billing'), 'aria-label': 'Billing', style: inputStyle },
          e('option', { value: 'monthly' }, 'monthly'),
          e('option', { value: 'yearly' }, 'yearly')
        )
      )
    ),
    e('button', { disabled: loading, style: Object.assign(buttonStyle('#343a40'), { marginTop: 8 }), onClick: addRow }, 'Add subscription'),
    e('label', { style: { display: 'block', fontSize: 12, color: '#333', marginTop: 14 } },
      'Or paste CSV with the header ',
      e('code', { style: { overflowWrap: 'anywhere' } }, 'service,prices,renewalDate,lastUsedAt,trialEndsAt,trialPrice,billing'),
      e('textarea', {
        value: csv, rows: 6, onChange: (ev) => setCsv(ev.target.value), 'aria-label': 'CSV',
        style: Object.assign({}, inputStyle, { fontFamily: 'monospace', marginTop: 4 })
      })
    ),
    e('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 } },
      e('button', { disabled: loading, style: buttonStyle('#5a6268'), onClick: loadSample }, 'Load sample'),
      e('button', {
        disabled: loading || !csv.trim(), style: buttonStyle('#343a40'),
        onClick: () => onInvoke('import_subscriptions', { csv, replace }, 'owner')
      }, 'Import CSV'),
      e('label', { style: { fontSize: 13, marginTop: 4 } },
        e('input', { type: 'checkbox', checked: replace, onChange: (ev) => setReplace(ev.target.checked), style: { marginRight: 4 } }),
        'Replace the demo subscriptions'
      )
    )
  );
}

function AgentProbe({ onInvoke, loading }) {
  return e('div', { style: Object.assign({}, panelStyle, { marginTop: 16, border: '1px dashed #6f42c1' }) },
    e('h2', { style: { fontSize: 16, marginBottom: 4 } }, 'Try it as the agent'),
    e('p', { style: { fontSize: 13, color: '#555', marginBottom: 10 } },
      'Two calls an over-reaching agent might make, sent as actor "agent" through the same invoke() every button above uses. Both are refused, and the refusal lands in the activity log. ',
      e('a', { href: TRANSCRIPT_URL, target: '_blank', rel: 'noopener noreferrer' }, 'See a real model (Claude) drive the four agent tools over MCP'),
      '.'
    ),
    e('button', {
      disabled: loading, style: buttonStyle('#6f42c1'),
      onClick: () => onInvoke('apply_action', {
        id: 'sub_streamvault', action: 'cancel', note: 'Cancel — price rose to $12.99.', status: 'cancelled'
      }, 'agent')
    }, 'Agent: set status directly'),
    e('button', {
      disabled: loading, style: buttonStyle('#6f42c1'),
      onClick: () => onInvoke('approve_action', { id: 'sub_streamvault' }, 'agent')
    }, 'Agent: approve a draft')
  );
}

function App() {
  const [subs, setSubs] = React.useState([]);
  const [reviews, setReviews] = React.useState({});
  const [log, setLog] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [lastError, setLastError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const refresh = () => {
    api.get('/api/state').then((d) => setSubs(d.subscriptions)).catch((err) => setLastError(String(err)));
    api.get('/api/activity-log').then(setLog).catch((err) => setLastError(String(err)));
  };

  // Run locally, an agent on the MCP server (src/mcp.js) drafts through the same server, so
  // the page polls to show its drafts as they land. The static demo has no other caller.
  React.useEffect(() => {
    refresh();
    if (local) {
      return undefined;
    }
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  // Refreshes after a refusal too, so the refused call shows up in the activity log.
  const invoke = (tool, args, actor, onSuccess) => {
    setLoading(true);
    api.invoke(tool, args, actor)
      .then((res) => {
        setLoading(false);
        setLastError(res.success ? null : `${tool} refused: ${res.error}`);
        if (res.success && tool === 'approve_action') {
          // Decided: its flag is no longer open. A reject leaves the flag showing, since
          // only the suggestion was dismissed.
          setReviews((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== args.id)));
        }
        if (res.success && tool === 'import_subscriptions') {
          setReviews({});
          setNotice(`Imported ${res.result.added.length} subscription${res.result.added.length === 1 ? '' : 's'}. Click Run Review to check ${res.result.added.length === 1 ? 'it' : 'them'}.`);
        }
        if (res.success && onSuccess) {
          onSuccess(res);
        }
        refresh();
      })
      .catch((err) => { setLoading(false); setLastError(String(err)); });
  };

  const runReview = () => {
    setLoading(true);
    setNotice(null);
    api.invoke('review_subscriptions', {}, 'agent')
      .then((res) => {
        setLoading(false);
        refresh();
        if (!res.success) { setLastError(`review_subscriptions refused: ${res.error}`); return; }
        const byId = {};
        res.result.forEach((r) => { byId[r.id] = r; });
        setReviews(byId);
      })
      .catch((err) => { setLoading(false); setLastError(String(err)); });
  };

  const note = (text, extra) => e('div', {
    role: 'note',
    style: Object.assign({ background: '#e8f4fd', border: '1px solid #b6dcf7', color: '#0b4f7c', padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13 }, extra)
  }, text);

  return e('div', { style: { maxWidth: 760, margin: '0 auto', padding: '24px 16px' } },
    local && note([
      'Live demo: runs entirely in your browser on fictional, seeded data — nothing is sent anywhere. Reload to reset. ',
      e('a', { key: 'src', href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer', style: { color: '#0b4f7c' } }, 'Source on GitHub')
    ]),
    !local && !ownerToken && note(
      'Opened without the owner link, so Approve, Reject and Import will be refused. Open the link npm start printed (it ends in #owner=…).',
      { background: '#fff4e5', border: '1px solid #f5d0a0', color: '#6b3d00' }
    ),
    e('h1', { style: { fontSize: 22, marginBottom: 4 } }, 'Subscription/Renewal Guard'),
    e('p', { style: { color: '#555', fontSize: 14, marginBottom: 16 } },
      'Drafting is free. Nothing about a subscription changes until you click Approve.'),
    lastError && e('div', {
      role: 'alert',
      style: { position: 'sticky', top: 0, zIndex: 1, background: '#fdecea', border: '1px solid #f5c2c0', color: '#611a15', padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13 }
    },
    lastError,
    e('button', { onClick: () => setLastError(null), style: { marginLeft: 12, cursor: 'pointer' } }, 'Dismiss')
    ),
    notice && note(notice),
    e('button', { disabled: loading, style: buttonStyle('#343a40'), onClick: runReview }, 'Run Review'),
    e(MoneyStrip, { subs, reviews }),
    e('div', { style: { marginTop: 16 } },
      subs.map((sub) => e(SubscriptionCard, {
        key: sub.id, sub, review: reviews[sub.id], onInvoke: invoke, loading
      }))
    ),
    e(ImportPanel, { onInvoke: invoke, loading }),
    e(AgentProbe, { onInvoke: invoke, loading }),
    e('h2', { style: { fontSize: 16, marginTop: 28, marginBottom: 8 } }, 'Activity log'),
    e('div', { style: { fontSize: 12, color: '#555', fontFamily: 'monospace', overflowWrap: 'anywhere' } },
      log.slice().reverse().slice(0, 20).map((entry, i) => e('div', { key: i, style: { marginBottom: 4 } },
        `${entry.timestamp} ${entry.actor} ${entry.tool} ${entry.result && entry.result.error ? '— refused: ' + entry.result.error : ''}`
      ))
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(e(App));

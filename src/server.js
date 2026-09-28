const crypto = require('crypto');
const express = require('express');
const path = require('path');
const api = require('./api');
const { localOnlyMiddleware } = require('./local-only');

const PORT = process.env.PORT || 3100;
const OWNER_HEADER = 'X-Owner-Token';

// Owner actions over HTTP (approve, reject, import) need this run's owner token, which only
// the terminal that ran `npm start` is shown, inside the owner link's #fragment. Browsers
// never send a fragment to the server, so the page itself doesn't carry the token and
// GET / hands it to nobody. An agent on the MCP server has no owner tools at all; this is
// what stops a local process that skips MCP and POSTs `actor: "owner"` itself.
function sameToken(presented, expected) {
  if (typeof presented !== 'string') {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createApp({ ownerToken }) {
  const app = express();

  app.use(localOnlyMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '../public')));

  app.get('/api/state', (req, res) => {
    res.json(api.getState());
  });

  app.get('/api/activity-log', (req, res) => {
    res.json(api.getActivityLog());
  });

  app.get('/api/tools', (req, res) => {
    res.json(api.getTools());
  });

  app.get('/api/import-sample', (req, res) => {
    res.json(api.getImportSample());
  });

  app.post('/api/invoke', async (req, res) => {
    if (req.body && req.body.actor === 'owner' && !sameToken(req.get(OWNER_HEADER), ownerToken)) {
      res.status(403).json({
        error: 'Owner actions need the owner link that npm start printed; it carries this run\'s owner token.'
      });
      return;
    }
    const { status, body } = await api.postInvoke(req.body);
    res.status(status).json(body);
  });

  return app;
}

// Exported so tests can drive the real Express app over a real (ephemeral, loopback)
// socket instead of only calling invoke() in-process.
module.exports = { createApp, OWNER_HEADER };

if (require.main === module) {
  const ownerToken = process.env.GUARD_OWNER_TOKEN || crypto.randomBytes(16).toString('hex');
  if (ownerToken.length < 16) {
    // eslint-disable-next-line no-console
    console.error('GUARD_OWNER_TOKEN must be at least 16 characters.');
    process.exit(1);
  }
  createApp({ ownerToken }).listen(PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`Subscription/Renewal Guard listening on http://localhost:${PORT} (local only)`);
    // eslint-disable-next-line no-console
    console.log(`Owner link (Approve, Reject and Import work only from here): http://localhost:${PORT}/#owner=${ownerToken}`);
  });
}

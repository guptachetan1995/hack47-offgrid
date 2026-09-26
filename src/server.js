const express = require('express');
const path = require('path');
const api = require('./api');
const { localOnlyMiddleware } = require('./local-only');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(localOnlyMiddleware);
app.use(express.json());
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

app.post('/api/invoke', async (req, res) => {
  const { status, body } = await api.postInvoke(req.body);
  res.status(status).json(body);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Exported so tests can drive the real Express app over a real (ephemeral, loopback)
// socket instead of only calling invoke() in-process.
module.exports = { app };

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`Subscription/Renewal Guard listening on http://localhost:${PORT} (local only)`);
  });
}

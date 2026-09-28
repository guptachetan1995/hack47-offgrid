const api = require('./api');

// The static live demo's transport: the dashboard's HTTP routes answered in-page by the
// same api.js the Express server uses. Everything crossing this boundary is JSON
// round-tripped, exactly as it would be over HTTP — the store hands out live references,
// and returning those would make React's setState a no-op after a mutation.
const viaJson = (v) => JSON.parse(JSON.stringify(v));

const GET_ROUTES = {
  '/api/state': api.getState,
  '/api/activity-log': api.getActivityLog,
  '/api/tools': api.getTools,
  '/api/import-sample': api.getImportSample
};

async function get(path) {
  const route = GET_ROUTES[path];
  if (!route) {
    throw new Error(`No route: GET ${path}`);
  }
  return viaJson(route());
}

// Resolves to the same body fetch(...).then((r) => r.json()) gives, 400 bodies included.
async function post(path, body = {}) {
  if (path !== '/api/invoke') {
    throw new Error(`No route: POST ${path}`);
  }
  const { body: resBody } = await api.postInvoke(viaJson(body));
  return viaJson(resBody);
}

module.exports = { get, post };

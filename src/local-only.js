// Loopback-only is the outer layer: the server binds to 127.0.0.1 (see server.js), and
// this middleware refuses anything else in case a proxy or a future change to that bind
// ever puts it on a real interface. It does not decide who the owner is. `actor` is a
// field in the request body; a request claiming `actor: "owner"` must also carry this
// run's owner token (server.js), and invoke() refuses owner-only calls from any other
// actor. None of this is multi-user authentication.

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackAddress(address) {
  return LOOPBACK_ADDRESSES.has(address);
}

function localOnlyMiddleware(req, res, next) {
  if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) {
    res.status(403).json({ error: 'This server only accepts local connections.' });
    return;
  }
  next();
}

module.exports = { isLoopbackAddress, localOnlyMiddleware };

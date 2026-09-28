// Records one MCP session with src/mcp.js over stdio, for an operator that can't hold a
// stdio pipe open between its own steps: a model working through a shell, one command at
// a time. The operator POSTs each JSON-RPC message; the relay writes those exact bytes to
// the MCP server's stdin, waits for the response with the same id, and hands it back.
// Every line in both directions is logged as sent, and POST /end writes the log out:
//
//   <out>.jsonl  one {seq, at, dir, line} per line, `line` byte for byte
//   <out>.md     the same session rendered for reading, generated from the log
//
//   node scripts/mcp-relay.js --port 3474 --guard http://127.0.0.1:3473 \
//     --out docs/mcp-transcript --label "Who drove it, how, and when"
//   curl -s --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://127.0.0.1:3474/send
//   curl -s -X POST http://127.0.0.1:3474/end
//
//   node scripts/mcp-relay.js --digest docs/mcp-transcript.jsonl
//     prints one line per message of a recorded session: each call as sent, and each
//     response as ok, a tool error, or a JSON-RPC error with its message.
//
// The relay decides nothing and edits nothing; it only moves and records lines.
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESPONSE_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  for (const key of ['port', 'guard', 'out', 'label']) {
    if (!args[key]) {
      throw new Error(`missing --${key}`);
    }
  }
  return args;
}

const fence = (lang, text) => `\`\`\`${lang}\n${text}\n\`\`\``;
const pretty = (line) => JSON.stringify(JSON.parse(line), null, 2);

function describeClient(msg) {
  if (msg.method === 'tools/call') {
    return `tools/call → ${msg.params && msg.params.name}`;
  }
  return msg.method;
}

// Rendering only: each client message pretty-printed, each tool result shown as its text
// content (which is the tool's own JSON), everything else pretty-printed as sent.
function renderMarkdown(entries, { label, guard, startedAt }) {
  const out = [
    '# MCP transcript: a real model in the agent seat',
    '',
    `**${label}**`,
    '',
    `Session recorded ${startedAt} against the dashboard server at \`${guard}\`, through`,
    '`src/mcp.js` over stdio. `scripts/mcp-relay.js` wrote each client message to the',
    'server\'s stdin byte for byte and recorded every line in both directions. This page is',
    'generated from that log, [`mcp-transcript.jsonl`](./mcp-transcript.jsonl), which has the',
    'exact bytes; nothing here was written or edited by hand. Tool results are shown as their',
    'text content.',
    ''
  ];
  let step = 0;
  for (const entry of entries) {
    if (entry.dir === 'client') {
      const msg = JSON.parse(entry.line);
      step += 1;
      out.push(`## ${step}. ${describeClient(msg)}`, '', `Client → server, ${entry.at}:`, '', fence('json', pretty(entry.line)), '');
    } else if (entry.dir === 'server') {
      const msg = JSON.parse(entry.line);
      out.push(`Server → client, ${entry.at}:`, '');
      if (msg.result && Array.isArray(msg.result.content)) {
        out.push(`\`isError: ${msg.result.isError}\``, '');
        msg.result.content.forEach((c) => out.push(fence(c.text.trim().startsWith('{') || c.text.trim().startsWith('[') ? 'json' : 'text', c.text), ''));
      } else {
        out.push(fence('json', pretty(entry.line)), '');
      }
    } else {
      out.push(`Server stderr, ${entry.at}:`, '', fence('text', entry.line), '');
    }
  }
  return out.join('\n');
}

// One line per protocol message, read straight off the log: calls with their exact
// arguments, responses reduced to ok / tool error / JSON-RPC error with its message.
function digest(entries) {
  return entries
    .filter((e) => e.dir === 'client' || e.dir === 'server')
    .map((e) => {
      const msg = JSON.parse(e.line);
      if (e.dir === 'client') {
        return msg.method === 'tools/call'
          ? `→ tools/call ${msg.params.name} ${JSON.stringify(msg.params.arguments)}`
          : `→ ${msg.method}`;
      }
      if (msg.error) {
        return `← error ${msg.error.code}: ${msg.error.message}`;
      }
      if (msg.result && Array.isArray(msg.result.tools)) {
        return `← ${msg.result.tools.length} tools: ${msg.result.tools.map((t) => t.name).join(', ')}`;
      }
      if (msg.result && msg.result.isError) {
        return `← tool error: ${msg.result.content.map((c) => c.text).join(' ')}`;
      }
      return '← ok';
    });
}

function main() {
  const { port, guard, out, label } = parseArgs(process.argv.slice(2));
  const outBase = path.resolve(ROOT, out);
  const startedAt = new Date().toISOString();
  const entries = [];
  const record = (dir, line) => entries.push({ seq: entries.length + 1, at: new Date().toISOString(), dir, line });
  const waiting = new Map();

  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'mcp.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { GUARD_URL: guard }),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  readline.createInterface({ input: child.stderr }).on('line', (line) => record('stderr', line));
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    record('server', line);
    let id;
    try {
      ({ id } = JSON.parse(line));
    } catch (err) {
      return;
    }
    const resolve = waiting.get(String(id));
    if (resolve) {
      waiting.delete(String(id));
      resolve(line);
    }
  });

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/send') {
        const line = body.replace(/\r?\n$/, '');
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (err) {
          res.writeHead(400).end('body must be one JSON-RPC message\n');
          return;
        }
        if (line.includes('\n')) {
          res.writeHead(400).end('one message per line: no newlines inside the message\n');
          return;
        }
        record('client', line);
        child.stdin.write(`${line}\n`);
        if (msg.id === undefined) {
          res.writeHead(204).end();
          return;
        }
        const timer = setTimeout(() => {
          waiting.delete(String(msg.id));
          res.writeHead(504).end(`no response with id ${msg.id} within ${RESPONSE_TIMEOUT_MS} ms\n`);
        }, RESPONSE_TIMEOUT_MS);
        waiting.set(String(msg.id), (response) => {
          clearTimeout(timer);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(`${response}\n`);
        });
      } else if (req.method === 'POST' && req.url === '/end') {
        child.stdin.end();
        child.on('close', () => {
          fs.writeFileSync(`${outBase}.jsonl`, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
          fs.writeFileSync(`${outBase}.md`, renderMarkdown(entries, { label, guard, startedAt }));
          res.writeHead(200).end(`wrote ${entries.length} lines to ${path.relative(ROOT, outBase)}.jsonl and .md\n`);
          server.close();
        });
      } else {
        res.writeHead(404).end();
      }
    });
  });
  server.listen(Number(port), '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`mcp-relay: POST messages to http://127.0.0.1:${port}/send, then POST /end`);
  });
}

module.exports = { renderMarkdown, digest };

if (require.main === module) {
  if (process.argv[2] === '--digest') {
    const entries = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // eslint-disable-next-line no-console
    console.log(digest(entries).join('\n'));
  } else {
    main();
  }
}

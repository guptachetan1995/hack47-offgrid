const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const MARKER = '<!-- pages:bundle -->';

// Builds the static live demo: the dashboard page plus one bundle of the real
// src/ domain code (invoke/store/rules/tools via api.js), so the browser runs the same
// chokepoint the Express server does. A relative outDir resolves against the entry root.
function build(outDir = path.join('dist', 'pages'), { template: templateFile = path.join(ROOT, 'public', 'index.html') } = {}) {
  // Checked before anything is written, so a bad template never leaves a half-built outDir.
  const template = fs.readFileSync(templateFile, 'utf8');
  const name = path.relative(ROOT, templateFile);
  const markers = template.split(MARKER).length - 1;
  if (markers !== 1) {
    throw new Error(`${name} must contain exactly one ${MARKER}, found ${markers}`);
  }
  const heads = template.split('</head>').length - 1;
  if (heads !== 1) {
    throw new Error(`${name} must contain exactly one </head>, found ${heads}`);
  }

  const out = path.resolve(ROOT, outDir);
  fs.mkdirSync(out, { recursive: true });

  const bundleFile = path.join(out, 'guard.bundle.js');
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src', 'browser-entry.js')],
    // Pins the bundle's module-path comments to the entry root, so the output never
    // carries the builder's home directory and its hash doesn't depend on cwd.
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    globalName: 'GuardLocal',
    platform: 'browser',
    target: 'es2019',
    minify: false,
    outfile: bundleFile,
    logLevel: 'silent'
  });

  // Content hash of what this build serves: the ?v= busts the Pages CDN cache on a
  // redeploy, and the meta tag lets a deploy poll for this exact build going live.
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(bundleFile))
    .update(template)
    .digest('hex')
    .slice(0, 12);

  const html = template
    .replace('</head>', `  <meta name="guard-build" content="${hash}">\n  </head>`)
    .replace(MARKER, `<script src="guard.bundle.js?v=${hash}"></script>`);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  return { outDir: out, hash };
}

module.exports = { build, MARKER };

if (require.main === module) {
  const { outDir, hash } = build(process.argv[2]);
  // eslint-disable-next-line no-console
  console.log(`Static demo built in ${path.relative(ROOT, outDir) || '.'} (guard-build ${hash})`);
}

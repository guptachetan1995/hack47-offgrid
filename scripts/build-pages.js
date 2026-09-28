const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const MARKER = '<!-- pages:bundle -->';
const APP_TAG = '<script src="app.js"></script>';

// Builds the static live demo: the dashboard page, its script (public/app.js, copied as-is)
// and one bundle of the real src/ domain code (invoke/store/rules/tools/import via api.js),
// so the browser runs the same chokepoint the Express server does. A relative outDir
// resolves against the entry root.
function build(outDir = path.join('dist', 'pages'), { template: templateFile = path.join(ROOT, 'public', 'index.html') } = {}) {
  // Checked before anything is written, so a bad template never leaves a half-built outDir.
  const template = fs.readFileSync(templateFile, 'utf8');
  const name = path.relative(ROOT, templateFile);
  const count = (needle) => template.split(needle).length - 1;
  for (const needle of [MARKER, '</head>', APP_TAG]) {
    const found = count(needle);
    if (found !== 1) {
      throw new Error(`${name} must contain exactly one ${needle}, found ${found}`);
    }
  }
  const app = fs.readFileSync(path.join(path.dirname(templateFile), 'app.js'));

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
    .update(app)
    .digest('hex')
    .slice(0, 12);

  const html = template
    .replace('</head>', `  <meta name="guard-build" content="${hash}">\n  </head>`)
    .replace(MARKER, `<script src="guard.bundle.js?v=${hash}"></script>`)
    .replace(APP_TAG, `<script src="app.js?v=${hash}"></script>`);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'app.js'), app);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  return { outDir: out, hash };
}

module.exports = { build, MARKER, APP_TAG };

if (require.main === module) {
  const { outDir, hash } = build(process.argv[2]);
  // eslint-disable-next-line no-console
  console.log(`Static demo built in ${path.relative(ROOT, outDir) || '.'} (guard-build ${hash})`);
}

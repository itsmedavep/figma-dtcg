// esbuild.config.mjs
// Build pipeline for the plugin: bundles UI + main thread and inlines assets.
// - Keeps __html__ in sync by inlining the freshly built ui bundle
// - Supports a simple --watch mode for iterative development
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = 'dist';
const isWatch = process.argv.includes('--watch');

/** Create the dist directory if missing. */
function ensureOutdir() {
  fs.mkdirSync(OUTDIR, { recursive: true });
}

/** Copy the raw UI HTML so esbuild can inline the compiled script. */
function copyUiHtml() {
  ensureOutdir();
  const src = 'src/app/ui.html';
  const dst = path.join(OUTDIR, 'ui.html');
  fs.copyFileSync(src, dst);
  console.log('✔ Copied ui.html →', dst);
}

/** Inline the compiled UI script into the HTML shell and return the final markup. */
function inlineUiScriptIntoHtml() {
  // Read built JS and HTML from dist, inline the script
  const htmlPath = path.join(OUTDIR, 'ui.html');
  const jsPath = path.join(OUTDIR, 'ui.js');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Replace a <script src="./ui.js"></script> (or with quotes variations) with inline script
  const replaced = html.replace(
    /<script\s+src=["']\.\/ui\.js["']><\/script>/i,
    '<script>' + js + '</script>'
  );

  // Overwrite dist/ui.html with inlined content for reference (optional)
  fs.writeFileSync(htmlPath, replaced, 'utf8');

  return replaced;
}

/** Bundle the iframe UI. */
async function buildUI() {
  await esbuild.build({
    entryPoints: { ui: 'src/app/ui.ts' },
    bundle: true,
    format: 'iife',
    target: ['es2017'],
    sourcemap: true,
    minify: false,
    outdir: OUTDIR,
    logLevel: 'info'
  });
}

/** Bundle the main thread, injecting the inlined UI markup as __html__. */
async function buildMain(inlinedHtml) {
  // inject __html__ from the inlined `dist/ui.html` string
  await esbuild.build({
    entryPoints: { main: 'src/app/main.ts' },
    bundle: true,
    format: 'iife',
    target: ['es2017'],
    sourcemap: true,
    minify: false,
    outdir: OUTDIR,
    logLevel: 'info',
    define: { __html__: JSON.stringify(inlinedHtml) }
  });
}

/** Full build sequence used for one-off builds and watch mode. */
async function buildAll() {
  await buildUI();
  copyUiHtml();
  const inlined = inlineUiScriptIntoHtml();
  await buildMain(inlined);
}

if (isWatch) {
  await buildAll();
  console.log('Watching for changes...');
  // naive watch: rebuild everything on any change under src/app
  const watcher = fs.watch('src/app', { recursive: true }, async () => {
    try { await buildAll(); } catch (e) { console.error(e); }
  });
} else {
  await buildAll();
}

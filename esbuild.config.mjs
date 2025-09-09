// esbuild.config.mjs
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = 'dist';
const isWatch = process.argv.includes('--watch');

function ensureOutdir() {
  fs.mkdirSync(OUTDIR, { recursive: true });
}

function copyUiHtml() {
  ensureOutdir();
  const src = 'src/app/ui.html';
  const dst = path.join(OUTDIR, 'ui.html');
  fs.copyFileSync(src, dst);
  console.log('✔ Copied ui.html →', dst);
}

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

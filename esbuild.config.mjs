
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');
const outdir = 'dist';

/** Copy ui.html to dist */
function copyHtml() {
  fs.mkdirSync(outdir, { recursive: true });
  fs.copyFileSync('src/app/ui.html', path.join(outdir, 'ui.html'));
}

copyHtml();

const ctx = await esbuild.context({
  entryPoints: {
    'main': 'src/app/main.ts',
    'ui': 'src/app/ui.ts',
  },
  bundle: true,
  minify: false,
  sourcemap: true,
  target: ['es2017'],
  format: 'iife',
  outdir,
  logLevel: 'info'
});

if (isWatch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

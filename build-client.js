import esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outdir = 'dist/client';

// Clean output
fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

// Build Tailwind CSS (includes Flowbite)
console.log('Building Tailwind CSS...');
execSync('npx @tailwindcss/cli -i src/client/tailwind.css -o dist/client/tailwind.css --minify', {
  stdio: 'inherit',
});

// Copy app.css
fs.copyFileSync('src/client/app.css', path.join(outdir, 'app.css'));

// Copy icons
const iconsSrc = path.join('docs', 'icons');
const iconsDst = path.join(outdir, 'icons');
fs.mkdirSync(iconsDst, { recursive: true });
for (const f of fs.readdirSync(iconsSrc)) {
  fs.copyFileSync(path.join(iconsSrc, f), path.join(iconsDst, f));
}

// Generate index.html (cache-bust query string forces browser reload after rebuild)
const cacheBust = Date.now();
const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X(P)FeRD</title>
  <link rel="stylesheet" href="/tailwind.css?v=${cacheBust}">
  <link rel="stylesheet" href="/app.css?v=${cacheBust}">
</head>
<body>
  <div id="app"></div>
  <script src="/app.js?v=${cacheBust}"></script>
</body>
</html>`;
fs.writeFileSync(path.join(outdir, 'index.html'), html);

await esbuild.build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  outfile: path.join(outdir, 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  conditions: ['svelte', 'browser'],
  define: {
    VERSION: JSON.stringify(process.env.VERSION || 'dev'),
  },
  plugins: [
    sveltePlugin({
      preprocess: sveltePreprocess(),
    }),
  ],
  loader: {
    '.ts': 'ts',
  },
  logLevel: 'info',
});

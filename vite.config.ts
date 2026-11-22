import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/, adds .nojekyll, and mirrors dist/ into docs/
      // so GitHub Pages "Deploy from a branch" (/docs) works directly on subpaths.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        transformIndexHtml(html: string): string {
          return html.replace(/<script data-root-static-fallback>[\s\S]*?<\/script>\s*/g, '');
        },
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const docsDir = path.resolve(__dirname, 'docs');
          const rootAssetsDir = path.resolve(__dirname, 'assets');
          const rootNoJekyll = path.resolve(__dirname, '.nojekyll');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          if (fs.existsSync(distDir)) {
            fs.writeFileSync(rootNoJekyll, '');
            fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
            fs.rmSync(docsDir, {recursive: true, force: true});
            fs.cpSync(distDir, docsDir, {recursive: true, force: true});
            fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

            const distIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
            const jsMatches = [...distIndexHtml.matchAll(/src="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
            const cssMatches = [...distIndexHtml.matchAll(/href="\.\/assets\/([^"]+\.css)"/g)].map((m) => m[1]);

            const builtAssetsDir = path.join(distDir, 'assets');
            if (fs.existsSync(builtAssetsDir)) {
              fs.rmSync(rootAssetsDir, {recursive: true, force: true});
              fs.cpSync(builtAssetsDir, rootAssetsDir, {recursive: true, force: true});

              const bootLines = [
                '(function () {',
                '  var base = (document.currentScript && document.currentScript.src) || window.location.href;',
                ...cssMatches.map(
                  (css) =>
                    `  var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./${css}', base).href; document.head.appendChild(l);`
                ),
                ...jsMatches.map(
                  (js) =>
                    `  var m = document.createElement('script'); m.type = 'module'; m.crossOrigin = 'anonymous'; m.src = new URL('./${js}', base).href; document.body.appendChild(m);`
                ),
                '})();',
              ];
              fs.writeFileSync(path.join(rootAssetsDir, 'boot.js'), bootLines.join('\n') + '\n');
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

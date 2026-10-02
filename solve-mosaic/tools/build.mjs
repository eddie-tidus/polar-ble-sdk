// Bundles the app and the vendored three.js into one self-contained HTML file
// (dist/solve-mosaic.html) that opens straight from disk, no server needed.
//   npm install && npm run build

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const vendorThree = {
  name: 'vendor-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: join(root, 'vendor/three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: join(root, 'vendor/addons', a.path.slice('three/addons/'.length)) }));
  },
};

const result = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'inline',
  write: false,
  plugins: [vendorThree],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
html = html.replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">\n${js}\n</script>`);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/solve-mosaic.html'), html);
console.log(`dist/solve-mosaic.html  ${(html.length / 1024).toFixed(0)} KB`);

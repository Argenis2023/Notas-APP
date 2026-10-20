// Empaqueta las librerías en app/vendor para que la app funcione sin internet.
// Uso: cd tools && npm install && npm run build
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const app = join(root, 'app');
mkdirSync(join(app, 'vendor'), { recursive: true });
mkdirSync(join(app, 'fonts'), { recursive: true });

const common = { bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2020', legalComments: 'none', logLevel: 'warning' };

await build({ ...common, stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: join(root, 'tools') }, outfile: join(app, 'vendor/supabase.js') });
await build({ ...common, stdin: { contents: "import Dexie from 'dexie'; export default Dexie; export { Dexie };", resolveDir: join(root, 'tools') }, outfile: join(app, 'vendor/dexie.js') });
await build({ ...common, stdin: { contents: "import * as XLSX from 'xlsx'; export default XLSX;", resolveDir: join(root, 'tools') }, outfile: join(app, 'vendor/xlsx.js') });

copyFileSync(join(root, 'tools/node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2'), join(app, 'fonts/public-sans.woff2'));
copyFileSync(join(root, 'tools/node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2'), join(app, 'fonts/source-serif-4.woff2'));

// Lista de archivos de la app y versión (hash del contenido) para el service worker
const skip = new Set(['sw.js', 'config.json', 'js/version.js']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else { const rel = relative(app, p); if (!skip.has(rel)) files.push(rel); }
  }
})(app);
const hash = createHash('sha256');
for (const f of files) { hash.update(f); hash.update(readFileSync(join(app, f))); }
const version = hash.digest('hex').slice(0, 10);
writeFileSync(join(app, 'js/version.js'), `// Generado por tools/build.mjs\nexport const VERSION = '${version}';\n`);
const sw = readFileSync(join(app, 'sw.src.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(['./', ...files.filter(f => f !== 'sw.src.js'), 'js/version.js', 'config.json']));
writeFileSync(join(app, 'sw.js'), sw);
console.log('Listo. Versión', version, '·', files.length, 'archivos');

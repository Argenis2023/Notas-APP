// Empaqueta la función del reporte semanal en UN archivo para pegarlo en Supabase (Edge Functions > Código).
// Uso: node build-fn.mjs [--prueba]   (con --prueba genera un paquete para correr en Node con pdf-lib local)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const prueba = process.argv.includes('--prueba');
const dexieStub = {
  name: 'sin-dexie',
  setup(b) {
    b.onResolve({ filter: /vendor\/dexie\.js$/ }, () => ({ path: 'dexie-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default class Dexie { version() { return { stores() {} }; } }', loader: 'js' }));
    if (prueba) b.onResolve({ filter: /^npm:@supabase/ }, () => ({ path: mockSupa }));
    if (prueba) b.onResolve({ filter: /^npm:nodemailer/ }, () => ({ path: 'nm-stub', namespace: 'stub2' }));
    b.onLoad({ filter: /.*/, namespace: 'stub2' }, () => ({ contents: 'export default { createTransport() { return { sendMail: async () => ({}) }; } }', loader: 'js' }));
    if (prueba) b.onResolve({ filter: /^npm:pdf-lib/ }, a => b.resolve(a.path.replace(/^npm:/, '').replace(/@[\d.]+$/, ''), { resolveDir: aqui, kind: a.kind }));
  },
};
const entrada = path.join(aqui, '..', 'supabase', 'functions', 'reporte-semanal', prueba ? 'nucleo-prueba.js' : 'main.js');
const mockSupa = path.join(aqui, '..', 'supabase', 'functions', 'reporte-semanal', 'mock-supabase.js');
const salida = path.join(aqui, '..', 'supabase', 'functions', 'reporte-semanal', prueba ? 'dist-prueba.mjs' : 'bundle.js');
await build({
  entryPoints: [entrada], outfile: salida, bundle: true, format: 'esm', platform: prueba ? 'node' : 'neutral',
  target: 'es2022', minify: !prueba, plugins: [dexieStub], external: prueba ? [] : ['npm:*'], logLevel: 'warning',
  mainFields: ['module', 'main'],
});
console.log(`Listo: ${path.relative(path.join(aqui, '..'), salida)} (${Math.round(fs.statSync(salida).size / 1024)} KB)`);

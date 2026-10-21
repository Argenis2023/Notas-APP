// Solo para pruebas en Node: una "base de datos" en memoria con la parte de la API de Supabase que usa la función.
export const DB = { tablas: {}, usuarios: {}, sesion: null };
const clonar = x => JSON.parse(JSON.stringify(x));
function consulta(nombre) {
  const filtros = []; let accion = 'select', datos = null, opts = null, rango = null;
  const filas = () => (DB.tablas[nombre] || []).filter(r => filtros.every(([k, v]) => r[k] === v));
  const q = {
    select() { return q; },
    eq(k, v) { filtros.push([k, v]); return q; },
    range(a, b) { rango = [a, b]; return q; },
    update(d) { accion = 'update'; datos = d; return q; },
    upsert(d, o) { accion = 'upsert'; datos = d; opts = o; return q; },
    maybeSingle() { return Promise.resolve({ data: clonar(filas()[0] || null), error: null }); },
    then(ok, mal) {
      let res;
      if (accion === 'select') { let f = clonar(filas()); if (rango) f = f.slice(rango[0], rango[1] + 1); res = { data: f, error: null }; }
      else if (accion === 'update') { for (const r of filas()) Object.assign(r, datos); res = { data: null, error: null }; }
      else {
        const t = (DB.tablas[nombre] = DB.tablas[nombre] || []);
        const clave = opts && opts.onConflict;
        const ya = t.find(r => r[clave] === datos[clave]);
        if (ya) Object.assign(ya, datos); else t.push({ ...datos });
        res = { data: null, error: null };
      }
      return Promise.resolve(res).then(ok, mal);
    },
  };
  return q;
}
export const createClient = (url, key, opts) => ({
  from: consulta,
  auth: {
    getUser: async () => ({ data: { user: (opts && opts.global && opts.global.headers && opts.global.headers.Authorization) ? DB.sesion : null } }),
    admin: { getUserById: async id => ({ data: { user: DB.usuarios[id] || null } }) },
  },
});

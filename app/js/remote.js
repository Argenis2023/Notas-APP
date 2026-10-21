// Conexión real con Supabase: login y envío/recepción de filas.
import { createClient } from '../vendor/supabase.js';

export function createSupabase(url, anonKey) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const auth = {
    async session() {
      const { data } = await client.auth.getSession();
      if (data && data.session) return { email: data.session.user.email };
      // Sin conexión no se puede renovar el permiso vencido, pero la cuenta sigue guardada en el celular.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try {
          const s = JSON.parse(localStorage.getItem(client.auth.storageKey));
          if (s && s.refresh_token && s.user && s.user.email) return { email: s.user.email };
        } catch { /* sin sesión guardada */ }
      }
      return null;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { email: data.user.email };
    },
    async signOut() {
      await client.auth.signOut();
    },
    // Vuelve a pedir la clave de la cuenta que ya tiene la sesión abierta (para acciones peligrosas).
    async verify(password) {
      const { data } = await client.auth.getSession();
      const email = data && data.session && data.session.user.email;
      if (!email) throw new Error('Sin sesión');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
  };

  // Si la tabla aún no existe en Supabase (falta correr el SQL nuevo), no se rompe la sincronización.
  const falta = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(e.message || ''));
  const remote = {
    async pull(table, since) {
      const out = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select('*');
        if (since) q = q.gte('server_updated_at', since);
        const { data, error } = await q.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (error) { if (falta(error)) return out; throw new Error(error.message); }
        out.push(...data);
        if (data.length < PAGE) break;
      }
      return out;
    },
    async push(table, rows) {
      if (!rows.length) return;
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error && falta(error)) throw new Error('Falta crear la tabla ' + table + ' en Supabase. Corre el SQL nuevo del proyecto.');
      if (error) throw new Error(error.message);
    },
    // Borra todas las filas de la cuenta en una tabla (la regla de seguridad deja borrar solo las propias).
    async wipe(table) {
      const { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && falta(error)) return;
      if (error) throw new Error(error.message);
    },
  };

  // Asistente de redacción: llama a la función segura de Supabase (la clave de la IA nunca está en la app).
  const invocar = async (funcion, body) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('offline'), { codigo: 'offline' });
    const { data, error } = await client.functions.invoke(funcion, { body });
    if (error) {
      let cuerpo = null;
      try { cuerpo = error.context && error.context.json ? await error.context.json() : null; } catch { /* sin cuerpo */ }
      const estado = error.context && error.context.status;
      const codigo = cuerpo && cuerpo.error ? cuerpo.error : estado === 404 ? 'no_desplegada' : estado === 401 ? 'sin_sesion' : 'error';
      throw Object.assign(new Error(codigo), { codigo, detalle: cuerpo && cuerpo.detalle });
    }
    return data;
  };
  const ia = (tipo, datos) => invocar('ia-redactor', { tipo, datos });
  // Reporte semanal por correo (configuración, envío ahora). El programador lo llama el servidor.
  const reporte = (accion, datos = {}) => invocar('reporte-semanal', { accion, ...datos });

  return { auth, remote, ia, reporte };
}

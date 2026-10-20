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
  };

  const remote = {
    async pull(table, since) {
      const out = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select('*');
        if (since) q = q.gte('server_updated_at', since);
        const { data, error } = await q.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...data);
        if (data.length < PAGE) break;
      }
      return out;
    },
    async push(table, rows) {
      if (!rows.length) return;
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    },
  };

  return { auth, remote };
}

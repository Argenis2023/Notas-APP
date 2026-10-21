// Sorteos para el aula: turnos y grupos al azar. Funciones puras; el azar se puede cambiar para probarlas.

// Copia de la lista en orden aleatorio (Fisher-Yates).
export function mezclar(lista, azar = Math.random) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cuántos grupos salen según lo que pide la docente. Siempre entre 1 y la cantidad de personas.
export function cantidadDeGrupos(n, { grupos, tam } = {}) {
  if (!n) return 0;
  const g = tam ? Math.ceil(n / Math.max(1, Math.floor(tam))) : Math.floor(grupos);
  return Math.min(n, Math.max(1, Number.isFinite(g) ? g : 1));
}

// Reparte la lista en grupos al azar y lo más parejos posible (los tamaños se diferencian en 1 como máximo).
// Pide { grupos } (cuántos grupos) o { tam } (cuántos integrantes por grupo).
export function repartirGrupos(lista, opciones, azar = Math.random) {
  const g = cantidadDeGrupos(lista.length, opciones);
  if (!g) return [];
  const grupos = Array.from({ length: g }, () => []);
  mezclar(lista, azar).forEach((x, i) => grupos[i % g].push(x));
  return grupos;
}

// Saca a una persona al azar de los que faltan por pasar.
export function sacarUno(pendientes, azar = Math.random) {
  if (!pendientes.length) return { elegido: null, resto: [] };
  const i = Math.floor(azar() * pendientes.length);
  return { elegido: pendientes[i], resto: pendientes.filter((_, k) => k !== i) };
}

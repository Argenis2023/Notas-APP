// Importar estudiantes desde Excel y exportar todos los datos.
// La librería de Excel pesa bastante, por eso se carga solo cuando se necesita.
import { db, TABLE_NAMES, TABLES } from './data.js';

let xlsxPromise;
const loadXlsx = () => (xlsxPromise ||= import('../vendor/xlsx.js').then(m => m.default));

export const quitarAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = s => quitarAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export const normalizarNombre = s => quitarAcentos(s).toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

export const COLUMNAS = [
  { campo: 'numero_lista', titulo: 'N° de lista', alias: ['n', 'no', 'nro', 'numero', 'numerodelista', 'nrodelista', 'lista', 'nrolista', 'numlista'] },
  { campo: 'nombre_completo', titulo: 'Nombre completo', alias: ['nombre', 'nombrecompleto', 'nombres', 'estudiante', 'alumno', 'nombreyapellido', 'apellidosynombres', 'nombresyapellidos', 'apellidosnombres'] },
  { campo: 'cedula', titulo: 'Cédula o cédula escolar', alias: ['cedula', 'cedulaescolar', 'ci', 'cedulaocedulaescolar', 'documento', 'cedulaoescolar'] },
  { campo: 'fecha_nacimiento', titulo: 'Fecha de nacimiento', alias: ['fechadenacimiento', 'nacimiento', 'fechanacimiento', 'fnac', 'fechanac'] },
  { campo: 'representante_nombre', titulo: 'Representante', alias: ['representante', 'nombredelrepresentante', 'nombrerepresentante'] },
  { campo: 'representante_contacto', titulo: 'Contacto del representante', alias: ['contacto', 'telefono', 'contactodelrepresentante', 'telefonodelrepresentante', 'celular', 'telefonorepresentante'] },
  { campo: 'necesidades_educativas', titulo: 'Necesidades educativas', alias: ['necesidadeseducativas', 'necesidades', 'nee', 'necesidadesespeciales'] },
  { campo: 'observaciones_conducta', titulo: 'Observaciones de conducta', alias: ['observaciones', 'observacionesdeconducta', 'conducta', 'observacion'] },
];

const textoCelda = v => (v == null ? '' : String(v).trim());

// Fecha de una celda: número de serie de Excel, texto dd/mm/aaaa o aaaa-mm-dd. Devuelve 'AAAA-MM-DD' o null.
export function fechaDeCelda(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (v < 1 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  } else return null;
  const f = new Date(Date.UTC(y, mo - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

// Lee la primera hoja y devuelve { filas, avisos, columnas }.
export async function leerEstudiantes(buffer) {
  const XLSX = await loadXlsx();
  let wb;
  try { wb = XLSX.read(buffer, { type: 'array' }); }
  catch { throw new Error('No se pudo leer el archivo. Usa un Excel (.xlsx o .xls) o un .csv.'); }
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '', blankrows: false });

  const detectar = fila => {
    const mapa = {};
    fila.forEach((cel, i) => {
      const k = clave(cel);
      if (!k) return;
      if (k === 'apellidos') mapa.__apellidos = i;
      for (const c of COLUMNAS) {
        if (mapa[c.campo] == null && (k === clave(c.titulo) || c.alias.includes(k))) mapa[c.campo] = i;
      }
    });
    return mapa;
  };

  let inicio = -1, mapa = {};
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const m = detectar(matriz[i]);
    if (m.nombre_completo != null) { inicio = i; mapa = m; break; }
  }
  if (inicio < 0) throw new Error('No encontré la columna del nombre. La primera fila debe tener títulos como "Nombre completo". Descarga la plantilla para ver el formato.');

  const filas = [];
  const avisos = [];
  for (let i = inicio + 1; i < matriz.length; i++) {
    const r = matriz[i];
    const linea = i + 1;
    let nombre = textoCelda(r[mapa.nombre_completo]);
    if (mapa.__apellidos != null) {
      const ap = textoCelda(r[mapa.__apellidos]);
      nombre = `${ap} ${nombre}`.trim();
    }
    const vacia = r.every(c => textoCelda(c) === '');
    if (vacia) continue;
    if (!nombre) { avisos.push(`Fila ${linea}: falta el nombre, no se importa.`); continue; }
    const fila = { nombre_completo: nombre, _linea: linea };
    for (const c of COLUMNAS) {
      if (c.campo === 'nombre_completo' || mapa[c.campo] == null) continue;
      const v = r[mapa[c.campo]];
      if (c.campo === 'fecha_nacimiento') {
        const f = fechaDeCelda(v);
        if (!f && textoCelda(v)) avisos.push(`Fila ${linea}: no entendí la fecha "${textoCelda(v)}", se deja vacía.`);
        fila.fecha_nacimiento = f;
      } else if (c.campo === 'numero_lista') {
        const n = parseInt(textoCelda(v), 10);
        fila.numero_lista = Number.isNaN(n) ? null : n;
      } else {
        fila[c.campo] = textoCelda(v);
      }
    }
    filas.push(fila);
  }
  const columnas = COLUMNAS.filter(c => mapa[c.campo] != null || (c.campo === 'nombre_completo')).map(c => c.titulo);
  return { filas, avisos, columnas };
}

// Marca las filas que ya existen (misma cédula o mismo nombre) o se repiten dentro del archivo.
export function marcarRepetidos(filas, existentes) {
  const cedulas = new Set(existentes.map(e => clave(e.cedula)).filter(Boolean));
  const nombres = new Set(existentes.map(e => normalizarNombre(e.nombre_completo)));
  const vistosC = new Set(), vistosN = new Set();
  return filas.map(f => {
    const c = clave(f.cedula), n = normalizarNombre(f.nombre_completo);
    let motivo = null;
    if (c && cedulas.has(c)) motivo = 'ya existe con esa cédula';
    else if (nombres.has(n)) motivo = 'ya existe con ese nombre';
    else if (c && vistosC.has(c)) motivo = 'repetido en el archivo (cédula)';
    else if (vistosN.has(n)) motivo = 'repetido en el archivo (nombre)';
    if (c) vistosC.add(c);
    vistosN.add(n);
    return { ...f, _repetido: motivo };
  });
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export { descargar };

export async function plantillaEstudiantes() {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS.map(c => c.titulo)]);
  hoja['!cols'] = COLUMNAS.map(c => ({ wch: Math.max(14, c.titulo.length + 2) }));
  XLSX.utils.book_append_sheet(wb, hoja, 'Estudiantes');
  const ayuda = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar esta plantilla'],
    ['1. Escribe un estudiante por fila, debajo de los títulos de la hoja "Estudiantes".'],
    ['2. Lo único obligatorio es el nombre. Las demás columnas se pueden dejar vacías.'],
    ['3. Si no pones el N° de lista, la app los numera en orden.'],
    ['4. La fecha de nacimiento puede ir como 25/03/2016.'],
    ['5. Guarda el archivo e impórtalo desde la app.'],
  ]);
  ayuda['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ayuda, 'Instrucciones');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'plantilla-estudiantes.xlsx');
}

const TITULOS = {
  estudiantes: Object.fromEntries(COLUMNAS.map(c => [c.campo, c.titulo])),
};

// Excel con todos los datos: una hoja por tabla que tenga filas.
export async function exportarTodo() {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  let hojas = 0;
  for (const t of TABLE_NAMES) {
    const filas = (await db[t].toArray()).filter(r => !r.deleted);
    if (!filas.length) continue;
    const campos = ['id', ...Object.keys(TABLES[t].cols)];
    const titulos = campos.map(c => (TITULOS[t] && TITULOS[t][c]) || c);
    const datos = filas.map(f => campos.map(c => {
      const v = f[c];
      return v != null && typeof v === 'object' ? JSON.stringify(v) : (v ?? '');
    }));
    const hoja = XLSX.utils.aoa_to_sheet([titulos, ...datos]);
    hoja['!cols'] = titulos.map(x => ({ wch: Math.max(12, String(x).length + 2) }));
    XLSX.utils.book_append_sheet(wb, hoja, t.slice(0, 31));
    hojas += 1;
  }
  if (!hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Todavía no hay datos']]), 'Sin datos');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const fecha = new Date().toISOString().slice(0, 10);
  descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `cuaderno-docente-${fecha}.xlsx`);
  return hojas;
}

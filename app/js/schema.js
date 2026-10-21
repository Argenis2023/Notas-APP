// Esquema único de datos. De aquí salen las tablas locales (IndexedDB)
// y el SQL de Supabase (tools/gen-sql.mjs). Si agregas un campo, hazlo aquí.
//
// Tipos: text, int, num, bool, date, ts, json, uuid

export const TABLES = {
  secciones: {
    cols: { nombre: 'text', grado: 'text', anio_escolar: 'text', siguiente_codigo: 'int' },
    idx: '',
  },
  lapsos: {
    cols: { seccion_id: 'uuid', numero: 'int', fecha_inicio: 'date', fecha_fin: 'date', cerrado: 'bool' },
    idx: 'seccion_id',
  },
  estudiantes: {
    cols: {
      seccion_id: 'uuid', numero_lista: 'int', nombre_completo: 'text', cedula: 'text',
      fecha_nacimiento: 'date', representante_nombre: 'text', representante_contacto: 'text',
      necesidades_educativas: 'text', observaciones_conducta: 'text', codigo_ia: 'text',
    },
    idx: 'seccion_id, numero_lista',
  },
  asignaturas: {
    cols: { seccion_id: 'uuid', nombre: 'text', orden: 'int' },
    idx: 'seccion_id',
  },
  evaluaciones: {
    cols: { asignatura_id: 'uuid', lapso_id: 'uuid', nombre: 'text', tipo: 'text', fecha: 'date' },
    idx: 'asignatura_id, lapso_id',
  },
  indicadores: {
    cols: { evaluacion_id: 'uuid', texto: 'text', etiqueta: 'text', orden: 'int', peso: 'num' },
    idx: 'evaluacion_id',
  },
  resultados: {
    cols: { indicador_id: 'uuid', estudiante_id: 'uuid', nivel: 'text', observacion: 'text' },
    idx: 'indicador_id, estudiante_id',
  },
  notas: {
    cols: { evaluacion_id: 'uuid', estudiante_id: 'uuid', nota_calculada: 'int', nota_final: 'int', observacion: 'text' },
    idx: 'evaluacion_id, estudiante_id',
  },
  asistencia: {
    cols: { estudiante_id: 'uuid', fecha: 'date', estado: 'text' },
    idx: 'estudiante_id, fecha',
  },
  recomendaciones: {
    cols: { asignatura_id: 'uuid', indicador_etiqueta: 'text', deficiencia: 'text', recomendacion: 'text', origen: 'text' },
    idx: 'asignatura_id',
  },
  reportes: {
    cols: {
      tipo: 'text', estudiante_id: 'uuid', seccion_id: 'uuid', lapso_id: 'uuid',
      texto: 'text', generado_con_ia: 'bool', revisado_en: 'ts',
    },
    idx: 'estudiante_id, lapso_id',
  },
  anotaciones: {
    cols: { estudiante_id: 'uuid', seccion_id: 'uuid', fecha: 'date', texto: 'text', tipo: 'text' },
    idx: 'estudiante_id, fecha',
  },
  configuracion: {
    cols: {
      umbral_indicador_debil: 'num', minimo_aprobatorio: 'int', puntos_logrado: 'num',
      puntos_en_proceso: 'num', puntos_no_logrado: 'num', tabla_conversion: 'json',
      hora_aviso: 'text', dias_aviso: 'int',
      institucion_nombre: 'text', institucion_subtitulo: 'text', institucion_encabezado: 'text',
      institucion_color: 'text', institucion_logo: 'text', docente_nombre: 'text',
    },
    idx: '',
  },
  avisos: {
    cols: { tipo: 'text', fecha_programada: 'ts', referencia_id: 'uuid', enviado: 'bool' },
    idx: 'fecha_programada',
  },
  suscripciones_push: {
    cols: { endpoint: 'text', claves: 'json' },
    idx: '',
  },
};

export const TABLE_NAMES = Object.keys(TABLES);

// Columnas que llevan todas las tablas
export const COMMON_COLS = { id: 'uuid', created_at: 'ts', updated_at: 'ts', deleted: 'bool' };

export function allCols(table) {
  return { ...COMMON_COLS, ...TABLES[table].cols };
}

// Convierte un valor de formulario al tipo de la columna.
export function coerce(type, v) {
  if (v === undefined) return undefined;
  if (type === 'bool') return !!v;
  if (type === 'json') return v ?? null;
  if (v === null) return null;
  if (type === 'int') {
    if (v === '') return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (type === 'num') {
    if (v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Deja solo las columnas de la tabla (con sus tipos) de un objeto parcial.
export function normalize(table, data) {
  const cols = TABLES[table].cols;
  const out = {};
  for (const [k, type] of Object.entries(cols)) {
    if (k in data) out[k] = coerce(type, data[k]);
  }
  return out;
}

// Fila local -> fila para Supabase (sin campos locales ni de servidor).
export function toRemote(table, row) {
  const out = {};
  for (const [k, type] of Object.entries(allCols(table))) {
    if (k in row) out[k] = coerce(type, row[k]);
  }
  return out;
}

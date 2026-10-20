# Cuaderno docente

App web instalable (PWA) para una docente: estudiantes, listas de cotejo y reportes. Guarda primero en el celular y respalda en Supabase.

La cuestionario original sigue en `index.html` (raíz). La app está en `app/`.

## Publicar
GitHub Pages sirve la carpeta del repositorio; la app queda en `https://<usuario>.github.io/cuestionario-app/app/`.
Después de cambiar código: `cd tools && npm install && npm run build` y subir todo (incluidos `app/vendor`, `app/fonts`, `app/sw.js`, `app/js/version.js`).
Cuando haya versión nueva, la app muestra "Actualizar" a la docente.

## Respaldo en la nube (Supabase, gratis)
1. Crear proyecto en supabase.com.
2. SQL Editor: pegar y ejecutar `supabase/schema.sql`.
3. Authentication > Users: crear el usuario (correo y contraseña de la docente). Authentication > Sign In / Providers: desactivar "Allow new users to sign up".
4. Project Settings > API: copiar `Project URL` y la clave `anon public`.
5. Pegarlas en `app/config.json` (`supabaseUrl`, `supabaseAnonKey`) y publicar. La clave anon es pública por diseño; los datos los protege RLS.

Nota: el plan gratis pausa el proyecto tras ~1 semana sin uso; basta entrar a la app o al panel para reactivarlo.

## Privacidad
La IA (etapa 4) solo recibirá códigos ("Estudiante 7"), nunca nombres, cédula, fecha de nacimiento ni contactos.

## Asistente de redacción (IA)
La función `supabase/functions/ia-redactor/index.ts` redacta borradores con Gemini (y Groq de respaldo).
1. Clave gratis en aistudio.google.com (Get API key). Nunca va en el código de la app.
2. Supabase > Edge Functions > Secrets: agregar `GEMINI_API_KEY`. Opcionales: `GROQ_API_KEY`, `GEMINI_MODEL`, `GROQ_MODEL`, `ALLOWED_EMAIL` (solo ese correo puede usarla) y `ALLOWED_ORIGIN`.
3. Supabase > Edge Functions > Deploy a new function > Via Editor: nombre `ia-redactor`, pegar `index.ts` y Deploy. Dejar activada "Verify JWT".
4. En la app: Ajustes > Asistente de redacción > "Probar la conexión con la IA".
La app solo envía códigos ("Estudiante 7"), notas, indicadores y porcentajes. La función además rechaza correos y números largos.

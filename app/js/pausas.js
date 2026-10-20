// Pausas activas: actividades cortas para hacer con el curso. Funcionan sin internet y sin IA.
export const TIPOS = [
  { id: 'todas', texto: 'Todas' },
  { id: 'activar', texto: 'Activar el cuerpo' },
  { id: 'calmar', texto: 'Calmar' },
  { id: 'concentrar', texto: 'Concentrarse' },
];

export const PAUSAS = [
  { id: 'estirar-gigante', tipo: 'activar', min: 2, titulo: 'El gigante y la hormiga', pasos: ['Todos de pie, junto a su puesto.', 'Dile al curso: "Somos gigantes". Se ponen en puntitas y estiran los brazos hacia el techo.', 'Luego: "Somos hormigas". Se agachan lo más pequeños que puedan.', 'Repite 6 veces, cada vez más rápido.'] },
  { id: 'estirar-arbol', tipo: 'calmar', min: 2, titulo: 'El árbol con viento', pasos: ['De pie, con los pies separados y los brazos arriba como ramas.', 'Respiran profundo por la nariz.', 'Mientras suena un "shhh" suave de la maestra, se mueven de un lado a otro como un árbol con brisa.', 'Terminan con los brazos abajo y una respiración lenta.'] },
  { id: 'respira-globo', tipo: 'calmar', min: 2, titulo: 'Inflar el globo', pasos: ['Sentados, con las manos sobre la barriga.', 'Toman aire por la nariz contando hasta 4, como si inflaran un globo.', 'Sueltan el aire despacio por la boca contando hasta 4.', 'Repiten 5 veces, con los ojos cerrados si quieren.'] },
  { id: 'respira-flor', tipo: 'calmar', min: 2, titulo: 'Oler la flor, apagar la vela', pasos: ['Cada niño imagina una flor en una mano y una vela en la otra.', 'Huelen la flor: aire por la nariz.', 'Apagan la vela: aire suave por la boca.', 'Repiten 5 veces.'] },
  { id: 'espejo', tipo: 'concentrar', min: 3, titulo: 'El espejo', pasos: ['Se ponen en parejas, frente a frente.', 'Uno hace movimientos lentos y el otro los copia como un espejo.', 'A la señal de la maestra cambian de papel.', 'Sin hablar: gana el espejo más parecido.'] },
  { id: 'simon', tipo: 'concentrar', min: 3, titulo: 'Simón dice', pasos: ['La maestra da órdenes de movimiento: "Simón dice: toquen sus hombros".', 'Solo se hace si empieza con "Simón dice".', 'Si la orden no empieza así, se quedan quietos.', 'Se puede cambiar el líder: un estudiante da las órdenes.'] },
  { id: 'estatuas', tipo: 'activar', min: 3, titulo: 'Estatuas y baile', pasos: ['Pon una canción conocida, o aplaude un ritmo, mientras todos bailan junto a su puesto.', 'Cuando la música pare, todos se quedan como estatuas.', 'El que se mueva se sienta a ser el juez.', 'Repite 4 o 5 rondas.'] },
  { id: 'cuerpo-saludo', tipo: 'activar', min: 2, titulo: 'Saludo de las partes del cuerpo', pasos: ['De pie, "saludan" cada parte con un movimiento: manos, hombros, cuello, cintura, rodillas, tobillos.', 'Giran suavemente cada una 5 veces hacia cada lado.', 'Terminan sacudiendo todo el cuerpo 5 segundos.'] },
  { id: 'cuello-hombros', tipo: 'calmar', min: 2, titulo: 'Cuello y hombros sin tensión', pasos: ['Sentados con la espalda recta.', 'Suben los hombros hasta las orejas, cuentan hasta 3 y los sueltan de golpe. Repiten 4 veces.', 'Inclinan la cabeza hacia un lado y luego hacia el otro, despacio.', 'Giran los hombros hacia atrás 5 veces.'] },
  { id: 'manos', tipo: 'activar', min: 2, titulo: 'Manos que hablan', pasos: ['Abren y cierran las manos rápido 10 veces.', 'Mueven los dedos como si tocaran un piano.', 'Se dan un masaje en las manos, una con la otra.', 'Terminan sacudiéndolas como si estuvieran mojadas.'] },
  { id: 'animales', tipo: 'activar', min: 3, titulo: 'Caminata de animales', pasos: ['Cada vez que la maestra nombra un animal, todos lo imitan sin hablar, en su sitio.', 'Ejemplos: rana (saltos pequeños), elefante (pasos pesados con trompa), pájaro (alas), serpiente (brazos ondulando).', 'Que los niños propongan los animales.'] },
  { id: 'contar', tipo: 'concentrar', min: 3, titulo: 'Contar con aplausos', pasos: ['La maestra dice un número y todos aplauden esa cantidad de veces, sin equivocarse.', 'Luego los números se piden en orden contrario o de dos en dos.', 'Para subir la dificultad, se pide aplaudir con una mano y pisar con el pie.'] },
  { id: 'silencio', tipo: 'calmar', min: 2, titulo: 'Un minuto de silencio', pasos: ['Todos apoyan la cabeza sobre los brazos en el pupitre, con los ojos cerrados.', 'La maestra pide escuchar tres sonidos: uno lejano, uno cercano y uno propio, como la respiración.', 'Después de un minuto levantan la cabeza despacio.', 'Cada uno cuenta en voz baja un sonido que escuchó.'] },
  { id: 'cruzado', tipo: 'concentrar', min: 2, titulo: 'Mano y rodilla opuestas', pasos: ['De pie, tocan con la mano derecha la rodilla izquierda, y luego al revés.', 'Hacen 10 repeticiones, primero lento y después más rápido.', 'Variante: tocan el talón por detrás.'] },
  { id: 'palabra-cadena', tipo: 'concentrar', min: 3, titulo: 'Cadena de palabras', pasos: ['La maestra dice una palabra, por ejemplo "casa".', 'El siguiente estudiante dice otra que empiece con la última sílaba: "sapo".', 'Sigue la cadena sin repetir, hasta que alguien no encuentre una palabra.', 'Si se traba, la clase lo ayuda y se sigue.'] },
  { id: 'cuerda', tipo: 'activar', min: 2, titulo: 'Saltar la cuerda imaginaria', pasos: ['De pie, hacen como si giraran una cuerda con las manos.', 'Saltan en su sitio 20 veces, primero con los dos pies y luego alternando.', 'Terminan respirando profundo 3 veces.'] },
];

export const filtrarPausas = tipo => (tipo && tipo !== 'todas' ? PAUSAS.filter(p => p.tipo === tipo) : PAUSAS);

// "Sorpréndeme": evita repetir la anterior. `azar` se puede reemplazar en las pruebas.
export function pausaAlAzar(tipo, anteriorId, azar = Math.random) {
  const lista = filtrarPausas(tipo);
  const opciones = lista.length > 1 ? lista.filter(p => p.id !== anteriorId) : lista;
  return opciones[Math.floor(azar() * opciones.length)];
}
export const pausaPorId = id => PAUSAS.find(p => p.id === id) || null;

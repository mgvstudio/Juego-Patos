/* =============================================================
   Encuentra los Patos
   -------------------------------------------------------------
   CONFIG concentra todo lo que se puede cambiar sin tocar el
   resto del codigo: cantidad de patos, tamano, imagen y las
   zonas del fondo donde pueden aparecer (todo en % del lienzo,
   asi el juego escala solo en cualquier pantalla o tableta).
   ============================================================= */
const CONFIG = {
  totalPatos: 5,

  // Imagenes: cambia estas rutas para usar otro fondo u otro pato
  imagenFondo: 'background6.jpg',
  imagenPato: 'pato.png',

  // Tamano del pato como % del ANCHO del lienzo (se sortea entre min y max).
  // Mas pequeno = mas dificil. Como hay zoom con dos dedos, se pueden
  // usar valores bajos sin que sea imposible tocarlos.
  //   Facil   : 3.5 - 5.5
  //   Normal  : 2.4 - 3.6
  //   Dificil : 1.5 - 2.6
  //   Experto : 0.9 - 1.6   <- actual
  //   Extremo : 0.6 - 1.0
  tamanoMin: 0.9,
  tamanoMax: 1.6,

  // Giro aleatorio en grados (+/-)
  giroMax: 22,

  // Separacion minima entre patos, en % del ancho
  separacionMin: 12,

  // Zonas donde pueden esconderse los patos (x, y, ancho, alto en %).
  // Agrega, quita o recorta zonas para dirigir el escondite.
  zonas: [
    { x: 2, y: 4, ancho: 96, alto: 92 }
  ],

  // Se voltean horizontalmente al azar para que no se vean repetidos
  espejoAleatorio: true,

  // ---- Camuflaje ----
  // Que tanto se funden los patos con la ilustracion del fondo.
  //   opacidad : 1 = solido, 0.3 = casi transparente
  //   mezcla   : modo de fusion con el fondo
  //              'multiply'  -> se integra en fondos claros (recomendado)
  //              'luminosity'-> toma el color del fondo
  //              'normal'    -> sin fusion
  //   saturacion / contraste : 1 = sin cambios, menos = mas apagado
  camuflaje: {
    opacidad: 0.5,
    mezcla: 'multiply',
    saturacion: 0.7,
    contraste: 0.85,
    // Cada pato varia un poco para que no se noten todos igual
    variacionOpacidad: 0.12
  },

  // ---- Zoom ----
  // El juego arranca acercado: nunca se ve la imagen completa, hay que
  // recorrerla arrastrando para encontrar a los patos.
  //   zoomInicial : acercamiento con el que empieza cada partida
  //   zoomMin     : lo mas lejos que se puede alejar el jugador
  //                 (igual a zoomInicial = nunca ve la imagen entera;
  //                  ponlo en 1 si quieres permitir ver todo el fondo)
  //   zoomMax     : lo mas cerca que puede acercarse
  zoomInicial: 2.4,
  zoomMin: 2.4,
  zoomMax: 8,

  // Cada partida empieza mirando un punto distinto del fondo
  inicioAleatorio: true,

  // Pixeles invisibles alrededor del pato que tambien responden al toque
  margenToque: 10,
  // Pixeles de arrastre permitidos antes de considerar que fue un movimiento
  // (y no un toque para atrapar un pato)
  umbralToque: 12,

  // ---- Reglas ----
  // Cuenta regresiva en milisegundos (90000 = 1:30). 0 = sin limite.
  tiempoLimite: 90000,
  // Segundos que se muestran los patos faltantes al acabarse el tiempo
  segundosRevelado: 4,
  // El reloj cambia a ambar / rojo (latiendo) con estos segundos restantes
  avisoAmbar: 20,
  avisoRojo: 10,

  // ---- Efectos ----
  sonidoPato: true,     // "cuac" al atrapar (sonidos/cuac.mp3 o sintetizado)
  volumenPato: 1,
  vibracion: true       // vibra el dispositivo al atrapar (si lo soporta)
};

// Guarda el nombre del jugador entre partidas
const CLAVE_NOMBRE = 'patos.nombre';

/* ===== Referencias del DOM ===== */
const $ = (sel) => document.querySelector(sel);

const escenario     = $('#escenario');
const lienzo        = $('#lienzo');
const capaPatos     = $('#capa-patos');
const fondo         = $('#fondo');
const elEncontrados = $('#encontrados');
const elTotal       = $('#total');
const elPistas      = $('#pistas');
const elCrono       = $('#cronometro');
const lienzoConfeti = $('#confeti');
const ctx           = lienzoConfeti.getContext('2d');

/* ===== Estado ===== */
const estado = {
  jugando: false,
  encontrados: 0,
  inicio: 0,
  transcurrido: 0,
  rafCrono: null,
  ultimoTiempo: 0,
  nombre: ''
};

// "tableta" en pantallas tactiles; "pantalla" con raton
const MODO_JUEGO = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  ? 'tableta' : 'pantalla';

/* =============================================================
   Utilidades
   ============================================================= */
const aleatorio = (min, max) => Math.random() * (max - min) + min;
const limitar   = (v, min, max) => Math.min(max, Math.max(min, v));

function formatearTiempo(ms) {
  const total = Math.max(0, ms);
  const min = Math.floor(total / 60000);
  const seg = Math.floor((total % 60000) / 1000);
  const dec = Math.floor((total % 1000) / 100);
  return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0') + '.' + dec;
}

function abrirModal(id)  { $(id).classList.add('activa'); }
function cerrarModal(id) { $(id).classList.remove('activa'); }

/* =============================================================
   Zoom y desplazamiento (pellizco con dos dedos + arrastre)
   -------------------------------------------------------------
   La transformacion se aplica al #lienzo completo, asi que el
   fondo y la capa de patos hacen zoom juntos y perfectamente
   alineados.
   ============================================================= */
const vista = { escala: 1, x: 0, y: 0 };
const punteros = new Map();       // pointerId -> {x, y}
let distanciaInicial = 0;
let escalaInicial = 1;
let centroInicial = null;
let huboMovimiento = false;

function aplicarVista() {
  lienzo.style.transform =
    'translate(' + vista.x + 'px,' + vista.y + 'px) scale(' + vista.escala + ')';
  lienzo.classList.toggle('con-zoom', vista.escala > 1.001);
  informarVista();
}

// Zona del fondo que esta mirando el jugador (fracciones 0..1) para el panel en vivo
function informarVista() {
  if (!window.EnVivo || !estado.jugando) return;
  const ancho = lienzo.offsetWidth * vista.escala;
  const alto  = lienzo.offsetHeight * vista.escala;
  if (!ancho || !alto) return;
  const dispAncho = Math.min(escenario.clientWidth, ancho);
  const dispAlto  = Math.min(escenario.clientHeight, alto);
  const f = (v) => limitar(v, 0, 1).toFixed(3);
  EnVivo.actualizar({
    vista: [f(-vista.x / ancho), f(-vista.y / alto), f(dispAncho / ancho), f(dispAlto / alto)].join(',')
  });
}

// Convierte coordenadas de pantalla a coordenadas locales del lienzo sin transformar
function aPuntoLocal(clientX, clientY) {
  const rect = escenario.getBoundingClientRect();
  return {
    x: clientX - rect.left - lienzo.offsetLeft,
    y: clientY - rect.top  - lienzo.offsetTop
  };
}

function limitarDesplazamiento() {
  const ancho = lienzo.offsetWidth;
  const alto  = lienzo.offsetHeight;
  vista.x = limitar(vista.x, ancho * (1 - vista.escala), 0);
  vista.y = limitar(vista.y, alto  * (1 - vista.escala), 0);
}

function hacerZoom(nuevaEscala, clientX, clientY) {
  const anterior = vista.escala;
  const escala = limitar(nuevaEscala, CONFIG.zoomMin, CONFIG.zoomMax);
  if (escala === anterior) return;

  const p = aPuntoLocal(clientX, clientY);
  // Punto del contenido que esta bajo el dedo/cursor
  const contenidoX = (p.x - vista.x) / anterior;
  const contenidoY = (p.y - vista.y) / anterior;

  vista.escala = escala;
  vista.x = p.x - contenidoX * escala;
  vista.y = p.y - contenidoY * escala;

  limitarDesplazamiento();
  aplicarVista();
}

/**
 * Coloca la vista en el acercamiento inicial. Por defecto encuadra un
 * punto al azar del fondo, asi cada partida empieza en una zona distinta.
 */
function reiniciarVista(aleatorio_ = false) {
  vista.escala = limitar(CONFIG.zoomInicial, CONFIG.zoomMin, CONFIG.zoomMax);

  const ancho = lienzo.offsetWidth;
  const alto  = lienzo.offsetHeight;

  // Centrado: deja el mismo margen oculto a cada lado
  vista.x = ancho * (1 - vista.escala) / 2;
  vista.y = alto  * (1 - vista.escala) / 2;

  if (aleatorio_ && CONFIG.inicioAleatorio) {
    // Desplaza el encuadre a un punto cualquiera del recorrido posible
    vista.x = ancho * (1 - vista.escala) * Math.random();
    vista.y = alto  * (1 - vista.escala) * Math.random();
  }

  limitarDesplazamiento();
  aplicarVista();
}

/**
 * Da al #lienzo exactamente el tamano que ocupa la imagen dentro del
 * escenario (tipo "contain", calculado a mano). Es lo que garantiza que
 * la capa de patos coincida al pixel con el fondo en cualquier pantalla,
 * al rotar la tableta y al entrar o salir de pantalla completa.
 */
function ajustarLienzo() {
  const anchoNatural = fondo.naturalWidth;
  const altoNatural  = fondo.naturalHeight;
  if (!anchoNatural || !altoNatural) return;   // la imagen aun no carga

  const dispAncho = escenario.clientWidth;
  const dispAlto  = escenario.clientHeight;
  if (!dispAncho || !dispAlto) return;

  const proporcion = anchoNatural / altoNatural;

  let ancho = dispAncho;
  let alto  = ancho / proporcion;

  if (alto > dispAlto) {
    alto  = dispAlto;
    ancho = alto * proporcion;
  }

  lienzo.style.width  = Math.round(ancho) + 'px';
  lienzo.style.height = Math.round(alto) + 'px';

  limitarDesplazamiento();
  aplicarVista();
}

function distanciaEntre(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroEntre(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

escenario.addEventListener('pointerdown', (ev) => {
  punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  escenario.setPointerCapture(ev.pointerId);

  if (punteros.size === 1) {
    huboMovimiento = false;
  } else if (punteros.size === 2) {
    const [a, b] = [...punteros.values()];
    distanciaInicial = distanciaEntre(a, b);
    escalaInicial = vista.escala;
    centroInicial = centroEntre(a, b);
    huboMovimiento = true;   // con dos dedos nunca se atrapa un pato
  }
});

escenario.addEventListener('pointermove', (ev) => {
  if (!punteros.has(ev.pointerId)) return;

  const previo = punteros.get(ev.pointerId);
  const dx = ev.clientX - previo.x;
  const dy = ev.clientY - previo.y;
  punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (punteros.size === 2) {
    // ---- Pellizco: zoom + arrastre simultaneo ----
    const [a, b] = [...punteros.values()];
    const distancia = distanciaEntre(a, b);
    const centro = centroEntre(a, b);

    if (distanciaInicial > 0) {
      const objetivo = escalaInicial * (distancia / distanciaInicial);
      hacerZoom(objetivo, centro.x, centro.y);
    }

    // Desplazamiento del centro entre los dos dedos
    if (centroInicial) {
      vista.x += centro.x - centroInicial.x;
      vista.y += centro.y - centroInicial.y;
      limitarDesplazamiento();
      aplicarVista();
    }
    centroInicial = centro;
    return;
  }

  if (punteros.size === 1) {
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (Math.hypot(dx, dy) > 0) huboMovimiento = huboMovimiento || Math.hypot(dx, dy) > 2;
    }
    // Arrastrar para recorrer el fondo
    if (vista.escala > 1.001) {
      vista.x += dx;
      vista.y += dy;
      limitarDesplazamiento();
      aplicarVista();
    }
  }
});

function soltarPuntero(ev) {
  const era = punteros.size;
  punteros.delete(ev.pointerId);

  if (punteros.size < 2) {
    distanciaInicial = 0;
    centroInicial = null;
  }

  // Toque limpio con un solo dedo => intento de atrapar un pato
  if (era === 1 && !huboMovimiento && ev.type === 'pointerup') {
    const objetivo = document.elementFromPoint(ev.clientX, ev.clientY);
    const pato = objetivo && objetivo.closest ? objetivo.closest('.pato') : null;
    if (pato) atraparPato(pato);
  }
}

escenario.addEventListener('pointerup', soltarPuntero);
escenario.addEventListener('pointercancel', soltarPuntero);

// Zoom con la rueda del raton (y trackpad)
escenario.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
  hacerZoom(vista.escala * factor, ev.clientX, ev.clientY);
}, { passive: false });

// Doble toque / doble clic: acercar o volver al tamano original
let ultimoToque = 0;
escenario.addEventListener('pointerup', (ev) => {
  const ahora = Date.now();
  if (ahora - ultimoToque < 300 && !huboMovimiento) {
    if (vista.escala > CONFIG.zoomMin + 0.01) reiniciarVista();
    else hacerZoom(vista.escala * 2, ev.clientX, ev.clientY);
    ultimoToque = 0;
  } else {
    ultimoToque = ahora;
  }
});

/* =============================================================
   Colocacion de patos
   ============================================================= */
function sortearPosiciones(cantidad) {
  const puestos = [];
  let intentos = 0;

  while (puestos.length < cantidad && intentos < 3000) {
    intentos++;

    const zona = CONFIG.zonas[Math.floor(Math.random() * CONFIG.zonas.length)];
    const tam  = aleatorio(CONFIG.tamanoMin, CONFIG.tamanoMax);

    // Margen para que el pato no se salga de la zona
    const x = aleatorio(zona.x, zona.x + Math.max(0, zona.ancho - tam));
    const y = aleatorio(zona.y, zona.y + Math.max(0, zona.alto - tam * 1.2));

    const choca = puestos.some((p) => Math.hypot(p.x - x, p.y - y) < CONFIG.separacionMin);

    // Si ya costo mucho, aceptamos posiciones mas juntas para no trabarnos
    if (choca && intentos < 2000) continue;

    puestos.push({ x: x, y: y, tam: tam });
  }

  return puestos;
}

function pintarPatos() {
  capaPatos.innerHTML = '';
  elPistas.innerHTML = '';

  sortearPosiciones(CONFIG.totalPatos).forEach((pos, i) => {
    const pato = document.createElement('div');
    pato.className = 'pato';
    pato.dataset.indice = String(i);
    pato.setAttribute('role', 'button');
    pato.setAttribute('aria-label', 'Pato escondido');

    const giro = aleatorio(-CONFIG.giroMax, CONFIG.giroMax);
    const espejo = CONFIG.espejoAleatorio && Math.random() < 0.5 ? -1 : 1;

    pato.style.left  = pos.x + '%';
    pato.style.top   = pos.y + '%';
    pato.style.width = pos.tam + '%';
    pato.style.aspectRatio = '1 / 1';
    pato.style.setProperty('--giro', giro.toFixed(1) + 'deg');
    pato.style.setProperty('--espejo', String(espejo));

    // Camuflaje, con una pizca de variacion por pato
    const cam = CONFIG.camuflaje;
    const opacidad = limitar(
      cam.opacidad + aleatorio(-cam.variacionOpacidad, cam.variacionOpacidad),
      0.15, 1
    );
    pato.style.setProperty('--opacidad', opacidad.toFixed(2));
    pato.style.setProperty('--mezcla', cam.mezcla);
    pato.style.setProperty('--saturacion', String(cam.saturacion));
    pato.style.setProperty('--contraste', String(cam.contraste));
    pato.style.backgroundImage = 'url("' + CONFIG.imagenPato + '")';
    // Area de toque un poco mayor que el dibujo, para que sean pequenos
    // de ver pero comodos de atrapar con el dedo
    pato.style.padding = CONFIG.margenToque + 'px';
    pato.style.margin  = '-' + CONFIG.margenToque + 'px';

    capaPatos.appendChild(pato);

    const pista = document.createElement('span');
    pista.className = 'pista';
    elPistas.appendChild(pista);
  });
}

/* =============================================================
   Interaccion
   ============================================================= */
function atraparPato(pato) {
  if (!estado.jugando) return;
  if (pato.classList.contains('encontrado')) return;

  pato.classList.add('encontrado');

  const caja = pato.getBoundingClientRect();
  lanzarConfeti(caja.left + caja.width / 2, caja.top + caja.height / 2);

  estado.encontrados++;
  elEncontrados.textContent = String(estado.encontrados);

  const pista = elPistas.children[estado.encontrados - 1];
  if (pista) pista.classList.add('ok');

  setTimeout(() => pato.remove(), 500);

  if (CONFIG.sonidoPato && window.SonidoPato) {
    SonidoPato.volumen = CONFIG.volumenPato;
    SonidoPato.cuac({ veces: 2 });
  }
  if (CONFIG.vibracion && navigator.vibrate) navigator.vibrate(60);
  if (window.EnVivo) EnVivo.actualizar({ encontrados: estado.encontrados });

  if (estado.encontrados >= CONFIG.totalPatos) terminarPartida();
}

/* =============================================================
   Cronometro
   ============================================================= */
function tick() {
  estado.transcurrido = performance.now() - estado.inicio;

  if (CONFIG.tiempoLimite > 0) {
    const restante = CONFIG.tiempoLimite - estado.transcurrido;
    elCrono.textContent = formatearTiempo(restante);
    elCrono.classList.toggle('ambar', restante <= CONFIG.avisoAmbar * 1000 && restante > CONFIG.avisoRojo * 1000);
    elCrono.classList.toggle('rojo', restante <= CONFIG.avisoRojo * 1000);
    if (restante <= 0) { tiempoAgotado(); return; }
  } else {
    elCrono.textContent = formatearTiempo(estado.transcurrido);
  }

  estado.rafCrono = requestAnimationFrame(tick);
}

function textoReloj() {
  return formatearTiempo(CONFIG.tiempoLimite > 0 ? CONFIG.tiempoLimite : 0);
}

function iniciarCrono() {
  estado.inicio = performance.now();
  cancelAnimationFrame(estado.rafCrono);
  tick();
}

function detenerCrono() {
  cancelAnimationFrame(estado.rafCrono);
  estado.rafCrono = null;
}

/* =============================================================
   Partida
   ============================================================= */
function nuevaPartida() {
  detenerCrono();
  estado.jugando = true;
  estado.encontrados = 0;
  estado.transcurrido = 0;

  elEncontrados.textContent = '0';
  elCrono.textContent = textoReloj();
  elCrono.classList.remove('ambar', 'rojo');
  escenario.classList.remove('agotado');

  ajustarLienzo();
  pintarPatos();       // posiciones nuevas en cada partida
  reiniciarVista(true);  // y un encuadre de inicio distinto
  iniciarCrono();

  cerrarModal('#modal-fin');
  cerrarModal('#modal-inicio');
  cerrarModal('#modal-ranking');

  const aviso = $('#aviso-guardado');
  aviso.textContent = '';
  aviso.className = 'aviso';

  if (window.EnVivo) {
    EnVivo.iniciar({ nombre: estado.nombre, modo: MODO_JUEGO, total: CONFIG.totalPatos });
    informarVista();
  }
}

/** Gano: encontro todos los patos */
function terminarPartida() {
  estado.jugando = false;
  detenerCrono();
  estado.ultimoTiempo = Math.round(estado.transcurrido);
  elCrono.classList.remove('ambar', 'rojo');

  if (window.EnVivo) EnVivo.cerrar('ganado', { encontrados: estado.encontrados });
  if (CONFIG.sonidoPato && window.SonidoPato) setTimeout(() => SonidoPato.victoria(), 350);
  lluviaConfeti();

  // Solo las partidas completas entran al ranking; se guarda solo
  guardarAutomatico();

  setTimeout(() => {
    $('#titulo-fin').textContent = '¡Los encontraste todos! 🎉';
    $('#tiempo-final').textContent = formatearTiempo(estado.ultimoTiempo);
    $('#tiempo-final').style.display = '';
    $('#resumen-fin').textContent = CONFIG.totalPatos + ' / ' + CONFIG.totalPatos + ' patos encontrados';
    abrirModal('#modal-fin');
  }, 700);
}

/** Perdio: se acabo la cuenta regresiva */
function tiempoAgotado() {
  estado.jugando = false;
  detenerCrono();
  elCrono.textContent = formatearTiempo(0);

  if (window.EnVivo) EnVivo.cerrar('perdido', { encontrados: estado.encontrados });
  if (CONFIG.sonidoPato && window.SonidoPato) SonidoPato.aviso();

  // El fondo se tine de verde y los patos que faltaban se muestran sin camuflaje
  escenario.classList.add('agotado');
  capaPatos.querySelectorAll('.pato:not(.encontrado)').forEach((p) => p.classList.add('revelado'));

  setTimeout(() => {
    $('#titulo-fin').textContent = '¡Se acabó el tiempo! ⏰';
    $('#tiempo-final').style.display = 'none';
    $('#resumen-fin').textContent = estado.encontrados + ' / ' + CONFIG.totalPatos + ' patos encontrados';
    const aviso = $('#aviso-guardado');
    aviso.textContent = 'Solo las partidas completas entran al ranking.';
    aviso.className = 'aviso';
    abrirModal('#modal-fin');
  }, CONFIG.segundosRevelado * 1000);
}

/* =============================================================
   Confeti
   ============================================================= */
let particulas = [];
let rafConfeti = null;
// Paleta de marca para el confeti (MongoDB)
const COLORES = ['#00ED64', '#00A35C', '#00684A', '#C0FAE6', '#E3FCF7', '#FFFFFF'];

function ajustarLienzoConfeti() {
  const dpr = window.devicePixelRatio || 1;
  lienzoConfeti.width  = window.innerWidth * dpr;
  lienzoConfeti.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function lanzarConfeti(x, y, cantidad) {
  cantidad = cantidad || 46;
  for (let i = 0; i < cantidad; i++) {
    const angulo = Math.random() * Math.PI * 2;
    const fuerza = aleatorio(3, 12);
    particulas.push({
      x: x, y: y,
      vx: Math.cos(angulo) * fuerza,
      vy: Math.sin(angulo) * fuerza - 3,
      tam: aleatorio(5, 11),
      giro: aleatorio(0, Math.PI * 2),
      vGiro: aleatorio(-0.3, 0.3),
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
      vida: 1
    });
  }
  if (!rafConfeti) animarConfeti();
}

function lluviaConfeti() {
  const ancho = window.innerWidth;
  for (let i = 0; i < 160; i++) {
    particulas.push({
      x: aleatorio(0, ancho),
      y: aleatorio(-window.innerHeight, 0),
      vx: aleatorio(-1.5, 1.5),
      vy: aleatorio(2, 6),
      tam: aleatorio(6, 13),
      giro: aleatorio(0, Math.PI * 2),
      vGiro: aleatorio(-0.2, 0.2),
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
      vida: 1
    });
  }
  if (!rafConfeti) animarConfeti();
}

function animarConfeti() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  particulas = particulas.filter((p) => p.vida > 0 && p.y < window.innerHeight + 60);

  particulas.forEach((p) => {
    p.vx *= 0.985;
    p.vy += 0.32;          // gravedad
    p.x  += p.vx;
    p.y  += p.vy;
    p.giro += p.vGiro;
    p.vida -= 0.006;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.giro);
    ctx.globalAlpha = Math.max(0, p.vida);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
    ctx.restore();
  });

  if (particulas.length) {
    rafConfeti = requestAnimationFrame(animarConfeti);
  } else {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    rafConfeti = null;
  }
}

/* =============================================================
   Ranking
   ============================================================= */
function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function cargarRanking(destacarNombre, destacarMs) {
  const caja = $('#tabla-ranking');
  caja.innerHTML = 'Cargando...';

  try {
    const res = await fetch('api.php?accion=ranking&limite=10', { cache: 'no-store' });
    const datos = await res.json();

    if (!datos.ok) throw new Error(datos.error || 'Error');

    if (!datos.ranking.length) {
      caja.innerHTML = '<p class="vacio">Todavia no hay tiempos registrados. &iexcl;Se el primero!</p>';
      return;
    }

    const filas = datos.ranking.map((r, i) => {
      const esMio = destacarNombre &&
                    r.nombre === destacarNombre &&
                    Number(r.milisegundos) === destacarMs;
      const medalla = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || (i + 1);
      return '<tr class="' + (esMio ? 'destacada' : '') + '">' +
               '<td class="pos">' + medalla + '</td>' +
               '<td>' + escapar(r.nombre) + '</td>' +
               '<td class="marca">' + formatearTiempo(Number(r.milisegundos)) + '</td>' +
             '</tr>';
    }).join('');

    caja.innerHTML =
      '<table><thead><tr><th>#</th><th>Jugador</th>' +
      '<th style="text-align:right">Tiempo</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table>';
  } catch (e) {
    caja.innerHTML = '<p class="vacio">No se pudo cargar el ranking.<br><small>' +
                     escapar(e.message) + '</small></p>';
  }
}

async function guardarAutomatico() {
  const aviso = $('#aviso-guardado');
  aviso.textContent = 'Guardando tiempo de ' + estado.nombre + '...';
  aviso.className = 'aviso';

  try {
    const res = await fetch('api.php?accion=guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: estado.nombre,
        milisegundos: estado.ultimoTiempo,
        patos: CONFIG.totalPatos
      })
    });
    const datos = await res.json();
    if (!datos.ok) throw new Error(datos.error || 'No se pudo guardar');

    aviso.textContent = 'Guardado. Posición #' + datos.posicion + ' del ranking.';
    aviso.className = 'aviso ok';
  } catch (e) {
    aviso.textContent = 'No se pudo guardar el tiempo.';
    aviso.className = 'aviso err';
  }
}

/* =============================================================
   Pantalla completa
   ============================================================= */
function alternarPantallaCompleta() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
  } catch (e) {
    console.warn('Pantalla completa no disponible', e);
  }
}

/* =============================================================
   Arranque
   ============================================================= */
function inicializar() {
  elTotal.textContent = String(CONFIG.totalPatos);
  $('#txt-total').textContent = String(CONFIG.totalPatos);

  ajustarLienzoConfeti();

  // Nombre recordado de la partida anterior
  try { $('#nombre').value = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) {}
  $('#txt-limite').textContent = CONFIG.tiempoLimite > 0
    ? Math.floor(CONFIG.tiempoLimite / 60000) + ':' +
      String(Math.round(CONFIG.tiempoLimite / 1000) % 60).padStart(2, '0') + ' minutos'
    : 'todo el tiempo que quieras';
  elCrono.textContent = textoReloj();

  $('#btn-jugar').addEventListener('click', () => {
    const nombre = $('#nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) {
      $('#aviso-inicio').textContent = 'Escribe tu nombre para jugar.';
      $('#aviso-inicio').className = 'aviso err';
      $('#nombre').focus();
      return;
    }
    estado.nombre = nombre.slice(0, 40);
    try { localStorage.setItem(CLAVE_NOMBRE, estado.nombre); } catch (e) {}
    $('#aviso-inicio').textContent = '';
    if (window.SonidoPato) SonidoPato.contexto();   // el audio se habilita con este toque
    alternarPantallaCompleta();
    nuevaPartida();
  });
  $('#nombre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-jugar').click();
  });
  // Reiniciar sin nombre lleva a la portada
  $('#btn-reiniciar').addEventListener('click', () => {
    if (estado.nombre) nuevaPartida(); else abrirModal('#modal-inicio');
  });
  $('#btn-otra').addEventListener('click', nuevaPartida);
  $('#btn-pantalla').addEventListener('click', alternarPantallaCompleta);

  $('#btn-ranking').addEventListener('click', () => {
    abrirModal('#modal-ranking');
    cargarRanking();
  });
  $('#btn-cerrar-ranking').addEventListener('click', () => cerrarModal('#modal-ranking'));

  $('#btn-ver-ranking').addEventListener('click', () => {
    cerrarModal('#modal-fin');
    abrirModal('#modal-ranking');
    cargarRanking(estado.nombre, estado.ultimoTiempo);
  });

  // Evitar el menu contextual y el zoom nativo del navegador en tableta
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  function recalcular() {
    ajustarLienzoConfeti();
    ajustarLienzo();
  }

  let temporizador;
  window.addEventListener('resize', () => {
    recalcular();
    clearTimeout(temporizador);
    temporizador = setTimeout(recalcular, 200);
  });
  window.addEventListener('orientationchange', () => setTimeout(recalcular, 300));

  // Entrar y salir de pantalla completa cambia el alto disponible
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((evt) => {
    document.addEventListener(evt, () => {
      recalcular();
      setTimeout(recalcular, 250);   // por si la transicion aun no termina
    });
  });

  // Si el navegador soporta ResizeObserver, seguimos el escenario en vivo
  if (window.ResizeObserver) {
    new ResizeObserver(ajustarLienzo).observe(escenario);
  }

  fondo.addEventListener('load', () => {
    ajustarLienzo();
    reiniciarVista(true);
  });

  fondo.addEventListener('error', () => {
    console.error('No se pudo cargar ' + CONFIG.imagenFondo);
  });
  fondo.src = CONFIG.imagenFondo;

  aplicarVista();
  cerrarSplash();
  detectarRealidadMixta();
}

/**
 * En un visor como el Meta Quest ofrece las versiones VR y de realidad mixta.
 */
function detectarRealidadMixta() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return;
  Promise.all(['immersive-vr', 'immersive-ar'].map((tipo) =>
    navigator.xr.isSessionSupported(tipo).catch(() => false)
  )).then((soportes) => {
    if (soportes.some(Boolean)) $('#caja-mr').style.display = 'flex';
  });
}

/**
 * Oculta la pantalla de arranque cuando el fondo ya esta cargado
 * (y como maximo a los 4 segundos, por si la imagen tarda mucho).
 */
function cerrarSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;

  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    splash.classList.add('oculto');
    setTimeout(() => splash.remove(), 700);
  };

  // Minimo 1.6 s para que el logo se alcance a ver
  const minimo = new Promise((r) => setTimeout(r, 1600));
  const imagen = fondo.complete
    ? Promise.resolve()
    : new Promise((r) => {
        fondo.addEventListener('load', r, { once: true });
        fondo.addEventListener('error', r, { once: true });
      });

  Promise.all([minimo, imagen]).then(cerrar);
  setTimeout(cerrar, 4000);
}

inicializar();

/* =============================================================
   Encuentra los Patos - REALIDAD MIXTA (Meta Quest 3, WebXR)
   -------------------------------------------------------------
   - Sesion 'immersive-ar': se ve la habitacion real (passthrough).
   - Si el visor tiene la habitacion escaneada (plane-detection),
     los patos se esconden sobre el piso, mesas, sillones, etc.
     Si no, se reparten alrededor del jugador.
   - Se atrapan TOCANDOLOS con la mano (hand tracking) o con el
     control. Tambien se puede apuntar y pulsar gatillo / pellizco.
   - Al tocarlos suena "cuac" en audio 3D (sale desde el pato).
   - Mismas reglas que la tableta: 5 patos, 1:30 de cuenta
     regresiva, revelado al acabarse el tiempo, ranking compartido.
   - MODO 360 (opcional): en vez de la habitacion, una imagen 360
     rodea al jugador y los patos estan camuflados en ella. Se
     atrapan apuntando con la mano (pinza) o con el gatillo.
   ============================================================= */
import * as THREE from './vendor/three.module.js';

const CONFIG = {
  totalPatos: 5,
  imagenPato: 'pato.png',

  // ---- Reglas (iguales a la tableta para que el ranking sea comparable) ----
  tiempoLimite: 90000,       // ms; 0 = sin cuenta regresiva
  segundosRevelado: 4,       // patos faltantes visibles al acabarse el tiempo
  avisoAmbar: 20,            // segundos restantes para reloj ambar
  avisoRojo: 10,             // segundos restantes para reloj rojo latiendo

  // Alto del pato en metros (0.18 = 18 cm)
  tamano: 0.18,

  // Reparto cuando NO hay planos detectados (metros desde el jugador)
  radioMin: 0.7,
  radioMax: 2.0,
  // Proporcion de patos en el piso; el resto "flota" a media altura
  proporcionPiso: 0.6,
  alturaFlotanteMin: 0.6,
  alturaFlotanteMax: 1.5,

  // Usar las superficies reales escaneadas por el Quest
  usarPlanos: true,
  distanciaMaxPlanos: 3.0,   // no esconder patos mas lejos de esto
  esperaPlanosMs: 1500,      // cuanto esperar a que lleguen los planos

  separacionMin: 0.45,       // metros entre patos

  // Distancia extra (m) para que el toque se sienta comodo
  margenToque: 0.03,

  // Volumen del cuac al atrapar (el archivo/sintesis esta en sonido-pato.js)
  volumenCuac: 1.0,

  // Pistas sonoras: un pato al azar hace "cuac" suave cada cierto tiempo
  pistaSonora: true,
  pistaCadaMs: [6000, 10000],
  volumenPista: 0.35,

  // ---- Modo 360 ----
  // Imagen que rodea al jugador. Si es 2:1 (equirectangular) se muestra
  // como esfera completa; si no, como pantalla curva de "arcoGrados".
  imagen360: 'mundo3.jpg',
  imagen360Respaldo: 'background6.jpg',   // si falta la anterior
  radio360: 8,                 // metros del jugador a la imagen
  arcoGrados: 190,             // envolvencia de la pantalla curva (180-240)
  tamano360Min: 1.8,           // tamano del pato en % del ancho de la imagen
  tamano360Max: 2.8,
  opacidad360: 0.62,           // camuflaje del pato sobre la imagen
  toleranciaApuntado: 1.9      // generosidad de la punteria (1 = exacta)
};

const CLAVE_NOMBRE = 'patos.nombre';   // misma clave que la tableta
const COLORES = [0x00ED64, 0x00A35C, 0x00684A, 0xC0FAE6, 0xE3FCF7, 0xFFFFFF];
const FUENTE = '"Euclid Circular A", "Everett", system-ui, sans-serif';
const FUENTE_CIFRAS = '"Source Code Pro", ui-monospace, monospace';

const $ = (s) => document.querySelector(s);
const aleatorio = (min, max) => Math.random() * (max - min) + min;

function formatearTiempo(ms) {
  const total = Math.max(0, ms);
  const min = Math.floor(total / 60000);
  const seg = Math.floor((total % 60000) / 1000);
  const dec = Math.floor((total % 1000) / 100);
  return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0') + '.' + dec;
}

/* =============================================================
   Sonido 3D: usa SonidoPato (sonido-pato.js) y lo coloca en el
   espacio con un PannerNode HRTF, asi el cuac sale desde el pato.
   ============================================================= */
const sonidos = {
  iniciar() {
    return window.SonidoPato ? window.SonidoPato.contexto() : null;
  },

  get ctx() { return window.SonidoPato ? window.SonidoPato.ctx : null; },

  // Coloca el "oido" del jugador donde esta su cabeza
  actualizarOyente(camara) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    camara.matrixWorld.decompose(p, q, new THREE.Vector3());
    const adelante = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(adelante.x, t);
      l.forwardY.setValueAtTime(adelante.y, t);
      l.forwardZ.setValueAtTime(adelante.z, t);
      l.upX.setValueAtTime(arriba.x, t);
      l.upY.setValueAtTime(arriba.y, t);
      l.upZ.setValueAtTime(arriba.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(adelante.x, adelante.y, adelante.z, arriba.x, arriba.y, arriba.z);
    }
  },

  // Nodo que hace sonar lo que se le conecte desde la posicion "pos"
  enPosicion(pos, duracionS) {
    const ctx = this.ctx;
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      // En 360 los patos estan a ~8 m: sin esto casi no se oirian
      refDistance: estado.modo === '360' ? CONFIG.radio360 * 0.6 : 0.6,
      rolloffFactor: 1.2,
      positionX: pos.x, positionY: pos.y, positionZ: pos.z
    });
    panner.connect(ctx.destination);
    setTimeout(() => { try { panner.disconnect(); } catch (e) {} }, (duracionS + 1.5) * 1000);
    return panner;
  },

  /** veces: 1 = "cuac", 2 = "cuac-cuac" */
  cuac(pos, volumen = 1, veces = 1) {
    if (!this.ctx) return;
    window.SonidoPato.cuac({
      destino: this.enPosicion(pos, veces * 0.26),
      volumen: volumen * CONFIG.volumenCuac,
      veces
    });
  },

  victoria() { if (this.ctx) window.SonidoPato.victoria(); },
  aviso()    { if (this.ctx) window.SonidoPato.aviso(); }
};

/* =============================================================
   Escena three.js
   ============================================================= */
const contenedor = $('#lienzo-xr');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);     // transparente = se ve la habitacion
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
contenedor.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
scene.add(camera);

const texturaPato = new THREE.TextureLoader().load(CONFIG.imagenPato);
texturaPato.colorSpace = THREE.SRGBColorSpace;
const ASPECTO_PATO = 1208 / 1136;   // ancho / alto de pato.png

const geoPato = new THREE.PlaneGeometry(CONFIG.tamano * ASPECTO_PATO, CONFIG.tamano);
geoPato.translate(0, CONFIG.tamano / 2, 0);   // el origen queda en las patas
const matPato = new THREE.MeshBasicMaterial({
  map: texturaPato, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide
});
const geoSombra = new THREE.CircleGeometry(CONFIG.tamano * 0.42, 24);
geoSombra.rotateX(-Math.PI / 2);
const matSombra = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false
});

// Aro verde para revelar los patos que faltaban
const geoAro = new THREE.RingGeometry(CONFIG.tamano * 0.62, CONFIG.tamano * 0.72, 40);
const matAro = new THREE.MeshBasicMaterial({
  color: 0x00ED64, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false
});

// Velo verde que "tine el entorno" cuando se acaba el tiempo
const velo = new THREE.Mesh(
  new THREE.SphereGeometry(6, 32, 16),
  new THREE.MeshBasicMaterial({
    color: 0x00ED64, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false
  })
);
velo.visible = false;
scene.add(velo);

/* ---------- Mundo 360 ---------- */
// Material del pato camuflado sobre la imagen (los revelados usan matPato)
const matPato360 = new THREE.MeshBasicMaterial({
  map: texturaPato, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide,
  opacity: CONFIG.opacidad360, color: 0xdfe8e4, depthWrite: false
});

const mundo = {
  textura: null,
  malla: null,
  esfera: false,      // true = 360 completo; false = pantalla curva
  arco: 0,            // radianes
  inicioArco: 0,
  alto: 0,            // metros (pantalla curva)
  centroY: 1.6,
  anchoM: 0           // ancho de la imagen en metros (para el tamano del pato)
};

// Se precarga al abrir la pagina para no demorar la entrada al visor
function precargar360() {
  const cargador = new THREE.TextureLoader();
  const usar = (tex, nombre) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;          // se ve por dentro: corregir el espejo
    tex.anisotropy = 4;
    mundo.textura = tex;
    mundo.nombre = nombre;
  };
  cargador.load(CONFIG.imagen360, (t) => usar(t, CONFIG.imagen360), undefined, () => {
    console.warn('No se encontro ' + CONFIG.imagen360 + '; se usa ' + CONFIG.imagen360Respaldo);
    cargador.load(CONFIG.imagen360Respaldo, (t) => usar(t, CONFIG.imagen360Respaldo));
  });
}

function construirMundo(alturaOjos) {
  quitarMundo();
  const img = mundo.textura.image;
  const aspecto = img.width / img.height;
  const r = CONFIG.radio360;
  mundo.centroY = alturaOjos;
  mundo.esfera = aspecto > 1.9;

  let geo;
  if (mundo.esfera) {
    // Equirectangular: esfera completa alrededor del jugador
    geo = new THREE.SphereGeometry(r, 64, 32);
    mundo.arco = Math.PI * 2;
    mundo.anchoM = 2 * Math.PI * r;
  } else {
    // Pantalla curva centrada frente al jugador (-Z)
    mundo.arco = THREE.MathUtils.degToRad(CONFIG.arcoGrados);
    mundo.inicioArco = Math.PI - mundo.arco / 2;
    mundo.anchoM = r * mundo.arco;
    mundo.alto = mundo.anchoM / aspecto;
    geo = new THREE.CylinderGeometry(r, r, mundo.alto, 96, 1, true,
                                     mundo.inicioArco, mundo.arco);
  }
  mundo.malla = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: mundo.textura, side: THREE.BackSide
  }));
  mundo.malla.position.y = alturaOjos;
  mundo.malla.renderOrder = -1;
  scene.add(mundo.malla);
}

function quitarMundo() {
  if (!mundo.malla) return;
  scene.remove(mundo.malla);
  mundo.malla.geometry.dispose();
  mundo.malla.material.dispose();
  mundo.malla = null;
}

/* ---------- Manos y controles ---------- */
const manos = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
const agarres = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)];
const punteros = [renderer.xr.getController(0), renderer.xr.getController(1)];
const fuentes = [null, null];   // XRInputSource de cada mando (para vibrar)

manos.forEach((m) => scene.add(m));
agarres.forEach((a) => scene.add(a));

const geoRayo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
]);
const matRayo = new THREE.LineBasicMaterial({ color: 0x00ED64, transparent: true, opacity: 0.6 });
const rayos = [];

punteros.forEach((p, i) => {
  const rayo = new THREE.Line(geoRayo, matRayo);
  rayo.scale.z = 3;
  rayo.visible = false;
  p.add(rayo);
  rayos[i] = rayo;
  p.addEventListener('connected', (ev) => { fuentes[i] = ev.data; });
  p.addEventListener('disconnected', () => { fuentes[i] = null; });
  p.addEventListener('select', () => seleccionarConRayo(p, i));
  scene.add(p);
});

function vibrar(i, fuerza = 0.7, ms = 90) {
  const fuente = fuentes[i];
  const act = fuente && fuente.gamepad && fuente.gamepad.hapticActuators &&
              fuente.gamepad.hapticActuators[0];
  if (act && act.pulse) act.pulse(fuerza, ms).catch(() => {});
}

/* ---------- Paneles de texto (marcador y mensajes) ---------- */
function crearPanel(anchoM, altoM, anchoPx, altoPx) {
  const lienzo = document.createElement('canvas');
  lienzo.width = anchoPx;
  lienzo.height = altoPx;
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const malla = new THREE.Mesh(
    new THREE.PlaneGeometry(anchoM, altoM),
    new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthTest: false })
  );
  malla.renderOrder = 10;
  malla.visible = false;
  scene.add(malla);
  return { malla, ctx: lienzo.getContext('2d'), textura, ancho: anchoPx, alto: altoPx };
}

function fondoPanel(p) {
  const c = p.ctx;
  c.clearRect(0, 0, p.ancho, p.alto);
  c.fillStyle = 'rgba(0, 30, 43, 0.86)';
  c.strokeStyle = '#00ED64';
  c.lineWidth = 4;
  c.beginPath();
  c.roundRect(4, 4, p.ancho - 8, p.alto - 8, 28);
  c.fill();
  c.stroke();
}

const hud = crearPanel(0.30, 0.09, 600, 180);
const mensaje = crearPanel(0.6, 0.22, 1000, 366);
const imgPatoHud = new Image();
imgPatoHud.src = CONFIG.imagenPato;

function tiempoRestante() {
  return CONFIG.tiempoLimite > 0 ? CONFIG.tiempoLimite - estado.transcurrido : 0;
}

function dibujarHud() {
  fondoPanel(hud);
  const c = hud.ctx;
  if (imgPatoHud.complete) c.drawImage(imgPatoHud, 30, 34, 118, 111);
  c.fillStyle = '#B8C4C2';
  c.font = '600 30px ' + FUENTE;
  c.fillText('PATOS', 170, 66);
  c.fillText('TIEMPO', 370, 66);
  c.fillStyle = '#FFFFFF';
  c.font = '700 58px ' + FUENTE_CIFRAS;
  c.fillText(estado.encontrados + '/' + CONFIG.totalPatos, 170, 136);

  // Reloj: cuenta regresiva verde -> ambar -> rojo (parpadea)
  let color = '#00ED64';
  let reloj = formatearTiempo(estado.transcurrido);
  if (CONFIG.tiempoLimite > 0) {
    const restante = tiempoRestante();
    reloj = formatearTiempo(restante);
    if (restante <= CONFIG.avisoRojo * 1000) {
      color = Math.floor(performance.now() / 300) % 2 ? '#FF5A5A' : '#FFB3B3';
    } else if (restante <= CONFIG.avisoAmbar * 1000) {
      color = '#FFC010';
    }
  }
  c.fillStyle = color;
  c.font = '700 50px ' + FUENTE_CIFRAS;
  c.fillText(reloj.slice(0, 7), 370, 134);
  hud.textura.needsUpdate = true;
}

function mostrarMensaje(titulo, subtitulo, ms) {
  fondoPanel(mensaje);
  const c = mensaje.ctx;
  c.textAlign = 'center';
  c.fillStyle = '#FFFFFF';
  c.font = '700 80px ' + FUENTE;
  c.fillText(titulo, mensaje.ancho / 2, 160);
  c.fillStyle = '#C0FAE6';
  c.font = '500 44px ' + FUENTE;
  c.fillText(subtitulo, mensaje.ancho / 2, 262);
  c.textAlign = 'left';
  mensaje.textura.needsUpdate = true;
  mensaje.malla.visible = true;
  colocarFrente(mensaje.malla, 1.1, -0.05, true);
  clearTimeout(mostrarMensaje.t);
  if (ms) mostrarMensaje.t = setTimeout(() => { mensaje.malla.visible = false; }, ms);
}

/* =============================================================
   Estado de la partida
   ============================================================= */
const estado = {
  // fuera | colocando | jugando | revelando | ganado | perdido
  fase: 'fuera',
  modo: 'mr',              // 'mr' (habitacion real) o '360' (imagen alrededor)
  pantalla: false,         // true = "Probar en pantalla" (sin lentes, con raton)
  nombre: '',
  encontrados: 0,
  inicio: 0,
  transcurrido: 0,
  ultimoTiempo: 0,
  inicioSesion: 0,
  inicioRevelado: 0,
  proximaPista: 0,
  ultimoHud: 0,
  partida: 0               // sube en cada partida; evita temporizadores viejos
};

let patos = [];            // { grupo, malla, centro, atrapado, revelado, ... }
let particulas = [];
const camPos = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmp = new THREE.Vector3();

function posicionCamara() {
  const cam = estado.pantalla ? camera : renderer.xr.getCamera();
  cam.getWorldPosition(camPos);
  cam.getWorldDirection(camDir);
  return cam;
}

// Pone un objeto frente al jugador (o lo acerca suavemente si "inmediato" es false)
function colocarFrente(obj, distancia, altura, inmediato) {
  const dir = tmp.set(camDir.x, 0, camDir.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
  dir.normalize();
  const destino = new THREE.Vector3(
    camPos.x + dir.x * distancia,
    camPos.y + altura,
    camPos.z + dir.z * distancia
  );
  if (inmediato) obj.position.copy(destino);
  else obj.position.lerp(destino, 0.06);
  obj.lookAt(camPos.x, obj.position.y, camPos.z);
}

/* =============================================================
   Donde esconder los patos
   ============================================================= */
const ETIQUETAS_PROHIBIDAS = ['ceiling', 'wall_face', 'window_frame', 'door_frame',
                              'wall_art', 'invisible_wall_face', 'lamp', 'screen'];

function puntoEnPoligono(x, z, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i], b = poligono[j];
    if (((a.z > z) !== (b.z > z)) &&
        (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) dentro = !dentro;
  }
  return dentro;
}

/** Puntos al azar sobre superficies horizontales reales (piso, mesas...) */
function candidatosDePlanos(frame, refSpace) {
  const lista = [];
  if (!CONFIG.usarPlanos || !frame || !frame.detectedPlanes) return lista;

  const normal = new THREE.Vector3();
  const matriz = new THREE.Matrix4();

  frame.detectedPlanes.forEach((plano) => {
    if (plano.orientation !== 'horizontal') return;
    if (plano.semanticLabel && ETIQUETAS_PROHIBIDAS.includes(plano.semanticLabel)) return;
    const pose = frame.getPose(plano.planeSpace, refSpace);
    if (!pose || !plano.polygon || plano.polygon.length < 3) return;

    matriz.fromArray(pose.transform.matrix);
    // El eje Y del plano es su normal: debe apuntar hacia arriba
    normal.set(0, 1, 0).transformDirection(matriz);
    if (normal.y < 0.85) return;

    const pol = plano.polygon;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pol.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });
    const area = (maxX - minX) * (maxZ - minZ);
    const esPiso = plano.semanticLabel === 'floor';
    const intentos = esPiso ? 40 : Math.min(25, Math.ceil(area * 30) + 4);
    const margen = CONFIG.tamano * 0.4;

    for (let k = 0; k < intentos; k++) {
      const x = aleatorio(minX + margen, maxX - margen);
      const z = aleatorio(minZ + margen, maxZ - margen);
      if (!puntoEnPoligono(x, z, pol)) continue;
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(matriz);
      if (p.y > 1.8) continue;
      const dist = Math.hypot(p.x, p.z);
      if (dist < 0.4 || dist > CONFIG.distanciaMaxPlanos) continue;
      lista.push({ pos: p, sobreSuperficie: true, mueble: !esPiso && p.y > 0.25 });
    }
  });

  // Primero los de muebles (son los escondites mas divertidos), mezclados
  lista.sort(() => Math.random() - 0.5);
  lista.sort((a, b) => (b.mueble ? 1 : 0) - (a.mueble ? 1 : 0));
  return lista;
}

function candidatoAlrededor() {
  const ang = Math.random() * Math.PI * 2;
  const r = aleatorio(CONFIG.radioMin, CONFIG.radioMax);
  const enPiso = Math.random() < CONFIG.proporcionPiso;
  const y = enPiso ? 0 : aleatorio(CONFIG.alturaFlotanteMin, CONFIG.alturaFlotanteMax);
  return {
    pos: new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r),
    sobreSuperficie: enPiso
  };
}

function lejosDeLosDemas(pos, elegidos, sep) {
  return elegidos.every((e) => e.pos.distanceTo(pos) >= sep);
}

/** Modo 360: patos camuflados sobre la imagen, mirando al jugador */
function colocarPatos360() {
  limpiarPatos();
  const r = CONFIG.radio360 - 0.04;           // apenas delante de la imagen
  const elegidos = [];
  let intentos = 0;

  while (elegidos.length < CONFIG.totalPatos && intentos < 3000) {
    intentos++;
    const anchoPato = mundo.anchoM * aleatorio(CONFIG.tamano360Min, CONFIG.tamano360Max) / 100;
    const escala = anchoPato / (CONFIG.tamano * ASPECTO_PATO);
    const altoPato = CONFIG.tamano * escala;
    const margenAng = (anchoPato / r) * 0.8;

    let ang, y;
    if (mundo.esfera) {
      ang = Math.random() * Math.PI * 2;
      const lat = THREE.MathUtils.degToRad(aleatorio(-30, 25));   // sin polos
      y = mundo.centroY + Math.sin(lat) * r - altoPato / 2;
    } else {
      ang = aleatorio(mundo.inicioArco + margenAng, mundo.inicioArco + mundo.arco - margenAng);
      const mitad = mundo.alto / 2;
      y = aleatorio(mundo.centroY - mitad + altoPato * 0.3, mundo.centroY + mitad - altoPato * 1.3);
    }
    const radioPlano = mundo.esfera ? Math.cos(Math.asin(
      Math.max(-1, Math.min(1, (y + altoPato / 2 - mundo.centroY) / r)))) * r : r;
    const pos = new THREE.Vector3(Math.sin(ang) * radioPlano, y, Math.cos(ang) * radioPlano);

    const sep = intentos < 2000 ? anchoPato * 3 : anchoPato * 1.2;
    if (elegidos.every((e) => e.pos.distanceTo(pos) >= sep)) elegidos.push({ pos, escala });
  }

  elegidos.forEach((c) => crearPato(c.pos, false, c.escala, matPato360));
}

function colocarPatos(frame) {
  if (estado.modo === '360') { colocarPatos360(); return; }
  limpiarPatos();
  const refSpace = renderer.xr.getReferenceSpace();
  const elegidos = [];

  // Hasta ~3/4 de los patos en superficies reales, para no amontonarlos
  const deplanos = candidatosDePlanos(frame, refSpace);
  const maxEnPlanos = Math.ceil(CONFIG.totalPatos * 0.75);
  for (const c of deplanos) {
    if (elegidos.length >= maxEnPlanos) break;
    if (lejosDeLosDemas(c.pos, elegidos, CONFIG.separacionMin)) elegidos.push(c);
  }

  let intentos = 0;
  while (elegidos.length < CONFIG.totalPatos && intentos < 2000) {
    intentos++;
    const c = candidatoAlrededor();
    const sep = intentos < 1500 ? CONFIG.separacionMin : 0.2;
    if (lejosDeLosDemas(c.pos, elegidos, sep)) elegidos.push(c);
  }

  elegidos.forEach((c) => crearPato(c.pos, c.sobreSuperficie));
}

function crearPato(pos, sobreSuperficie, escala = 1, material = matPato) {
  const grupo = new THREE.Group();
  grupo.position.copy(pos);
  grupo.scale.setScalar(escala);

  const malla = new THREE.Mesh(geoPato, material);
  if (estado.modo === '360') malla.rotation.z = THREE.MathUtils.degToRad(aleatorio(-22, 22));
  malla.scale.x = Math.random() < 0.5 ? -1 : 1;   // espejo al azar
  grupo.add(malla);

  if (sobreSuperficie) {
    const sombra = new THREE.Mesh(geoSombra, matSombra);
    sombra.position.y = 0.003;
    grupo.add(sombra);
  }

  scene.add(grupo);
  patos.push({
    grupo, malla,
    escala,
    centro: pos.clone().add(new THREE.Vector3(0, CONFIG.tamano * escala / 2, 0)),
    flota: !sobreSuperficie && estado.modo !== '360',
    fase: Math.random() * Math.PI * 2,
    atrapado: false,
    revelado: false,
    aro: null,
    t0: 0,
    sacudida: 0
  });
}

function limpiarPatos() {
  patos.forEach((p) => scene.remove(p.grupo));
  patos = [];
}

/* =============================================================
   Atrapar patos
   ============================================================= */
const puntoDedo = new THREE.Vector3();
const DEDOS = ['index-finger-tip', 'middle-finger-tip', 'thumb-tip', 'middle-finger-metacarpal'];

function revisarToques() {
  const radio = CONFIG.tamano * 0.55 + CONFIG.margenToque;
  const puntos = [];

  manos.forEach((mano, i) => {
    if (!mano.visible || !mano.joints) return;
    DEDOS.forEach((nombre) => {
      const j = mano.joints[nombre];
      if (j && j.visible) puntos.push({ pos: j.getWorldPosition(puntoDedo.clone()), i });
    });
  });
  agarres.forEach((a, i) => {
    if (a.visible && fuentes[i] && !fuentes[i].hand) {
      puntos.push({ pos: a.getWorldPosition(puntoDedo.clone()), i });
    }
  });
  if (!puntos.length) return;

  patos.forEach((pato) => {
    if (pato.atrapado) return;
    for (const p of puntos) {
      if (p.pos.distanceTo(pato.centro) < radio) {
        atrapar(pato, p.i);
        break;
      }
    }
  });
}

const raycaster = new THREE.Raycaster();
const matRot = new THREE.Matrix4();

function seleccionarConRayo(puntero, i) {
  if (estado.fase !== 'jugando') return;
  matRot.identity().extractRotation(puntero.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(puntero.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matRot);
  raycaster.far = CONFIG.radio360 + 2;
  atraparConRayo(i);
}

/** Atrapa el pato al que apunta raycaster.ray (mando, mano o raton) */
function atraparConRayo(i) {
  if (estado.fase !== 'jugando') return;
  const vivos = patos.filter((p) => !p.atrapado);

  if (estado.modo === '360') {
    // Punteria generosa: gana el pato mas cercano al rayo dentro de la tolerancia
    let mejor = null, mejorAng = Infinity;
    const aPato = new THREE.Vector3();
    vivos.forEach((p) => {
      aPato.copy(p.centro).sub(raycaster.ray.origin);
      const dist = aPato.length();
      const radioAng = Math.atan((CONFIG.tamano * p.escala / 2) / dist) * CONFIG.toleranciaApuntado;
      const ang = aPato.angleTo(raycaster.ray.direction);
      if (ang < radioAng && ang < mejorAng) { mejor = p; mejorAng = ang; }
    });
    if (mejor) atrapar(mejor, i);
    return;
  }

  const choques = raycaster.intersectObjects(vivos.map((p) => p.malla), false);
  if (!choques.length) return;
  const pato = vivos.find((p) => p.malla === choques[0].object);
  if (pato) atrapar(pato, i);
}

function atrapar(pato, i) {
  if (estado.fase !== 'jugando' || pato.atrapado) return;
  pato.atrapado = true;
  pato.t0 = performance.now();

  sonidos.cuac(pato.centro, 1, 2);
  vibrar(i);
  lanzarConfeti(pato.centro);

  estado.encontrados++;
  dibujarHud();
  if (window.EnVivo) window.EnVivo.actualizar({ encontrados: estado.encontrados });

  if (estado.encontrados >= CONFIG.totalPatos) terminarPartida();
}

/* =============================================================
   Confeti 3D
   ============================================================= */
const geoConfeti = new THREE.BoxGeometry(0.012, 0.004, 0.02);
const matsConfeti = COLORES.map((c) => new THREE.MeshBasicMaterial({ color: c }));

function lanzarConfeti(origen, cantidad = 36, fuerza = 1.6) {
  for (let k = 0; k < cantidad; k++) {
    const m = new THREE.Mesh(geoConfeti, matsConfeti[k % matsConfeti.length]);
    m.position.copy(origen);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const dir = new THREE.Vector3(aleatorio(-1, 1), aleatorio(0.2, 1.4), aleatorio(-1, 1))
      .normalize().multiplyScalar(aleatorio(0.4, 1) * fuerza);
    scene.add(m);
    particulas.push({ m, v: dir, giro: aleatorio(-10, 10), vida: aleatorio(1.0, 1.8) });
  }
}

function animarConfeti(dt) {
  particulas = particulas.filter((p) => {
    p.vida -= dt;
    if (p.vida <= 0) { scene.remove(p.m); return false; }
    p.v.y -= 3.2 * dt;
    p.v.multiplyScalar(0.985);
    p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.002) { p.m.position.y = 0.002; p.v.set(0, 0, 0); }
    p.m.rotation.x += p.giro * dt;
    p.m.rotation.z += p.giro * 0.7 * dt;
    return true;
  });
}

/* =============================================================
   Partida
   ============================================================= */
async function entrar(modo) {
  const boton = $(modo === '360' ? '#btn-entrar-360' : '#btn-entrar');
  const aviso = $('#estado-xr');

  const nombre = $('#nombre').value.trim().replace(/\s+/g, ' ');
  if (!nombre) {
    aviso.textContent = 'Escribe tu nombre para jugar.';
    aviso.className = 'estado-xr err';
    $('#nombre').focus();
    return;
  }
  estado.nombre = nombre.slice(0, 40);
  try { localStorage.setItem(CLAVE_NOMBRE, estado.nombre); } catch (e) {}

  if (modo === '360' && !mundo.textura) {
    aviso.textContent = 'La imagen 360 todavía se está cargando, espera un momento.';
    aviso.className = 'estado-xr';
    return;
  }
  estado.modo = modo;

  boton.disabled = true;
  aviso.textContent = modo === '360' ? 'Abriendo modo 360…' : 'Abriendo realidad mixta…';
  aviso.className = 'estado-xr';

  try {
    sonidos.iniciar();   // el audio se habilita con este clic
    const sesion = await navigator.xr.requestSession(
      modo === '360' ? 'immersive-vr' : 'immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: modo === '360' ? ['hand-tracking'] : ['hand-tracking', 'plane-detection']
      });
    sesion.addEventListener('end', alSalir);
    await renderer.xr.setSession(sesion);

    cerrarModales();
    contenedor.style.display = 'block';
    estado.fase = 'colocando';
    estado.encontrados = 0;
    estado.transcurrido = 0;
    estado.inicioSesion = performance.now();
    aviso.textContent = '';
  } catch (e) {
    console.error(e);
    aviso.textContent = 'No se pudo iniciar: ' + (e.message || e);
    aviso.className = 'estado-xr err';
    boton.disabled = false;
  }
}

function empezarPartida(frame) {
  estado.partida++;
  if (estado.modo === '360') construirMundo(camPos.y > 0.5 ? camPos.y : 1.6);
  colocarPatos(frame);
  estado.fase = 'jugando';
  estado.encontrados = 0;
  estado.transcurrido = 0;
  estado.inicio = performance.now();
  estado.proximaPista = estado.inicio + 4000;
  velo.visible = false;
  velo.material.opacity = 0;
  hud.malla.visible = true;
  dibujarHud();
  colocarFrente(hud.malla, 0.8, -0.32, true);
  mostrarMensaje('¡Encuentra ' + CONFIG.totalPatos + ' patos!',
                 estado.pantalla
                   ? 'Arrastra para mirar y haz clic en los patos'
                   : estado.modo === '360'
                     ? 'Gira la cabeza, apunta y haz pinza (o gatillo)'
                     : 'Míralos a tu alrededor y tócalos con la mano', 4500);
  if (window.EnVivo) {
    window.EnVivo.iniciar({ nombre: estado.nombre, modo: estado.pantalla ? 'pantalla' : 'lentes',
                           total: CONFIG.totalPatos });
  }
}

/** Gano: encontro todos los patos */
function terminarPartida() {
  estado.fase = 'ganado';
  estado.ultimoTiempo = Math.round(estado.transcurrido);
  dibujarHud();
  if (window.EnVivo) window.EnVivo.cerrar('ganado', { encontrados: estado.encontrados });

  // Festejo: confeti frente al jugador, coro de cuacs y fanfarria
  const frente = new THREE.Vector3().copy(camPos).addScaledVector(
    new THREE.Vector3(camDir.x, 0, camDir.z).normalize(), 0.9);
  lanzarConfeti(frente, 140, 2.2);
  [0, 350, 700].forEach((ms, k) => setTimeout(() => {
    sonidos.cuac(new THREE.Vector3(frente.x + (k - 1) * 0.6, frente.y, frente.z), 0.8, 1);
  }, ms));
  setTimeout(() => sonidos.victoria(), 1000);

  const tiempo = formatearTiempo(estado.ultimoTiempo);
  mostrarMensaje('¡Los encontraste todos!', 'Tiempo: ' + tiempo, 0);

  // Solo las partidas completas entran al ranking; se guarda solo
  guardarAutomatico().then((posicion) => {
    if (posicion && estado.fase === 'ganado' && (renderer.xr.isPresenting || estado.pantalla)) {
      mostrarMensaje('¡Los encontraste todos!', 'Tiempo: ' + tiempo + '  ·  Posición #' + posicion, 0);
    }
  });

  const partida = estado.partida;
  setTimeout(() => { if (estado.partida === partida && estado.fase === 'ganado') terminarSesion(); }, 5000);
}

/** Perdio: se acabo la cuenta regresiva */
function tiempoAgotado() {
  estado.fase = 'revelando';
  estado.transcurrido = CONFIG.tiempoLimite;
  estado.inicioRevelado = performance.now();
  dibujarHud();
  if (window.EnVivo) window.EnVivo.cerrar('perdido', { encontrados: estado.encontrados });

  sonidos.aviso();

  // El entorno se tine de verde y los patos que faltaban se marcan con un aro
  if (estado.modo === '360' && mundo.malla) mundo.malla.material.color.set(0x7dffb4);
  else velo.visible = true;
  patos.forEach((p) => {
    if (p.atrapado) return;
    p.revelado = true;
    p.malla.material = matPato;        // sin camuflaje
    p.aro = new THREE.Mesh(geoAro, matAro);
    p.aro.position.y = CONFIG.tamano / 2;
    p.aro.renderOrder = 5;
    p.grupo.add(p.aro);
  });
  mostrarMensaje('¡Se acabó el tiempo!',
                 estado.encontrados + ' / ' + CONFIG.totalPatos + ' patos encontrados',
                 CONFIG.segundosRevelado * 1000);

  const partida = estado.partida;
  setTimeout(() => {
    if (estado.partida !== partida || estado.fase !== 'revelando') return;
    estado.fase = 'perdido';
    terminarSesion();
  }, CONFIG.segundosRevelado * 1000);
}

function terminarSesion() {
  if (estado.pantalla) { salirDePantalla(); return; }
  const s = renderer.xr.getSession();
  if (s) s.end();
}

/* =============================================================
   Probar en pantalla (sin lentes): arrastrar para mirar, clic
   sobre los patos. Sirve para revisar la imagen y el camuflaje.
   ============================================================= */
const mirada = { yaw: 0, pitch: 0, arrastre: null };

function leerNombre() {
  const nombre = $('#nombre').value.trim().replace(/\s+/g, ' ');
  if (!nombre) {
    $('#estado-xr').textContent = 'Escribe tu nombre para jugar.';
    $('#estado-xr').className = 'estado-xr err';
    $('#nombre').focus();
    return null;
  }
  estado.nombre = nombre.slice(0, 40);
  try { localStorage.setItem(CLAVE_NOMBRE, estado.nombre); } catch (e) {}
  return estado.nombre;
}

function probarEnPantalla() {
  if (!leerNombre()) return;
  if (!mundo.textura) {
    $('#estado-xr').textContent = 'La imagen 360 todavía se está cargando, espera un momento.';
    return;
  }
  sonidos.iniciar();
  estado.modo = '360';
  estado.pantalla = true;
  mirada.yaw = 0;
  mirada.pitch = 0;
  camera.position.set(0, 1.6, 0);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  cerrarModales();
  contenedor.style.display = 'block';
  $('#ayuda-pantalla').style.display = 'block';
  estado.fase = 'colocando';
  estado.encontrados = 0;
  estado.transcurrido = 0;
  estado.inicioSesion = performance.now() - CONFIG.esperaPlanosMs;  // sin esperar planos
}

function salirDePantalla() {
  estado.pantalla = false;
  $('#ayuda-pantalla').style.display = 'none';
  alSalir();
}

function prepararMouse() {
  const lienzo = renderer.domElement;
  lienzo.style.touchAction = 'none';
  lienzo.addEventListener('pointerdown', (e) => {
    if (!estado.pantalla) return;
    mirada.arrastre = { x: e.clientX, y: e.clientY, movio: 0 };
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    const a = mirada.arrastre;
    if (!estado.pantalla || !a) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.movio += Math.abs(dx) + Math.abs(dy);
    a.x = e.clientX; a.y = e.clientY;
    // La imagen sigue al cursor: radianes por pixel segun el campo de vision
    const k = THREE.MathUtils.degToRad(camera.fov) / window.innerHeight;
    mirada.yaw += dx * k;
    mirada.pitch = Math.max(-1.2, Math.min(1.2, mirada.pitch + dy * k));
    camera.rotation.set(mirada.pitch, mirada.yaw, 0, 'YXZ');
  });
  lienzo.addEventListener('pointerup', (e) => {
    const a = mirada.arrastre;
    mirada.arrastre = null;
    if (!estado.pantalla || !a || a.movio > 6) return;   // fue arrastre, no clic
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    atraparConRayo(0);
  });
  window.addEventListener('keydown', (e) => {
    if (estado.pantalla && e.key === 'Escape') {
      if (window.EnVivo && estado.fase === 'jugando') {
        window.EnVivo.cerrar('abandonado', { encontrados: estado.encontrados });
      }
      salirDePantalla();
    }
  });
}

function alSalir() {
  contenedor.style.display = 'none';
  hud.malla.visible = false;
  mensaje.malla.visible = false;
  velo.visible = false;
  quitarMundo();
  rayos.forEach((r) => { r.visible = false; });
  limpiarPatos();
  particulas.forEach((p) => scene.remove(p.m));
  particulas = [];

  const fase = estado.fase;
  estado.fase = 'fuera';
  actualizarBotones();

  if (fase === 'ganado') {
    $('#titulo-fin').textContent = '¡Los encontraste todos! 🎉';
    $('#tiempo-final').textContent = formatearTiempo(estado.ultimoTiempo);
    $('#tiempo-final').style.display = '';
    $('#resumen-fin').textContent = CONFIG.totalPatos + ' / ' + CONFIG.totalPatos + ' patos encontrados';
    abrirModal('#modal-fin');
  } else if (fase === 'perdido' || fase === 'revelando') {
    $('#titulo-fin').textContent = '¡Se acabó el tiempo! ⏰';
    $('#tiempo-final').style.display = 'none';
    $('#resumen-fin').textContent = estado.encontrados + ' / ' + CONFIG.totalPatos + ' patos encontrados';
    $('#aviso-guardado').textContent = 'Solo las partidas completas entran al ranking.';
    $('#aviso-guardado').className = 'aviso';
    abrirModal('#modal-fin');
  } else {
    // Salio con el boton de Meta a media partida
    if (window.EnVivo) window.EnVivo.cerrar('abandonado', { encontrados: estado.encontrados });
    $('#estado-xr').textContent = 'Saliste antes de terminar. ¡Inténtalo otra vez!';
    $('#estado-xr').className = 'estado-xr';
    abrirModal('#modal-inicio');
  }
}

/* =============================================================
   Bucle principal (cada cuadro del visor)
   ============================================================= */
let ultimo = performance.now();

renderer.setAnimationLoop((tiempo, frame) => {
  const ahora = performance.now();
  const dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;

  if (!renderer.xr.isPresenting && !estado.pantalla) return;

  const cam = posicionCamara();
  sonidos.actualizarOyente(cam);

  // Rayo: siempre en 360 (se apunta de lejos); en MR solo con controles
  rayos.forEach((r, i) => {
    const f = fuentes[i];
    r.visible = !!f && (estado.modo === '360' || !f.hand);
    r.scale.z = estado.modo === '360' ? CONFIG.radio360 : 3;
  });

  // Esperar un momento a que el Quest entregue los planos de la habitacion
  if (estado.fase === 'colocando') {
    const espera = ahora - estado.inicioSesion;
    const hayPlanos = frame && frame.detectedPlanes && frame.detectedPlanes.size > 0;
    if ((hayPlanos && espera > 800) || espera > CONFIG.esperaPlanosMs) empezarPartida(frame);
  }

  if (estado.fase === 'jugando') {
    estado.transcurrido = ahora - estado.inicio;
    if (ahora - estado.ultimoHud > 100) { estado.ultimoHud = ahora; dibujarHud(); }
    if (estado.modo === 'mr') revisarToques();

    if (CONFIG.tiempoLimite > 0 && estado.fase === 'jugando' && tiempoRestante() <= 0) {
      tiempoAgotado();
    }

    // Pista sonora: un pato escondido hace "cuac" suave
    if (estado.fase === 'jugando' && CONFIG.pistaSonora && ahora > estado.proximaPista) {
      const vivos = patos.filter((p) => !p.atrapado);
      if (vivos.length) {
        const p = vivos[Math.floor(Math.random() * vivos.length)];
        sonidos.cuac(p.centro, CONFIG.volumenPista, 1);
        p.sacudida = 0.6;
      }
      estado.proximaPista = ahora + aleatorio(CONFIG.pistaCadaMs[0], CONFIG.pistaCadaMs[1]);
    }
  }

  // Velo verde: aparece suave y sigue la cabeza
  if (velo.visible) {
    velo.position.copy(camPos);
    const k = Math.min(1, (ahora - estado.inicioRevelado) / 600);
    velo.material.opacity = 0.32 * k;
  }

  if (hud.malla.visible) colocarFrente(hud.malla, 0.8, estado.pantalla ? -0.2 : -0.32, false);
  if (mensaje.malla.visible) colocarFrente(mensaje.malla, 1.1, -0.05, false);

  // Animar patos: miran al jugador, se mecen y, al atraparlos, saltan y desaparecen
  const t = ahora / 1000;
  patos = patos.filter((p) => {
    p.grupo.lookAt(camPos.x, p.grupo.position.y, camPos.z);

    if (p.atrapado) {
      const k = (ahora - p.t0) / 450;
      if (k >= 1) { scene.remove(p.grupo); return false; }
      const s = k < 0.3 ? 1 + k * 1.2 : 1.36 * (1 - (k - 0.3) / 0.7);
      p.malla.scale.set(Math.sign(p.malla.scale.x) * s, s, s);
      p.malla.position.y = k * 0.25;
      p.malla.rotation.y = k * Math.PI * 2;
      return true;
    }

    if (p.revelado) {
      // Revelado: el pato salta y el aro late
      const s = 1.25 + Math.sin(t * 6) * 0.12;
      p.malla.scale.set(Math.sign(p.malla.scale.x) * s, s, s);
      p.malla.position.y = Math.abs(Math.sin(t * 5 + p.fase)) * 0.06;
      if (estado.modo === '360') p.malla.position.y *= 0.3;
      if (p.aro) {
        p.aro.position.y = CONFIG.tamano / 2 * s + p.malla.position.y;
        p.aro.scale.setScalar(s * (1 + Math.sin(t * 6) * 0.08));
      }
      return true;
    }

    const balanceo = Math.sin(t * 2.2 + p.fase);
    p.malla.rotation.z = balanceo * 0.06;
    p.malla.position.y = p.flota ? Math.sin(t * 1.6 + p.fase) * 0.03 : 0;
    if (p.sacudida > 0) {
      p.sacudida -= dt;
      p.malla.rotation.z += Math.sin(t * 40) * 0.25 * p.sacudida;
      p.malla.position.y += Math.abs(Math.sin(t * 20)) * 0.02 * p.sacudida;
    }
    p.grupo.updateMatrixWorld(true);
    p.centro.set(0, CONFIG.tamano / 2, 0).add(p.malla.position);
    p.grupo.localToWorld(p.centro);
    return true;
  });

  animarConfeti(dt);
  renderer.render(scene, camera);
});

/* =============================================================
   Interfaz 2D (antes y despues de la sesion)
   ============================================================= */
function abrirModal(id)  { $(id).classList.add('activa'); }
function cerrarModal(id) { $(id).classList.remove('activa'); }
function cerrarModales() { ['#modal-inicio', '#modal-fin', '#modal-ranking'].forEach(cerrarModal); }

function escapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function cargarRanking(destacarNombre, destacarMs) {
  const caja = $('#tabla-ranking');
  caja.innerHTML = 'Cargando...';
  try {
    const res = await fetch('api.php?accion=ranking&limite=10', { cache: 'no-store' });
    const datos = await res.json();
    if (!datos.ok) throw new Error(datos.error || 'Error');
    if (!datos.ranking.length) {
      caja.innerHTML = '<p class="vacio">Todavía no hay tiempos registrados.</p>';
      return;
    }
    const filas = datos.ranking.map((r, i) => {
      const esMio = destacarNombre && r.nombre === destacarNombre &&
                    Number(r.milisegundos) === destacarMs;
      const medalla = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || (i + 1);
      return '<tr class="' + (esMio ? 'destacada' : '') + '">' +
               '<td class="pos">' + medalla + '</td>' +
               '<td>' + escapar(r.nombre) + '</td>' +
               '<td class="marca">' + formatearTiempo(Number(r.milisegundos)) + '</td>' +
             '</tr>';
    }).join('');
    caja.innerHTML = '<table><thead><tr><th>#</th><th>Jugador</th>' +
      '<th style="text-align:right">Tiempo</th></tr></thead><tbody>' + filas + '</tbody></table>';
  } catch (e) {
    caja.innerHTML = '<p class="vacio">No se pudo cargar el ranking.<br><small>' +
                     escapar(e.message) + '</small></p>';
  }
}

/** Guarda el tiempo con el nombre de la portada. Devuelve la posicion o null. */
async function guardarAutomatico() {
  const aviso = $('#aviso-guardado');
  aviso.textContent = 'Guardando tiempo de ' + estado.nombre + '...';
  aviso.className = 'aviso';
  try {
    const res = await fetch('api.php?accion=guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: estado.nombre, milisegundos: estado.ultimoTiempo,
                             patos: CONFIG.totalPatos })
    });
    const datos = await res.json();
    if (!datos.ok) throw new Error(datos.error || 'No se pudo guardar');
    aviso.textContent = 'Guardado. Posición #' + datos.posicion + ' del ranking.';
    aviso.className = 'aviso ok';
    return datos.posicion;
  } catch (e) {
    aviso.textContent = 'No se pudo guardar el tiempo.';
    aviso.className = 'aviso err';
    return null;
  }
}

function volverAJugar() {
  cerrarModales();
  abrirModal('#modal-inicio');
  $('#estado-xr').textContent = '';
  $('#aviso-guardado').textContent = '';
}

async function inicializar() {
  // Precargar las fuentes de marca para dibujarlas en los paneles 3D
  if (document.fonts && document.fonts.load) {
    ['700 50px "Source Code Pro"', '700 80px "Euclid Circular A"'].forEach((f) =>
      document.fonts.load(f).catch(() => {}));
  }
  $('#txt-total').textContent = String(CONFIG.totalPatos);
  $('#txt-limite').textContent = CONFIG.tiempoLimite > 0
    ? Math.floor(CONFIG.tiempoLimite / 60000) + ':' +
      String(Math.round(CONFIG.tiempoLimite / 1000) % 60).padStart(2, '0') + ' minutos'
    : 'todo el tiempo que quieras';
  try { $('#nombre').value = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) {}

  $('#btn-entrar').addEventListener('click', () => entrar('mr'));
  $('#btn-entrar-360').addEventListener('click', () => entrar('360'));
  $('#nombre').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (PAGINA_VR) { if (!$('#btn-entrar-360').disabled) entrar('360'); }
    else if (!$('#btn-entrar').disabled) entrar('mr');
  });
  const btnProbar = $('#btn-probar');
  if (btnProbar) btnProbar.addEventListener('click', probarEnPantalla);
  prepararMouse();
  precargar360();
  $('#btn-otra').addEventListener('click', volverAJugar);
  $('#btn-cerrar-ranking').addEventListener('click', volverAJugar);
  $('#btn-ver-ranking').addEventListener('click', () => {
    cerrarModal('#modal-fin');
    abrirModal('#modal-ranking');
    cargarRanking(estado.nombre, estado.ultimoTiempo);
  });

  window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    if (!estado.pantalla && contenedor.style.display !== 'block') return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const soporta = async (tipo) => {
    try { return !!(navigator.xr && await navigator.xr.isSessionSupported(tipo)); }
    catch (e) { return false; }
  };
  soporte.mr = await soporta('immersive-ar');
  soporte.vr = await soporta('immersive-vr');
  actualizarBotones();

  if (PAGINA_VR ? !soporte.vr : (!soporte.mr && !soporte.vr)) {
    const aviso = $('#estado-xr');
    aviso.className = 'estado-xr err';
    aviso.textContent = !window.isSecureContext
      ? 'Abre esta página con https:// (WebXR no funciona en http).'
      : 'Abre esta página en el navegador de tu Meta Quest 3' +
        (PAGINA_VR ? ', o usa «Probar en pantalla».' : '.');
  }
}

// vr.php marca <body data-pagina="vr">: solo realidad virtual con la imagen
const PAGINA_VR = document.body.dataset.pagina === 'vr';

const soporte = { mr: false, vr: false };

function actualizarBotones() {
  const mr = $('#btn-entrar');
  const v360 = $('#btn-entrar-360');
  mr.disabled = !soporte.mr;
  mr.textContent = soporte.mr ? 'Entrar en realidad mixta' : 'Realidad mixta no disponible';
  v360.disabled = !soporte.vr;
  v360.textContent = PAGINA_VR
    ? (soporte.vr ? 'Entrar con los lentes' : 'Lentes VR no disponibles')
    : (soporte.vr ? 'Jugar en 360' : '360 no disponible');
}

inicializar();

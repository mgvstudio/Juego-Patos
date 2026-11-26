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
   ============================================================= */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const CONFIG = {
  totalPatos: 8,
  imagenPato: 'pato.png',

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

  // Sonido: si existe este archivo se usa; si no, se sintetiza un "cuac"
  sonidoArchivo: 'sonidos/cuac.mp3',
  volumenCuac: 1.0,

  // Pistas sonoras: un pato al azar hace "cuac" suave cada cierto tiempo
  pistaSonora: true,
  pistaCadaMs: [6000, 10000],
  volumenPista: 0.35
};

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
   Sonido (Web Audio con audio espacial HRTF)
   ============================================================= */
class Sonidos {
  constructor() {
    this.ctx = null;
    this.buffer = null;
  }

  // Debe llamarse dentro de un gesto del usuario (clic en "Entrar")
  async iniciar() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.cargarArchivo(CONFIG.sonidoArchivo);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async cargarArchivo(url) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return;
      this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      this.buffer = null;   // sin archivo: se usa el cuac sintetizado
    }
  }

  // Coloca el "oido" del jugador donde esta su cabeza
  actualizarOyente(camara) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    camara.matrixWorld.decompose(p, q, new THREE.Vector3());
    const adelante = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
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
  }

  /**
   * Reproduce un cuac que suena desde la posicion "pos" (metros).
   * veces: 1 = "cuac", 2 = "cuac-cuac"
   */
  cuac(pos, volumen = 1, veces = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 0.6,
      rolloffFactor: 1.2,
      positionX: pos.x, positionY: pos.y, positionZ: pos.z
    });
    const salida = ctx.createGain();
    salida.gain.value = volumen * CONFIG.volumenCuac;
    salida.connect(panner).connect(ctx.destination);

    const tono = aleatorio(0.92, 1.12);   // cada cuac un poco distinto
    for (let i = 0; i < veces; i++) {
      const inicio = ctx.currentTime + 0.01 + i * 0.26;
      const vol = i === 0 ? 1 : 0.75;
      if (this.buffer) this.reproducirArchivo(salida, inicio, tono, vol);
      else this.sintetizar(salida, inicio, tono * (i === 0 ? 1 : 0.94), vol);
    }

    // Liberar los nodos cuando termina
    setTimeout(() => { try { panner.disconnect(); salida.disconnect(); } catch (e) {} },
               (veces * 0.26 + 1.2) * 1000);
  }

  reproducirArchivo(destino, inicio, tono, vol) {
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.buffer = this.buffer;
    src.playbackRate.value = tono;
    src.connect(g).connect(destino);
    src.start(inicio);
  }

  /**
   * "Cuac" sintetizado: onda diente de sierra con tono que cae,
   * filtrada en las frecuencias nasales del pato y con un temblor
   * de amplitud que le da lo rasposo.
   */
  sintetizar(destino, t, tono, vol) {
    const ctx = this.ctx;
    const dur = 0.24;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(560 * tono, t);
    osc.frequency.exponentialRampToValueAtTime(400 * tono, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(300 * tono, t + dur);

    const osc2 = ctx.createOscillator();     // segunda voz desafinada
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(565 * tono, t);
    osc2.frequency.exponentialRampToValueAtTime(404 * tono, t + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(302 * tono, t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;

    // Temblor rasposo (modulacion de amplitud ~ 60 Hz)
    const temblor = ctx.createGain();
    temblor.gain.value = 0.65;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 58;
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 0.35;
    lfo.connect(lfoAmp).connect(temblor.gain);

    // Formantes nasales
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 1150; f1.Q.value = 1.6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 3.5;
    const f2g = ctx.createGain(); f2g.gain.value = 0.6;
    const cuerpo = ctx.createBiquadFilter();
    cuerpo.type = 'lowpass'; cuerpo.frequency.value = 900;
    const cuerpoG = ctx.createGain(); cuerpoG.gain.value = 0.25;

    // Envolvente
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    env.gain.setValueAtTime(vol, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(temblor);
    osc2.connect(g2).connect(temblor);
    temblor.connect(f1).connect(env);
    temblor.connect(f2).connect(f2g).connect(env);
    temblor.connect(cuerpo).connect(cuerpoG).connect(env);
    env.connect(destino);

    [osc, osc2, lfo].forEach((o) => { o.start(t); o.stop(t + dur + 0.05); });
  }
}

const sonidos = new Sonidos();

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

punteros.forEach((p, i) => {
  const rayo = new THREE.Line(geoRayo, matRayo);
  rayo.scale.z = 3;
  rayo.visible = false;
  p.add(rayo);
  p.addEventListener('connected', (ev) => {
    fuentes[i] = ev.data;
    rayo.visible = !ev.data.hand;          // el rayo solo con controles
  });
  p.addEventListener('disconnected', () => { fuentes[i] = null; rayo.visible = false; });
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
  c.fillStyle = '#00ED64';
  c.font = '700 50px ' + FUENTE_CIFRAS;
  c.fillText(formatearTiempo(estado.transcurrido).slice(0, 7), 370, 134);
  hud.textura.needsUpdate = true;
}

function mostrarMensaje(titulo, subtitulo, ms) {
  fondoPanel(mensaje);
  const c = mensaje.ctx;
  c.textAlign = 'center';
  c.fillStyle = '#FFFFFF';
  c.font = '700 84px ' + FUENTE;
  c.fillText(titulo, mensaje.ancho / 2, 160);
  c.fillStyle = '#C0FAE6';
  c.font = '500 46px ' + FUENTE;
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
  fase: 'fuera',          // fuera | colocando | jugando | fin
  encontrados: 0,
  inicio: 0,
  transcurrido: 0,
  ultimoTiempo: 0,
  inicioSesion: 0,
  proximaPista: 0,
  ultimoHud: 0
};

let patos = [];            // { grupo, malla, centro, atrapado, t0 }
let particulas = [];
const camPos = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmp = new THREE.Vector3();

function posicionCamara() {
  const cam = renderer.xr.getCamera();
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
    // Muebles: varios intentos; piso: mas, porque es grande
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

function colocarPatos(frame) {
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

function crearPato(pos, sobreSuperficie) {
  const grupo = new THREE.Group();
  grupo.position.copy(pos);

  const malla = new THREE.Mesh(geoPato, matPato);
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
    centro: pos.clone().add(new THREE.Vector3(0, CONFIG.tamano / 2, 0)),
    flota: !sobreSuperficie,
    fase: Math.random() * Math.PI * 2,
    atrapado: false,
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
  raycaster.far = 6;

  const vivos = patos.filter((p) => !p.atrapado);
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
async function entrar() {
  const boton = $('#btn-entrar');
  const aviso = $('#estado-xr');
  boton.disabled = true;
  aviso.textContent = 'Abriendo realidad mixta…';
  aviso.className = 'estado-xr';

  try {
    await sonidos.iniciar();
    const sesion = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'plane-detection']
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
  colocarPatos(frame);
  estado.fase = 'jugando';
  estado.encontrados = 0;
  estado.inicio = performance.now();
  estado.proximaPista = estado.inicio + 4000;
  hud.malla.visible = true;
  dibujarHud();
  colocarFrente(hud.malla, 0.8, -0.32, true);
  mostrarMensaje('¡Encuentra ' + CONFIG.totalPatos + ' patos!',
                 'Míralos a tu alrededor y tócalos con la mano', 4500);
}

function terminarPartida() {
  estado.fase = 'fin';
  estado.ultimoTiempo = Math.round(estado.transcurrido);
  dibujarHud();

  // Festejo: confeti frente al jugador y coro de cuacs
  const frente = new THREE.Vector3().copy(camPos).addScaledVector(
    new THREE.Vector3(camDir.x, 0, camDir.z).normalize(), 0.9);
  lanzarConfeti(frente, 140, 2.2);
  [0, 350, 700].forEach((ms, k) => setTimeout(() => {
    sonidos.cuac(new THREE.Vector3(frente.x + (k - 1) * 0.6, frente.y, frente.z), 0.8, 1);
  }, ms));

  mostrarMensaje('¡Los encontraste todos!', 'Tiempo: ' + formatearTiempo(estado.ultimoTiempo), 0);

  setTimeout(() => {
    const s = renderer.xr.getSession();
    if (s) s.end();
  }, 4000);
}

function alSalir() {
  contenedor.style.display = 'none';
  hud.malla.visible = false;
  mensaje.malla.visible = false;
  limpiarPatos();
  particulas.forEach((p) => scene.remove(p.m));
  particulas = [];

  const termino = estado.fase === 'fin';
  estado.fase = 'fuera';
  $('#btn-entrar').disabled = false;
  $('#btn-entrar').textContent = 'Entrar en realidad mixta';

  if (termino) {
    $('#tiempo-final').textContent = formatearTiempo(estado.ultimoTiempo);
    $('#aviso-guardado').textContent = '';
    $('#aviso-guardado').className = 'aviso';
    $('#btn-guardar').disabled = false;
    abrirModal('#modal-fin');
  } else {
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

  if (!renderer.xr.isPresenting) return;

  const cam = posicionCamara();
  sonidos.actualizarOyente(cam);

  // Esperar un momento a que el Quest entregue los planos de la habitacion
  if (estado.fase === 'colocando') {
    const espera = ahora - estado.inicioSesion;
    const hayPlanos = frame && frame.detectedPlanes && frame.detectedPlanes.size > 0;
    if ((hayPlanos && espera > 800) || espera > CONFIG.esperaPlanosMs) empezarPartida(frame);
  }

  if (estado.fase === 'jugando') {
    estado.transcurrido = ahora - estado.inicio;
    if (ahora - estado.ultimoHud > 100) { estado.ultimoHud = ahora; dibujarHud(); }
    revisarToques();

    // Pista sonora: un pato escondido hace "cuac" suave
    if (CONFIG.pistaSonora && ahora > estado.proximaPista) {
      const vivos = patos.filter((p) => !p.atrapado);
      if (vivos.length) {
        const p = vivos[Math.floor(Math.random() * vivos.length)];
        sonidos.cuac(p.centro, CONFIG.volumenPista, 1);
        p.sacudida = 0.6;
      }
      estado.proximaPista = ahora + aleatorio(CONFIG.pistaCadaMs[0], CONFIG.pistaCadaMs[1]);
    }
  }

  if (hud.malla.visible) colocarFrente(hud.malla, 0.8, -0.32, false);
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
    const res = await fetch('api.php?accion=ranking&limite=10&modo=mr', { cache: 'no-store' });
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

async function guardarTiempo(ev) {
  ev.preventDefault();
  const nombre = $('#nombre').value.trim();
  const aviso = $('#aviso-guardado');
  const boton = $('#btn-guardar');
  if (!nombre) { aviso.textContent = 'Escribe tu nombre.'; aviso.className = 'aviso err'; return; }

  boton.disabled = true;
  aviso.textContent = 'Guardando...';
  aviso.className = 'aviso';
  try {
    const res = await fetch('api.php?accion=guardar&modo=mr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, milisegundos: estado.ultimoTiempo,
                             patos: CONFIG.totalPatos })
    });
    const datos = await res.json();
    if (!datos.ok) throw new Error(datos.error || 'No se pudo guardar');
    aviso.textContent = 'Guardado. Posición #' + datos.posicion + ' del ranking.';
    aviso.className = 'aviso ok';
    setTimeout(() => {
      cerrarModal('#modal-fin');
      abrirModal('#modal-ranking');
      cargarRanking(nombre, estado.ultimoTiempo);
    }, 900);
  } catch (e) {
    aviso.textContent = 'Error: ' + e.message;
    aviso.className = 'aviso err';
    boton.disabled = false;
  }
}

function volverAJugar() {
  cerrarModales();
  abrirModal('#modal-inicio');
  $('#estado-xr').textContent = '';
}

async function inicializar() {
  // Precargar las fuentes de marca para dibujarlas en los paneles 3D
  if (document.fonts && document.fonts.load) {
    ['700 50px "Source Code Pro"', '700 84px "Euclid Circular A"'].forEach((f) =>
      document.fonts.load(f).catch(() => {}));
  }
  $('#txt-total').textContent = String(CONFIG.totalPatos);
  $('#btn-entrar').addEventListener('click', entrar);
  $('#btn-otra').addEventListener('click', volverAJugar);
  $('#btn-cerrar-ranking').addEventListener('click', volverAJugar);
  $('#form-nombre').addEventListener('submit', guardarTiempo);

  window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const boton = $('#btn-entrar');
  const aviso = $('#estado-xr');
  let soportado = false;
  try {
    soportado = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
  } catch (e) { soportado = false; }

  if (soportado) {
    boton.disabled = false;
    boton.textContent = 'Entrar en realidad mixta';
  } else {
    boton.textContent = 'Realidad mixta no disponible';
    aviso.className = 'estado-xr err';
    aviso.textContent = !window.isSecureContext
      ? 'Abre esta página con https:// (WebXR no funciona en http).'
      : 'Abre esta página en el navegador de tu Meta Quest 3.';
  }
}

inicializar();

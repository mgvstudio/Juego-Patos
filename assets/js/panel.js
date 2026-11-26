/* =============================================================
   Panel en vivo: consulta api.php?accion=panel cada 2 segundos
   ============================================================= */
(function () {
  'use strict';

  const CONFIG = {
    cadaMs: 2000,
    // Mismo fondo que usa la tableta (CONFIG.imagenFondo en game.js)
    imagenMapa: 'background6.jpg',
    // Para colorear el reloj igual que en el juego
    tiempoLimite: 90000,
    avisoAmbar: 20,
    avisoRojo: 10
  };

  const MODOS = { pantalla: '🖥️ Pantalla', tableta: '📱 Tableta', lentes: '🥽 Lentes MR' };
  const ESTADOS = { ganado: 'Ganó', perdido: 'Tiempo agotado', abandonado: 'Abandonó' };

  const $ = (s) => document.querySelector(s);
  let vivos = [];
  let recibido = 0;   // momento del ultimo dato, para que el reloj avance entre consultas

  function escapar(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mmss(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function formatearMs(ms) {
    const total = Math.max(0, ms);
    return mmss(total / 1000) + '.' + Math.floor((total % 1000) / 100);
  }

  function pips(encontrados, total) {
    let html = '';
    for (let i = 0; i < total; i++) html += '<span class="pip' + (i < encontrados ? ' ok' : '') + '"></span>';
    return html;
  }

  function mapa(j) {
    if (j.modo === 'lentes') {
      return '<div class="mapa mr">Buscando patos en su habitación<br>(realidad mixta)</div>';
    }
    const v = String(j.vista || '').split(',').map(Number);
    let zona = '';
    if (v.length === 4 && v.every((n) => isFinite(n))) {
      zona = '<div class="zona" style="left:' + v[0] * 100 + '%;top:' + v[1] * 100 +
             '%;width:' + v[2] * 100 + '%;height:' + v[3] * 100 + '%"></div>';
    }
    return '<div class="mapa" style="background-image:url(\'' + CONFIG.imagenMapa + '\')">' + zona + '</div>';
  }

  // Reloj de cada jugador: cuenta regresiva si hay limite
  function reloj(j) {
    const transcurrido = Number(j.segundos) + (Date.now() - recibido) / 1000;
    if (!CONFIG.tiempoLimite) return { texto: mmss(transcurrido), clase: '' };
    const restante = CONFIG.tiempoLimite / 1000 - transcurrido;
    const clase = restante <= CONFIG.avisoRojo ? 'rojo' : restante <= CONFIG.avisoAmbar ? 'ambar' : '';
    return { texto: mmss(restante), clase };
  }

  function pintarVivos() {
    const caja = $('#lista-vivos');
    $('#num-vivos').textContent = String(vivos.length);
    if (!vivos.length) {
      caja.innerHTML = '<p class="vacio">Nadie está jugando en este momento.</p>';
      return;
    }
    caja.innerHTML = vivos.map((j) => {
      const r = reloj(j);
      return '<article class="jugador" data-sid="' + escapar(j.sid) + '">' +
        '<div class="fila"><span class="nombre">' + escapar(j.nombre) + '</span>' +
        '<span class="modo ' + escapar(j.modo) + '">' + (MODOS[j.modo] || escapar(j.modo)) + '</span></div>' +
        '<div class="fila"><span class="pips">' + pips(Number(j.encontrados), Number(j.total)) + '</span>' +
        '<span class="tiempo ' + r.clase + '">' + r.texto + '</span></div>' +
        mapa(j) +
      '</article>';
    }).join('');
  }

  // Solo el reloj, sin redibujar todo (cada medio segundo)
  function actualizarRelojes() {
    document.querySelectorAll('.jugador').forEach((el) => {
      const j = vivos.find((v) => v.sid === el.dataset.sid);
      if (!j) return;
      const r = reloj(j);
      const t = el.querySelector('.tiempo');
      t.textContent = r.texto;
      t.className = 'tiempo ' + r.clase;
    });
  }

  function pintarRecientes(lista) {
    const cuerpo = $('#tabla-recientes');
    if (!lista.length) {
      cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">Sin partidas todavía.</td></tr>';
      return;
    }
    cuerpo.innerHTML = lista.map((r) =>
      '<tr><td>' + escapar(r.nombre) + '</td>' +
      '<td>' + (MODOS[r.modo] || escapar(r.modo)) + '</td>' +
      '<td class="estado ' + escapar(r.estado) + '">' + (ESTADOS[r.estado] || escapar(r.estado)) + '</td>' +
      '<td>' + Number(r.encontrados) + ' / ' + Number(r.total) + '</td>' +
      '<td class="der">' + mmss(Number(r.segundos)) + '</td></tr>'
    ).join('');
  }

  function pintarRanking(lista) {
    const ol = $('#lista-ranking');
    if (!lista.length) {
      ol.innerHTML = '<li class="vacio">Todavía no hay tiempos.</li>';
      return;
    }
    ol.innerHTML = lista.map((r, i) =>
      '<li><span class="pos">' + (['🥇', '🥈', '🥉'][i] || i + 1) + '</span>' +
      '<span class="quien">' + escapar(r.nombre) + '</span>' +
      '<span class="marca">' + formatearMs(Number(r.milisegundos)) + '</span></li>'
    ).join('');
  }

  function conexion(ok, texto) {
    $('#conexion').className = 'conexion ' + (ok ? 'ok' : 'err');
    $('#txt-conexion').textContent = texto;
  }

  async function consultar() {
    try {
      const [panel, ranking] = await Promise.all([
        fetch('api.php?accion=panel', { cache: 'no-store' }).then((r) => r.json()),
        fetch('api.php?accion=ranking&limite=10', { cache: 'no-store' }).then((r) => r.json())
      ]);
      if (!panel.ok) throw new Error(panel.error || 'Error');

      recibido = Date.now();
      vivos = panel.vivos || [];
      pintarVivos();
      pintarRecientes(panel.recientes || []);
      const hoy = panel.hoy || {};
      $('#hoy-partidas').textContent = String(hoy.partidas || 0);
      $('#hoy-patos').textContent = String(hoy.patos || 0);
      $('#hoy-ganadas').textContent = String(hoy.ganadas || 0);
      if (ranking.ok) pintarRanking(ranking.ranking || []);

      conexion(true, 'En vivo · ' + new Date().toLocaleTimeString());
    } catch (e) {
      conexion(false, 'Sin conexión con el servidor');
    } finally {
      setTimeout(consultar, CONFIG.cadaMs);
    }
  }

  setInterval(actualizarRelojes, 500);
  consultar();
})();

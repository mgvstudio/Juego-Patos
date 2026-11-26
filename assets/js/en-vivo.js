/* =============================================================
   En vivo: avisa al servidor como va cada partida para panel.php
   -------------------------------------------------------------
   Envia un "latido" cada 2 s y en cada cambio importante.
   Si la red falla el juego sigue sin enterarse.

   Uso:
     EnVivo.iniciar({ nombre, modo, total })   // modo: pantalla | tableta | lentes
     EnVivo.actualizar({ encontrados, vista })  // vista: "x,y,ancho,alto" en 0..1
     EnVivo.cerrar('ganado' | 'perdido' | 'abandonado', { encontrados })
   ============================================================= */
(function () {
  'use strict';

  const URL_LATIDO = 'api.php?accion=latido';
  const CADA_MS = 2000;

  function nuevoSid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  const EnVivo = {
    sid: null,
    datos: null,
    temporizador: null,

    iniciar(datos) {
      if (this.sid) this.cerrar('abandonado');
      this.sid = nuevoSid();
      this.datos = Object.assign({ estado: 'jugando', encontrados: 0, vista: '' }, datos);
      this.enviar(false);
      clearInterval(this.temporizador);
      this.temporizador = setInterval(() => this.enviar(false), CADA_MS);
    },

    /** Los cambios de progreso se envian al instante; la vista viaja con el siguiente latido */
    actualizar(cambios) {
      if (!this.sid) return;
      let importante = false;
      Object.keys(cambios).forEach((k) => {
        if (k !== 'vista' && this.datos[k] !== cambios[k]) importante = true;
        this.datos[k] = cambios[k];
      });
      if (importante) this.enviar(false);
    },

    cerrar(estado, cambios) {
      if (!this.sid) return;
      Object.assign(this.datos, cambios || {}, { estado: estado });
      clearInterval(this.temporizador);
      this.temporizador = null;
      this.enviar(true);
      this.sid = null;
    },

    enviar(final) {
      if (!this.sid) return;
      const cuerpo = JSON.stringify(Object.assign({ sid: this.sid }, this.datos));
      if (final && navigator.sendBeacon) {
        try {
          if (navigator.sendBeacon(URL_LATIDO, new Blob([cuerpo], { type: 'application/json' }))) return;
        } catch (e) { /* seguimos con fetch */ }
      }
      fetch(URL_LATIDO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        keepalive: !!final
      }).catch(() => {});
    }
  };

  // Si cierran la pestana a media partida, queda como abandonada
  window.addEventListener('pagehide', () => EnVivo.cerrar('abandonado'));

  window.EnVivo = EnVivo;
})();

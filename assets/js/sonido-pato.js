/* =============================================================
   Sonidos del juego (compartido por la tableta y la realidad mixta)
   -------------------------------------------------------------
   - cuac(): usa sonidos/cuac.mp3 si existe; si no, sintetiza
     un "cuac" con Web Audio (respaldo, siempre funciona).
   - victoria(): fanfarria corta al encontrar todos los patos.
   - aviso(): tono grave cuando se acaba el tiempo.
   Todas aceptan { destino } para mandar el sonido a otro nodo
   (la realidad mixta lo usa para el audio 3D).
   ============================================================= */
(function () {
  'use strict';

  const SonidoPato = {
    archivo: 'sonidos/cuac.mp3',
    volumen: 1,
    ctx: null,
    buffer: null,

    /** Crea o reactiva el AudioContext. Llamar por primera vez en un toque/clic. */
    contexto() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.cargar();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },

    async cargar() {
      try {
        const res = await fetch(this.archivo, { cache: 'force-cache' });
        if (!res.ok) return;
        const datos = await res.arrayBuffer();
        this.buffer = await new Promise((ok, mal) =>
          this.ctx.decodeAudioData(datos, ok, mal));
      } catch (e) {
        this.buffer = null;   // sin archivo: se usa el cuac sintetizado
      }
    },

    /** "Cuac". opciones: { destino, volumen, veces } */
    cuac(opciones) {
      const o = opciones || {};
      const ctx = this.contexto();
      if (!ctx) return;
      const salida = ctx.createGain();
      salida.gain.value = (o.volumen == null ? 1 : o.volumen) * this.volumen;
      salida.connect(o.destino || ctx.destination);

      const veces = o.veces || 1;
      const tono = 0.92 + Math.random() * 0.2;   // cada cuac un poco distinto
      for (let i = 0; i < veces; i++) {
        const t = ctx.currentTime + 0.01 + i * 0.26;
        const vol = i === 0 ? 1 : 0.75;
        if (this.buffer) this.reproducirArchivo(salida, t, tono, vol);
        else this.sintetizar(salida, t, tono * (i === 0 ? 1 : 0.94), vol);
      }
      setTimeout(() => { try { salida.disconnect(); } catch (e) {} },
                 (veces * 0.26 + 1.5) * 1000);
    },

    reproducirArchivo(destino, t, tono, vol) {
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.buffer = this.buffer;
      src.playbackRate.value = tono;
      src.connect(g).connect(destino);
      src.start(t);
    },

    /**
     * Cuac sintetizado: diente de sierra con tono que cae, filtrado en
     * las frecuencias nasales del pato y con un temblor rasposo.
     */
    sintetizar(destino, t, tono, vol) {
      const ctx = this.ctx;
      const dur = 0.24;
      const rampa = (param, a, b, c) => {
        param.setValueAtTime(a * tono, t);
        param.exponentialRampToValueAtTime(b * tono, t + 0.05);
        param.exponentialRampToValueAtTime(c * tono, t + dur);
      };

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      rampa(osc.frequency, 560, 400, 300);
      const osc2 = ctx.createOscillator();         // segunda voz desafinada
      osc2.type = 'square';
      rampa(osc2.frequency, 565, 404, 302);
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;

      const temblor = ctx.createGain();             // modulacion ~58 Hz
      temblor.gain.value = 0.65;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 58;
      const lfoAmp = ctx.createGain();
      lfoAmp.gain.value = 0.35;
      lfo.connect(lfoAmp).connect(temblor.gain);

      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 1150; f1.Q.value = 1.6;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 3.5;
      const f2g = ctx.createGain(); f2g.gain.value = 0.6;
      const cuerpo = ctx.createBiquadFilter();
      cuerpo.type = 'lowpass'; cuerpo.frequency.value = 900;
      const cuerpoG = ctx.createGain(); cuerpoG.gain.value = 0.25;

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

      [osc, osc2, lfo].forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
    },

    nota(destino, frecuencia, t, dur, tipo, vol) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tipo;
      osc.frequency.setValueAtTime(frecuencia, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(destino);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },

    /** Fanfarria corta de victoria */
    victoria(opciones) {
      const o = opciones || {};
      const ctx = this.contexto();
      if (!ctx) return;
      const destino = o.destino || ctx.destination;
      const t = ctx.currentTime + 0.05;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.nota(destino, f, t + i * 0.13, i === 3 ? 0.6 : 0.2, 'triangle', 0.35));
      this.nota(destino, 783.99, t + 0.52, 0.6, 'sine', 0.2);
    },

    /** Tono grave de "se acabo el tiempo" */
    aviso(opciones) {
      const o = opciones || {};
      const ctx = this.contexto();
      if (!ctx) return;
      const destino = o.destino || ctx.destination;
      const t = ctx.currentTime + 0.02;
      this.nota(destino, 146.8, t, 0.35, 'sawtooth', 0.22);
      this.nota(destino, 110, t + 0.4, 0.7, 'sawtooth', 0.25);
    }
  };

  window.SonidoPato = SonidoPato;
})();

<?php
/**
 * Encuentra los patos - version REALIDAD VIRTUAL para los lentes Meta Quest.
 * La imagen (mundo3.jpg) rodea al jugador y los patos estan camuflados en ella.
 * Se atrapan apuntando con la mano y haciendo pinza, o con el gatillo del control.
 *
 * Requisitos: navegador del Quest y HTTPS (WebXR no funciona en http://,
 * salvo en localhost). "Probar en pantalla" permite jugar con el raton.
 * Usa el mismo motor que realidad-mixta.php (assets/js/mr.js, modo 360).
 */
$version = '2.2.0';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="theme-color" content="#001E2B">
<title>Encuentra los Patos VR | MongoDB</title>
<link rel="icon" type="image/svg+xml" href="assets/img/mongodb-hoja-verde.svg">
<link rel="stylesheet" href="assets/css/marca.css?v=<?= $version ?>">
<link rel="stylesheet" href="assets/css/style.css?v=<?= $version ?>">
<style>
  #lienzo-xr { position: fixed; inset: 0; display: none; }
  .modal { background: var(--fondo-app); }
  .estado-xr { min-height: 22px; font-weight: 600; color: var(--texto-suave); }
  .estado-xr.err { color: var(--rojo, #ff6b6b); }
  .pato-portada { height: 96px; width: auto; margin: 0 auto 10px; display: block; }
  .tarjeta a.enlace { color: var(--verde-base); }
  #btn-entrar { display: none; }          /* esta pagina es solo realidad virtual */
  #ayuda-pantalla {
    display: none; position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    z-index: 5; padding: 8px 16px; border-radius: 999px; font-size: 14px;
    background: rgba(0, 30, 43, .8); color: var(--texto-suave); pointer-events: none;
  }
</style>
</head>
<body data-pagina="vr">

<!-- ===== Pantalla de inicio ===== -->
<div class="modal activa" id="modal-inicio">
  <div class="tarjeta">
    <img class="logo-portada" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB">
    <img class="pato-portada" src="pato.png" alt="">
    <h1>Encuentra los Patos</h1>
    <p>Ponte los lentes: una imagen gigante te rodea y hay
       <strong id="txt-total">5</strong> patos <strong>camuflados</strong> en ella.
       Gira la cabeza para buscarlos, <strong>apunta con la mano y haz pinza</strong>
       (índice + pulgar) o usa el gatillo del control.</p>
    <p class="ayuda">Tienes <strong id="txt-limite">1:30 minutos</strong>.
       Escucha: los patos hacen “cuac” de vez en cuando desde donde están escondidos.</p>
    <div class="campo-nombre">
      <label for="nombre">Tu nombre (para el ranking)</label>
      <input type="text" id="nombre" name="nombre" maxlength="40" placeholder="Tu nombre" autocomplete="off">
    </div>
    <div class="fila-botones">
      <button type="button" class="btn btn-grande" id="btn-entrar-360" disabled>Comprobando visor…</button>
      <button type="button" class="btn btn-sec" id="btn-probar">Probar en pantalla</button>
      <button type="button" id="btn-entrar" disabled hidden></button>
    </div>
    <p class="estado-xr" id="estado-xr"></p>
    <p class="ayuda">
      <a class="enlace" href="realidad-mixta.php">Realidad mixta (patos en tu habitación)</a> ·
      <a class="enlace" href="index.php">Versión de tableta</a>
    </p>
  </div>
</div>

<!-- ===== Fin de partida ===== -->
<div class="modal" id="modal-fin">
  <div class="tarjeta">
    <h2 id="titulo-fin">¡Los encontraste todos! 🎉</h2>
    <p class="tiempo-final" id="tiempo-final">00:00.0</p>
    <p class="resumen-fin" id="resumen-fin"></p>
    <div class="fila-botones">
      <button type="button" class="btn btn-grande" id="btn-otra">Jugar otra vez</button>
      <button type="button" class="btn btn-sec" id="btn-ver-ranking">Ranking</button>
    </div>
    <p class="aviso" id="aviso-guardado"></p>
  </div>
</div>

<!-- ===== Ranking ===== -->
<div class="modal" id="modal-ranking">
  <div class="tarjeta">
    <h2>🏆 Mejores tiempos</h2>
    <div id="tabla-ranking" class="tabla-scroll">Cargando…</div>
    <button type="button" class="btn" id="btn-cerrar-ranking">Jugar otra vez</button>
  </div>
</div>

<div id="lienzo-xr"></div>
<div id="ayuda-pantalla">Arrastra para mirar · clic en los patos · Esc para salir</div>

<script src="assets/js/sonido-pato.js?v=<?= $version ?>"></script>
<script src="assets/js/en-vivo.js?v=<?= $version ?>"></script>
<script type="module" src="assets/js/mr.js?v=<?= $version ?>"></script>
</body>
</html>

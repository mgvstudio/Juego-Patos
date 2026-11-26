<?php
/**
 * Encuentra los patos - version de REALIDAD MIXTA para Meta Quest 3.
 * Usa WebXR (immersive-ar): los patos aparecen sobre tu habitacion real
 * (passthrough) y al tocarlos con la mano o el control se escucha "cuac".
 *
 * Requisitos: abrir en el navegador del Quest y servir por HTTPS
 * (WebXR no funciona en http:// salvo en localhost).
 */
$version = '1.0.0';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="theme-color" content="#001E2B">
<title>Encuentra los Patos MR | MongoDB</title>
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
</style>
</head>
<body>

<!-- ===== Pantalla de inicio ===== -->
<div class="modal activa" id="modal-inicio">
  <div class="tarjeta">
    <img class="logo-portada" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB">
    <img class="pato-portada" src="pato.png" alt="">
    <h1>Encuentra los Patos</h1>
    <p>Realidad mixta: hay <strong id="txt-total">8</strong> patos escondidos
       <strong>en tu habitación</strong>. Búscalos a tu alrededor y
       <strong>tócalos con la mano</strong> (o con el control) para atraparlos.</p>
    <p class="ayuda">Si te pierdes, escucha: los patos hacen “cuac” de vez en cuando
       y el sonido viene de donde están escondidos.</p>
    <button type="button" class="btn btn-grande" id="btn-entrar" disabled>Comprobando visor…</button>
    <p class="estado-xr" id="estado-xr"></p>
    <p class="ayuda"><a class="enlace" href="index.php">Jugar la versión de tableta</a></p>
  </div>
</div>

<!-- ===== Fin de partida ===== -->
<div class="modal" id="modal-fin">
  <div class="tarjeta">
    <h2 id="titulo-fin">¡Los encontraste todos! 🎉</h2>
    <p class="tiempo-final" id="tiempo-final">00:00.0</p>
    <form id="form-nombre" autocomplete="off">
      <label for="nombre">Escribe tu nombre para el ranking</label>
      <input type="text" id="nombre" name="nombre" maxlength="40" placeholder="Tu nombre" required>
      <div class="fila-botones">
        <button type="submit" class="btn btn-grande" id="btn-guardar">Guardar tiempo</button>
        <button type="button" class="btn btn-sec" id="btn-otra">Jugar otra vez</button>
      </div>
    </form>
    <p class="aviso" id="aviso-guardado"></p>
  </div>
</div>

<!-- ===== Ranking ===== -->
<div class="modal" id="modal-ranking">
  <div class="tarjeta">
    <h2>🏆 Mejores tiempos (realidad mixta)</h2>
    <div id="tabla-ranking" class="tabla-scroll">Cargando…</div>
    <button type="button" class="btn" id="btn-cerrar-ranking">Jugar otra vez</button>
  </div>
</div>

<div id="lienzo-xr"></div>

<script type="module" src="assets/js/mr.js?v=<?= $version ?>"></script>
</body>
</html>

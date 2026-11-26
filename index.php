<?php
/**
 * Encuentra los patos - juego para tableta / pantalla completa.
 */
$version = '2.6.0';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#001E2B">
<title>Encuentra los Patos | MongoDB</title>
<link rel="icon" type="image/svg+xml" href="assets/img/mongodb-hoja-verde.svg">
<link rel="stylesheet" href="assets/css/marca.css?v=<?= $version ?>">
<link rel="stylesheet" href="assets/css/style.css?v=<?= $version ?>">
</head>
<body>

<!-- ===== Pantalla de arranque con el logo ===== -->
<div id="splash">
  <div class="splash-caja">
    <img class="splash-logo" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB">
    <div class="splash-barra"><span></span></div>
  </div>
</div>

<div id="app">

  <!-- ===== Marcador superior ===== -->
  <header id="hud">
    <!-- Logo de marca en la esquina -->
    <img class="hud-logo" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB"
         height="24" style="height:24px;width:auto">

    <div class="hud-izq">
      <div class="hud-bloque" id="hud-patos"
           style="display:flex;flex-direction:row;align-items:center;gap:12px">
        <img class="icono-pato" src="pato.png" alt="" height="44"
             style="height:44px;width:auto;flex:0 0 auto">
        <div class="hud-patos-datos"
             style="display:flex;flex-direction:column;gap:2px">
          <span class="hud-etiqueta">Patos</span>
          <span class="hud-valor"><span id="encontrados">0</span> / <span id="total">5</span></span>
          <div id="pistas"></div>
        </div>
      </div>

      <div class="hud-bloque">
        <span class="hud-etiqueta">Tiempo</span>
        <span class="hud-valor hud-tiempo" id="cronometro">00:00.0</span>
      </div>
    </div>


    <div class="hud-bloque hud-acciones">
      <button type="button" class="btn" id="btn-reiniciar" title="Reiniciar partida">Reiniciar</button>
      <button type="button" class="btn btn-sec" id="btn-ranking" title="Mejores tiempos">Ranking</button>
      <button type="button" class="btn btn-sec" id="btn-pantalla" title="Pantalla completa">Pantalla</button>
    </div>
  </header>

  <!-- ===== Escenario ===== -->
  <main id="escenario">
    <div id="lienzo">
      <img id="fondo" alt="Escenario" draggable="false">
      <!-- Capa independiente de patos: se puede cambiar/modificar sin tocar el fondo -->
      <div id="capa-patos" aria-label="Patos escondidos"></div>
    </div>
  </main>

  <canvas id="confeti"></canvas>

  <!-- ===== Pantalla de inicio ===== -->
  <div class="modal activa" id="modal-inicio">
    <div class="tarjeta">
      <img class="logo-portada" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB">
      <h1>Encuentra los Patos</h1>
      <p>Hay <strong id="txt-total">5</strong> patos escondidos en la imagen.
         Tócalos para atraparlos lo más rápido que puedas.</p>
      <p class="ayuda">No se ve toda la escena a la vez: <strong>arrastra para recorrerla</strong>
         y acerca con dos dedos (pellizco) para mirar de cerca.</p>
      <button type="button" class="btn btn-grande" id="btn-jugar">Jugar</button>
    </div>
  </div>

  <!-- ===== Fin de partida ===== -->
  <div class="modal" id="modal-fin">
    <div class="tarjeta">
      <h2>¡Los encontraste todos! 🎉</h2>
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
      <img class="pie-marca" src="assets/img/mongodb-hoja-verde.svg" alt="MongoDB">
    </div>
  </div>

  <!-- ===== Ranking ===== -->
  <div class="modal" id="modal-ranking">
    <div class="tarjeta">
      <h2>🏆 Mejores tiempos</h2>
      <div id="tabla-ranking" class="tabla-scroll">Cargando…</div>
      <button type="button" class="btn btn-sec" id="btn-cerrar-ranking">Cerrar</button>
      <img class="pie-marca" src="assets/img/mongodb-hoja-verde.svg" alt="MongoDB">
    </div>
  </div>

</div>

<script src="assets/js/game.js?v=<?= $version ?>"></script>
</body>
</html>

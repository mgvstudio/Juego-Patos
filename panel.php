<?php
/**
 * Encuentra los patos - PANEL EN VIVO.
 * Para proyector, laptop o celular: muestra quien esta jugando, cuantos
 * patos lleva, la zona que esta mirando y las estadisticas del dia.
 * Se actualiza solo cada 2 segundos (api.php?accion=panel).
 */
$version = '1.0.0';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#001E2B">
<title>Panel en vivo | Encuentra los Patos</title>
<link rel="icon" type="image/svg+xml" href="assets/img/mongodb-hoja-verde.svg">
<link rel="stylesheet" href="assets/css/marca.css?v=<?= $version ?>">
<link rel="stylesheet" href="assets/css/panel.css?v=<?= $version ?>">
</head>
<body>

<header class="cabecera">
  <img class="logo" src="assets/img/mongodb-lockup-blanco.svg" alt="MongoDB">
  <h1><img src="pato.png" alt=""> Encuentra los Patos <span>en vivo</span></h1>
  <div class="conexion" id="conexion"><span class="punto"></span> <span id="txt-conexion">Conectando…</span></div>
</header>

<main class="rejilla">
  <section class="bloque hoy">
    <div class="indicador"><span class="cifra" id="hoy-partidas">0</span><span class="etiqueta">Partidas hoy</span></div>
    <div class="indicador"><span class="cifra" id="hoy-patos">0</span><span class="etiqueta">Patos encontrados</span></div>
    <div class="indicador"><span class="cifra" id="hoy-ganadas">0</span><span class="etiqueta">Partidas ganadas</span></div>
  </section>

  <section class="bloque vivos">
    <h2>Jugando ahora <span class="contador" id="num-vivos">0</span></h2>
    <div id="lista-vivos" class="tarjetas">
      <p class="vacio">Nadie está jugando en este momento.</p>
    </div>
  </section>

  <section class="bloque ranking">
    <h2>🏆 Mejores tiempos</h2>
    <ol id="lista-ranking" class="lista-ranking"><li class="vacio">Cargando…</li></ol>
  </section>

  <section class="bloque recientes">
    <h2>Partidas recientes</h2>
    <table>
      <thead><tr><th>Jugador</th><th>Modo</th><th>Resultado</th><th>Patos</th><th class="der">Duración</th></tr></thead>
      <tbody id="tabla-recientes"><tr><td colspan="5" class="vacio">Sin partidas todavía.</td></tr></tbody>
    </table>
  </section>
</main>

<script src="assets/js/panel.js?v=<?= $version ?>"></script>
</body>
</html>

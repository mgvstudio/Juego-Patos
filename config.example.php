<?php
/**
 * Configuracion de la base de datos (PLANTILLA).
 *
 * Copia este archivo como config.php y pon la contrasena real de produccion.
 * config.php no se sube a git (esta en .gitignore).
 *
 * Detecta solo el entorno:
 *   - En tu PC (XAMPP)      -> usa la conexion 'local'
 *   - En el hosting (Plesk) -> usa la conexion 'produccion'
 *
 * Asi puedes subir los archivos tal cual, sin editar nada.
 */

$host = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
$host = explode(':', $host)[0];

$esLocal = in_array($host, ['localhost', '127.0.0.1', '::1'], true)
        || strpos($host, '192.168.') === 0          // tableta en la red local
        || strpos($host, '.local') !== false
        || ($host === '' && stripos(PHP_OS, 'WIN') === 0);  // consola en Windows/XAMPP

$entornos = [

    // ---------- Tu maquina con XAMPP ----------
    'local' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'dbname'  => 'juego_patos',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
        'crear_bd' => true,   // en XAMPP root si puede crear la base
    ],

    // ---------- Hosting Plesk (proyectosdevelopmentfactor.com) ----------
    'produccion' => [
        'host'    => 'localhost',      // localhost DEL SERVIDOR de Plesk
        'port'    => 3306,
        'dbname'  => 'Mongodb_pato',
        'user'    => 'Mongodb_pato_db',
        'pass'    => 'CAMBIAR_CONTRASENA',
        'charset' => 'utf8mb4',
        'crear_bd' => false,  // la base ya la creo Plesk
    ],
];

return $esLocal ? $entornos['local'] : $entornos['produccion'];

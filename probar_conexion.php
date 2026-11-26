<?php
/**
 * Diagnostico rapido de la conexion.
 * Abrelo en el navegador y BORRALO despues de comprobar que todo va bien.
 */
header('Content-Type: text/plain; charset=utf-8');

$cfg = require __DIR__ . '/config.php';

echo "Host detectado : " . ($_SERVER['HTTP_HOST'] ?? 'consola') . "\n";
echo "Servidor BD    : {$cfg['host']}:{$cfg['port']}\n";
echo "Base de datos  : {$cfg['dbname']}\n";
echo "Usuario        : {$cfg['user']}\n";
echo str_repeat('-', 46) . "\n";

try {
    require __DIR__ . '/db.php';
    $pdo = db();

    $version = $pdo->query('SELECT VERSION()')->fetchColumn();
    $total   = $pdo->query('SELECT COUNT(*) FROM puntajes')->fetchColumn();

    echo "CONEXION CORRECTA\n";
    echo "Motor          : $version\n";
    echo "Tabla puntajes : existe, $total registro(s)\n";
    echo "\nTodo listo. Ya puedes borrar este archivo.\n";
} catch (Throwable $e) {
    echo "ERROR DE CONEXION\n";
    echo $e->getMessage() . "\n\n";
    echo "Revisa nombre de base, usuario y contrasena en config.php.\n";
}

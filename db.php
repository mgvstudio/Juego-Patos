<?php
/**
 * Conexion PDO a MySQL / MariaDB.
 *
 * En local (XAMPP) crea la base si no existe.
 * En el hosting la base ya la creo Plesk, asi que solo se conecta
 * y se asegura de que exista la tabla de puntajes.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $cfg = require __DIR__ . '/config.php';

    $opciones = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['dbname']};charset={$cfg['charset']}";

    try {
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $opciones);
    } catch (PDOException $e) {
        // 1049 = la base no existe. Solo intentamos crearla si esta permitido.
        // strpos en vez de str_contains para servidores con PHP 7.x
        $msg = $e->getMessage();
        $noExiste = strpos($msg, '1049') !== false
                 || strpos($msg, 'Unknown database') !== false;

        if (!$noExiste || empty($cfg['crear_bd'])) {
            throw $e;
        }

        $dsnServidor = "mysql:host={$cfg['host']};port={$cfg['port']};charset={$cfg['charset']}";
        $tmp = new PDO($dsnServidor, $cfg['user'], $cfg['pass'], $opciones);
        $tmp->exec(
            "CREATE DATABASE IF NOT EXISTS `{$cfg['dbname']}`
             CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        );

        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $opciones);
    }

    // La tabla si la puede crear el usuario de Plesk dentro de su propia base.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS puntajes (
            id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            nombre       VARCHAR(40)  NOT NULL,
            milisegundos INT UNSIGNED NOT NULL,
            patos        TINYINT UNSIGNED NOT NULL DEFAULT 5,
            creado_en    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_tiempo (milisegundos)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    return $pdo;
}

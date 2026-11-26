<?php
/**
 * API del juego.
 *   GET  api.php?accion=ranking&limite=10   -> mejores tiempos
 *   POST api.php?accion=guardar  {nombre, milisegundos, patos}
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/db.php';

function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $accion = $_GET['accion'] ?? 'ranking';

    if ($accion === 'ranking') {
        $limite = (int)($_GET['limite'] ?? 10);
        $limite = max(1, min(50, $limite));

        $sql = "SELECT nombre, milisegundos, creado_en
                FROM puntajes
                ORDER BY milisegundos ASC, creado_en ASC
                LIMIT $limite";
        $filas = db()->query($sql)->fetchAll();

        responder(['ok' => true, 'ranking' => $filas]);
    }

    if ($accion === 'guardar') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            responder(['ok' => false, 'error' => 'Metodo no permitido'], 405);
        }

        $cuerpo = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($cuerpo)) {
            $cuerpo = $_POST;
        }

        $nombre = trim((string)($cuerpo['nombre'] ?? ''));
        $nombre = preg_replace('/\s+/u', ' ', $nombre);
        if ($nombre === '') {
            $nombre = 'Anonimo';
        }
        if (function_exists('mb_substr')) {
            $nombre = mb_substr($nombre, 0, 40);
        } else {
            $nombre = substr($nombre, 0, 40);
        }

        $ms = (int)($cuerpo['milisegundos'] ?? 0);
        if ($ms <= 0 || $ms > 36000000) { // maximo 10 horas
            responder(['ok' => false, 'error' => 'Tiempo invalido'], 422);
        }

        $patos = (int)($cuerpo['patos'] ?? 5);
        $patos = max(1, min(255, $patos));

        $stmt = db()->prepare(
            'INSERT INTO puntajes (nombre, milisegundos, patos) VALUES (?, ?, ?)'
        );
        $stmt->execute([$nombre, $ms, $patos]);

        $id = (int)db()->lastInsertId();

        // Posicion dentro del ranking global.
        $pos = db()->prepare(
            'SELECT COUNT(*) + 1 FROM puntajes WHERE milisegundos < ?'
        );
        $pos->execute([$ms]);

        responder([
            'ok'       => true,
            'id'       => $id,
            'posicion' => (int)$pos->fetchColumn(),
        ]);
    }

    responder(['ok' => false, 'error' => 'Accion desconocida'], 400);
} catch (Throwable $e) {
    responder(['ok' => false, 'error' => 'Error del servidor: ' . $e->getMessage()], 500);
}

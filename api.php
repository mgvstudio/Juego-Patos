<?php
/**
 * API del juego (la usan la tableta, la realidad mixta y el panel en vivo).
 *   GET  api.php?accion=ranking&limite=10   -> mejores tiempos (ranking compartido)
 *   POST api.php?accion=guardar  {nombre, milisegundos, patos}
 *   POST api.php?accion=latido   {sid, nombre, modo, estado, encontrados, total, vista}
 *   GET  api.php?accion=panel                -> vivos, recientes y hoy
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/db.php';

const MODOS   = ['pantalla', 'tableta', 'lentes'];
const ESTADOS = ['jugando', 'ganado', 'perdido', 'abandonado'];

function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function exigirPost(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        responder(['ok' => false, 'error' => 'Metodo no permitido'], 405);
    }
}

function leerCuerpo(): array
{
    $cuerpo = json_decode(file_get_contents('php://input') ?: '[]', true);
    return is_array($cuerpo) ? $cuerpo : $_POST;
}

function limpiarNombre($valor): string
{
    $nombre = trim((string)$valor);
    $nombre = preg_replace('/\s+/u', ' ', $nombre);
    if ($nombre === '') {
        $nombre = 'Anonimo';
    }
    return function_exists('mb_substr') ? mb_substr($nombre, 0, 40) : substr($nombre, 0, 40);
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
        responder(['ok' => true, 'ranking' => db()->query($sql)->fetchAll()]);
    }

    if ($accion === 'guardar') {
        exigirPost();
        $cuerpo = leerCuerpo();
        $nombre = limpiarNombre($cuerpo['nombre'] ?? '');

        $ms = (int)($cuerpo['milisegundos'] ?? 0);
        if ($ms <= 0 || $ms > 36000000) { // maximo 10 horas
            responder(['ok' => false, 'error' => 'Tiempo invalido'], 422);
        }

        $patos = max(1, min(255, (int)($cuerpo['patos'] ?? 5)));

        $stmt = db()->prepare('INSERT INTO puntajes (nombre, milisegundos, patos) VALUES (?, ?, ?)');
        $stmt->execute([$nombre, $ms, $patos]);
        $id = (int)db()->lastInsertId();

        // Posicion dentro del ranking global.
        $pos = db()->prepare('SELECT COUNT(*) + 1 FROM puntajes WHERE milisegundos < ?');
        $pos->execute([$ms]);

        responder(['ok' => true, 'id' => $id, 'posicion' => (int)$pos->fetchColumn()]);
    }

    if ($accion === 'latido') {
        exigirPost();
        $c = leerCuerpo();

        $sid = (string)($c['sid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{8,40}$/', $sid)) {
            responder(['ok' => false, 'error' => 'sid invalido'], 422);
        }
        $modo   = (string)($c['modo'] ?? '');
        $estado = (string)($c['estado'] ?? 'jugando');
        if (!in_array($modo, MODOS, true) || !in_array($estado, ESTADOS, true)) {
            responder(['ok' => false, 'error' => 'modo o estado invalido'], 422);
        }
        $nombre      = limpiarNombre($c['nombre'] ?? '');
        $total       = max(1, min(255, (int)($c['total'] ?? 5)));
        $encontrados = max(0, min($total, (int)($c['encontrados'] ?? 0)));
        $vista       = (string)($c['vista'] ?? '');
        $vista       = preg_match('/^[0-9.,]{0,40}$/', $vista) ? $vista : '';

        $pdo = db();

        // Una sesion cerrada (ganado/perdido/abandonado) ya no se modifica
        $previo = $pdo->prepare('SELECT estado FROM sesiones WHERE sid = ?');
        $previo->execute([$sid]);
        $estadoPrevio = $previo->fetchColumn();
        if ($estadoPrevio !== false && $estadoPrevio !== 'jugando') {
            responder(['ok' => true, 'ignorado' => true]);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO sesiones (sid, nombre, modo, estado, encontrados, total, vista, inicio, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                nombre = VALUES(nombre), modo = VALUES(modo), estado = VALUES(estado),
                encontrados = VALUES(encontrados), total = VALUES(total),
                vista = VALUES(vista), actualizado_en = NOW()'
        );
        $stmt->execute([$sid, $nombre, $modo, $estado, $encontrados, $total, $vista]);

        // Limpieza ocasional de sesiones viejas
        if (mt_rand(1, 50) === 1) {
            $pdo->exec('DELETE FROM sesiones WHERE actualizado_en < NOW() - INTERVAL 3 DAY');
        }

        responder(['ok' => true]);
    }

    if ($accion === 'panel') {
        $pdo = db();

        $vivos = $pdo->query(
            "SELECT sid, nombre, modo, estado, encontrados, total, vista,
                    TIMESTAMPDIFF(SECOND, inicio, NOW()) AS segundos
             FROM sesiones
             WHERE estado = 'jugando' AND actualizado_en >= NOW() - INTERVAL 20 SECOND
             ORDER BY inicio ASC"
        )->fetchAll();

        // Las que dejaron de latir sin cerrarse cuentan como abandonadas
        $recientes = $pdo->query(
            "SELECT sid, nombre, modo,
                    IF(estado = 'jugando', 'abandonado', estado) AS estado,
                    encontrados, total,
                    TIMESTAMPDIFF(SECOND, inicio, actualizado_en) AS segundos,
                    actualizado_en
             FROM sesiones
             WHERE estado <> 'jugando' OR actualizado_en < NOW() - INTERVAL 20 SECOND
             ORDER BY actualizado_en DESC
             LIMIT 15"
        )->fetchAll();

        $hoy = $pdo->query(
            "SELECT COUNT(*) AS partidas,
                    COALESCE(SUM(encontrados), 0) AS patos,
                    COALESCE(SUM(estado = 'ganado'), 0) AS ganadas
             FROM sesiones
             WHERE inicio >= CURDATE()"
        )->fetch();

        responder([
            'ok'        => true,
            'vivos'     => $vivos,
            'recientes' => $recientes,
            'hoy'       => array_map('intval', $hoy ?: []),
        ]);
    }

    responder(['ok' => false, 'error' => 'Accion desconocida'], 400);
} catch (Throwable $e) {
    responder(['ok' => false, 'error' => 'Error del servidor: ' . $e->getMessage()], 500);
}

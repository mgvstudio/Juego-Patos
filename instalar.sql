-- ============================================================
--  Encuentra los Patos - tabla de mejores tiempos
--  Ejecutar en phpMyAdmin de Plesk, dentro de la base Mongodb_pato
-- ============================================================

CREATE TABLE IF NOT EXISTS puntajes (
    id           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    nombre       VARCHAR(40)      NOT NULL,
    milisegundos INT UNSIGNED     NOT NULL,
    patos        TINYINT UNSIGNED NOT NULL DEFAULT 5,
    creado_en    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tiempo (milisegundos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Partidas en curso y recientes (panel en vivo: panel.php)
CREATE TABLE IF NOT EXISTS sesiones (
    sid            VARCHAR(40)      NOT NULL,
    nombre         VARCHAR(40)      NOT NULL,
    modo           VARCHAR(12)      NOT NULL,             -- pantalla | tableta | lentes
    estado         VARCHAR(12)      NOT NULL DEFAULT 'jugando', -- jugando | ganado | perdido | abandonado
    encontrados    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    total          TINYINT UNSIGNED NOT NULL DEFAULT 5,
    vista          VARCHAR(40)      NOT NULL DEFAULT '',  -- x,y,ancho,alto en fraccion 0..1
    inicio         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sid),
    KEY idx_estado (estado, actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

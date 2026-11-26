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

-- Ranking de la version de realidad mixta (Meta Quest 3)
CREATE TABLE IF NOT EXISTS puntajes_mr LIKE puntajes;

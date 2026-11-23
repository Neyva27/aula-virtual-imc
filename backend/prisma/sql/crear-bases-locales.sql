-- =====================================================================================
-- Aula Virtual IMC: bases de datos y usuario LOCALES para desarrollo (fase B1.1)
-- =====================================================================================
-- Ejecutar UNA vez en MySQL Workbench con el usuario root (decisión B1-e).
-- root solo se usa para este script: la API se conecta siempre con el usuario `aula_imc`.
--
-- Antes de ejecutar: reemplazar CAMBIAR_ESTA_CLAVE por la misma contraseña que figura en
-- backend/.env (DATABASE_URL). Si existe backend/prisma/sql/crear-bases-locales.local.sql,
-- ese archivo ya tiene la contraseña generada y puede ejecutarse directamente.
--
-- El script NO borra nada: solo crea lo que no existe (IF NOT EXISTS).
-- =====================================================================================

CREATE DATABASE IF NOT EXISTS `aula_imc_dev`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Base exclusiva para las pruebas de integración: las pruebas vacían sus tablas.
CREATE DATABASE IF NOT EXISTS `aula_imc_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Base temporal que usa `prisma migrate dev` para comparar migraciones.
CREATE DATABASE IF NOT EXISTS `aula_imc_shadow`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'aula_imc'@'localhost' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';

-- Permisos SOLO sobre las tres bases del proyecto (sin permisos globales).
GRANT ALL PRIVILEGES ON `aula_imc_dev`.*    TO 'aula_imc'@'localhost';
GRANT ALL PRIVILEGES ON `aula_imc_test`.*   TO 'aula_imc'@'localhost';
GRANT ALL PRIVILEGES ON `aula_imc_shadow`.* TO 'aula_imc'@'localhost';

FLUSH PRIVILEGES;

-- Comprobación: debe listar las tres bases y los permisos del usuario.
SHOW DATABASES LIKE 'aula_imc%';
SHOW GRANTS FOR 'aula_imc'@'localhost';

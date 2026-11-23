-- B2.3c (13/11/2026): registro de estudiantes por el Instructor y activación de la cuenta por enlace de correo.
--
-- Generada SIN conexión con `prisma migrate diff --from-schema <esquema B2.2a> --to-schema prisma/schema.prisma`.
-- El SQL es exactamente el que generó Prisma; solo se agregaron estos comentarios.
--
-- Depende de las migraciones de B2.1 y B2.2a (aún sin aplicar): se aplica después de ellas, en el orden de carpetas.
--
-- Solo agrega:
-- - `users.activation_pending` (BOOLEAN NOT NULL DEFAULT false): todas las cuentas existentes quedan en false, es decir,
--   siguen funcionando igual. No hay UPDATE ni se modifican filas.
-- - la tabla vacía `account_activation_tokens` (solo el hash SHA-256 de cada token, vencimiento y un solo uso).

-- AlterTable
ALTER TABLE `users` ADD COLUMN `activation_pending` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `account_activation_tokens` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `issued_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `account_activation_tokens_token_hash_key`(`token_hash`),
    INDEX `account_activation_tokens_user_id_idx`(`user_id`),
    INDEX `account_activation_tokens_issued_by_idx`(`issued_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `account_activation_tokens` ADD CONSTRAINT `account_activation_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_activation_tokens` ADD CONSTRAINT `account_activation_tokens_issued_by_fkey` FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

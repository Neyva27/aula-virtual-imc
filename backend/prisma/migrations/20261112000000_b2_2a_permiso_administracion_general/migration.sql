-- B2.2a (12/11/2026): permiso administrativo especial de la administración general de IMC.
--
-- Generada SIN conexión con `prisma migrate diff --from-schema <esquema B2.1> --to-schema prisma/schema.prisma`.
-- El SQL es exactamente el que generó Prisma; solo se agregaron estos comentarios.
--
-- Depende de la migración de B2.1 (20261111000000_b2_1_empresas_instructores_matriculas), que crea `instructors`:
-- se aplica después de ella, en el orden de las carpetas.
--
-- Solo crea una tabla vacía. No modifica `users.role` (el enum de roles sigue siendo INSTRUCTOR | STUDENT), no altera
-- filas existentes y no otorga el permiso a nadie: se otorga después con `npm run admin:grant-general`.

-- CreateTable
CREATE TABLE `instructor_permissions` (
    `instructor_id` VARCHAR(36) NOT NULL,
    `permission` ENUM('IMC_GENERAL_ADMIN') NOT NULL,
    `granted_by` VARCHAR(36) NULL,
    `granted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `instructor_permissions_permission_idx`(`permission`),
    INDEX `instructor_permissions_granted_by_idx`(`granted_by`),
    PRIMARY KEY (`instructor_id`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `instructor_permissions` ADD CONSTRAINT `instructor_permissions_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_permissions` ADD CONSTRAINT `instructor_permissions_granted_by_fkey` FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

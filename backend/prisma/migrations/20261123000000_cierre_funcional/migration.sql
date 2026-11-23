-- Cierre funcional (23/11/2026). Migracion ADITIVA: no borra tablas, columnas ni filas y no asigna valores a los
-- registros existentes.
-- * students.whatsapp: opcional (NULL = no registrado).
-- * courses.level: tres niveles oficiales (NULL = pendiente de clasificacion).
-- * certificates: copias opcionales de nombres, apellidos, empresa y nivel; import_id. Los certificados historicos quedan
--   con NULL en esas columnas y conservan todos sus datos.
-- * certificates.attempt_id, approval_date, score y scale_max pasan a admitir NULL: un certificado importado no tiene
--   intento, nota ni fecha de aprobacion y no se inventan. Los valores existentes no cambian.
-- * certificate_imports: registro de las importaciones masivas.
-- Se aplica con: npm run db:migrate (prisma migrate deploy), con respaldo previo.

-- AlterTable
ALTER TABLE `students` ADD COLUMN `whatsapp` VARCHAR(16) NULL;

-- AlterTable
ALTER TABLE `courses` ADD COLUMN `level` ENUM('PERSONA_AUTORIZADA', 'PERSONA_COMPETENTE', 'PERSONA_CERTIFICADA') NULL;

-- AlterTable
ALTER TABLE `certificates` ADD COLUMN `course_level` ENUM('PERSONA_AUTORIZADA', 'PERSONA_COMPETENTE', 'PERSONA_CERTIFICADA') NULL,
    ADD COLUMN `import_id` VARCHAR(36) NULL,
    ADD COLUMN `participant_company` VARCHAR(500) NULL,
    ADD COLUMN `participant_first_names` VARCHAR(100) NULL,
    ADD COLUMN `participant_last_names` VARCHAR(100) NULL,
    MODIFY `attempt_id` VARCHAR(36) NULL,
    MODIFY `approval_date` DATETIME(3) NULL,
    MODIFY `score` INTEGER NULL,
    MODIFY `scale_max` INTEGER NULL;

-- CreateTable
CREATE TABLE `certificate_imports` (
    `id` VARCHAR(36) NOT NULL,
    `actor_id` VARCHAR(36) NULL,
    `actor_name` VARCHAR(201) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `format` ENUM('XLSX', 'CSV') NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `total_rows` INTEGER NOT NULL,
    `imported_count` INTEGER NOT NULL,
    `rejected_count` INTEGER NOT NULL,
    `duplicate_count` INTEGER NOT NULL,
    `errors` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `certificate_imports_actor_id_created_at_idx`(`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `certificates_import_id_idx` ON `certificates`(`import_id`);

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `certificate_imports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_imports` ADD CONSTRAINT `certificate_imports_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


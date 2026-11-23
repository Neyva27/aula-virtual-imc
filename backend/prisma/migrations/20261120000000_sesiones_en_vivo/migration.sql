-- Clases en vivo con Google Meet (20/11/2026). Migración ADITIVA: crea la tabla course_live_sessions (módulo opcional y
-- enlace de grabación opcional) y sus claves foráneas hacia courses, course_modules y users. No modifica ni borra
-- tablas ni datos existentes. Requiere 20261118000000_modulo_academico.
-- Se aplica con: npm run db:migrate (prisma migrate deploy), con respaldo previo y autorización.

-- CreateTable
CREATE TABLE `course_live_sessions` (
    `id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `module_id` VARCHAR(36) NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` VARCHAR(2000) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `meet_url` VARCHAR(500) NOT NULL,
    `recording_url` VARCHAR(500) NULL,
    `status` ENUM('PROGRAMADA', 'CANCELADA') NOT NULL DEFAULT 'PROGRAMADA',
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_live_sessions_course_id_starts_at_idx`(`course_id`, `starts_at`),
    INDEX `course_live_sessions_module_id_idx`(`module_id`),
    INDEX `course_live_sessions_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_live_sessions` ADD CONSTRAINT `course_live_sessions_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_live_sessions` ADD CONSTRAINT `course_live_sessions_module_id_fkey` FOREIGN KEY (`module_id`) REFERENCES `course_modules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_live_sessions` ADD CONSTRAINT `course_live_sessions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

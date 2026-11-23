-- Recuperaciones de examen (21/11/2026). Migración ADITIVA: crea la tabla exam_recoveries y sus claves foráneas hacia
-- students, courses, exams (examen regular y examen que se rinde), users y exam_attempts. No modifica ni borra tablas
-- ni datos existentes (los intentos regulares no se tocan). Requiere 20261118000000_modulo_academico.
-- Se aplica con: npm run db:migrate (prisma migrate deploy), con respaldo previo y autorización.

-- CreateTable
CREATE TABLE `exam_recoveries` (
    `id` VARCHAR(36) NOT NULL,
    `student_id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `regular_exam_id` VARCHAR(36) NOT NULL,
    `exam_id` VARCHAR(36) NOT NULL,
    `reason` ENUM('DESAPROBADO', 'AUSENTE') NOT NULL DEFAULT 'DESAPROBADO',
    `mode` ENUM('ORIGINAL', 'INDEPENDIENTE') NOT NULL,
    `opens_at` DATETIME(3) NOT NULL,
    `closes_at` DATETIME(3) NOT NULL,
    `authorized_by` VARCHAR(36) NULL,
    `authorized_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `answers` JSON NULL,
    `answers_updated_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `attempt_id` VARCHAR(36) NULL,
    `no_show_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_recoveries_attempt_id_key`(`attempt_id`),
    INDEX `exam_recoveries_student_id_course_id_idx`(`student_id`, `course_id`),
    INDEX `exam_recoveries_course_id_idx`(`course_id`),
    INDEX `exam_recoveries_regular_exam_id_idx`(`regular_exam_id`),
    INDEX `exam_recoveries_exam_id_idx`(`exam_id`),
    INDEX `exam_recoveries_authorized_by_idx`(`authorized_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_regular_exam_id_fkey` FOREIGN KEY (`regular_exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_authorized_by_fkey` FOREIGN KEY (`authorized_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recoveries` ADD CONSTRAINT `exam_recoveries_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `exam_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

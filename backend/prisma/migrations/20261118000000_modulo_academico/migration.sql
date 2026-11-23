-- Módulo académico (18/11/2026): cursos, módulos, videos, progreso, evaluaciones, intentos y certificados.
--
-- Generada SIN conexión con `prisma migrate diff --from-schema <esquema 20261117> --to-schema prisma/schema.prisma --script`.
-- El SQL es exactamente el que generó Prisma; solo se agregaron estos comentarios.
--
-- Solo AGREGA (no hay DROP, DELETE, UPDATE ni cambios de columnas existentes):
-- - courses: description ("" por defecto), status (BORRADOR), training_hours (NULL), cover_image (NULL),
--   active (true) y created_by (NULL, FK a users ON DELETE SET NULL). Los cursos existentes quedan en borrador,
--   activos y sin Instructor dueño (no visibles para ningún Instructor).
-- - enrollments: status (PENDIENTE) y started_at (NULL). Las matrículas existentes quedan pendientes.
-- - Tablas nuevas y vacías: course_modules, course_videos, video_progress, exams, exam_questions, exam_starts,
--   exam_attempts y certificates, con sus índices y claves foráneas.
-- Los videos NO se guardan en MySQL: solo su referencia (YouTube, Google Drive o URL https).

-- AlterTable
ALTER TABLE `courses` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `cover_image` VARCHAR(500) NULL,
    ADD COLUMN `created_by` VARCHAR(36) NULL,
    ADD COLUMN `description` VARCHAR(2000) NOT NULL DEFAULT '',
    ADD COLUMN `status` ENUM('BORRADOR', 'PUBLICADO') NOT NULL DEFAULT 'BORRADOR',
    ADD COLUMN `training_hours` INTEGER NULL;

-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `started_at` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('PENDIENTE', 'EN_PROGRESO', 'LISTO_EXAMEN', 'EN_REVISION', 'APROBADO', 'DESAPROBADO') NOT NULL DEFAULT 'PENDIENTE';

-- CreateTable
CREATE TABLE `course_modules` (
    `id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_modules_course_id_idx`(`course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_videos` (
    `id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `module_id` VARCHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `duration_sec` INTEGER NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `source_kind` ENUM('YOUTUBE', 'DRIVE', 'URL', 'PLACEHOLDER') NOT NULL DEFAULT 'PLACEHOLDER',
    `source_ref` VARCHAR(500) NULL,
    `source_credit` VARCHAR(300) NULL,
    `material_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_videos_course_id_idx`(`course_id`),
    INDEX `course_videos_module_id_idx`(`module_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_progress` (
    `enrollment_id` VARCHAR(36) NOT NULL,
    `video_id` VARCHAR(36) NOT NULL,
    `completed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `video_progress_video_id_idx`(`video_id`),
    PRIMARY KEY (`enrollment_id`, `video_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exams` (
    `id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `kind` ENUM('REGULAR', 'RECUPERACION') NOT NULL DEFAULT 'REGULAR',
    `parent_exam_id` VARCHAR(36) NULL,
    `time_minutes` INTEGER NOT NULL,
    `pass_score` INTEGER NOT NULL,
    `scale_max` INTEGER NOT NULL,
    `available_from` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exams_course_id_idx`(`course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_questions` (
    `id` VARCHAR(36) NOT NULL,
    `exam_id` VARCHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `type` ENUM('SINGLE', 'MULTIPLE', 'TRUEFALSE', 'OPEN') NOT NULL,
    `text` VARCHAR(1000) NOT NULL,
    `options` JSON NOT NULL,
    `correct` JSON NOT NULL,
    `points` DOUBLE NOT NULL,
    `select_count` INTEGER NULL,
    `rubric` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exam_questions_exam_id_idx`(`exam_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_starts` (
    `id` VARCHAR(36) NOT NULL,
    `student_id` VARCHAR(36) NOT NULL,
    `exam_id` VARCHAR(36) NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `answers` JSON NULL,
    `answers_updated_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `attempt_id` VARCHAR(36) NULL,

    INDEX `exam_starts_exam_id_idx`(`exam_id`),
    UNIQUE INDEX `exam_starts_student_id_exam_id_key`(`student_id`, `exam_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_attempts` (
    `id` VARCHAR(36) NOT NULL,
    `student_id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `exam_id` VARCHAR(36) NOT NULL,
    `kind` ENUM('REGULAR', 'RECUPERACION') NOT NULL DEFAULT 'REGULAR',
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `duration_sec` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `scale_max` INTEGER NOT NULL,
    `correct_count` INTEGER NOT NULL,
    `total_questions` INTEGER NOT NULL,
    `passed` BOOLEAN NOT NULL,
    `answers` JSON NOT NULL,
    `grading_rule` ENUM('PROPORCIONAL', 'TODO_O_NADA') NOT NULL DEFAULT 'PROPORCIONAL',
    `question_scores` JSON NOT NULL,
    `max_points` DOUBLE NOT NULL,
    `auto_submitted` BOOLEAN NOT NULL DEFAULT false,
    `review_status` ENUM('EN_REVISION', 'CALIFICADO') NULL,
    `manual_scores` JSON NULL,
    `graded_at` DATETIME(3) NULL,

    INDEX `exam_attempts_course_id_idx`(`course_id`),
    INDEX `exam_attempts_exam_id_idx`(`exam_id`),
    UNIQUE INDEX `exam_attempts_student_id_exam_id_kind_key`(`student_id`, `exam_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `student_id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `attempt_id` VARCHAR(36) NOT NULL,
    `participant_name` VARCHAR(201) NOT NULL,
    `participant_dni` CHAR(8) NULL,
    `course_name` VARCHAR(150) NOT NULL,
    `approval_date` DATETIME(3) NOT NULL,
    `issue_date` DATETIME(3) NOT NULL,
    `score` INTEGER NOT NULL,
    `scale_max` INTEGER NOT NULL,
    `training_hours` INTEGER NULL,
    `entity_name` VARCHAR(150) NOT NULL,
    `status` ENUM('VIGENTE', 'REVOCADO') NOT NULL DEFAULT 'VIGENTE',

    UNIQUE INDEX `certificates_code_key`(`code`),
    UNIQUE INDEX `certificates_attempt_id_key`(`attempt_id`),
    INDEX `certificates_student_id_idx`(`student_id`),
    INDEX `certificates_course_id_idx`(`course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `courses_created_by_idx` ON `courses`(`created_by`);

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_videos` ADD CONSTRAINT `course_videos_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_videos` ADD CONSTRAINT `course_videos_module_id_fkey` FOREIGN KEY (`module_id`) REFERENCES `course_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_progress` ADD CONSTRAINT `video_progress_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_progress` ADD CONSTRAINT `video_progress_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `course_videos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_questions` ADD CONSTRAINT `exam_questions_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_starts` ADD CONSTRAINT `exam_starts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_starts` ADD CONSTRAINT `exam_starts_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attempts` ADD CONSTRAINT `exam_attempts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attempts` ADD CONSTRAINT `exam_attempts_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attempts` ADD CONSTRAINT `exam_attempts_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `exam_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

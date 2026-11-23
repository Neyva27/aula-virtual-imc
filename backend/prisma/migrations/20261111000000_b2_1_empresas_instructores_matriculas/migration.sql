-- B2.1 (11/11/2026): estudiantes en varias empresas (o en ninguna), perfil de Instructor con sus empresas,
-- cursos (estructura mínima) y matrículas.
--
-- Generada SIN conexión con `prisma migrate diff --from-schema <esquema B1.1> --to-schema prisma/schema.prisma`
-- y REORDENADA a mano para no perder datos:
--   Prisma emitía primero `DROP COLUMN students.company_id`, lo que habría borrado las asociaciones existentes.
--   Aquí se crean primero las tablas nuevas, después se COPIAN los datos y solo al final se retira la columna.
-- Las sentencias DDL son exactamente las que generó Prisma; lo único agregado son los dos INSERT … SELECT (pasos 2 y 3).
-- Si la migración se interrumpe antes del paso 4, `students.company_id` sigue intacta (MySQL no revierte DDL).
--
-- No se reasigna a nadie, no se crean empresas ni RUC y no se borra ningún registro.

-- =====================================================================================================
-- 1. Tablas nuevas y sus claves foráneas
-- =====================================================================================================

-- CreateTable
CREATE TABLE `instructors` (
    `user_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_companies` (
    `student_id` VARCHAR(36) NOT NULL,
    `company_id` VARCHAR(36) NOT NULL,
    `assigned_by` VARCHAR(36) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_companies_company_id_idx`(`company_id`),
    INDEX `student_companies_assigned_by_idx`(`assigned_by`),
    PRIMARY KEY (`student_id`, `company_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructor_companies` (
    `instructor_id` VARCHAR(36) NOT NULL,
    `company_id` VARCHAR(36) NOT NULL,
    `assigned_by` VARCHAR(36) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `instructor_companies_company_id_idx`(`company_id`),
    INDEX `instructor_companies_assigned_by_idx`(`assigned_by`),
    PRIMARY KEY (`instructor_id`, `company_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courses` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(36) NOT NULL,
    `student_id` VARCHAR(36) NOT NULL,
    `course_id` VARCHAR(36) NOT NULL,
    `assigned_by` VARCHAR(36) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollments_course_id_idx`(`course_id`),
    INDEX `enrollments_assigned_by_idx`(`assigned_by`),
    UNIQUE INDEX `enrollments_student_id_course_id_key`(`student_id`, `course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `instructors` ADD CONSTRAINT `instructors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_companies` ADD CONSTRAINT `student_companies_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_companies` ADD CONSTRAINT `student_companies_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_companies` ADD CONSTRAINT `student_companies_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_companies` ADD CONSTRAINT `instructor_companies_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_companies` ADD CONSTRAINT `instructor_companies_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_companies` ADD CONSTRAINT `instructor_companies_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================================================
-- 2. Datos: perfil de Instructor para cada usuario que ya tiene el rol INSTRUCTOR (por ejemplo, a1).
--    No se le asigna ninguna empresa: las empresas de cada Instructor se asignan después, de forma explícita.
-- =====================================================================================================

INSERT INTO `instructors` (`user_id`, `created_at`, `updated_at`)
SELECT `id`, `created_at`, CURRENT_TIMESTAMP(3)
FROM `users`
WHERE `role` = 'INSTRUCTOR';

-- =====================================================================================================
-- 3. Datos: cada asociación estudiante–empresa existente pasa a `student_companies`, sin cambios.
--    `company_id` es NOT NULL en B1.1, así que se copian TODAS las filas de `students` (una por estudiante).
--    `assigned_by` queda NULL (B1.1 no registraba quién asignó) y `assigned_at` toma la fecha de creación del perfil.
-- =====================================================================================================

INSERT INTO `student_companies` (`student_id`, `company_id`, `assigned_by`, `assigned_at`)
SELECT `user_id`, `company_id`, NULL, `created_at`
FROM `students`;

-- =====================================================================================================
-- 4. Solo ahora se retira la columna anterior (las asociaciones ya están en `student_companies`).
-- =====================================================================================================

-- DropForeignKey
ALTER TABLE `students` DROP FOREIGN KEY `students_company_id_fkey`;

-- DropIndex
DROP INDEX `students_company_id_idx` ON `students`;

-- AlterTable
ALTER TABLE `students` DROP COLUMN `company_id`;

-- Comprobación sugerida tras aplicarla (solo lectura; debe devolver 0 filas):
--   SELECT s.user_id FROM students s LEFT JOIN student_companies sc ON sc.student_id = s.user_id WHERE sc.student_id IS NULL;
-- (Antes de B2.1 todo estudiante tenía empresa; justo después de migrar, ninguno debe quedar sin su asociación.)

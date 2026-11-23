-- Integración (17/11/2026): cada Instructor ve solo a los estudiantes que registró.
--
-- Generada SIN conexión con `prisma migrate diff --from-schema <esquema B2.3c> --to-schema prisma/schema.prisma --script`.
-- El SQL es exactamente el que generó Prisma; solo se agregaron estos comentarios.
--
-- Depende de las migraciones anteriores (orden de carpetas). Solo AGREGA:
-- - la columna `students.registered_by` (NULL permitido): Instructor que registró al estudiante;
-- - su índice y su clave foránea a `users` (ON DELETE SET NULL).
--
-- No modifica ni borra filas. Los estudiantes existentes quedan con `registered_by` = NULL (decisión del 17/11/2026:
-- no se asignan automáticamente a ningún Instructor), por lo que no son visibles para ningún Instructor.

-- AlterTable
ALTER TABLE `students` ADD COLUMN `registered_by` VARCHAR(36) NULL;

-- CreateIndex
CREATE INDEX `students_registered_by_idx` ON `students`(`registered_by`);

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_registered_by_fkey` FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

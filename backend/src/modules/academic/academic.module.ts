import { Module } from '@nestjs/common';
import { AuthzModule } from '../../authz/authz.module.js';
import { AcademicData } from './academic.data.js';
import {
  InstructorAcademicController,
  LearningController,
  PublicCertificatesController,
  PublicCourseCoversController,
} from './academic.controllers.js';
import { CourseCoverStorage } from './course-cover.storage.js';
import { InstructorAcademicService } from './instructor-academic.service.js';
import { LearningService } from './learning.service.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { RecoveriesService } from './recoveries.service.js';

/**
 * Módulo académico (18/11/2026): cursos, módulos, videos, matrículas, avance, evaluaciones, intentos, calificaciones,
 * certificados y verificación pública. Migración: 20261118000000_modulo_academico.
 */
@Module({
  imports: [AuthzModule],
  controllers: [InstructorAcademicController, LearningController, PublicCertificatesController, PublicCourseCoversController],
  providers: [AcademicData, InstructorAcademicService, LearningService, LiveSessionsService, RecoveriesService, CourseCoverStorage],
})
export class AcademicModule {}

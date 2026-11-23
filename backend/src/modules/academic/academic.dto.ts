import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { COURSE_LEVEL_INVALID, COURSE_LEVELS, LEVEL_PENDING, type CourseLevelValue } from './course-levels.js';

/**
 * Módulo académico (18/11/2026). Los DTO comprueban tipos y longitudes; las reglas de negocio (RN-03, RN-07, RN-12,
 * RN-15, Etapa 2A/2B) las aplica el servicio con los mensajes ya validados en la demostración.
 * Los nombres de los campos son los de los modelos del frontend (course.model.ts, exam.model.ts).
 */

export class CourseInputDto {
  @ApiProperty() @MaxLength(150, { message: 'El nombre del curso admite como máximo 150 caracteres.' }) @IsString() name: string;
  @ApiProperty() @MaxLength(2000, { message: 'La descripción admite como máximo 2000 caracteres.' }) @IsString() description: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt({ message: 'Las horas de formación deben ser un número entero.' }) trainingHours: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @MaxLength(500, { message: 'La dirección de la portada no puede superar los 500 caracteres.' }) @IsString() coverImage: string | null;
  @ApiPropertyOptional({ enum: COURSE_LEVELS, nullable: true, description: 'Nivel oficial. null = pendiente de clasificación; si se omite al editar, se conserva.' })
  @IsOptional()
  @IsIn(COURSE_LEVELS, { message: COURSE_LEVEL_INVALID })
  level?: CourseLevelValue | null;
}

export class CourseQueryDto {
  @ApiPropertyOptional({ enum: [...COURSE_LEVELS, LEVEL_PENDING], description: 'Filtra por nivel; «pendiente» = sin clasificar.' })
  @IsOptional()
  @IsIn([...COURSE_LEVELS, LEVEL_PENDING], { message: COURSE_LEVEL_INVALID })
  level?: CourseLevelValue | typeof LEVEL_PENDING;
}

export class CoursePatchDto extends CourseInputDto {
  @ApiProperty({ enum: ['borrador', 'publicado'] }) @IsIn(['borrador', 'publicado'], { message: 'Estado de curso no válido.' }) status: 'borrador' | 'publicado';
}

export class CourseActiveDto {
  @ApiProperty() @IsBoolean() active: boolean;
}

export class ModuleInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class MoveDto {
  @ApiProperty({ enum: [-1, 1] }) @IsIn([-1, 1], { message: 'Movimiento no válido.' }) delta: -1 | 1;
}

export class VideoInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() moduleId?: string;
  @ApiProperty() @MaxLength(200, { message: 'El título admite como máximo 200 caracteres.' }) @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(1000) @IsString() description?: string;
  @ApiProperty({ description: 'Duración real en segundos.' }) @IsNumber() durationSec: number;
  @ApiProperty() @IsBoolean() published: boolean;
  @ApiPropertyOptional({ description: 'YouTube, Google Drive u otro enlace https (p. ej. MP4 en un almacenamiento).' })
  @IsOptional()
  @MaxLength(500)
  @IsString()
  url?: string;
  @ApiPropertyOptional({ enum: ['youtube', 'drive', 'url'] }) @IsOptional() @IsIn(['youtube', 'drive', 'url']) sourceKind?: 'youtube' | 'drive' | 'url';
  @ApiPropertyOptional({ description: 'Material complementario (enlace https).' }) @IsOptional() @MaxLength(500) @IsString() materialUrl?: string;
}

/** Sesión en vivo (20/11/2026). Los límites y formatos se validan en el servicio, con mensajes en español. */
export class LiveSessionInputDto {
  @ApiPropertyOptional({ nullable: true, description: 'Módulo relacionado (opcional). Sin módulo, la clase es de todo el curso.' })
  @IsOptional()
  @IsString()
  moduleId?: string | null;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() description?: string | null;
  @ApiProperty({ description: 'Fecha y hora de inicio en ISO 8601 (por ejemplo, 2026-12-01T15:00:00.000Z).' }) @IsString() startsAt: string;
  @ApiProperty({ description: 'Enlace https de Google Meet (https://meet.google.com/abc-defg-hij).' }) @IsString() meetUrl: string;
}

/** Recuperación de examen (21/11/2026): autorización del Instructor. Las fechas llevan zona horaria (ISO 8601). */
export class RecoveryInputDto {
  @ApiProperty({ description: 'Estudiante (id de usuario).' }) @IsString() userId: string;
  @ApiProperty() @IsString() courseId: string;
  /** Decisión del 20/11/2026: solo el examen original. Se acepta omitirlo; «independiente» ya no se admite. */
  @ApiPropertyOptional({ enum: ['original'], default: 'original' })
  @IsOptional()
  @IsIn(['original'], { message: 'Las recuperaciones solo se rinden con el examen original del curso.' })
  mode?: 'original';
  @ApiPropertyOptional({ description: 'Compatibilidad: si se envía, debe ser el examen original del curso.' }) @IsOptional() @IsString() recoveryExamId?: string;
  @ApiProperty({ example: '2026-11-25T09:00:00-05:00' }) @IsString() opensAt: string;
  @ApiProperty({ example: '2026-11-27T18:00:00-05:00' }) @IsString() closesAt: string;
}

/**
 * Certificados del Instructor (filtros, 20/11/2026). Todos opcionales y combinables. La consulta siempre se limita a
 * los cursos propios y a los participantes que registró el Instructor: la empresa solo filtra, nunca amplía el alcance.
 */
export class CertificateQueryDto {
  @ApiPropertyOptional({ description: 'Estudiante (id de usuario).' }) @IsOptional() @IsString() @MaxLength(36) userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(36) courseId?: string;
  @ApiPropertyOptional({ description: 'Nombre, apellido o nombre completo (parcial; sin distinguir mayúsculas ni tildes).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  student?: string;
  @ApiPropertyOptional({ description: 'Código del certificado, completo o parcial.' }) @IsOptional() @IsString() @MaxLength(40) code?: string;
  @ApiPropertyOptional({ description: 'Empresa del participante.' }) @IsOptional() @IsString() @MaxLength(36) companyId?: string;
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Emitidos desde (AAAA-MM-DD, hora de Lima).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha «desde» debe tener el formato AAAA-MM-DD.' })
  from?: string;
  @ApiPropertyOptional({ example: '2026-11-30', description: 'Emitidos hasta (AAAA-MM-DD, hora de Lima).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha «hasta» debe tener el formato AAAA-MM-DD.' })
  to?: string;
}

export class RecoveryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional({ description: 'Estudiante (id de usuario).' }) @IsOptional() @IsString() userId?: string;
}

export class LiveSessionRecordingDto {
  @ApiPropertyOptional({ nullable: true, description: 'Enlace https de la grabación (Drive, YouTube u otro); null la quita.' })
  @IsOptional()
  @IsString()
  recordingUrl?: string | null;
}

export class LiveSessionStatusDto {
  @ApiProperty({ enum: ['programada', 'cancelada'] }) @IsIn(['programada', 'cancelada']) status: 'programada' | 'cancelada';
}

export class VideoPublishedDto {
  @ApiProperty() @IsBoolean() published: boolean;
}

export class VideoModuleDto {
  @ApiProperty() @IsString() moduleId: string;
}

export class ExamConfigDto {
  @ApiProperty() @IsNumber() timeMinutes: number;
  @ApiProperty() @IsNumber() passScore: number;
  @ApiProperty({ description: 'Siempre 1 (un solo intento por examen).' }) @IsNumber() maxAttempts: number;
  @ApiProperty({ enum: [20, 100] }) @IsNumber() scaleMax: number;
  @ApiPropertyOptional({ nullable: true, description: 'Fecha desde la que se puede rendir (ISO 8601).' })
  @IsOptional()
  @IsString()
  availableFrom?: string | null;
}

export class QuestionOptionDto {
  @ApiProperty() @IsString() id: string;
  @ApiProperty() @MaxLength(500) @IsString() text: string;
}

export class QuestionDto {
  @ApiProperty() @IsString() id: string;
  @ApiProperty({ enum: ['single', 'multiple', 'truefalse', 'open'] }) @IsIn(['single', 'multiple', 'truefalse', 'open']) type: 'single' | 'multiple' | 'truefalse' | 'open';
  @ApiProperty() @MaxLength(1000) @IsString() text: string;
  @ApiProperty({ type: [QuestionOptionDto] })
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMaxSize(20)
  @IsArray()
  options: QuestionOptionDto[];
  @ApiProperty({ type: [String] }) @IsString({ each: true }) @IsArray() correct: string[];
  @ApiProperty() @IsNumber() points: number;
  @ApiPropertyOptional() @IsOptional() @MaxLength(1000) @IsString() rubric?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() selectCount?: number;
  /** El frontend reenvía la pregunta guardada (con su examen): se acepta y se ignora. */
  @ApiPropertyOptional() @IsOptional() @IsString() examId?: string;
}

export class EnrollDto {
  @ApiProperty() @IsString() studentId: string;
  @ApiProperty() @IsString() courseId: string;
}

export class OpenGradeDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiProperty() @IsNumber() score: number;
}

export class GradeOpenAnswersDto {
  @ApiProperty({ type: [OpenGradeDto] })
  @ValidateNested({ each: true })
  @Type(() => OpenGradeDto)
  @IsArray()
  grades: OpenGradeDto[];
}

export class AnswersDto {
  @ApiProperty({ description: 'Respuestas por pregunta: { [questionId]: string[] }.' }) @IsObject() answers: Record<string, string[]>;
}

export class SubmitDto extends AnswersDto {
  @ApiProperty() @IsNumber() durationSec: number;
  @ApiPropertyOptional({ enum: ['voluntaria', 'tiempo'] }) @IsOptional() @IsIn(['voluntaria', 'tiempo']) mode?: 'voluntaria' | 'tiempo';
}

export class AttemptQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() examId?: string;
}

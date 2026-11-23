import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../../common/decorators.js';
import { AuthThrottle } from '../../common/throttle.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AnswersDto,
  AttemptQueryDto,
  CertificateQueryDto,
  CourseActiveDto,
  LiveSessionInputDto,
  RecoveryInputDto,
  RecoveryQueryDto,
  LiveSessionRecordingDto,
  LiveSessionStatusDto,
  CourseInputDto,
  CoursePatchDto,
  CourseQueryDto,
  EnrollDto,
  ExamConfigDto,
  GradeOpenAnswersDto,
  ModuleInputDto,
  MoveDto,
  QuestionDto,
  SubmitDto,
  VideoInputDto,
  VideoModuleDto,
  VideoPublishedDto,
} from './academic.dto.js';
import { type CertificateRow, toPublicCertificate, toPublicDniCertificate } from './academic.mappers.js';
import { InstructorAcademicService } from './instructor-academic.service.js';
import { COVER_INVALID, COVER_MAX_BYTES, COVER_MISSING, COVER_TOO_LARGE, CourseCoverStorage, type UploadedCover } from './course-cover.storage.js';
import { LearningService } from './learning.service.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { RecoveriesService } from './recoveries.service.js';

/**
 * Recepción de la portada (19/11/2026): Multer en memoria (nada se escribe en disco antes de validar), un solo archivo
 * en el campo «file» y como máximo 2 MB. Los errores de Multer (en inglés) se devuelven en español y sin detalles
 * internos. Se ejecuta después de los guards: sin sesión o sin rol de Instructor no se lee el cuerpo.
 */
@Injectable()
export class CoverUploadInterceptor implements NestInterceptor {
  // Sin `dest` ni `storage`, Multer guarda el archivo en memoria (Buffer).
  private readonly inner = new (FileInterceptor('file', {
    limits: { fileSize: COVER_MAX_BYTES, files: 1, fields: 0, parts: 1 },
  }))();

  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new PayloadTooLargeException(COVER_TOO_LARGE);
      if (error instanceof UnsupportedMediaTypeException) throw new BadRequestException(COVER_MISSING);
      if (error instanceof HttpException && error.getStatus() === 400) throw new BadRequestException(COVER_MISSING);
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(COVER_INVALID);
    }
  }
}

/** Módulo académico (18/11/2026), rutas del INSTRUCTOR: solo sus cursos y sus estudiantes. */
@ApiTags('Académico: Instructor')
@ApiBearerAuth()
@Roles(Role.INSTRUCTOR)
@Controller()
export class InstructorAcademicController {
  constructor(
    private readonly academic: InstructorAcademicService,
    private readonly live: LiveSessionsService,
    private readonly recoveries: RecoveriesService,
  ) {}

  // ----- Recuperaciones de examen (21/11/2026): solo el Instructor dueño del curso -----
  @Get('recoveries')
  @ApiOperation({ summary: 'Recuperaciones autorizadas en los cursos del Instructor (filtros opcionales).' })
  listRecoveries(@CurrentUser() actor: AuthUser, @Query() query: RecoveryQueryDto) {
    return this.recoveries.list(actor, query);
  }

  @Get('recovery-states')
  @ApiOperation({ summary: 'Situación de recuperación de cada estudiante matriculado (desaprobados → «pendiente»).' })
  recoveryStates(@CurrentUser() actor: AuthUser, @Query() query: RecoveryQueryDto) {
    return this.recoveries.states(actor, query);
  }

  @Post('recoveries')
  @ApiOperation({ summary: 'Autoriza una recuperación (solo a quien desaprobó el examen regular; siempre con el examen original del curso).' })
  authorizeRecovery(@CurrentUser() actor: AuthUser, @Body() body: RecoveryInputDto) {
    return this.recoveries.authorize(actor, body);
  }

  @Put('recoveries/:recoveryId/cancel')
  @ApiOperation({ summary: 'Anula una recuperación antes de que el estudiante la inicie.' })
  cancelRecovery(@CurrentUser() actor: AuthUser, @Param('recoveryId') recoveryId: string) {
    return this.recoveries.cancel(actor, recoveryId);
  }

  // ----- Sesiones en vivo (20/11/2026): enlaces de Google Meet por módulo -----
  @Get('courses/:courseId/live-sessions')
  @ApiOperation({ summary: 'Sesiones en vivo del curso (programadas y canceladas), por fecha de inicio.' })
  liveSessions(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.live.instructorList(actor, courseId);
  }

  @Post('courses/:courseId/live-sessions')
  @ApiOperation({ summary: 'Programa una sesión en vivo en un módulo del curso (enlace https de Google Meet).' })
  createLiveSession(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: LiveSessionInputDto) {
    return this.live.create(actor, courseId, body);
  }

  @Put('courses/:courseId/live-sessions/:sessionId')
  @ApiOperation({ summary: 'Edita una sesión en vivo (título, descripción, módulo, fecha y enlace).' })
  updateLiveSession(
    @CurrentUser() actor: AuthUser,
    @Param('courseId') courseId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionInputDto,
  ) {
    return this.live.update(actor, courseId, sessionId, body);
  }

  @Put('courses/:courseId/live-sessions/:sessionId/status')
  @ApiOperation({ summary: 'Cancela o vuelve a programar una sesión en vivo (nunca se borra).' })
  liveSessionStatus(
    @CurrentUser() actor: AuthUser,
    @Param('courseId') courseId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionStatusDto,
  ) {
    return this.live.setStatus(actor, courseId, sessionId, body.status);
  }

  @Put('courses/:courseId/live-sessions/:sessionId/recording')
  @ApiOperation({ summary: 'Agrega, cambia o quita (null) el enlace de la grabación de una clase ya realizada.' })
  liveSessionRecording(
    @CurrentUser() actor: AuthUser,
    @Param('courseId') courseId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionRecordingDto,
  ) {
    return this.live.setRecording(actor, courseId, sessionId, body.recordingUrl ?? null);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicadores del Instructor (MySQL).' })
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.academic.dashboard(actor);
  }

  // ----- Cursos -----
  @Get('courses')
  @ApiOperation({ summary: 'Cursos del Instructor; filtro opcional por nivel (o «pendiente»).' })
  listCourses(@CurrentUser() actor: AuthUser, @Query() query: CourseQueryDto) {
    return this.academic.listCourses(actor, query.level);
  }

  @Post('courses')
  createCourse(@CurrentUser() actor: AuthUser, @Body() body: CourseInputDto) {
    return this.academic.createCourse(actor, body);
  }

  @Put('courses/:courseId')
  @ApiOperation({ summary: 'Edita el curso y lo publica o despublica (RN-03 para publicar).' })
  updateCourse(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: CoursePatchDto) {
    return this.academic.updateCourse(actor, courseId, body);
  }

  @Put('courses/:courseId/cover')
  @UseInterceptors(CoverUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiOperation({ summary: 'Sube o reemplaza la portada del curso (JPG, PNG o WebP; máximo 2 MB). En MySQL queda solo la ruta.' })
  uploadCover(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @UploadedFile() file: UploadedCover | undefined) {
    return this.academic.uploadCover(actor, courseId, file);
  }

  @Put('courses/:courseId/active')
  setActive(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: CourseActiveDto) {
    return this.academic.setCourseActive(actor, courseId, body.active);
  }

  @Get('courses/:courseId/content')
  content(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.academic.courseContent(actor, courseId);
  }

  @Get('courses/:courseId/publication-check')
  publicationCheck(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.academic.publicationCheck(actor, courseId);
  }

  // ----- Módulos -----
  @Post('courses/:courseId/modules')
  saveModule(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: ModuleInputDto) {
    return this.academic.saveModule(actor, courseId, body);
  }

  @Post('courses/:courseId/modules/:moduleId/move')
  @HttpCode(HttpStatus.OK)
  moveModule(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('moduleId') moduleId: string, @Body() body: MoveDto) {
    return this.academic.moveModule(actor, courseId, moduleId, body.delta);
  }

  @Delete('courses/:courseId/modules/:moduleId')
  deleteModule(
    @CurrentUser() actor: AuthUser,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Query('targetModuleId') targetModuleId?: string,
  ) {
    return this.academic.deleteModule(actor, courseId, moduleId, targetModuleId || undefined);
  }

  // ----- Videos -----
  @Post('courses/:courseId/videos')
  saveVideo(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: VideoInputDto) {
    return this.academic.saveVideo(actor, courseId, body);
  }

  @Post('courses/:courseId/videos/:videoId/move')
  @HttpCode(HttpStatus.OK)
  moveVideo(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('videoId') videoId: string, @Body() body: MoveDto) {
    return this.academic.moveVideo(actor, courseId, videoId, body.delta);
  }

  @Put('courses/:courseId/videos/:videoId/published')
  setPublished(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('videoId') videoId: string, @Body() body: VideoPublishedDto) {
    return this.academic.setVideoPublished(actor, courseId, videoId, body.published);
  }

  @Put('courses/:courseId/videos/:videoId/module')
  assignModule(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('videoId') videoId: string, @Body() body: VideoModuleDto) {
    return this.academic.assignVideoToModule(actor, courseId, videoId, body.moduleId);
  }

  @Delete('courses/:courseId/videos/:videoId')
  deleteVideo(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('videoId') videoId: string) {
    return this.academic.deleteVideo(actor, courseId, videoId);
  }

  // ----- Evaluaciones -----
  @Get('courses/:courseId/exams')
  exams(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.academic.listExams(actor, courseId);
  }

  @Get('courses/:courseId/exams/active')
  activeExam(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.academic.activeExam(actor, courseId);
  }

  @Post('courses/:courseId/exams')
  createExam(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.academic.createExam(actor, courseId);
  }

  @Put('exams/:examId/config')
  @ApiOperation({ summary: 'Tiempo, nota mínima, escala y fecha de disponibilidad (bloqueado si ya se rindió, RN-15).' })
  examConfig(@CurrentUser() actor: AuthUser, @Param('examId') examId: string, @Body() body: ExamConfigDto) {
    return this.academic.updateExamConfig(actor, examId, body);
  }

  @Get('exams/:examId/questions')
  questions(@CurrentUser() actor: AuthUser, @Param('examId') examId: string) {
    return this.academic.examQuestions(actor, examId);
  }

  @Post('exams/:examId/questions')
  @ApiOperation({ summary: 'Crea o edita una pregunta (RN-12; bloqueado si ya se rindió, RN-15).' })
  saveQuestion(@CurrentUser() actor: AuthUser, @Param('examId') examId: string, @Body() body: QuestionDto) {
    return this.academic.saveQuestion(actor, examId, body);
  }

  @Delete('exams/:examId/questions/:questionId')
  deleteQuestion(@CurrentUser() actor: AuthUser, @Param('examId') examId: string, @Param('questionId') questionId: string) {
    return this.academic.deleteQuestion(actor, examId, questionId);
  }

  // ----- Matrículas, resultados y certificados -----
  @Get('enrollments')
  enrollments(@CurrentUser() actor: AuthUser, @Query('userId') userId?: string, @Query('courseId') courseId?: string) {
    return this.academic.listEnrollments(actor, { userId, courseId });
  }

  @Post('enrollments')
  enroll(@CurrentUser() actor: AuthUser, @Body() body: EnrollDto) {
    return this.academic.enroll(actor, body);
  }

  @Delete('enrollments/:studentId/:courseId')
  unenroll(@CurrentUser() actor: AuthUser, @Param('studentId') studentId: string, @Param('courseId') courseId: string) {
    return this.academic.unenroll(actor, studentId, courseId);
  }

  @Get('attempts')
  attempts(@CurrentUser() actor: AuthUser, @Query() query: AttemptQueryDto) {
    return this.academic.listAttempts(actor, query);
  }

  @Post('attempts/:attemptId/grade')
  @HttpCode(HttpStatus.OK)
  grade(@CurrentUser() actor: AuthUser, @Param('attemptId') attemptId: string, @Body() body: GradeOpenAnswersDto) {
    return this.academic.gradeOpenAnswers(actor, attemptId, body.grades);
  }

  @Get('certificates')
  @ApiOperation({ summary: 'Certificados de los cursos propios y de los participantes registrados por el Instructor, con filtros combinables.' })
  certificates(@CurrentUser() actor: AuthUser, @Query() query: CertificateQueryDto) {
    return this.academic.listCertificates(actor, query);
  }
}

/** Módulo académico, rutas del ESTUDIANTE: la identidad sale siempre del token (solo su información). */
@ApiTags('Académico: Estudiante')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('me')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  courses(@CurrentUser() actor: AuthUser) {
    return this.learning.myCourses(actor);
  }

  @Get('courses/:courseId/content')
  content(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.courseContent(actor, courseId);
  }

  @Get('courses/:courseId/recovery')
  @ApiOperation({ summary: 'Situación de la recuperación del estudiante autenticado en el curso.' })
  myRecovery(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.myRecovery(actor, courseId);
  }

  @Get('courses/:courseId/live-sessions')
  @ApiOperation({ summary: 'Sesiones en vivo del curso (Google Meet), también las canceladas. Requiere matrícula.' })
  liveSessions(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.liveSessions(actor, courseId);
  }

  @Post('courses/:courseId/videos/:videoId/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Param('videoId') videoId: string) {
    return this.learning.completeVideo(actor, courseId, videoId);
  }

  @Get('enrollments')
  enrollments(@CurrentUser() actor: AuthUser, @Query('courseId') courseId?: string) {
    return this.learning.myEnrollments(actor, courseId);
  }

  @Get('attempts')
  attempts(@CurrentUser() actor: AuthUser, @Query('courseId') courseId?: string, @Query('examId') examId?: string) {
    return this.learning.myAttempts(actor, { courseId, examId });
  }

  @Get('certificates')
  certificates(@CurrentUser() actor: AuthUser, @Query('courseId') courseId?: string) {
    return this.learning.myCertificates(actor, courseId);
  }

  @Get('courses/:courseId/exam')
  exam(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.myExam(actor, courseId);
  }

  @Get('courses/:courseId/exam/availability')
  availability(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.availability(actor, courseId);
  }

  @Post('courses/:courseId/exam/start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string) {
    return this.learning.start(actor, courseId);
  }

  @Put('courses/:courseId/exam/answers')
  saveAnswers(@CurrentUser() actor: AuthUser, @Param('courseId') courseId: string, @Body() body: AnswersDto) {
    return this.learning.saveAnswers(actor, courseId, body.answers);
  }

  @Get('exams/:examId/questions')
  @ApiOperation({ summary: 'Preguntas para rendir: sin respuestas correctas ni criterios.' })
  questions(@CurrentUser() actor: AuthUser, @Param('examId') examId: string) {
    return this.learning.examQuestions(actor, examId);
  }

  @Post('exams/:examId/submit')
  submit(@CurrentUser() actor: AuthUser, @Param('examId') examId: string, @Body() body: SubmitDto) {
    return this.learning.submit(actor, examId, body.answers, body.durationSec, body.mode ?? 'voluntaria');
  }
}

/**
 * Verificación PÚBLICA de certificados (sin sesión, límite estricto de solicitudes). Nunca el DNI ni identificadores
 * internos. Por DNI (20/11/2026, validación pública desde /login): solo titular, curso, código, emisión y estado; un DNI
 * mal formado o sin certificados responde igual (lista vacía), sin revelar si existe una cuenta.
 */
@ApiTags('Certificados: verificación pública')
@Public()
@AuthThrottle()
@Controller('public/certificates')
export class PublicCertificatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dni/:dni')
  async byDni(@Param('dni') dni: string) {
    if (!/^\d{8}$/.test(dni)) return [];
    const rows = (await this.prisma.certificate.findMany({ where: { participantDni: dni } })) as CertificateRow[];
    return rows.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime()).map(toPublicDniCertificate);
  }

  @Get(':code')
  async byCode(@Param('code') code: string) {
    const row = /^[A-Za-z0-9-]{4,40}$/.test(code)
      ? ((await this.prisma.certificate.findUnique({ where: { code: code.toUpperCase() } })) as CertificateRow | null)
      : null;
    if (!row) throw new NotFoundException('No se encontró un certificado con ese código.');
    return toPublicCertificate(row);
  }
}

/**
 * Portadas de curso, PÚBLICAS (19/11/2026): las muestra una etiqueta <img>, que no envía el token. Solo se sirven
 * nombres administrados (UUID + jpg/png/webp) de la carpeta de portadas; cualquier otro nombre responde 404 sin
 * revelar rutas del servidor. Los nombres nunca se reutilizan, por eso la caché puede ser larga e inmutable.
 */
@ApiTags('Portadas de curso (públicas)')
@Public()
@Controller('public/course-covers')
export class PublicCourseCoversController {
  constructor(private readonly covers: CourseCoverStorage) {}

  @Get(':file')
  @ApiOperation({ summary: 'Imagen de portada de un curso.' })
  async cover(@Param('file') file: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const found = await this.covers.read(file);
    if (!found) throw new NotFoundException('No se encontró la imagen.');
    res.set({
      'Content-Type': found.contentType,
      'Content-Length': String(found.data.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // Helmet usa same-origin; la imagen se puede mostrar desde el frontend en otro dominio (producción).
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(found.data);
  }
}

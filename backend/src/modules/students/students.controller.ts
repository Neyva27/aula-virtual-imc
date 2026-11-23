import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser, Roles } from '../../common/decorators.js';
import {
  AssignStudentCompaniesDto,
  AssignStudentCompaniesResultDto,
  ActivationStatusDto,
  WhatsappActivationResultDto,
  ListStudentsQueryDto,
  RegisterStudentDto,
  RegisterStudentResultDto,
  ResendActivationResultDto,
  RemoveStudentCompanyResultDto,
  StudentCompanyDto,
  StudentDto,
  StudentPageDto,
  UpdateStudentContactDto,
} from './student.dto.js';
import { StudentRegistrationService } from './student-registration.service.js';
import { StudentsService } from './students.service.js';

/**
 * B2.3a: consulta de estudiantes. B2.3b: asignación y retiro de sus empresas. B2.3c: registro y reenvío del enlace de
 * activación. Rol INSTRUCTOR; NO es una ruta
 * administrativa: el acceso depende solo de las empresas asignadas al Instructor autenticado (CompanyScopeService),
 * nunca del permiso IMC_GENERAL_ADMIN.
 */
@ApiTags('Estudiantes')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'El usuario no es Instructor, o debe cambiar su contraseña temporal.' })
@Roles(Role.INSTRUCTOR)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly registration: StudentRegistrationService,
  ) {}

  @Post()
  @ApiCreatedResponse({
    type: RegisterStudentResultDto,
    description:
      'B2.3c: registra un estudiante en empresas del Instructor. La cuenta queda pendiente hasta que el estudiante la ' +
      'active con el enlace de su correo; la respuesta indica el resultado del envío y nunca incluye el enlace ni el token.',
  })
  @ApiBadRequestResponse({ description: 'Datos no válidos o campos no permitidos.' })
  @ApiNotFoundResponse({ description: 'Alguna empresa no existe o no es del Instructor.' })
  @ApiConflictResponse({ description: 'Empresa inactiva, o correo o DNI ya registrados.' })
  register(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Body() body: RegisterStudentDto): Promise<RegisterStudentResultDto> {
    return this.registration.register(body, { actor, ip: ip ?? null });
  }

  @Post(':id/activation-email')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResendActivationResultDto, description: 'B2.3c: emite un enlace nuevo (anula los anteriores) y lo envía.' })
  @ApiNotFoundResponse({ description: 'El estudiante no existe o está fuera del alcance del Instructor.' })
  @ApiConflictResponse({ description: 'La cuenta ya está activada o está desactivada.' })
  resendActivation(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<ResendActivationResultDto> {
    return this.registration.resendActivation(id, { actor, ip: ip ?? null });
  }

  @Post(':id/activation-whatsapp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Genera un enlace de activación (anula los anteriores) y prepara el wa.me. No envía el mensaje.' })
  @ApiOkResponse({ type: WhatsappActivationResultDto })
  @ApiNotFoundResponse({ description: 'El estudiante no existe o no lo registró este Instructor.' })
  @ApiConflictResponse({ description: 'Cuenta ya activada o desactivada, sin WhatsApp, o sin ACTIVATION_URL.' })
  prepareWhatsapp(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<WhatsappActivationResultDto> {
    return this.registration.prepareWhatsappActivation(id, { actor, ip: ip ?? null });
  }

  @Post(':id/activation-whatsapp/opened')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra que se abrió WhatsApp para el envío manual (no implica envío ni entrega).' })
  @ApiOkResponse({ type: ActivationStatusDto })
  markWhatsappOpened(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<ActivationStatusDto> {
    return this.registration.markWhatsappOpened(id, { actor, ip: ip ?? null });
  }

  @Get(':id/activation-status')
  @ApiOperation({ summary: 'Estado real del proceso de activación del participante.' })
  @ApiOkResponse({ type: ActivationStatusDto })
  activationStatus(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<ActivationStatusDto> {
    return this.registration.activationStatus(id, { actor, ip: ip ?? null });
  }

  @Get()
  @ApiOkResponse({ type: StudentPageDto, description: 'Estudiantes que comparten al menos una empresa con el Instructor.' })
  @ApiBadRequestResponse({ description: 'Parámetros no válidos o no permitidos.' })
  @ApiNotFoundResponse({ description: '`companyId` no es una empresa asignada al Instructor.' })
  list(@CurrentUser() actor: AuthUser, @Query() query: ListStudentsQueryDto): Promise<StudentPageDto> {
    return this.students.list(actor, query);
  }

  /** Declarada ANTES de `:id`: si no, «companies» se tomaría como identificador de estudiante. */
  @Get('companies')
  @ApiOkResponse({
    type: [StudentCompanyDto],
    description: 'Empresas activas registradas que el Instructor puede elegir para sus participantes (por nombre). Solo lectura.',
  })
  myCompanies(@CurrentUser() actor: AuthUser): Promise<StudentCompanyDto[]> {
    return this.students.myCompanies(actor);
  }

  @Get(':id')
  @ApiOkResponse({ type: StudentDto })
  @ApiNotFoundResponse({ description: 'El estudiante no existe o está fuera de las empresas del Instructor.' })
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string): Promise<StudentDto> {
    return this.students.findOne(actor, id);
  }

  @Patch(':id/contact')
  @ApiOkResponse({ type: StudentDto, description: 'Actualiza o quita (null) el número de WhatsApp de un participante propio.' })
  @ApiBadRequestResponse({ description: 'Número no válido o campos no permitidos.' })
  @ApiNotFoundResponse({ description: 'El estudiante no existe o no lo registró este Instructor.' })
  updateContact(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string, @Body() body: UpdateStudentContactDto): Promise<StudentDto> {
    return this.students.updateContact(id, body, { actor, ip: ip ?? null });
  }

  @Post(':id/companies')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AssignStudentCompaniesResultDto, description: 'Asigna empresas del Instructor al estudiante (todo o nada).' })
  @ApiBadRequestResponse({ description: 'Lista vacía, demasiado larga, identificadores no válidos o campos no permitidos.' })
  @ApiNotFoundResponse({ description: 'El estudiante o alguna empresa están fuera del alcance del Instructor (o no existen).' })
  @ApiConflictResponse({ description: 'La cuenta del estudiante o alguna empresa están desactivadas.' })
  assignCompanies(
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() body: AssignStudentCompaniesDto,
  ): Promise<AssignStudentCompaniesResultDto> {
    return this.students.assignCompanies(id, body, { actor, ip: ip ?? null });
  }

  @Delete(':id/companies/:companyId')
  @ApiOkResponse({ type: RemoveStudentCompanyResultDto, description: 'Retira la asociación (solo la relación).' })
  @ApiNotFoundResponse({ description: 'Estudiante o empresa fuera del alcance, o la asociación no existe.' })
  @ApiConflictResponse({ description: 'Es la única empresa del estudiante.' })
  removeCompany(
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ): Promise<RemoveStudentCompanyResultDto> {
    return this.students.removeCompany(id, companyId, { actor, ip: ip ?? null });
  }
}

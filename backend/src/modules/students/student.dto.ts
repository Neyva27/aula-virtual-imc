import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActivationSummaryDto } from '../account-activation/account-activation.dto.js';

// Con stopAtFirstError, class-validator evalúa primero el decorador escrito MÁS ABAJO: el tipo va al final.
const cleanText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
/** Convierte solo cadenas de dígitos; cualquier otro valor llega tal cual para que la validación lo rechace. */
const toInt = ({ value }: { value: unknown }) => (typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value);

/** WhatsApp (23/11/2026): se ignoran espacios, guiones y paréntesis; no se agrega ningún prefijo ni se completa el dato. */
export const WHATSAPP_PATTERN = /^(\+[1-9]\d{7,14}|9\d{8})$/;
export const WHATSAPP_INVALID = 'Ingresa un número de WhatsApp válido: celular de 9 dígitos que empiece con 9, o con prefijo internacional (por ejemplo, +51…).';
const cleanPhone = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const phone = value.replace(/[\s()-]/g, '');
  return phone === '' ? null : phone;
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Límite de página: evita desplazamientos desmedidos en la base. */
export const MAX_PAGE = 10_000;

export class ListStudentsQueryDto {
  @ApiPropertyOptional({ description: 'Busca en nombres, apellidos, correo o DNI.', maxLength: 100 })
  @IsOptional()
  @Transform(cleanText)
  @MaxLength(100, { message: 'La búsqueda es demasiado larga.' })
  @IsString({ message: 'La búsqueda no es válida.' })
  q?: string;

  @ApiPropertyOptional({ description: 'Solo estudiantes de esta empresa. Debe ser una empresa asignada al Instructor (si no, 404).' })
  @IsOptional()
  @MaxLength(36, { message: 'La empresa indicada no es válida.' })
  @MinLength(1, { message: 'La empresa indicada no es válida.' })
  @IsString({ message: 'La empresa indicada no es válida.' })
  companyId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @IsOptional()
  @Transform(toInt)
  @Max(MAX_PAGE, { message: `La página no puede ser mayor que ${MAX_PAGE}.` })
  @Min(1, { message: 'La página debe ser un número entero mayor o igual que 1.' })
  @IsInt({ message: 'La página debe ser un número entero mayor o igual que 1.' })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Transform(toInt)
  @Max(MAX_PAGE_SIZE, { message: `El tamaño de página no puede ser mayor que ${MAX_PAGE_SIZE}.` })
  @Min(1, { message: `El tamaño de página debe ser un número entero entre 1 y ${MAX_PAGE_SIZE}.` })
  @IsInt({ message: `El tamaño de página debe ser un número entero entre 1 y ${MAX_PAGE_SIZE}.` })
  pageSize?: number;
}

/** Empresa visible para el Instructor (solo las de su alcance). */
export class StudentCompanyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() ruc: string;
  @ApiProperty({ description: 'Estado de la empresa.' }) active: boolean;
}

/**
 * Lista blanca de la respuesta. Sin hash, tokens, datos de bloqueo, versión de sesión, `mustChangePassword`, rol,
 * permisos ni empresas fuera del alcance del Instructor.
 */
export class StudentDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstNames: string;
  @ApiProperty() lastNames: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ example: '00000001' }) dni: string;
  @ApiProperty({ type: String, nullable: true, description: 'WhatsApp; null si no está registrado.' }) whatsapp: string | null;
  @ApiProperty({ description: 'Estado de la cuenta.' }) active: boolean;
  @ApiProperty({ description: 'true mientras el estudiante no haya creado su contraseña con el enlace de activación.' }) activationPending: boolean;
  @ApiProperty({ type: [StudentCompanyDto], description: 'Solo las empresas asignadas al Instructor autenticado.' })
  companies: StudentCompanyDto[];
}

/** B2.3b: máximo de empresas por solicitud de asignación. */
export const MAX_COMPANY_IDS = 50;

/**
 * B2.3b: empresas a asignar a un estudiante. Lista obligatoria (1 a 50); los identificadores repetidos se ignoran (se
 * procesa cada empresa una vez). Cualquier otro campo (por ejemplo `instructorId`, `userId` o `role`) → 400.
 */
export class AssignStudentCompaniesDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: MAX_COMPANY_IDS, description: 'Empresas del Instructor (los repetidos se ignoran).' })
  @MaxLength(36, { each: true, message: 'Un identificador de empresa no es válido.' })
  @MinLength(1, { each: true, message: 'Un identificador de empresa no es válido.' })
  @IsString({ each: true, message: 'Un identificador de empresa no es válido.' })
  @ArrayMaxSize(MAX_COMPANY_IDS, { message: `Indica como máximo ${MAX_COMPANY_IDS} empresas.` })
  @ArrayNotEmpty({ message: 'Indica al menos una empresa.' })
  @IsArray({ message: 'Indica al menos una empresa.' })
  companyIds: string[];
}

export class AssignStudentCompaniesResultDto {
  @ApiProperty({ type: [String], description: 'Empresas asignadas en esta operación.' }) created: string[];
  @ApiProperty({ type: [String], description: 'Ya estaban asignadas: no se duplican ni se registran.' }) alreadyAssigned: string[];
  @ApiProperty({ type: () => StudentDto, description: 'El estudiante con sus empresas visibles para el Instructor.' })
  student: StudentDto;
}

export class RemoveStudentCompanyResultDto {
  @ApiProperty() studentId: string;
  @ApiProperty() companyId: string;
  @ApiProperty({ description: 'false si el Instructor ya no comparte ninguna empresa con el estudiante (deja de verlo).' })
  stillVisible: boolean;
}

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trimOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Mensajes iguales a los del frontend en modo demostración (`addParticipant`), según el criterio de B2. */
const NAMES_REQUIRED = 'Ingresa nombres y apellidos.';

/**
 * B2.3c: registro de un estudiante. Nombres y apellidos por separado (D-9), de 2 a 100 caracteres como el resto de las
 * cuentas; correo único; DNI de 8 dígitos y único. Empresas OPCIONALES desde el 17/11/2026 (0 a 50, repetidos
 * ignorados; si se indican, propias y activas). Sin contraseña: el estudiante la crea al activar su cuenta. Cualquier
 * otro campo (instructorId, registeredById, role…) → 400.
 */
/** Empresa indicada al registrar un participante (20/11/2026): razón social y RUC de 11 dígitos. */
export class StudentNewCompanyDto {
  @ApiProperty({ example: 'Gloria S.A.', maxLength: 150 })
  @Transform(cleanText)
  @MaxLength(150, { message: 'La razón social no puede superar 150 caracteres.' })
  @MinLength(2, { message: 'Ingresa la razón social de la empresa.' })
  @IsString({ message: 'Ingresa la razón social de la empresa.' })
  name: string;

  @ApiProperty({ example: '20100190797', description: '11 dígitos.' })
  @Transform(trimOnly)
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos.' })
  @IsString({ message: 'El RUC debe tener 11 dígitos.' })
  ruc: string;
}

export class RegisterStudentDto {
  @ApiProperty({ example: 'Ana María', minLength: 2, maxLength: 100 })
  @Transform(cleanText)
  @MaxLength(100, { message: 'Los nombres no pueden superar 100 caracteres.' })
  @MinLength(2, { message: NAMES_REQUIRED })
  @IsString({ message: NAMES_REQUIRED })
  firstNames: string;

  @ApiProperty({ example: 'Torres Quispe', minLength: 2, maxLength: 100 })
  @Transform(cleanText)
  @MaxLength(100, { message: 'Los apellidos no pueden superar 100 caracteres.' })
  @MinLength(2, { message: NAMES_REQUIRED })
  @IsString({ message: NAMES_REQUIRED })
  lastNames: string;

  @ApiProperty({ example: 'ana@empresa.pe' })
  @Transform(trimLower)
  @MaxLength(191, { message: 'Ingresa un correo electrónico válido.' })
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email: string;

  @ApiProperty({ example: '12345678', description: '8 dígitos (D-9).' })
  @Transform(trimOnly)
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos.' })
  @IsString({ message: 'El DNI debe tener 8 dígitos.' })
  dni: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+51987654321', description: 'Opcional. Celular de 9 dígitos o número con prefijo internacional.' })
  @Transform(cleanPhone)
  @IsOptional()
  @Matches(WHATSAPP_PATTERN, { message: WHATSAPP_INVALID })
  @IsString({ message: WHATSAPP_INVALID })
  whatsapp?: string | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_COMPANY_IDS,
    description: 'Opcional. Empresas del Instructor, activas. Sin empresas, el estudiante queda solo vinculado a quien lo registró.',
  })
  @IsOptional()
  @MaxLength(36, { each: true, message: 'Un identificador de empresa no es válido.' })
  @MinLength(1, { each: true, message: 'Un identificador de empresa no es válido.' })
  @IsString({ each: true, message: 'Un identificador de empresa no es válido.' })
  @ArrayMaxSize(MAX_COMPANY_IDS, { message: `Indica como máximo ${MAX_COMPANY_IDS} empresas.` })
  @IsArray({ message: 'Las empresas indicadas no son válidas.' })
  companyIds?: string[];

  @ApiPropertyOptional({
    type: () => StudentNewCompanyDto,
    description:
      'Opcional (20/11/2026). Empresa por razón social y RUC: si el RUC ya existe y la empresa está activa, se reutiliza; ' +
      'si está desactivada → 409 (no se duplica ni se reactiva); si no existe, se registra. Todo en la misma transacción.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentNewCompanyDto)
  company?: StudentNewCompanyDto;
}

/** Edición de los datos de contacto (23/11/2026). `null` o vacío quita el número. Cualquier otro campo → 400. */
export class UpdateStudentContactDto {
  @ApiProperty({ type: String, nullable: true, example: '+51987654321' })
  @Transform(cleanPhone)
  @ValidateIf((_o, value) => value !== null)
  @Matches(WHATSAPP_PATTERN, { message: WHATSAPP_INVALID })
  @IsString({ message: WHATSAPP_INVALID })
  whatsapp: string | null;
}

export class RegisterStudentResultDto {
  @ApiProperty({ type: () => StudentDto }) student: StudentDto;
  @ApiPropertyOptional({
    enum: ['CREATED', 'REUSED'],
    description: 'Solo si se indicó `company`: la empresa se registró (CREATED) o ya existía con ese RUC (REUSED).',
  })
  companyOutcome?: 'CREATED' | 'REUSED';
  @ApiProperty({ type: ActivationSummaryDto, description: 'La cuenta queda pendiente hasta que el estudiante la active.' })
  activation: ActivationSummaryDto;
}

/**
 * Activación manual asistida por WhatsApp (23/11/2026). `whatsappUrl` lleva el enlace de un solo uso: la respuesta no se
 * guarda en caché y solo la recibe el Instructor que registró al estudiante. NO significa que el mensaje se envió.
 */
export class WhatsappActivationResultDto {
  @ApiProperty({ enum: ['LINK_GENERATED'] }) status: 'LINK_GENERATED';
  @ApiProperty({ description: 'Enlace wa.me con el mensaje preparado. El Instructor lo revisa y pulsa enviar.' }) whatsappUrl: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}

/** Estados REALES del proceso. La plataforma no puede saber si el mensaje se envió o se entregó. */
export class ActivationStatusDto {
  @ApiProperty() activationPending: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time', description: 'Último enlace generado para WhatsApp.' }) linkGeneratedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time', description: 'Se abrió WhatsApp con ese enlace (no implica envío).' }) whatsappOpenedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) expiresAt: string | null;
  @ApiProperty({ enum: ['VIGENTE', 'VENCIDO', 'USADO', 'ANULADO', 'SIN_ENLACE'] }) linkState: 'VIGENTE' | 'VENCIDO' | 'USADO' | 'ANULADO' | 'SIN_ENLACE';
}

export class ResendActivationResultDto {
  @ApiProperty({ type: ActivationSummaryDto }) activation: ActivationSummaryDto;
}

export class StudentPageDto {
  @ApiProperty({ type: [StudentDto] }) items: StudentDto[];
  @ApiProperty({ description: 'Total de estudiantes que cumplen los filtros (todas las páginas).' }) total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

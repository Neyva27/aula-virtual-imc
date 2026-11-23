import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client.js';

// Con stopAtFirstError, class-validator evalúa primero el decorador escrito MÁS ABAJO: el tipo va al final para que
// un campo ausente o null informe «Ingresa…» y no un error de longitud.

/** Recorta y une espacios repetidos. Otros tipos pasan sin cambios para que la validación los rechace. */
const cleanText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const trimOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const cleanEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

const NAME_REQUIRED = 'Ingresa el nombre de la empresa.';
const NAME_TOO_LONG = 'El nombre de la empresa no puede superar 150 caracteres.';
const RUC_REQUIRED = 'Ingresa el RUC de la empresa.';
/**
 * RUC: solo se aplican las restricciones estructurales de B1.1 que conserva B2.1 (obligatorio, 11 caracteres y
 * único). Su formato institucional (por ejemplo, si son solo dígitos o tienen dígito verificador) sigue PENDIENTE
 * (D-9, B2.1-5): no se valida el contenido.
 */
const RUC_LENGTH = 'El RUC debe tener 11 caracteres.';
const EMAIL_INVALID = 'Ingresa un correo de contacto válido.';
const EMAIL_TOO_LONG = 'El correo de contacto es demasiado largo.';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Empresa Ejemplo S.A.C.', maxLength: 150 })
  @Transform(cleanText)
  @MaxLength(150, { message: NAME_TOO_LONG })
  @MinLength(1, { message: NAME_REQUIRED })
  @IsString({ message: NAME_REQUIRED })
  name: string;

  @ApiProperty({ minLength: 11, maxLength: 11, description: 'Obligatorio, 11 caracteres y único. Formato institucional pendiente.' })
  @Transform(trimOnly)
  @Length(11, 11, { message: RUC_LENGTH })
  @IsString({ message: RUC_REQUIRED })
  ruc: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'contacto@empresa.pe' })
  @IsOptional()
  @Transform(cleanEmail)
  @MaxLength(191, { message: EMAIL_TOO_LONG })
  @IsEmail({}, { message: EMAIL_INVALID })
  contactEmail?: string | null;
}

/** Datos editables. `active` no se cambia aquí: tiene sus propias operaciones (desactivar y reactivar). */
export class UpdateCompanyDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @ValidateIf((_o, value) => value !== undefined) // null no se admite: el nombre es obligatorio
  @Transform(cleanText)
  @MaxLength(150, { message: NAME_TOO_LONG })
  @MinLength(1, { message: NAME_REQUIRED })
  @IsString({ message: NAME_REQUIRED })
  name?: string;

  @ApiPropertyOptional({ minLength: 11, maxLength: 11 })
  @ValidateIf((_o, value) => value !== undefined) // null no se admite: el RUC es obligatorio
  @Transform(trimOnly)
  @Length(11, 11, { message: RUC_LENGTH })
  @IsString({ message: RUC_REQUIRED })
  ruc?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null lo borra.' })
  @IsOptional()
  @Transform(cleanEmail)
  @MaxLength(191, { message: EMAIL_TOO_LONG })
  @IsEmail({}, { message: EMAIL_INVALID })
  contactEmail?: string | null;
}

export class ListCompaniesQueryDto {
  @ApiPropertyOptional({ description: 'Busca en el nombre o el RUC.', maxLength: 100 })
  @IsOptional()
  @Transform(cleanText)
  @MaxLength(100, { message: 'La búsqueda es demasiado larga.' })
  @IsString({ message: 'La búsqueda no es válida.' })
  q?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Sin indicar: todas.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'El filtro «active» debe ser true o false.' })
  active?: boolean;
}

export class CompanyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() ruc: string;
  @ApiPropertyOptional({ type: String, nullable: true }) contactEmail: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export const COMPANY_SELECT = {
  id: true,
  name: true,
  ruc: true,
  contactEmail: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

export type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;

export function toCompanyDto(row: CompanyRow): CompanyDto {
  return {
    id: row.id,
    name: row.name,
    ruc: row.ruc,
    contactEmail: row.contactEmail,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

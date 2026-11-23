import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export class CompanySummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: '00000000001' }) ruc: string;
}

/**
 * B2.1: un estudiante puede pertenecer a varias empresas o a ninguna. Antes (B1.1) era `company`, un solo objeto;
 * ahora es `companies`, una colección ordenada por nombre (vacía si no tiene empresas).
 */
export class StudentProfileDto {
  @ApiProperty({ example: '00000001' }) dni: string;
  @ApiProperty({ type: [CompanySummaryDto] }) companies: CompanySummaryDto[];
}

/** Datos de usuario que puede ver el cliente. Nunca incluye el hash de la contraseña ni los datos de bloqueo. */
export class UserDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'ana@ejemplo.test' }) email: string;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ example: 'Ana' }) firstNames: string;
  @ApiProperty({ example: 'Torres Quispe' }) lastNames: string;
  @ApiProperty({ example: 'Ana Torres Quispe' }) fullName: string;
  @ApiProperty() active: boolean;
  @ApiProperty() mustChangePassword: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastLoginAt: string | null;
  @ApiPropertyOptional({ type: StudentProfileDto, nullable: true }) student: StudentProfileDto | null;
}

/** Selección de columnas permitidas: la proyección se decide en la consulta, no después. */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  role: true,
  firstNames: true,
  lastNames: true,
  active: true,
  mustChangePassword: true,
  lastLoginAt: true,
  student: {
    select: {
      dni: true,
      companies: {
        select: { company: { select: { id: true, name: true, ruc: true } } },
        orderBy: { company: { name: 'asc' } },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type UserPublicRow = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

export function toUserDto(row: UserPublicRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    fullName: `${row.firstNames} ${row.lastNames}`.trim(),
    active: row.active,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    student: row.student
      ? { dni: row.student.dni, companies: row.student.companies.map(({ company }) => ({ ...company })) }
      : null,
  };
}

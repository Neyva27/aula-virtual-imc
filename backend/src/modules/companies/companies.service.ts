import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth-user.js';
import {
  COMPANY_SELECT,
  toCompanyDto,
  type CompanyDto,
  type CompanyRow,
  type CreateCompanyDto,
  type ListCompaniesQueryDto,
  type UpdateCompanyDto,
} from './company.dto.js';

export const COMPANY_NOT_FOUND = 'Empresa no encontrada.';
export const COMPANY_NAME_TAKEN = 'Ya existe una empresa con ese nombre.';
export const COMPANY_RUC_TAKEN = 'Ya existe una empresa con ese RUC.';
export const COMPANY_DUPLICATE = 'Ya existe una empresa con ese nombre o RUC.';
export const COMPANY_ALREADY_INACTIVE = 'La empresa ya está desactivada.';
export const COMPANY_ALREADY_ACTIVE = 'La empresa ya está activa.';

/** Acciones de la bitácora de B2.2b. */
export type CompanyAuditAction = 'COMPANY_CREATED' | 'COMPANY_UPDATED' | 'COMPANY_DEACTIVATED' | 'COMPANY_ACTIVATED';

type Tx = Prisma.TransactionClient;

/** Contexto de la operación: el actor sale SIEMPRE del token (request.user), nunca de la petición. */
export interface AdminContext {
  actor: AuthUser;
  ip: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * B2.2b: gestión de empresas por la administración general de IMC (las rutas exigen IMC_GENERAL_ADMIN).
 * - Sin borrado físico: una empresa se desactiva (y puede reactivarse). Decisión institucional del 12/11/2026:
 *   se conservan la empresa, su historial y sus asociaciones con estudiantes e instructores, y el acceso a los
 *   registros existentes (el alcance por empresa de CompanyScopeService no cambia). Una empresa inactiva NO admite
 *   nuevas asignaciones ni matrículas vinculadas a ella: esas operaciones aún no existen y deben comprobar `active`
 *   al implementarse (docs/ARQUITECTURA_BACKEND.md, 22.9). Al reactivarla vuelven a permitirse.
 * - El RUC se puede corregir (decisión del 12/11/2026), con bitácora del valor anterior y el nuevo.
 * - Cada operación que modifica datos escribe su registro de bitácora en la MISMA transacción: si la bitácora falla,
 *   la operación no se confirma.
 */
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCompaniesQueryDto): Promise<CompanyDto[]> {
    const where: Prisma.CompanyWhereInput = {};
    if (query.active !== undefined) where.active = query.active;
    if (query.q) where.OR = [{ name: { contains: query.q } }, { ruc: { contains: query.q } }];
    const rows = await this.prisma.company.findMany({ where, orderBy: { name: 'asc' }, select: COMPANY_SELECT });
    return rows.map(toCompanyDto);
  }

  async findOne(id: string): Promise<CompanyDto> {
    return toCompanyDto(await this.require(this.prisma, id));
  }

  async create(input: CreateCompanyDto, ctx: AdminContext): Promise<CompanyDto> {
    return this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertAvailable(tx, { name: input.name, ruc: input.ruc });
        const row = await tx.company.create({
          data: { name: input.name, ruc: input.ruc, contactEmail: input.contactEmail ?? null },
          select: COMPANY_SELECT,
        });
        await this.audit(tx, ctx, 'COMPANY_CREATED', row.id, { name: row.name, ruc: row.ruc });
        return toCompanyDto(row);
      }),
    );
  }

  async update(id: string, input: UpdateCompanyDto, ctx: AdminContext): Promise<CompanyDto> {
    return this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.require(tx, id);
        const data: Prisma.CompanyUpdateInput = {};
        if (input.name !== undefined && input.name !== current.name) data.name = input.name;
        if (input.ruc !== undefined && input.ruc !== current.ruc) data.ruc = input.ruc;
        if (input.contactEmail !== undefined && input.contactEmail !== current.contactEmail) data.contactEmail = input.contactEmail;

        const fields = Object.keys(data);
        if (!fields.length) return toCompanyDto(current); // sin cambios reales: no se escribe ni se registra

        await this.assertAvailable(tx, { name: data.name as string | undefined, ruc: data.ruc as string | undefined }, id);
        const row = await tx.company.update({ where: { id }, data, select: COMPANY_SELECT });
        // El correo de contacto puede ser un dato personal: se registra que cambió, no su valor.
        const before: Record<string, string> = {};
        const after: Record<string, string> = {};
        for (const key of ['name', 'ruc'] as const) {
          if (key in data) {
            before[key] = current[key];
            after[key] = row[key];
          }
        }
        await this.audit(tx, ctx, 'COMPANY_UPDATED', id, { fields, before, after });
        return toCompanyDto(row);
      }),
    );
  }

  deactivate(id: string, ctx: AdminContext): Promise<CompanyDto> {
    return this.setActive(id, false, ctx);
  }

  activate(id: string, ctx: AdminContext): Promise<CompanyDto> {
    return this.setActive(id, true, ctx);
  }

  private setActive(id: string, active: boolean, ctx: AdminContext): Promise<CompanyDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, id);
      if (current.active === active) throw new ConflictException(active ? COMPANY_ALREADY_ACTIVE : COMPANY_ALREADY_INACTIVE);
      const row = await tx.company.update({ where: { id }, data: { active }, select: COMPANY_SELECT });
      await this.audit(tx, ctx, active ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED', id, { name: row.name });
      return toCompanyDto(row);
    });
  }

  private async require(db: Tx | PrismaService, id: string): Promise<CompanyRow> {
    const row = await db.company.findUnique({ where: { id }, select: COMPANY_SELECT });
    if (!row) throw new NotFoundException(COMPANY_NOT_FOUND);
    return row;
  }

  /**
   * Comprobación previa para dar un mensaje claro. La garantía real es el índice único de MySQL (que además compara
   * sin distinguir mayúsculas ni tildes, por la intercalación utf8mb4_unicode_ci); si dos solicitudes compiten,
   * `unique()` convierte el error P2002 en 409.
   */
  private async assertAvailable(tx: Tx, values: { name?: string; ruc?: string }, exceptId?: string): Promise<void> {
    const notSelf = exceptId ? { NOT: { id: exceptId } } : {};
    if (values.name !== undefined && (await tx.company.findFirst({ where: { name: values.name, ...notSelf }, select: { id: true } }))) {
      throw new ConflictException(COMPANY_NAME_TAKEN);
    }
    if (values.ruc !== undefined && (await tx.company.findFirst({ where: { ruc: values.ruc, ...notSelf }, select: { id: true } }))) {
      throw new ConflictException(COMPANY_RUC_TAKEN);
    }
  }

  private async unique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(COMPANY_DUPLICATE);
      throw error;
    }
  }

  private async audit(tx: Tx, ctx: AdminContext, action: CompanyAuditAction, companyId: string, data: Prisma.InputJsonValue) {
    await tx.auditLog.create({ data: { action, actorId: ctx.actor.id, entity: 'company', entityId: companyId, ip: ctx.ip, data } });
  }
}

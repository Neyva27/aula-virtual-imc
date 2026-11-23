import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CompanyScopeService } from '../../authz/company-scope.service.js';
import type { AuthUser } from '../../common/auth-user.js';
import { toUserDto, USER_PUBLIC_SELECT, type UserDto } from './user.dto.js';

export const USER_NOT_FOUND = 'No se encontró el usuario.';

/** Consulta segura de usuarios. La gestión (alta, edición, listados) llega en B2.2 y siguientes (decisión B1-c). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: CompanyScopeService,
  ) {}

  /** Perfil propio (`/auth/me`) y uso interno. No aplica el alcance por empresa: quien llama ya decidió el acceso. */
  async findById(id: string): Promise<UserDto> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_PUBLIC_SELECT });
    if (!row) throw new NotFoundException(USER_NOT_FOUND);
    return toUserDto(row);
  }

  /**
   * `GET /users/:id` (solo Instructor). B2.1: un estudiante solo es visible si pertenece a alguna empresa asignada al
   * Instructor autenticado; si no, se responde 404, igual que si no existiera. El propio usuario siempre es visible.
   * La consulta de otros instructores no tiene una regla institucional por empresa y se mantiene como en B1.1.
   */
  async findVisibleTo(actor: AuthUser, id: string): Promise<UserDto> {
    if (id !== actor.id) {
      const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (!target) throw new NotFoundException(USER_NOT_FOUND);
      if (target.role === Role.STUDENT) await this.scope.assertStudentInScope(actor, id, USER_NOT_FOUND);
    }
    return this.findById(id);
  }
}

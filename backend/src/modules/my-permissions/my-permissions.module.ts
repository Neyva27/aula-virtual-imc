import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser, Roles } from '../../common/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Permisos administrativos del usuario autenticado, leídos de la base en cada consulta. */
@Injectable()
export class MyPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async permissionsOf(actor: AuthUser): Promise<{ permissions: string[] }> {
    if (actor.role !== Role.INSTRUCTOR) return { permissions: [] };
    const rows = await this.prisma.instructorPermission.findMany({ where: { instructorId: actor.id }, select: { permission: true } });
    return { permissions: rows.map((r) => r.permission) };
  }
}

/**
 * NO es una ruta administrativa: la interfaz la usa para mostrar las opciones del panel de administración sin provocar
 * denegaciones en la bitácora. Se conservó al retirar la gestión de instructores (23/11/2026).
 */
@ApiTags('Sesión')
@ApiBearerAuth()
@Roles(Role.INSTRUCTOR)
@Controller('me/permissions')
export class MyPermissionsController {
  constructor(private readonly permissions: MyPermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Permisos administrativos de la cuenta autenticada.' })
  get(@CurrentUser() actor: AuthUser) {
    return this.permissions.permissionsOf(actor);
  }
}

@Module({
  controllers: [MyPermissionsController],
  providers: [MyPermissionsService],
})
export class MyPermissionsModule {}

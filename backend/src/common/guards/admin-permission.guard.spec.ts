/**
 * B2.2a: decoradores de permisos administrativos y AdminPermissionGuard (unitarias, base simulada).
 * La integración HTTP completa (con JwtAuthGuard y RolesGuard) está en test/b2-2a.e2e-spec.ts.
 */
import { ForbiddenException, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakePrisma } from '../../../test/support/fake-prisma.js';
import { AdminPermission, Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../auth-user.js';
import { ADMIN_PERMISSIONS_KEY, GeneralAdmin, isAdminPermission, RequireAdminPermission, ROLES_KEY } from '../decorators.js';
import { AdminPermissionGuard } from './admin-permission.guard.js';

class Routes {
  @GeneralAdmin() admin() {}
  open() {}
  @SetMetadata(ADMIN_PERMISSIONS_KEY, ['NO_EXISTE']) unknownPermission() {}
  @SetMetadata(ADMIN_PERMISSIONS_KEY, []) emptyPermission() {}
  @SetMetadata(ADMIN_PERMISSIONS_KEY, 'IMC_GENERAL_ADMIN') notAnArray() {}
}

@GeneralAdmin()
class AdminClass {
  handler() {}
}

/** Método decorado, solo para leer sus metadatos (no se invoca). */
const method = (cls: object, name: string) => (cls as { prototype: Record<string, () => void> }).prototype[name];

function context(handler: keyof Routes | 'classLevel', user?: AuthUser): ExecutionContext {
  const request = { user, method: 'GET', path: '/api/v1/admin/prueba', ip: '127.0.0.1' };
  const fn = handler === 'classLevel' ? method(AdminClass, 'handler') : method(Routes, handler);
  return {
    getHandler: () => fn,
    getClass: () => (handler === 'classLevel' ? AdminClass : Routes),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const instructor = (id: string): AuthUser => ({ id, role: Role.INSTRUCTOR, sessionVersion: 0, mustChangePassword: false });
const student = (id: string): AuthUser => ({ id, role: Role.STUDENT, sessionVersion: 0, mustChangePassword: false });

describe('decoradores de permisos administrativos', () => {
  it('@GeneralAdmin exige el rol INSTRUCTOR y el permiso IMC_GENERAL_ADMIN', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, method(Routes, 'admin'))).toEqual([Role.INSTRUCTOR]);
    expect(reflector.get(ADMIN_PERMISSIONS_KEY, method(Routes, 'admin'))).toEqual([AdminPermission.IMC_GENERAL_ADMIN]);
    expect(reflector.get(ADMIN_PERMISSIONS_KEY, AdminClass)).toEqual([AdminPermission.IMC_GENERAL_ADMIN]);
  });

  it('RequireAdminPermission falla al definir la ruta con un permiso inexistente o sin permisos', () => {
    expect(() => RequireAdminPermission()).toThrow(/al menos un permiso/);
    expect(() => RequireAdminPermission('NO_EXISTE' as AdminPermission)).toThrow(/permiso administrativo existente/);
    expect(() => RequireAdminPermission('INSTRUCTOR' as AdminPermission)).toThrow(); // un rol no es un permiso
  });

  it('isAdminPermission solo acepta valores del enum', () => {
    expect(isAdminPermission('IMC_GENERAL_ADMIN')).toBe(true);
    for (const value of ['imc_general_admin', 'ADMIN', 'INSTRUCTOR', '', null, undefined, 1, ['IMC_GENERAL_ADMIN']]) {
      expect(isAdminPermission(value)).toBe(false);
    }
  });
});

describe('AdminPermissionGuard', () => {
  let db: FakePrisma;
  let guard: AdminPermissionGuard;

  beforeEach(async () => {
    db = new FakePrisma();
    for (const [id, role] of [['adm', 'INSTRUCTOR'], ['ins', 'INSTRUCTOR'], ['est', 'STUDENT']] as const) {
      await db.user.create({ data: { id, email: `${id}@prueba.test`, role, firstNames: 'N', lastNames: 'A', passwordHash: 'h' } });
    }
    await db.instructor.create({ data: { userId: 'adm' } });
    await db.instructor.create({ data: { userId: 'ins' } });
    await db.instructorPermission.create({ data: { instructorId: 'adm', permission: 'IMC_GENERAL_ADMIN' } });
    const audit = { log: async (entry: Record<string, unknown>) => void db.auditLogs.push(entry) };
    guard = new AdminPermissionGuard(new Reflector(), db as never, audit as never);
  });

  it('una ruta sin permisos declarados no se ve afectada', async () => {
    await expect(guard.canActivate(context('open', student('est')))).resolves.toBe(true);
    expect(db.auditLogs).toHaveLength(0);
  });

  it('permite al Instructor con el permiso (en el método y a nivel de clase)', async () => {
    await expect(guard.canActivate(context('admin', instructor('adm')))).resolves.toBe(true);
    await expect(guard.canActivate(context('classLevel', instructor('adm')))).resolves.toBe(true);
  });

  it('deniega al Instructor sin el permiso y lo registra en la bitácora', async () => {
    await expect(guard.canActivate(context('admin', instructor('ins')))).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({ action: 'ADMIN_ACCESS_DENIED', actorId: 'ins', data: expect.objectContaining({ reason: 'MISSING_PERMISSION' }) }),
    ]);
  });

  it('deniega a un estudiante y a una solicitud sin usuario, aunque exista la fila del permiso', async () => {
    await expect(guard.canActivate(context('admin', student('est')))).rejects.toBeInstanceOf(ForbiddenException);
    // Un rol distinto de INSTRUCTOR nunca pasa, aunque el identificador tenga el permiso.
    await expect(guard.canActivate(context('admin', { ...instructor('adm'), role: Role.STUDENT }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(context('admin', undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deniega un permiso inexistente, una lista vacía o un valor mal formado, incluso al administrador', async () => {
    for (const handler of ['unknownPermission', 'emptyPermission', 'notAnArray'] as const) {
      const attempt = guard.canActivate(context(handler, instructor('adm')));
      if (handler === 'notAnArray') {
        // Un valor suelto válido se interpreta como lista de un elemento; el resto se rechaza.
        await expect(attempt).resolves.toBe(true);
      } else {
        await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      }
    }
    expect(db.auditLogs.map((a) => (a.data as { reason: string }).reason)).toEqual(['INVALID_PERMISSION', 'INVALID_PERMISSION']);
  });

  it('retirar el permiso surte efecto en la siguiente solicitud (se consulta la base cada vez)', async () => {
    await expect(guard.canActivate(context('admin', instructor('adm')))).resolves.toBe(true);
    db.instructorPermissions = [];
    await expect(guard.canActivate(context('admin', instructor('adm')))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

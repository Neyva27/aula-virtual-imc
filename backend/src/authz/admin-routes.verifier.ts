import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ADMIN_PERMISSIONS_KEY, ADMIN_ROUTE_PREFIX } from '../common/decorators.js';

function segments(path: unknown): string[] {
  const list = Array.isArray(path) ? path : [path ?? ''];
  return list.map((p) => String(p).replace(/^\/+|\/+$/g, ''));
}

function join(base: string, sub: string): string {
  return [base, sub].filter(Boolean).join('/');
}

/**
 * Rutas bajo el prefijo administrativo (`/admin/...`) que NO declaran ningún permiso administrativo, ni en el
 * método ni en la clase. Devuelve «Controlador.método (ruta)».
 */
export function findUnprotectedAdminRoutes(discovery: DiscoveryService, scanner: MetadataScanner, reflector: Reflector): string[] {
  const problems: string[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { metatype, instance } = wrapper;
    if (!metatype || !instance || typeof metatype !== 'function') continue;
    const basePaths = segments(Reflect.getMetadata(PATH_METADATA, metatype));
    for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
      const handler = (instance as Record<string, unknown>)[name];
      if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const routes = basePaths.flatMap((base) => segments(Reflect.getMetadata(PATH_METADATA, handler)).map((sub) => join(base, sub)));
      const isAdmin = routes.some((r) => r === ADMIN_ROUTE_PREFIX || r.startsWith(`${ADMIN_ROUTE_PREFIX}/`));
      if (!isAdmin) continue;
      const declared = [handler, metatype].some((target) => {
        const value: unknown = reflector.get(ADMIN_PERMISSIONS_KEY, target as never);
        return Array.isArray(value) && value.length > 0;
      });
      if (!declared) problems.push(`${metatype.name}.${name} (${routes.join(', ')})`);
    }
  }
  return problems;
}

/**
 * B2.2a: denegación por defecto también al definir rutas. Al arrancar, la aplicación se niega a iniciar si alguna
 * ruta bajo `/admin` no exige un permiso administrativo (por ejemplo, un controlador declarado con @Controller('admin/…')
 * en lugar de @AdminController). Así un olvido no deja una operación administrativa abierta.
 */
@Injectable()
export class AdminRoutesVerifier implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const problems = findUnprotectedAdminRoutes(this.discovery, this.scanner, this.reflector);
    if (problems.length) {
      throw new Error(`Rutas administrativas sin permiso declarado (usa @AdminController o @GeneralAdmin): ${problems.join('; ')}`);
    }
  }
}

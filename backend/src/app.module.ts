import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv, type Env } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuditModule } from './audit/audit.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { AdminPermissionGuard } from './common/guards/admin-permission.guard.js';
import { AdminRoutesVerifier } from './authz/admin-routes.verifier.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { skipUnlessAuthThrottled } from './common/throttle.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { MyPermissionsModule } from './modules/my-permissions/my-permissions.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { MailModule } from './mail/mail.module.js';
import { AccountActivationModule } from './modules/account-activation/account-activation.module.js';
import { AcademicModule } from './modules/academic/academic.module.js';
import { CertificateImportsModule } from './modules/certificate-imports/certificate-imports.module.js';

export const JWT_ISSUER = 'aula-virtual-imc';
export const JWT_AUDIENCE = 'aula-virtual-imc-api';

@Module({
  imports: [
    // En las pruebas (NODE_ENV=test) se ignora backend/.env: cada prueba define sus variables.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      ignoreEnvFile: process.env['NODE_ENV'] === 'test',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const ttl = config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000;
        return {
          errorMessage: 'Demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
          throttlers: [
            // Límite general por IP para toda la API.
            { name: 'default', ttl, limit: config.get('THROTTLE_LIMIT', { infer: true }) },
            // Límite estricto por IP para el inicio de sesión y la verificación pública (@AuthThrottle()).
            {
              name: 'auth',
              ttl,
              limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
              skipIf: skipUnlessAuthThrottled,
            },
          ],
        };
      },
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
    // B2.2a: para comprobar al arrancar que toda ruta /admin exige un permiso administrativo.
    DiscoveryModule,
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    // B2.2b: gestión de empresas (administración general, /admin/companies).
    CompaniesModule,
    // Permisos de la cuenta autenticada. La gestión de instructores se retiró el 23/11/2026.
    MyPermissionsModule,
    // B2.3a: consulta de estudiantes dentro del alcance por empresa del Instructor (/students).
    StudentsModule,
    // B2.3c: correo (abstracción; sin proveedor real todavía) y activación de cuentas (/auth/activate).
    MailModule,
    AccountActivationModule,
    // Módulo académico (18/11/2026): cursos, contenido, matrículas, evaluaciones, resultados y certificados.
    AcademicModule,
    CertificateImportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden: primero el límite de solicitudes (antes de tocar la base), luego autenticación, roles y (B2.2a) permisos
    // administrativos especiales.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AdminPermissionGuard },
    // B2.2a: la aplicación no arranca si una ruta /admin no exige un permiso administrativo.
    AdminRoutesVerifier,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

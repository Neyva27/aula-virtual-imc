import { BadRequestException, INestApplication, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.validation.js';
import { REFRESH_COOKIE } from './modules/auth/refresh-cookie.js';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/** Mensajes de validación en español. Los campos no permitidos (lista blanca) se nombran explícitamente. */
export function validationMessages(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([rule, message]) =>
      rule === 'whitelistValidation' ? `El campo «${field}» no está permitido.` : message,
    );
    return [...own, ...validationMessages(error.children ?? [], field)];
  });
}

/**
 * Configuración HTTP común a main.ts y a las pruebas de integración, para que las pruebas ejerciten
 * exactamente la misma aplicación que se ejecuta.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const express = app as NestExpressApplication;

  if (config.get('TRUST_PROXY', { infer: true })) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => new BadRequestException(validationMessages(errors)),
    }),
  );

  if (config.get('SWAGGER_ENABLED', { infer: true }) && config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Aula Virtual IMC — API')
        .setDescription('API REST del Aula Virtual IMC. Fase B1.1: autenticación y consulta segura de usuarios.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth(REFRESH_COOKIE)
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document);
  }
}

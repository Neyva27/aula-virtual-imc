import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/** Códigos de Prisma y mensajes del driver que indican que no hay conexión con MySQL. */
const DB_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const DB_UNAVAILABLE_TEXT = /pool failed to retrieve a connection|ECONNREFUSED|ETIMEDOUT|Access denied for user|connect timeout/i;

export function isDatabaseUnavailable(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientInitializationError) return true;
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return DB_UNAVAILABLE_CODES.has(exception.code) || DB_UNAVAILABLE_TEXT.test(exception.message);
  }
  return exception instanceof Error && DB_UNAVAILABLE_TEXT.test(exception.message);
}

/**
 * Formato único de errores: { statusCode, error, message }.
 * Los errores no previstos se registran en el servidor y el cliente recibe un mensaje genérico,
 * sin detalles internos (consultas, rutas, trazas).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, error: exception.name, message: body } : body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'Ya existe un registro con esos datos.',
      });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));

    if (isDatabaseUnavailable(exception)) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'El servicio no está disponible en este momento. Inténtalo nuevamente en unos minutos.',
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
    });
  }
}

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp, SWAGGER_PATH } from './app.setup.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Arranque');
  logger.log(`API disponible en http://localhost:${port}/${API_PREFIX}`);
  if (config.get('SWAGGER_ENABLED', { infer: true }) && config.get('NODE_ENV', { infer: true }) !== 'production') {
    logger.log(`Documentación Swagger en http://localhost:${port}/${SWAGGER_PATH}`);
  }
}
await bootstrap();

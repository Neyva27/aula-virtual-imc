import { Module } from '@nestjs/common';
import { CompanyScopeService } from './company-scope.service.js';

/** B2.1: infraestructura de autorización por empresa, para los módulos que gestionan estudiantes (B2.2 y siguientes). */
@Module({
  providers: [CompanyScopeService],
  exports: [CompanyScopeService],
})
export class AuthzModule {}

import { Module } from '@nestjs/common';
import { CertificateImportsController, ImportUploadInterceptor } from './certificate-imports.controller.js';
import { CertificateImportsService } from './certificate-imports.service.js';

/** Importación masiva de certificados (23/11/2026). Migración: 20261123000000_cierre_funcional. */
@Module({
  controllers: [CertificateImportsController],
  providers: [CertificateImportsService, ImportUploadInterceptor],
})
export class CertificateImportsModule {}

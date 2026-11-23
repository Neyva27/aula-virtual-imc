import { Module } from '@nestjs/common';
import { AuthzModule } from '../../authz/authz.module.js';
import { AccountActivationModule } from '../account-activation/account-activation.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StudentRegistrationService } from './student-registration.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

/** B2.3a–B2.3c: consulta, empresas, registro y reenvío de activación de estudiantes del alcance del Instructor. */
@Module({
  imports: [AuthzModule, AuthModule, AccountActivationModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentRegistrationService],
})
export class StudentsModule {}

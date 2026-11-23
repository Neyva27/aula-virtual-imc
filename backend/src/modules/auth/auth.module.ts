import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { RefreshCookie } from './refresh-cookie.js';
import { RefreshThrottleGuard } from './refresh-throttle.guard.js';
import { SessionService } from './session.service.js';

/** JwtModule se registra en AppModule (global), porque también lo usa JwtAuthGuard. */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, RefreshCookie, RefreshThrottleGuard],
  exports: [PasswordService],
})
export class AuthModule {}

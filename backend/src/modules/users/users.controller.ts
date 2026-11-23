import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser, Roles } from '../../common/decorators.js';
import type { AuthUser } from '../../common/auth-user.js';
import { UserDto } from './user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  @Roles(Role.INSTRUCTOR)
  @ApiOkResponse({
    type: UserDto,
    description:
      'Datos públicos del usuario (solo Instructor). Un estudiante solo es visible si pertenece a una empresa asignada ' +
      'al Instructor autenticado (B2.1).',
  })
  @ApiForbiddenResponse({
    description: 'El usuario autenticado no es Instructor, o debe cambiar su contraseña temporal (error «PasswordChangeRequired»).',
  })
  @ApiNotFoundResponse({ description: 'El usuario no existe o es un estudiante fuera de las empresas del Instructor.' })
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string): Promise<UserDto> {
    return this.users.findVisibleTo(actor, id);
  }
}

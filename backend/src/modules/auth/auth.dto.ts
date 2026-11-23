import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserDto } from '../users/user.dto.js';

/**
 * Política de contraseñas (B1.1): de 8 a 128 caracteres, con al menos una letra y un número. La usan el cambio de
 * contraseña y, desde B2.3c, la activación de la cuenta. Los decoradores se registran en el mismo orden que cuando
 * estaban escritos sobre la propiedad (de abajo arriba), así que los mensajes no cambian.
 */
export function NewPasswordPolicy() {
  return applyDecorators(
    Matches(/\d/, { message: 'La nueva contraseña debe incluir al menos un número.' }),
    Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, { message: 'La nueva contraseña debe incluir al menos una letra.' }),
    MaxLength(128, { message: 'La nueva contraseña es demasiado larga.' }),
    MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' }),
    IsString({ message: 'Ingresa la nueva contraseña.' }),
  );
}

export class LoginDto {
  @ApiProperty({ example: 'ana@ejemplo.test' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(191, { message: 'El correo es demasiado largo.' })
  email: string;

  @ApiProperty({ example: 'demo1234', format: 'password' })
  @IsString({ message: 'Ingresa tu contraseña.' })
  @MinLength(1, { message: 'Ingresa tu contraseña.' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga.' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Ingresa tu contraseña actual.' })
  @MinLength(1, { message: 'Ingresa tu contraseña actual.' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga.' })
  currentPassword: string;

  @ApiProperty({ format: 'password', minLength: 8, description: 'Al menos 8 caracteres, con letras y números.' })
  @NewPasswordPolicy()
  newPassword: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Token de acceso (JWT). Guardarlo solo en memoria.' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900, description: 'Segundos hasta que vence el token de acceso.' })
  expiresIn: number;

  @ApiProperty({ type: UserDto })
  user: UserDto;
}

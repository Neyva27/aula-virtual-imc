import { Body, Get, HttpCode, HttpStatus, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.js';
import { AdminController, CurrentUser } from '../../common/decorators.js';
import { CompanyDto, CreateCompanyDto, ListCompaniesQueryDto, UpdateCompanyDto } from './company.dto.js';
import { CompaniesService } from './companies.service.js';

/**
 * B2.2b: gestión de empresas. `@AdminController` monta las rutas en `/admin/companies` y exige, para TODAS, el rol
 * INSTRUCTOR y el permiso IMC_GENERAL_ADMIN (AdminPermissionGuard, consultado en la base en cada solicitud).
 * El actor de la bitácora sale del token; ningún identificador de usuario se toma de la petición.
 */
@ApiTags('Administración: empresas')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin el permiso de administración general, o con contraseña temporal pendiente de cambio.' })
@AdminController('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @ApiOkResponse({ type: [CompanyDto], description: 'Empresas ordenadas por nombre. Filtros: q (nombre o RUC) y active.' })
  @ApiBadRequestResponse({ description: 'Filtros no válidos o no permitidos.' })
  list(@Query() query: ListCompaniesQueryDto): Promise<CompanyDto[]> {
    return this.companies.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: CompanyDto })
  @ApiBadRequestResponse({ description: 'Datos no válidos o campos no permitidos.' })
  @ApiConflictResponse({ description: 'Ya existe una empresa con ese nombre o RUC.' })
  create(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Body() body: CreateCompanyDto): Promise<CompanyDto> {
    return this.companies.create(body, { actor, ip: ip ?? null });
  }

  @Get(':id')
  @ApiOkResponse({ type: CompanyDto })
  @ApiNotFoundResponse({ description: 'La empresa no existe.' })
  findOne(@Param('id') id: string): Promise<CompanyDto> {
    return this.companies.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CompanyDto, description: 'Actualiza nombre, RUC o correo de contacto. El estado tiene sus propias rutas.' })
  @ApiBadRequestResponse({ description: 'Datos no válidos o campos no permitidos (incluido `active`).' })
  @ApiNotFoundResponse({ description: 'La empresa no existe.' })
  @ApiConflictResponse({ description: 'Ya existe una empresa con ese nombre o RUC.' })
  update(
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() body: UpdateCompanyDto,
  ): Promise<CompanyDto> {
    return this.companies.update(id, body, { actor, ip: ip ?? null });
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompanyDto, description: 'Desactiva la empresa (sin borrarla ni tocar sus asociaciones).' })
  @ApiNotFoundResponse({ description: 'La empresa no existe.' })
  @ApiConflictResponse({ description: 'La empresa ya está desactivada.' })
  deactivate(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<CompanyDto> {
    return this.companies.deactivate(id, { actor, ip: ip ?? null });
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompanyDto, description: 'Reactiva una empresa desactivada.' })
  @ApiNotFoundResponse({ description: 'La empresa no existe.' })
  @ApiConflictResponse({ description: 'La empresa ya está activa.' })
  activate(@CurrentUser() actor: AuthUser, @Ip() ip: string, @Param('id') id: string): Promise<CompanyDto> {
    return this.companies.activate(id, { actor, ip: ip ?? null });
  }
}

import {
  BadRequestException,
  Body,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Ip,
  PayloadTooLargeException,
  Post,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiForbiddenResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Equals, IsString, Matches } from 'class-validator';
import type { AuthUser } from '../../common/auth-user.js';
import { AdminController, CurrentUser } from '../../common/decorators.js';
import { CertificateImportsService } from './certificate-imports.service.js';
import { IMPORT_MAX_BYTES } from './import-parser.js';

const FILE_MISSING = 'Selecciona un archivo Excel (.xlsx) o CSV (.csv).';
const FILE_TOO_LARGE = 'El archivo supera el tamaño máximo de 2 MB.';

interface UploadedImport {
  originalname: string;
  buffer: Buffer;
}

/** Multer en memoria (nada se escribe en disco), un archivo de hasta 2 MB. Se ejecuta DESPUÉS de los guards. */
@Injectable()
export class ImportUploadInterceptor implements NestInterceptor {
  private readonly inner = new (FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1, fields: 2, parts: 3 } }))();

  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new PayloadTooLargeException(FILE_TOO_LARGE);
      if (error instanceof HttpException && error.getStatus() !== 400 && !(error instanceof UnsupportedMediaTypeException)) throw error;
      throw new BadRequestException(FILE_MISSING);
    }
  }
}

export class ConfirmImportDto {
  @ApiProperty({ description: 'Huella SHA-256 devuelta por la vista previa.' })
  @Matches(/^[a-f0-9]{64}$/, { message: 'Analiza el archivo antes de confirmar la importación.' })
  @IsString({ message: 'Analiza el archivo antes de confirmar la importación.' })
  fileHash: string;

  @ApiProperty({ enum: ['true'], description: 'Confirmación expresa del usuario.' })
  @Equals('true', { message: 'Debes confirmar la importación.' })
  confirm: string;
}

function required(file: UploadedImport | undefined): UploadedImport {
  if (!file?.buffer) throw new BadRequestException(FILE_MISSING);
  return file;
}
/** Multer entrega el nombre en latin1: se recupera UTF-8 y se quita cualquier ruta. */
const cleanName = (name: string) => Buffer.from(name, 'latin1').toString('utf8').split(/[\\/]/).pop()!.slice(0, 255);

const FILE_BODY = { type: 'string', format: 'binary' } as const;

/** Importación masiva. `@AdminController`: rol INSTRUCTOR y permiso IMC_GENERAL_ADMIN en TODAS las rutas. */
@ApiTags('Administración: importación de certificados')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin el permiso de administración general.' })
@AdminController('certificate-imports')
export class CertificateImportsController {
  constructor(private readonly imports: CertificateImportsService) {}

  @Get('template')
  @ApiOperation({ summary: 'Columnas, niveles, límites y ejemplos ficticios de la plantilla.' })
  template() {
    return this.imports.template();
  }

  @Get()
  @ApiOperation({ summary: 'Últimas 20 importaciones realizadas por el usuario.' })
  history(@CurrentUser() actor: AuthUser) {
    return this.imports.history(actor);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(ImportUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: FILE_BODY }, required: ['file'] } })
  @ApiOperation({ summary: 'Analiza un .xlsx o .csv y devuelve la vista previa. NO guarda nada.' })
  preview(@CurrentUser() actor: AuthUser, @UploadedFile() file: UploadedImport | undefined) {
    const upload = required(file);
    return this.imports.preview(actor, upload.buffer, cleanName(upload.originalname));
  }

  @Post('confirm')
  @UseInterceptors(ImportUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: FILE_BODY, fileHash: { type: 'string' }, confirm: { type: 'string', enum: ['true'] } },
      required: ['file', 'fileHash', 'confirm'],
    },
  })
  @ApiOperation({ summary: 'Importa las filas válidas del MISMO archivo analizado, en una transacción.' })
  confirm(@CurrentUser() actor: AuthUser, @Ip() ip: string, @UploadedFile() file: UploadedImport | undefined, @Body() body: ConfirmImportDto) {
    const upload = required(file);
    return this.imports.confirm(actor, ip ?? null, upload.buffer, cleanName(upload.originalname), body.fileHash);
  }
}

# Backend del Aula Virtual IMC

API REST con **NestJS 12 + Prisma 7 + MySQL 8**. Proyecto independiente del frontend Angular (carpeta raíz):
tiene su propio `package.json` y no comparte dependencias ni configuración.

Estado: **fase B1.1** (base, autenticación y consulta segura de usuarios) y **subbloque B2.1** (estudiantes en varias
empresas o en ninguna, perfil de Instructor con sus empresas, cursos mínimos, matrículas y autorización por empresa)
y **subbloque B2.2a** (permiso especial de administración general de IMC, independiente del rol; sin rutas
administrativas funcionales en ese subbloque) y **subbloque B2.2b** (gestión de empresas en `/admin/companies`, probada con
la base simulada y pendiente de validación con MySQL) y **subbloque B2.2c** (asignación de instructores a empresas, en las
mismas condiciones).
Diseño completo y fases siguientes en `../docs/ARQUITECTURA_BACKEND.md` (B2.1: sección 20; B2.2a: sección 21; B2.2b:
sección 22; B2.2c: sección 23).

> **Estado de las migraciones (18/11/2026).** En `aula_imc_dev` están aplicadas B1.1, B2.1, B2.2a, B2.3c y
> `20261117000000_estudiantes_registrados_por_instructor`. **Pendiente de aplicar (con autorización y respaldo previo):**
> `prisma/migrations/20261118000000_modulo_academico` (solo AGREGA: columnas con valor por defecto en `courses` y
> `enrollments`, y las tablas vacías `course_modules`, `course_videos`, `video_progress`, `exams`, `exam_questions`,
> `exam_starts`, `exam_attempts` y `certificates`). Hasta aplicarla, las rutas académicas (`/courses`, `/me/...`,
> `/dashboard`, `/attempts`, `/certificates`) fallan con esa base. En `aula_imc_test` se aplican con `npm run test:db`.
> **Aplicada en `aula_imc_dev` el 20/11/2026 (con respaldo previo):** `prisma/migrations/20261120000000_sesiones_en_vivo`.
> **Aplicada en `aula_imc_dev` el 20/11/2026 (con respaldo previo):** `prisma/migrations/20261121000000_recuperaciones_examen`
> (solo AGREGA la tabla vacía `exam_recoveries`).
> Notas de las anteriores: la de B2.1 copia las asociaciones `students.company_id` a `student_companies` antes de
> retirar la columna; la de B2.2a crea la tabla vacía `instructor_permissions`; la de B2.3c agrega
> `users.activation_pending` (false para todas las cuentas existentes) y la tabla vacía `account_activation_tokens`.

## Requisitos

- Node.js 24 (probado con 24.22.0) y npm 11.
- MySQL 8.0 local (probado con 8.0.42, servicio `MySQL80`).

## Puesta en marcha (una sola vez)

1. **Crear las bases y el usuario de la aplicación.** En MySQL Workbench, con el usuario root, abrir y ejecutar
   `prisma/sql/crear-bases-locales.local.sql` (ya tiene la contraseña generada para tu `.env`; no se versiona).
   Si no existe, usar `prisma/sql/crear-bases-locales.sql` y reemplazar `CAMBIAR_ESTA_CLAVE` por la contraseña de
   `DATABASE_URL`. El script solo crea lo que falta: `aula_imc_dev`, `aula_imc_test`, `aula_imc_shadow` y el usuario
   `aula_imc`@`localhost` con permisos únicamente sobre esas tres bases. La API nunca se conecta como root.
2. **Variables de entorno.** `backend/.env` ya existe en esta máquina (generado con secretos aleatorios). En otra
   máquina: copiar `.env.example` a `.env` y completar. La aplicación no arranca si falta o es inválida una variable.
3. **Dependencias y cliente de Prisma.**
   ```bash
   npm install
   npm run prisma:generate
   ```
4. **Migraciones y datos de demostración** (en `aula_imc_dev`):
   ```bash
   npm run db:migrate   # aplica prisma/migrations (no borra datos)
   npm run db:seed      # crea las cuentas de demostración que falten; no modifica las existentes
   ```

## Uso

```bash
npm run start:dev      # desarrollo, con recarga
npm run build && npm run start:prod
```

- API: `http://localhost:3000/api/v1`
- Salud: `GET http://localhost:3000/api/v1/health`
- Swagger (solo desarrollo, `SWAGGER_ENABLED=true`): `http://localhost:3000/api/docs`

Cuentas de demostración (contraseña `SEED_DEMO_PASSWORD`, por defecto `demo1234`): `admin@ejemplo.test`
(Instructor) y `ana@`, `luis@`, `carla@`, `pedro@`, `rosa@`, `jorge@ejemplo.test` (estudiantes de la
«Empresa de demostración»). Son los mismos identificadores que la demo del frontend.

## Rutas de B1.1

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /auth/login` | Pública (límite estricto por IP) | Devuelve el token de acceso (15 min) y deja la cookie `imc_refresh` |
| `POST /auth/refresh` | Cookie + `X-Requested-With: XMLHttpRequest` | Rota la cookie y entrega un token de acceso nuevo |
| `POST /auth/logout` | Cookie + `X-Requested-With` | Cierra la sesión actual |
| `POST /auth/logout-all` | Autenticado | Cierra todas las sesiones del usuario |
| `GET /auth/me` | Autenticado | Perfil del usuario. B2.1: el estudiante trae `student.companies` (colección; antes `student.company`) |
| `PATCH /auth/password` | Autenticado | Cambia la contraseña y cierra todas las sesiones |
| `GET /users/:id` | Instructor | Consulta segura de un usuario. B2.1: un estudiante solo es visible si pertenece a una empresa asignada al Instructor autenticado (si no, 404) |
| `GET /health` | Pública | Estado de la API y de MySQL |

## Consulta de estudiantes (B2.3a)

Rol Instructor. **No** es una ruta administrativa: el acceso depende solo de las empresas asignadas al Instructor
autenticado (el permiso `IMC_GENERAL_ADMIN` no da acceso a estudiantes).

| Método y ruta | Descripción |
|---|---|
| `GET /students?q&companyId&page&pageSize` | Estudiantes que comparten al menos una empresa con el Instructor. `q`: nombres, apellidos, correo o DNI. `companyId`: una empresa propia (si no, 404). `page` ≥ 1 (máx. 10 000) y `pageSize` de 1 a 100 (20 por defecto). Respuesta `{ items, total, page, pageSize }` |
| `GET /students/:id` | Detalle. Inexistente o fuera del alcance: el mismo 404 |

La respuesta solo incluye id, correo, nombres, apellidos, nombre completo, DNI, estado de la cuenta y las empresas del
estudiante **que pertenecen al Instructor**.

**Empresas de estudiantes (B2.3b):**

| Método y ruta | Descripción |
|---|---|
| `POST /students/:id/companies` | `{ companyIds[] }` (1 a 50; repetidos ignorados): asigna empresas **propias** a un estudiante que el Instructor ya ve. Todo o nada. 409 si la cuenta del estudiante o alguna empresa están inactivas. Respuesta `{ created, alreadyAssigned, student }` |
| `DELETE /students/:id/companies/:companyId` | Retira la asociación con una empresa propia (permitido aunque esté inactiva). 409 si es la **única** empresa del estudiante. Respuesta `{ studentId, companyId, stillVisible }` |

**Registro y activación de estudiantes (B2.3c):**

| Método y ruta | Descripción |
|---|---|
| `POST /students` | Instructor. `{ firstNames, lastNames, email, dni, companyIds[] }` (al menos una empresa propia y activa). Crea la cuenta **pendiente de activación**, sin matrículas, y envía el enlace por correo. 409 si el correo o el DNI ya existen. Respuesta 201 `{ student, activation: { status, emailDelivery, expiresAt } }`, sin el token |
| `POST /students/:id/activation-email` | Instructor. Reenvía el enlace (uno nuevo; el anterior deja de servir). 409 si la cuenta ya está activada o desactivada |
| `POST /auth/activate` | Pública (límite estricto). `{ token, newPassword }`: el estudiante crea su contraseña. 204. Enlace no válido, vencido o usado: el mismo 400 |

Una cuenta pendiente no puede iniciar sesión (mismo 401 que una contraseña incorrecta).

El retiro solo borra la relación. Las escrituras bloquean la fila del estudiante y usan `READ COMMITTED` para que la
regla «al menos una empresa» resista solicitudes simultáneas (pendiente de validar con MySQL). El alta y la edición de
estudiantes no están implementadas (B2.3c y B2.3d; el alta depende de D17).

## Rutas de administración general (B2.2b)

Todas exigen rol Instructor **y** el permiso `IMC_GENERAL_ADMIN` (`@AdminController`). Sin el permiso: 403; sin
sesión: 401. Cada cambio queda en la bitácora, en la misma transacción.

| Método y ruta | Descripción |
|---|---|
| `GET /admin/companies?q&active` | Empresas ordenadas por nombre; `q` busca en nombre o RUC; `active` = `true`/`false` |
| `POST /admin/companies` | Registra una empresa: `name` (hasta 150), `ruc` (obligatorio, 11 caracteres, único; su formato institucional sigue pendiente y no se valida el contenido), `contactEmail` opcional |
| `GET /admin/companies/:id` | Detalle |
| `PATCH /admin/companies/:id` | Cambia `name`, `ruc` o `contactEmail` (`null` lo borra). La corrección del RUC está autorizada (12/11/2026) y queda en la bitácora con el valor anterior y el nuevo. El estado no se cambia aquí |
| `POST /admin/companies/:id/deactivate` | Desactiva sin borrar. Conserva historial, asociaciones y acceso a los registros existentes. Las futuras operaciones de asignación y matrícula deberán rechazar empresas inactivas (aún no existen; ver `docs/ARQUITECTURA_BACKEND.md`, 22.9) |
| `POST /admin/companies/:id/activate` | Reactiva (confirmado el 12/11/2026), conservando las asociaciones |

**Asignación de instructores a empresas (B2.2c):**

| Método y ruta | Descripción |
|---|---|
| `GET /admin/instructors?q&active` | Instructores con sus empresas (`q`: nombres, apellidos o correo; `active`: estado de la cuenta) |
| `GET /admin/instructors/:instructorId` | Un instructor con sus empresas (404 si no es instructor) |
| `GET /admin/companies/:companyId/instructors` | Instructores asignados a una empresa |
| `POST /admin/instructor-assignments` | `{ instructorIds[], companyIds[] }`: asigna cada instructor a cada empresa (1 a 50 por lista). Lo existente no se duplica. Todo o nada |
| `PUT /admin/instructors/:instructorId/companies` | `{ companyIds[] }`: reasignación; el instructor queda exactamente con esas empresas (vacía = ninguna) |
| `DELETE /admin/instructors/:instructorId/companies/:companyId` | Retira una asignación (solo la relación; no borra datos académicos) |

- **Empresa inactiva o instructor con la cuenta inactiva:** no admiten asignaciones nuevas (409). Las existentes se
  conservan y se pueden retirar.
- **Autoasignación:** el administrador general puede asignarse a sí mismo (si tiene perfil de Instructor); queda en la
  bitácora como cualquier asignación. Ser administrador no da empresas automáticamente.
- **Bitácora:** cada asignación o retiro queda registrado (`INSTRUCTOR_COMPANY_ASSIGNED` / `_REMOVED`) con actor, IP y
  operación.
- **Alcance:** retirar una asignación corta el acceso del Instructor a los estudiantes que ya no comparte por ninguna
  empresa.

No hay borrado físico de empresas. Para usar estas rutas contra MySQL hay que aplicar antes las migraciones de B2.1 y
B2.2a y habilitar una cuenta con `admin:grant-general` (todo con autorización).

## Roles y permiso de administración general (B2.2a)

- **Roles:** solo `INSTRUCTOR` y `STUDENT` (D-4).
- **Permiso `IMC_GENERAL_ADMIN`:** la administración general de IMC es un permiso especial que tienen **algunos**
  Instructores. **No es un rol:** la cuenta sigue siendo `INSTRUCTOR`. Se guarda en `instructor_permissions` y se
  comprueba en la base en cada solicitud (no va en el token).
- **Rutas administrativas:** se declaran con `@AdminController('…')` (prefijo `/admin`, protege toda la clase) o con
  `@GeneralAdmin()`. Un Instructor sin el permiso o un estudiante recibe 403. **La API no arranca** si una ruta `/admin`
  no exige el permiso. Todavía no hay rutas administrativas funcionales (B2.2b).
- **Cómo se otorga:** solo con `npm run admin:grant-general`. Ninguna ruta HTTP otorga ni retira permisos.

## Correo de activación (B2.3c)

**No hay proveedor de correo real integrado.** El envío pasa por la interfaz `MailSender` (`src/mail/mail-sender.ts`).
El proveedor actual, `UnconfiguredMailSender`, **no envía nada y lo informa**. Por eso el registro responde
`emailDelivery: "NOT_CONFIGURED"` y la cuenta queda pendiente; el enlace se reenvía cuando haya proveedor.

**Para enviar correos reales** (requiere autorización):
1. Implementar `MailSender` con un proveedor (SMTP o API de un servicio transaccional, según el hosting).
2. Registrarlo en `src/mail/mail.module.ts`.
3. Definir sus variables de entorno sin valores en el repositorio: servidor, puerto y TLS, usuario y clave o clave de
   API, y remitente. Configurar SPF, DKIM y DMARC del dominio remitente.

| Variable (opcional) | Uso |
|---|---|
| `ACTIVATION_URL` | Pantalla de activación del frontend; el correo enlaza a `<ACTIVATION_URL>#token=<token>`. URL válida, sin `#`; https en producción. Sin ella no se envían correos. En local: `http://localhost:4200/activar-cuenta` (pantalla de Angular, solo en modo API) |
| `ACTIVATION_TOKEN_TTL_HOURS` | Vigencia del enlace: 72 h por defecto (de 1 a 336) |
| `MAIL_DEV_CONSOLE` | **Solo desarrollo local** (falso por defecto). Con `true`, el enlace se escribe en la consola del backend en lugar de enviarse por correo y la respuesta indica `emailDelivery: "DEV_CONSOLE"` (nunca se simula un envío). Requiere `ACTIVATION_URL`. **La API no arranca** si es `true` con `NODE_ENV=production` |

**Prueba local sin proveedor de correo** (`MAIL_DEV_CONSOLE=true` y `ACTIVATION_URL=http://localhost:4200/activar-cuenta`
en `backend/.env`, y reiniciar el backend): al registrar un estudiante, la consola del backend muestra un aviso
`[ActivacionDesarrollo]` con el enlace. Abrirlo en el navegador (con el frontend en `npm run start:api`), crear la
contraseña e iniciar sesión. Los valores de `emailDelivery` son: `SENT` (el proveedor aceptó el mensaje), `FAILED`,
`NOT_CONFIGURED` (sin proveedor o sin `ACTIVATION_URL`) y `DEV_CONSOLE` (solo desarrollo).

**Visibilidad de estudiantes (17/11/2026):** cada Instructor ve y gestiona **solo a los estudiantes que registró**
(`students.registered_by`, migración `20261117000000_estudiantes_registrados_por_instructor`); fuera de ese alcance la
API responde 404. Las empresas son **opcionales** al registrar. Los estudiantes anteriores a la migración quedan sin
`registered_by` y no son visibles para ningún Instructor (no se asignan automáticamente).

## Portadas de curso (19/11/2026)

El Instructor sube la portada desde su equipo. El archivo se guarda en disco y en MySQL (`courses.cover_image`, `VARCHAR(500)`) solo su ruta pública. Nunca se guarda Base64. No requiere migración.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| PUT | `/api/v1/courses/:courseId/cover` | Instructor dueño del curso | Multipart, campo `file`. JPG, PNG o WebP de hasta 2 MB, validado por su firma binaria y su tipo MIME. Guarda `<UUID>.<ext>`, actualiza el curso y borra la portada subida anterior solo después de guardar. |
| GET | `/api/v1/public/course-covers/:archivo` | Público (la usa `<img>`) | Solo nombres `<UUID v4>.jpg/png/webp`; cualquier otro responde 404 sin revelar rutas. Cabeceras `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: cross-origin` y caché inmutable. |

- **Carpeta:** `<UPLOADS_DIR>/course-covers/`. `UPLOADS_DIR` es opcional (por defecto `storage`, relativa a `backend/`). La carpeta `backend/storage/` no se versiona: **respáldala junto con la base de datos**.
- **Edición del curso (`PUT /courses/:id`):** acepta la ruta de una portada subida solo si es la del propio curso. Si se cambia a «sin portada», a una de demostración o a una dirección https, el archivo subido anterior se borra después de guardar.
- **Direcciones https:** máximo 500 caracteres (mensaje en español).

## Sesiones en vivo con Google Meet (20/11/2026)

Requieren la migración `20261120000000_sesiones_en_vivo` (tabla `course_live_sessions`, aditiva; módulo opcional y enlace de grabación), aplicada en `aula_imc_dev` el 20/11/2026.

| Método | Ruta | Acceso |
|---|---|---|
| GET / POST | `/api/v1/courses/:courseId/live-sessions` | Instructor dueño del curso |
| PUT | `/api/v1/courses/:courseId/live-sessions/:sessionId` | Instructor dueño (editar) |
| PUT | `/api/v1/courses/:courseId/live-sessions/:sessionId/status` | Instructor dueño (`programada` o `cancelada`) |
| PUT | `/api/v1/courses/:courseId/live-sessions/:sessionId/recording` | Instructor dueño: enlace https de la grabación de una clase ya realizada (`null` la quita) |
| GET | `/api/v1/me/courses/:courseId/live-sessions` | Estudiante matriculado en un curso disponible (incluye las canceladas) |

- **Enlaces:** solo `https://meet.google.com/abc-defg-hij`.
- **Fecha:** el inicio se guarda en UTC y el frontend lo muestra en hora de Lima.
- **Sesiones:** nunca se borran; se cancelan.

## Recuperación de exámenes (21/11/2026)

Usa la tabla `exam_recoveries` (migración `20261121000000_recuperaciones_examen`, aplicada en `aula_imc_dev`).
Decisión definitiva (20/11/2026): la recuperación se rinde **solo con el examen original** del curso (sin duplicarlo ni
modificarlo). La modalidad «independiente» ya no se autoriza (400) y la ruta para crear exámenes de recuperación se
retiró; las filas históricas con esa modalidad se siguen leyendo y rindiendo. Solo sobre participantes registrados por
el Instructor (`students.registered_by`).

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/v1/recovery-states?courseId&userId` | Instructor: situación de cada matriculado (desaprobados → «pendiente») |
| GET | `/api/v1/recoveries?courseId&userId` | Instructor: recuperaciones de sus cursos |
| POST | `/api/v1/recoveries` | Instructor: autoriza (solo desaprobados; siempre el examen original, `mode` opcional = `original`; ventana con zona horaria) |
| PUT | `/api/v1/recoveries/:recoveryId/cancel` | Instructor: anula antes del inicio |
| GET | `/api/v1/me/courses/:courseId/recovery` | Estudiante: su propia situación |

- **Rendir:** el estudiante usa las rutas de siempre (`exam/availability`, `exam/start`, `exam/answers` y `exams/:id/submit`). Con una recuperación vigente, operan sobre la recuperación.
- **Intentos:** el intento regular no se modifica; el de recuperación es `kind = RECUPERACION`.

## Seguridad implementada

- Contraseñas con **argon2id** (19 MiB, 2 iteraciones). Correo inexistente y contraseña incorrecta: mismo mensaje y
  mismo tiempo de respuesta.
- **Bloqueo de 15 minutos tras 5 intentos fallidos** y **límite de solicitudes por IP** (general y estricto en
  inicio de sesión y renovación).
- Token de acceso JWT HS256 de 15 minutos, solo con `sub`, `role` y versión de sesión. En cada solicitud se comprueba
  en la base que el usuario siga activo y que su sesión no se haya cerrado.
- Token de renovación aleatorio de 256 bits en cookie **HttpOnly**, `SameSite` configurable, **Secure obligatorio en
  producción**, limitado a `/api/v1/auth`. En la base solo se guarda su hash. **Rotación** en cada uso, vencimiento
  absoluto de 7 días y **revocación de toda la sesión** si se reutiliza un token ya rotado.
- Todas las rutas protegidas por defecto (`JwtAuthGuard` global); las públicas se marcan con `@Public()`. Roles con
  `@Roles()`.
- Validación de entrada con lista blanca (campos no declarados → 400), `helmet`, CORS restringido, sin `x-powered-by`,
  errores sin detalles internos, bitácora (`audit_logs`) sin contraseñas ni tokens.

## Pruebas

```bash
npm test            # unitarias (no requieren MySQL)
# test:db también ejecuta db:check-clean y admin:create como procesos reales, siempre contra aula_imc_test
npm run test:e2e    # integración HTTP con la app completa y una base simulada en memoria (no requieren MySQL; archivos en serie)
npm run test:db     # contra MySQL real: base aula_imc_test (requiere el paso 1)
npm run typecheck && npm run lint
```

`test:db` aplica las migraciones en `aula_imc_test` y **vacía sus tablas** antes de cada prueba. Por seguridad, se
niega a ejecutarse si `TEST_DATABASE_URL` no apunta a una base cuyo nombre termine en `_test`.

## Producción: empezar con una base limpia

La semilla de demostración es **solo para desarrollo**. Una base de producción nunca debe contener las cuentas
ficticias: los datos reales se crean desde la plataforma.

| Protección | Cómo funciona |
|---|---|
| Semilla con frenos (`npm run db:seed`) | Antes de escribir exige: `NODE_ENV` distinto de `production`, base cuyo nombre termine en `_dev` o `_test`, `SEED_DEMO_ALLOWED=true` y que no haya usuarios ni empresas reales. Si falla una, no escribe nada. Además, la API no arranca en producción con `SEED_DEMO_ALLOWED=true`. |
| `npm run db:check-clean` | Solo lectura. Código 0 si la base no tiene empresas, usuarios ni estudiantes de demostración; código 1 si los tiene (e informa cuántos). |
| `npm run admin:create` | Crea el **primer** Instructor con una contraseña temporal fuerte (se muestra una sola vez, solo se guarda su hash) y lo registra en la bitácora. Se niega si ya existe un Instructor activo. |
| `npm run admin:grant-general` (B2.2a) | Otorga el permiso de administración general a la **primera** cuenta: un Instructor que ya existe, activo y con perfil de Instructor. Se niega si ya hay una cuenta activa con el permiso. No crea usuarios ni cambia el rol, la contraseña o las sesiones. Lo registra en la bitácora. |
| Cambio obligatorio de contraseña | Mientras `mustChangePassword` esté activo, la API solo permite ver el perfil, cambiar la contraseña, renovar y cerrar sesión; el resto responde 403 `PasswordChangeRequired`. |

Procedimiento (cuando se confirme el hosting):

```bash
# backend/.env de producción: NODE_ENV=production, base nueva y vacía, SEED_DEMO_ALLOWED=false (o ausente)
npm ci && npm run build
npm run db:migrate          # solo crea las tablas
npm run db:check-clean      # debe terminar con «LIMPIA» (código 0)
npm run admin:create        # interactivo; o con --email= --nombres= --apellidos= --si
npm run admin:grant-general # B2.2a, con el mismo correo; interactivo o con --email= --si
```

El primer Instructor inicia sesión con la contraseña temporal y la cambia.
- **Tras `admin:grant-general` (B2.2a)**, esa cuenta tiene además el permiso de administración general. Con él creará empresas, registrará
  instructores y los asignará a empresas. **Implementado:** gestión de empresas (B2.2b) y asignación de instructores
  a empresas (B2.2c). **Pendiente:** registro (alta) de instructores.
- Los estudiantes, cursos y matrículas los gestionan los Instructores, dentro de sus empresas (módulos de B2 y B3).

`db:check-clean`, `admin:create` y `admin:grant-general` se compilan con la API (`dist/cli/`): no necesitan las
dependencias de desarrollo. En local, ejecutar `npm run build` antes.

## Solución de problemas

- **`P1000: Authentication failed` / `ER_ACCESS_DENIED_ERROR`:** la contraseña de `aula_imc` en MySQL no coincide con
  `DATABASE_URL`. Ejecutar en Workbench (root) `prisma/sql/sincronizar-clave-aula-imc.local.sql`, que aplica un
  `ALTER USER` con la contraseña del `.env` sin borrar nada. Comprobar con `npm run db:status`.
- **`ER_CANNOT_RETRIEVE_RSA_KEY`:** MySQL 8 sin SSL (`caching_sha2_password`). Con MySQL en el mismo equipo, poner
  `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true` en `.env`; con otro servidor, configurar SSL (la API rechaza la opción si el
  host no es localhost).

## Notas

- npm 11 bloquea los scripts de instalación de dependencias. No hacen falta: `argon2` trae binarios precompilados y
  Prisma incluye su motor. Quedan sin aprobar (`npm install-scripts ls`).
- El cliente de Prisma se genera en `src/generated/prisma` (no se versiona).
- `AGENTS.md` lo generó la plantilla de NestJS. Menciona un servicio de telemetría externo que **no está activado**
  en este proyecto.

## Certificados del Instructor y validación pública (20/11/2026)

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/v1/certificates?student&code&companyId&from&to&courseId&userId` | Instructor: certificados de sus cursos y de los participantes que registró; filtros opcionales y combinables |
| GET | `/api/v1/public/certificates/dni/:dni` | Público (sin sesión, límite de solicitudes): solo titular, curso, código, fecha de emisión y estado |

- **Filtros:** `student` busca por nombre, apellido o nombre completo (parcial, sin distinguir mayúsculas ni tildes); `code`, código completo o parcial; `companyId`, empresa del participante; `from` y `to`, fecha de emisión AAAA-MM-DD (hora de Lima). Se validan con `CertificateQueryDto`.
- **Aislamiento:** la empresa solo filtra dentro del alcance del Instructor (`registered_by`); compartir empresa con otro Instructor no da acceso a sus participantes.
- **Validación pública:** el DNI debe tener 8 dígitos; un DNI mal formado o sin certificados responde `[]` (sin revelar si existe una cuenta).

## Cierre funcional (23/11/2026)

Migración: `20261123000000_cierre_funcional` (aditiva, aplicada en `aula_imc_dev`).

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/v1/students` | Instructor: acepta `whatsapp` opcional |
| PATCH | `/api/v1/students/:id/contact` | Instructor: actualiza o quita (`null`) el WhatsApp de un participante propio |
| GET | `/api/v1/courses?level=` | Instructor: filtra por nivel o `pendiente` |
| POST, PUT | `/api/v1/courses`, `/api/v1/courses/:courseId` | Instructor: aceptan `level` (`persona_autorizada`, `persona_competente`, `persona_certificada` o `null`) |
| GET | `/api/v1/admin/certificate-imports/template` | Administración general: columnas, niveles, límites y ejemplos |
| GET | `/api/v1/admin/certificate-imports` | Administración general: últimas 20 importaciones propias |
| POST | `/api/v1/admin/certificate-imports/preview` | Administración general: analiza `.xlsx` o `.csv`; no guarda nada |
| POST | `/api/v1/admin/certificate-imports/confirm` | Administración general: `file`, `fileHash` y `confirm=true`; importa en una transacción |

Guía de la importación: `docs/IMPORTACION_CERTIFICADOS.md`.

## Activación manual por WhatsApp (23/11/2026)

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/v1/students/:id/activation-whatsapp` | Instructor: genera el enlace (anula los anteriores) y devuelve el `wa.me` preparado. No envía nada. Sin caché |
| POST | `/api/v1/students/:id/activation-whatsapp/opened` | Instructor: registra que se abrió WhatsApp (no implica envío) |
| GET | `/api/v1/students/:id/activation-status` | Instructor: estado real del enlace |

Requiere `ACTIVATION_URL`. Guía de despliegue: `docs/PUBLICACION.md`.

## Gestión de instructores retirada (23/11/2026)

Ya no existen `/admin/instructors`, `/admin/instructor-assignments` ni `/admin/companies/:companyId/instructors`; las referencias anteriores a esas rutas son históricas. Se conservan `GET /me/permissions`, `npm run admin:create` y `npm run admin:grant-general`. No hubo cambios en Prisma.

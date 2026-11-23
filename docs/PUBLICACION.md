# Guía para publicar Aula Virtual IMC

Para quien despliegue el sistema. Preparada el 23/11/2026. **Todavía no se ha desplegado nada.**

## Arquitectura recomendada

Un solo dominio con HTTPS:

- `https://<dominio>/`: archivos estáticos de Angular.
- `https://<dominio>/api/`: proxy inverso hacia NestJS (Node.js).
- MySQL 8: base **nueva y exclusiva de producción**. No se reutiliza `aula_imc_dev`, que contiene datos de prueba.

## Requisitos del hosting

- [ ] Node.js compatible con el proyecto (en desarrollo se usa 24) y proceso persistente (PM2, systemd o equivalente).
- [ ] MySQL 8 con un usuario exclusivo, que no sea `root`. Si está en otro servidor, conexión con SSL.
- [ ] Proxy inverso (Nginx, Apache o el del proveedor) y certificado HTTPS.
- [ ] Carpeta persistente y con respaldo para las portadas (`UPLOADS_DIR`).
- [ ] Respaldos automáticos de MySQL.

## Variables de entorno del backend

Se cargan en el servidor. Nunca se copian a archivos versionados.

| Variable | Valor en producción |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Puerto interno de la API |
| `DATABASE_URL` | Base de producción, con usuario exclusivo |
| `DB_ALLOW_PUBLIC_KEY_RETRIEVAL` | `false` si MySQL no está en el mismo equipo |
| `JWT_ACCESS_SECRET` | Secreto **nuevo** de 32 caracteres o más |
| `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TTL_DAYS` | Vigencia de la sesión |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `strict` con un solo dominio |
| `CORS_ORIGIN` | `https://<dominio>` (nunca `*`) |
| `TRUST_PROXY` | `true` detrás del proxy inverso |
| `SWAGGER_ENABLED` | `false` |
| `SEED_DEMO_ALLOWED` | `false` |
| `MAIL_DEV_CONSOLE` | `false` |
| `ACTIVATION_URL` | `https://<dominio>/activar-cuenta` |
| `ACTIVATION_TOKEN_TTL_HOURS` | 72 por defecto |
| `UPLOADS_DIR` | Carpeta persistente |
| `LOGIN_*`, `THROTTLE_*`, `AUTH_THROTTLE_LIMIT` | Límites de seguridad |

No definir en producción: `SEED_DEMO_PASSWORD`, `TEST_DATABASE_URL` ni `SHADOW_DATABASE_URL`.

## Pasos

1. Respaldar la base de destino, si ya existe.
2. Backend: `npm ci`, `npm run build`, `npm run db:migrate` y revisar `npm run db:status`.
3. Crear el primer Instructor con `npm run admin:create` y otorgar el permiso con `npm run admin:grant-general`.
4. Comprobar `npm run db:check-clean`. **Nunca ejecutar la semilla en producción.**
5. Frontend: `npm ci` y **`npm run build:api`**. Publicar `dist/aula-virtual-imc/browser`.
6. Proxy: `/api/` hacia NestJS y las demás rutas hacia `index.html`, para que funcionen `/validar-certificado` y `/activar-cuenta`.
7. Probar en el dominio: inicio de sesión, activación, examen, certificado y validación pública.

> **Importante:** `npm run build` genera el **modo demostración**, que guarda datos en el navegador. Para publicar se usa
> siempre `npm run build:api`.

## Pendientes antes de publicar

- Proveedor de hosting, dominio y datos de MySQL de producción.
- Número oficial de WhatsApp de soporte (`src/app/core/config/support.config.ts`).
- Proveedor de correo: sin él, la activación se hace por WhatsApp manual.
- Certificado oficial: logotipo, firma, diseño y textos. Se reemplazan en
  `src/app/core/services/certificate.service.ts` y `src/app/features/certificates/certificate-view/`. También se quitan
  los avisos «PLANTILLA PROVISIONAL» y «QR de prueba».

## Riesgos a vigilar

- El enlace de activación da acceso a crear la contraseña: se comparte solo con su titular. Es de un solo uso y vence.
- Los reportes y respaldos contienen DNI y datos personales: guardarlos con acceso restringido.
- No publicar `backend/.env`, respaldos `.sql` o `.json`, ni la carpeta de portadas fuera de su ruta pública.

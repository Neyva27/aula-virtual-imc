# PROMPT PARA CLAUDE CODE — Frontend del Aula Virtual IMC (prioridad: certificados)

> Pégalo completo en Claude Code, con la terminal abierta en la carpeta raíz del proyecto Angular.
> Antes: copia a `docs/referencias/` las reglas de negocio (PDF) y la transcripción de la reunión (docx).

---

## 1. Rol y contexto

Actúa como desarrollador frontend senior Angular y diseñador UX/UI con experiencia en plataformas e-learning y emisión de certificados digitales.

Trabajas dentro de mi proyecto local en Visual Studio Code. Soy desarrolladora y voy a revisar, ejecutar y presentar lo que construyas. **Esta etapa es solo frontend**: una propuesta navegable en `localhost:4200` con datos mock, que se presentará a la empresa el **lunes 19 de octubre de 2026** para su aprobación. Después se desarrollará el backend.

**Cliente:** IM Corporación SST Perú (RUC 20550299977), empresa de capacitación y certificación en Seguridad y Salud en el Trabajo. Sitio de referencia: https://sstperu-im.com/ (WordPress; no se modifica ni se reconstruye).

**Decisiones tomadas en la reunión de definición (13/10/2026):**
- El Aula Virtual se construye **desde cero**, frontend primero, en local; luego se despliega.
- Experiencia tipo **Hotmart**: el usuario entra y ve **su curso** (no un catálogo de compras), con módulos/videos en una vista de curso.
- **No hay auto-registro**: la **empresa registra** al participante y le entrega usuario y contraseña.
- Flujo: iniciar sesión → curso asignado → videos → examen cronometrado → certificado digital si aprueba → descarga desde su cuenta.
- El certificado parte de una **plantilla del diseñador de la empresa** (aún no disponible para mí). Debe llevar **QR** con el código del certificado, **fecha de emisión**, **horas de formación**, código único, nombre completo, nombre del curso y fecha de aprobación. El QR lleva a la página de verificación.
- Actualmente existe en la web una página "Verificar certificado" que consulta por **DNI**. La nueva verificación debe convivir con ella.
- La escala de nota (sobre 100 o sobre 20) **no está definida**; es posible que sea sobre 100.
- Las reglas de negocio **no están completas** (Yesenia Huamani lo indicó). No inventes lo que falta.

Lee los documentos en `docs/referencias/` antes de proponer nada. Si no los encuentras, pídemelos.

## 2. Identidad visual

- Color corporativo verificado: azul oscuro **#0A1E50**. Úsalo como base, con blancos, grises y **un** color de acento discreto. Define todo como variables CSS.
- Sobrio, claro y confiable. Evita lo recargado o decorativo. Prioriza usabilidad y legibilidad.
- **No uses ni inventes logotipos.** Deja un componente `LogoPlaceholder` fácil de reemplazar por el SVG autorizado que yo agregue en `src/assets/brand/`.
- **No inventes** firmas, sellos, acreditaciones, datos legales ni contenido oficial de capacitación.
- Interfaz en **español (Perú)**, fechas `dd/mm/aaaa`, hora local.
- Responsive (escritorio, tablet, móvil), accesibilidad básica, foco visible y navegación por teclado.

## 3. Tecnología

- Angular con TypeScript (usa la versión instalada), componentes standalone, Angular Router, formularios reactivos, CSS por componente + estilos globales.
- Servicios mock detrás de **interfaces** (por ejemplo `CertificateRepository`) para sustituirlos luego por HTTP sin tocar las pantallas.
- LocalStorage solo para conservar el estado de la demo.
- **No instales nada sin verificar antes** versiones y compatibilidad, y sin decirme qué instalarás. Para PDF propongo `jspdf`; para el QR de demostración `qrcode`. Si no son compatibles, propón alternativa o un respaldo con CSS de impresión.
- Datos mock coherentes: un participante, su curso, su progreso, sus intentos y **un único** certificado ligado a esa aprobación.

## 4. Forma de trabajo (obligatoria)

1. **Antes de tocar código**: inspecciona el proyecto (`angular.json`, `package.json`, estructura, versión de Angular), lee las referencias y presenta un plan con pantallas, rutas, componentes y pendientes. **Espera mi aprobación.**
2. Trabaja **por etapas** y **detente al final de cada una** con un resumen para que yo pruebe y apruebe.
3. En cada etapa ejecuta `ng build` (y levanta `ng serve` cuando haga falta) y **corrige los errores antes de continuar**.
4. **No afirmes que algo funciona sin haberlo comprobado**. Si no puedes comprobarlo, dilo.
5. Crea y modifica archivos reales; no me muestres solo fragmentos. No sobrescribas archivos sin revisarlos antes.
6. Si hay requisitos contradictorios, incompletos o pendientes: **no los inventes**. Regístralos en `docs/PENDIENTES.md` y usa una solución provisional **configurable** y visiblemente marcada como "demo".

## 5. Etapas

**ETAPA 1 — Inspección y plan.** Sin modificar archivos.

**ETAPA 2 — Base.** Estructura de carpetas, estilos globales, tokens de diseño, layouts (autenticación, participante, administrador), rutas con protección **visual** por rol, página 404, modelos TypeScript, servicios mock y datos semilla.

**ETAPA 3 — Certificados (módulo prioritario).** Se construye primero para poder mostrar lo central.
- **Mis certificados** (`/certificados`), con estados: sin certificado, pendiente de habilitación, disponible.
- Tarjeta del certificado: participante, curso, fecha de aprobación, nota, fecha de emisión, **horas de formación** (dato configurable del curso), código único, estado, y botones Visualizar, Descargar PDF y Verificar.
- **Vista previa horizontal** con aspecto formal: espacio para logo, entidad capacitadora, datos del participante, curso, fecha de aprobación, nota, horas, código y QR. Plantilla **provisional**, marcada como tal, fácil de reemplazar por la del diseñador.
- **Descarga PDF** funcional en la demo (verificando antes la dependencia).
- **QR** de demostración que apunta a `/verificar/:codigo`, identificado como recurso de prueba.
- **Página pública de verificación** (`/verificar` y `/verificar/:codigo`): por **código** y, de forma provisional y configurable, por **DNI** (solo DNI ficticios de prueba). Muestra código, participante, curso, fecha de emisión, horas y estado (válido / no encontrado / revocado). Muestra el mínimo de datos personales necesario. Aclara que la verificación real consultará al backend.
- Reglas: **solo se accede al certificado si hay aprobación**; **nunca más de un certificado válido por aprobación**; el certificado conserva los datos del momento de emisión.

**ETAPA 4 — Flujos del participante.** Login demo (usuarios de prueba identificados por rol, con aviso de que no es autenticación real y sin contraseñas reales), panel con estados (pendiente, en progreso, listo para examen, aprobado, desaprobado), aula tipo Hotmart (reproductor, lista de módulos/videos con orden, duración y completado, progreso, anterior/siguiente, examen bloqueado hasta completar los videos obligatorios), instrucciones del examen, examen cronometrado (selección única, múltiple y verdadero/falso; navegación; confirmación de entrega) y resultados (nota, mínima, aprobado/desaprobado, correctas, fecha, duración, intentos; enlace al certificado solo si aprueba). Entre 5 y 7 videos de 5 a 10 minutos, con marcadores de posición.

**ETAPA 5 — Administración.** Menú lateral y secciones: Dashboard (cifras de demostración), Participantes (tabla y alta con usuario/contraseña de demo, porque la empresa registra), Cursos, Videos (agregar, editar, eliminar, publicar, ordenar), Evaluaciones (preguntas, puntajes, tiempo, nota mínima, intentos, **escala de nota configurable**), Seguimiento y resultados, Certificados (tabla con ver y descargar). Sin reportes avanzados. Los botones tienen comportamiento de demo coherente y no aparentan guardar en un servidor.

**ETAPA 6 — Validación y documentación.** Compilación sin errores, revisión de rutas y flujos, responsive, estados vacíos y de error, y descarga del PDF. Genera `README.md` y `docs/PENDIENTES.md`.

## 6. Parámetros de demostración (configurables, marcados como "demo")

Escala de nota: sobre 100. Nota mínima, tiempo del examen e intentos: valores de ejemplo en un único archivo de configuración (referencia del PDF: 2 intentos). Nada de esto es definitivo.

## 7. Qué NO hacer en esta etapa

Base de datos, API real, autenticación segura, gestión real de contraseñas, emisión oficial de certificados, validación definitiva del QR, control del examen en servidor, envío de correos, integraciones no solicitadas. Aclara en la interfaz y en la documentación que el temporizador, la calificación, el progreso de visualización y la protección de rutas son **simulados** y que el control real corresponde al backend.

## 8. Entregable final

Resumen de lo implementado; estructura de carpetas; lista de rutas; comandos exactos para ejecutar; usuarios de prueba y cómo entrar con cada rol; funciones operativas; funciones simuladas; pendientes de definición (`docs/PENDIENTES.md`); lista de tareas de backend.

## 9. Pendientes a confirmar con la empresa (regístralos en `docs/PENDIENTES.md`)

1. Escala de nota (100 o 20), nota mínima, tiempo e intentos.
2. Verificación por DNI, por código/QR, o ambas.
3. Si habrá más de un curso o solo uno (RN-02 dice uno; el panel admin pide "Cursos").
4. Cómo se definen las horas de formación del certificado.
5. Plantilla oficial del certificado y logos autorizados.
6. Política de reconexión durante el examen (RN-18) y de modificación de cursos publicados (RN-15).
7. Mecanismo real de control de visualización de videos (reproductor y backend).
8. Si el Aula Virtual actual en Q10 convivirá con la nueva o se reemplaza.

---

**Empieza únicamente por la ETAPA 1** y espera mi aprobación antes de modificar archivos.

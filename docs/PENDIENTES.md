# Pendientes de definición — Aula Virtual IMC

Registro de requisitos confirmados, solicitudes pendientes de validación, decisiones de la demostración
y asuntos sin definir. **Ningún punto se considera aprobado por la empresa si no lo dice una fuente.**
Mientras un punto siga abierto, el frontend usa valores **provisionales y configurables**, marcados como "demo".

Última actualización: 13/11/2026 (**B2.3c**: registro de estudiantes y activación de la cuenta por enlace de correo;
D17, P2 y P4 confirmadas; migración generada sin aplicar; sin proveedor de correo real; sección 39). Antes, el mismo día (**B2.3b**: asignación y retiro de empresas de estudiantes en el backend; P3, P5 y P6
confirmadas; sección 38). Antes, el mismo día (**B2.3a**: consulta de estudiantes del alcance del Instructor en el backend, solo
lectura; sección 37). Antes, 12/11/2026 (**B2.2c**: asignación de instructores a empresas por la administración general en el
backend, sin migración nueva; sección 36). Antes, el mismo día (**cierre de B2.2b**: desactivación, corrección del RUC y reactivación de empresas
confirmadas por la institución; 35.6). Antes, el mismo día (**B2.2b**: gestión de empresas por la administración general en el backend, sin
migración nueva y pendiente de validación con MySQL; sección 35). Antes, el mismo día (**B2.2a**: la administración general de IMC es un **permiso especial** de algunos
Instructores, no un tercer rol; infraestructura de autorización implementada en el backend, sin operaciones
funcionales; migración generada y no aplicada; sección 34). Antes, 11/11/2026 (**B2.1**: estudiantes en varias empresas o en ninguna, instructores con empresas,
matrículas y autorización por empresa en el backend; migración generada y no aplicada; sección 33). Antes: corrección
final de B0.2 (D-8, D-11 y D-12 armonizadas con las reglas posteriores, sección 32.4). Antes, en B0.2: alineación documental con el backend. Se registran de forma retrospectiva
la Etapa 1, la Etapa 2A y la Etapa 2B Bloque 1, en las secciones 29 a 31, y los pendientes de B0 en la 32. Anterior, del
mismo día: Etapa 2B, Bloque 2, recuperación de exámenes en el frontend en modo demostración (sección 28). La regla de
intentos de la sección 15 y el alojamiento de videos de la sección 10.1 **quedan sustituidos** por la sección 24.

**Orden de las secciones:** son cronológicas hasta la 28. Las secciones 29 a 31 describen etapas del 09/11/2026,
anteriores a la 28, que se documentaron después (B0.2). Se numeraron al final para no cambiar las referencias
existentes.

## Fuentes

Todas están en `docs/referencias/`.

| Código | Documento | Observaciones |
|---|---|---|
| **RN** | `Reglas de negocio Aula Virtual IMC.pdf` | La empresa indicó que **no están completas** (R1). |
| **R1** | `Reunión de prácticas IMC` (documento privado, no publicado) (13/10/2026) | Transcripción automática. |
| **R2** | `Reunión 23-10-2026 - Notas y transcripción (Gemini).pdf` (23/10/2026) | Copia sin cambios del archivo original `Teu 20261023 1111 GMT-0500 - Notas de Gemini.pdf` (SHA-256 `1d087d5f…4b90`). Incluye un resumen y una transcripción generados por computadora. **El resumen tiene al menos un error** (dice "26 de agosto"; la transcripción dice lunes 26, es decir, octubre), así que **se toma como referencia la transcripción**, citada con su marca de tiempo. |
| **P** | `PROMPT_Aula_Virtual_IMC_Claude_Code.md` | Indicaciones de trabajo, no requisitos de la empresa. |

## Categorías

- **Confirmado**: lo establecen las RN o lo acordaron las partes en una reunión, sin contradecir otra fuente.
- **Solicitado (pendiente de validación formal)**: se pidió en una reunión, pero contradice o amplía las RN, que no se han actualizado.
- **Decisión de demo**: la tomó el equipo de desarrollo para la demostración. No es una decisión de la empresa.
- **Sin definir**: ninguna fuente lo resuelve.

---

## 1. Requisitos confirmados

| # | Requisito | Fuente |
|---|---|---|
| C1 | El Aula Virtual es **solo académica**: sin pasarela de pagos ni datos financieros. | R2 00:11:32, 00:16:16 |
| C2 | **Matrícula manual:** el interesado escribe a un WhatsApp exclusivo de capacitación virtual, el personal valida el pago y sus datos, **registra al alumno en la plataforma, le asigna el curso** y le envía sus credenciales. No hay auto-registro. | R1 08:25; R2 00:16:16, 00:21:15 |
| C3 | Un usuario sin cursos **no ve un catálogo**: los cursos disponibles se publicitan en la web de la empresa. | R2 00:13:11 |
| C4 | El alumno accede **solo a los cursos que tiene habilitados o asignados**. | RN-02; R2 00:31:59 |
| C5 | Flujo: iniciar sesión → curso → videos → examen cronometrado → certificado digital si aprueba → descarga desde su cuenta. | RN (objetivo); R1 08:25 |
| C6 | Cada curso tiene, como mínimo, nombre, descripción y estado (**borrador** o **publicado**). | RN-02 |
| C7 | **RN-03:** cada curso tiene **entre 5 y 7 videos**, de **5 a 10 minutos** cada uno, con título, descripción opcional, orden y archivo o enlace. Solo se muestran los videos publicados. | RN-03 **Actualizado el 20/11/2026:** sin límite de duración (sección 43). |
| C8 | El examen se habilita al completar todos los videos obligatorios. Solo puede haber un intento activo a la vez. | RN-04, RN-11 |
| C9 | El certificado se emite solo si el alumno aprueba. **Un solo certificado válido por aprobación del mismo curso**, y conserva los datos del momento de emisión. | RN-08 |
| C10 | El certificado lleva QR, código único, fecha de emisión y horas de formación. La plantilla la hará el diseñador de la empresa. | R1 13:24 |
| C11 | La página de verificación por DNI que hoy está en WordPress **no se modifica**. | R1 04:07; P |
| C12 | Las RN no están completas. | R1 02:38 |
| C13 | **Imagen de portada por curso**, relacionada con su tema, para que el alumno ubique su curso. La propuso la empresa (Virtual SST Perú IM) y Responsable A la aceptó ("sería lo ideal"). Las notas de Gemini la registran como "Acordada". La entrega de las imágenes oficiales sigue pendiente (S6). | R2 00:33:22, 00:34:46 |

## 2. Solicitudes de la reunión del 23/10, pendientes de validación formal

Se pidieron en R2, pero **las RN no se han actualizado**. Cuando una solicitud contradice una regla, se indica.

| # | Solicitud | Fuente | Contradicción o vacío |
|---|---|---|---|
| S1 | **Varios cursos** en la plataforma y por alumno. Ejemplos de la empresa: "altura y confinados"; "todos los cursos que tengas". | R2 00:14:08, 00:28:33 | **Contradice RN-02**: "para la primera versión, se considerará un solo curso configurable, salvo que se requiera ampliar el alcance". Falta que la empresa confirme por escrito la ampliación. |
| S2 | **Crear cursos desde la administración**, con nombre, descripción, horas, módulos, videos y examen. | R2 00:33:22, 00:35:49 | Amplía RN-02 y RN-10. Hoy el botón "Registrar nuevo curso" está deshabilitado a propósito. Sin definir: si el curso se registra completo "antes de crearlo" (R2 00:33:22) o como borrador que se completa (RN-02). |
| S3 | **El curso es la entidad principal**, con relación de **uno a muchos** con **módulos, clases (videos) y exámenes**. **Un mismo video no se comparte entre cursos.** | R2 00:21:15, 00:22:36 | RN-04 a RN-07 hablan de "el examen", en singular (ver D1). RN-03 cuenta los videos por curso y no menciona módulos (ver D2). |
| S4 | **Tres vistas del alumno** (estilo Hotmart): (1) **tablero de cursos** con portadas, que ya no se llamará "Mi perfil"; (2) **aula interna** con menú lateral de módulos, videos, examen y certificado; (3) **reportes** de progreso y certificados obtenidos. | R2 00:25:18, 00:26:27, 00:30:51, 00:31:59 | El examen y el certificado **no van en el tablero** ("tendría que ir en otro apartado", R2 00:25:18). Se sugiere ubicarlos en módulos finales del curso (R2 00:30:51, "quizás"). |
| S5 | **Asignación manual de cursos** al registrar a un alumno (un "módulo de registro anexado a los cursos disponibles"). | R2 00:21:15 | El alta actual inscribe siempre en el único curso. Vacantes: "no hay problema porque como es virtual", pero "hay que considerar" (sin definir). |
| S6 | **Entrega de las portadas oficiales.** La empresa indica que tiene una imagen para cada uno de sus cursos (el requisito de portada está confirmado en C13). | R2 00:34:46 | No se han entregado. Los cursos demo usan portadas de demostración neutras, que **no son imágenes oficiales de IMC** (sección 6). Sin definir: formato, tamaño y proporción de las imágenes. |
| S7 | **Reportes en la administración:** alumnos, avances y certificados emitidos. | R2 00:33:22 | RN-10: "no será necesario incluir un sistema avanzado de reportes". El contenido exacto está sin definir (ver D10). |
| S8 | **Hosting exclusivo** para el Aula Virtual, separado de la web institucional. Está en análisis (Responsable A y Responsable B). | R2 00:34:46, 00:35:49 | Decisión aplazada ("requiere más debate"). |

## 3. Decisiones tomadas para la demostración

Las tomó el equipo de desarrollo. **No son decisiones de la empresa** y se pueden revertir.

| # | Decisión | Motivo |
|---|---|---|
| M1 | **Dos cursos de demostración:** *Introducción a la Inteligencia Artificial* y *Fundamentos del Marketing Digital*. **No son cursos oficiales de IMC.** La empresa capacita en Seguridad y Salud en el Trabajo; sus propios ejemplos son altura y espacios confinados (R2 00:14:08). En R1, la IA y el e-commerce solo aparecen en una conversación personal. | Mostrar la arquitectura de varios cursos sin inventar contenido oficial. |
| M2 | Cada curso demo tiene **un único video real de YouTube**. **No se inventan videos ni contenido adicional.** | Instrucción del equipo. |
| M3 | Como no cumplen RN-03 (mínimo 5 videos), los cursos demo quedan en **borrador**: **no se pueden publicar** y **el examen no se habilita** mientras no se cumpla la regla. | Respetar RN-03 sin modificarla. |
| M4 | **YouTube es una solución provisional** de reproducción, **no el alojamiento definitivo**. Los videos oficiales los grabará la empresa en su local (R2 00:02:20), y dónde se alojarán está sin definir (S8). El modelo de datos debe aceptar otras fuentes de video. | Evitar atar la arquitectura a YouTube. |
| M5 | **Datos personales ficticios** en las semillas y las pruebas: DNI `0000000X`, correos con dominio `.test`, contraseña de demostración compartida. **No se usarán datos reales** de las reuniones. En la demostración grabada en R2 se registró un DNI real; no debe copiarse al proyecto. | Protección de datos personales (RN-16). |
| M6 | Valores de examen de ejemplo: escala 100, nota mínima 60, 20 minutos (`demo.config.ts`). Los intentos ya no son un valor de ejemplo: un solo intento por regla (sección 15). | Ver D3 a D6. |

## 4. Asuntos sin definir

### 4.1 Cursos, módulos y exámenes

| # | Asunto | Fuente |
|---|---|---|
| D1 | **Varios exámenes por curso:** cuál habilita el certificado, en qué orden se rinden, cómo se cuentan los intentos y cómo se combinan las notas. RN-04 a RN-07 hablan de un solo examen. | R2 00:22:36 frente a RN-04 a RN-07 |
| D2 | **RN-03 y los módulos:** si el límite de 5 a 7 videos se cuenta por curso o por módulo. **Resuelto el 19/11/2026:** mínimo de 5 videos publicados **por módulo** para publicar, sin máximo (sección 42). | RN-03, R2 00:30:51 |
| D3 | Si "un intento activo a la vez" se aplica por curso o a todos los cursos del alumno. | RN-04 |
| D4 | Si los alumnos pueden ver un curso en **borrador** (afecta la demostración de M3). | RN-02 |
| D5 | Si existen **tareas** y **materiales en PDF** por módulo. Se mencionaron como ejemplo ("qué sé yo"), no como requisito. | R2 00:29:40 |
| D6 | Política de modificación de videos y preguntas de un curso publicado. | RN-15 |

### 4.2 Videos: RN-03 y sus excepciones

**Ninguna excepción a RN-03 está aprobada.** Cada una requiere la autorización de la empresa.

| # | Asunto | Estado |
|---|---|---|
| V1 | Los cursos demo tienen **1 video**; RN-03 exige al menos 5. | Excepción **sin aprobar**. Se aplica M3. |
| V2 | **El video de Marketing Digital (`Ctd6BTuZmjA`) dura 10:03** (603 s, según YouTube el 26/10/2026). **Supera por 3 s el máximo de 10 minutos de RN-03.** Se conserva la duración real, la excepción no se oculta y **la regla no se cambia sin autorización**. | Excepción **sin aprobar**. **Actualizado el 20/11/2026:** sin límite de duración (sección 43). |
| V3 | El video de IA (`_tA5cinv0U8`) dura **8:33** (513 s): **cumple RN-03**. | Dato verificado. |
| V4 | **Derechos de uso:** ambos videos son de canales de terceros (*Derivando* y *Emprende Aprendiendo*). No hay constancia de permiso para usarlos en una capacitación. | Solo para la demostración, con atribución al canal. |
| V5 | Reproducción integrada: el 26/10/2026 ambos videos tenían `playableInEmbed: true`, pero el propietario puede cambiarlo. | Se necesita un enlace de respaldo. |
| V6 | **Control real de la visualización:** RN-03 pide verificar si un reproductor externo permite controlar el progreso. En el navegador, el progreso es manipulable. | Hoy es manual ("Marcar como visto") y está marcado como simulado. El control real corresponde al backend. |

### 4.3 Examen, calificación y certificados

| # | Asunto | Fuente | Valor provisional |
|---|---|---|---|
| D7 | **Escala** de nota: sobre 100 o sobre 20 ("es posible que sea con nota de 100"). | RN-06, R1 09:49 | 100 |
| D8 | **Nota mínima** aprobatoria. | RN-06 | 60 |
| D9 | **Duración** del examen. | RN-05 | 20 min. En la demostración grabada de R2 se usaron 60 min, cambiados en la administración; **no es un requisito**. |
| D10 | **Intentos** permitidos. **Resuelto el 27/10/2026:** un solo intento por alumno y examen, no configurable (sección 15). **Sustituido el 07/11/2026 por D-8** (un intento regular más una recuperación autorizada); implementado en el frontend, modo demostración, el 11/11/2026 (sección 28). | RN-07, RN-10 | 1 regular + 1 recuperación (D-8) |
| D11 | Si escala, nota mínima, tiempo e intentos serán **por curso o por examen**, o globales. | RN-05 a RN-07, R2 | Hoy son globales. |
| D12 | **Horas de formación** de cada curso. No hay dato para los cursos demo y **no se inventarán**. | R1 13:24, R2 00:33:22 | — |
| D13 | **Plantilla oficial** del certificado, logos, firmantes y cómo debe figurar la entidad capacitadora. | R1 13:24, RN-08 | Plantilla provisional. |
| D14 | Verificación por DNI, por código/QR o por ambos. | R1, P §9.2 | Ambas, con DNI ficticios. |
| D15 | Política de reconexión durante el examen; temporizador controlado desde el servidor. | RN-14, RN-18 | Simulado en el navegador. |
| D16 | **Preguntas oficiales** de cada curso. Las actuales son genéricas y no son oficiales. | RN-04, RN-12 | — |

### 4.4 Credenciales, hosting y reportes

| # | Asunto | Fuente |
|---|---|---|
| D17 | **Credenciales:** cuándo y cómo se generan el usuario y la contraseña, cómo se entregan al alumno y si debe cambiarla al primer ingreso. Responsable A: "en qué momento le creamos su usuario, su clave, cómo le entrego… no está contemplado". En esta etapa están fuera de alcance las contraseñas reales y el envío de correos (P §7). | R2 00:19:46; RN-01 |
| D18 | RN-01 pide **nombres y apellidos** por separado; hoy el proyecto usa un solo campo (`fullName`). | RN-01 |
| D19 | **Hosting** de la plataforma y de los videos (S8). | R2 00:34:46 |
| D20 | **Contenido de los reportes** del alumno (S4) y de la administración (S7), dentro del límite de RN-10. | R2, RN-10 |
| D21 | Si el Aula Virtual en Q10 convivirá con la nueva o será reemplazada. | P §9.8 |

---

## 5. Riesgos técnicos (auditoría, E1, E2 y E3)

Las pruebas de `src/app/core/services/mock-data-repository.spec.ts` documentaron en E1 estos riesgos con el prefijo **RIESGO**. En E2 se actualizaron las pruebas de los riesgos resueltos.

| # | Riesgo | Dónde | Plan |
|---|---|---|---|
| T1 | Un certificado vigente impedía emitir otro al mismo usuario, aunque fuera de otro curso. | `mock-data-repository.ts`, `submitExamAttempt` | **Resuelto en E2:** la unicidad se comprueba por usuario + curso (C9). |
| T2 | Los intentos se contaban por usuario, sin distinguir curso. | Repositorio y pantallas del alumno | **Resuelto en E2 (repositorio) y E3 (pantallas):** las pantallas usan `getExamAvailability` por curso. |
| T3 | La pantalla de resultado mostraba el último intento del usuario. | `exam/result/result.ts` | **Resuelto en E3:** la ruta incluye el curso (`/cursos/:courseId/examen/resultado`). |
| T4 | La escala no se guardaba en el certificado ni en el intento. | `certificate.service.ts`, `certificate-view`, `my-certificates` | **Resuelto:** el intento y el certificado guardan `scaleMax` (E2), y el PDF y las vistas lo usan (E3). |
| T5 | La sesión del examen no indicaba a qué examen pertenece. | `exam-session.service.ts` | **Resuelto en E2:** se añade `examId` (opcional, por compatibilidad) y se descartan las sesiones con forma no reconocida. Las pantallas lo usarán en E3. |
| T6 | `markVideoCompleted` aceptaba un id de video inexistente. | `mock-data-repository.ts` | **Resuelto en E2:** el video debe existir, pertenecer al curso y estar publicado. |
| T7 | Antes de E1 el proyecto no tenía pruebas automatizadas. | — | Resuelto: 44 pruebas en E1; 78 en E2. |
| T8 | Las pantallas no conocían el bloqueo por borrador. | Aula, instrucciones, resultado, Mis certificados | **Resuelto en E3:** usan `getExamAvailability`, sin lógica duplicada. |
| T9 | Las horas de formación pueden ser `null` (por definir). | Vistas de certificado y verificación | **Resuelto en E3:** se muestra «Por definir» (pipe `trainingHours`). |

### 5.1 Migración del estado en `localStorage`

El estado de la demo se guarda en la clave **`imc-demo-state-v2`** con un solo `course`. La sesión se guarda en `imc-demo-session` y el examen en curso en sessionStorage, con la clave `imc-demo-exam-session`.

**Comportamiento actual (verificado con pruebas):** si el estado guardado tiene otra forma, le falta una colección o no es un JSON válido, `load()` lo **descarta en silencio** y usa los datos semilla. No avisa al usuario.

**Riesgos al pasar a varios cursos:**

1. **Pérdida silenciosa** de lo hecho en la demo: alumnos registrados, progreso, intentos y certificados emitidos.
2. Un examen en curso (formato antiguo, sin curso) podría restaurarse en un curso equivocado.
3. La sesión guarda una copia del usuario. Si cambian los ids de las cuentas de prueba, la sesión queda huérfana.
4. Los certificados ya emitidos guardan el nombre del curso de demostración anterior.

**Implementado en E2** (`core/data/demo-state.ts`, `MockDataRepository.load()`):

| Situación al cargar | Resultado |
|---|---|
| Existe `imc-demo-state-v3` y es válido | Se usa. |
| Existe `imc-demo-state-v3`, pero no es válido | **Se copia tal cual en `imc-demo-state-v3-respaldo`**, se usa la semilla y se avisa. |
| No hay v3, pero hay `imc-demo-state-v2` válido | Se migra conservando identificadores y datos, **se verifica** que no se haya perdido nada (`verifyMigration`), se guarda en v3 y **v2 se conserva sin cambios**. Se añaden los cursos demo sin reemplazar nada. El curso migrado queda **sin portada** (P9). |
| v2 con forma no reconocida, o la verificación falla | Se usa la semilla, **v2 no se borra** y se avisa. |
| No hay datos guardados | Se usa la semilla y no se escribe nada. |

- El aviso se obtiene con `getStorageStatus()`. **Mostrarlo en la interfaz queda para E3.**
- `resetDemo()` guarda la semilla en v3, para que v2 no se vuelva a migrar, y no borra v2.
- `removeLegacyState()` borra v2 solo si el v3 guardado es válido. **Todavía no lo usa ninguna pantalla.**
- La sesión del alumno (`imc-demo-session`) no cambia: los ids de las cuentas de prueba se mantienen.
- Limitación conocida: v2 no guardaba la escala de cada intento ni de cada certificado. Al migrar se asigna la escala vigente del examen, que es la única conocida.

---

## 6. Requisito del equipo: portada y navegación por curso (26/10/2026)

Requisito obligatorio del equipo de desarrollo, alineado con C4, C13 y S4. Se reparte entre etapas: en **E2** se preparan el modelo y la persistencia, en **E3** se implementan las pantallas y rutas del alumno, y en **E5** la administración.

### 6.1 Reglas

| # | Regla | Etapa |
|---|---|---|
| P1 | Cada curso tiene su **propia** portada en el campo `coverImage` (ruta o referencia). No se comparte automáticamente entre cursos. | E2 |
| P2 | La **descripción** es un campo de texto independiente; **nunca se incrusta en la imagen**. | E2 |
| P3 | Cada curso demo tiene una portada **distinta**, neutra y profesional, marcada como **demostración** y **no oficial de IMC**. | E2 |
| P4 | La administración podrá registrar y editar la portada de cada curso. En E2 solo se preparan el modelo y la persistencia; la interfaz llega en E5. | E2 / E5 |
| P5 | El tablero del alumno muestra **una tarjeta por curso asignado**, con portada, nombre, descripción y, cuando corresponda, progreso y estado. | E3 |
| P6 | Al hacer clic en una tarjeta se abre el aula **de ese curso**. La ruta lleva el identificador del curso, y el aula no mezcla videos, módulos, evaluaciones, progreso ni certificados de otros cursos. | E3 |
| P7 | El alumno accede **solo a los cursos que tiene asignados**. Ver una tarjeta o conocer la URL no concede acceso por sí solo. | E2 (repositorio) / E3 (guard) |
| P8 | Si la imagen falta o no carga, se muestra una **portada de respaldo** y la interfaz no se rompe. | E3 |
| P9 | La migración de `localStorage` conserva los cursos existentes. **No elimina datos ni sustituye portadas en silencio.** | E2 |

### 6.2 Diseño propuesto (pendiente de aprobación)

- **Modelo:**
  - `Course.coverImage: string | null` guarda una ruta relativa (por ejemplo `demo/covers/<id>.svg`) o una URL.
  - `null` significa "sin portada" y muestra la portada de respaldo; **no** se asigna automáticamente la de otro curso.
  - `Course.description` se mantiene como campo independiente.
- **Portadas demo:** propongo ilustraciones abstractas en **SVG propio**, guardadas en `public/demo/covers/`.
  - No llevan texto, logotipos ni personas, y hay una por curso.
  - Se sirven localmente, sin depender de servicios externos y sin dudas de licencia.
  - **No se usará la miniatura de YouTube** como portada, porque es una imagen de terceros.
- **Portada de respaldo:** un recurso local genérico (degradado con los tokens de color), que se muestra cuando `coverImage` es `null` o la imagen da error al cargar. Lleva `alt` descriptivo; si es decorativa, `alt=""` y el nombre del curso como texto.
- **Acceso (P7):** el repositorio solo devolverá el contenido del curso si existe una inscripción del alumno en él.
  - Ejemplo: `getCourseContent(courseId, userId)` falla con "No tienes acceso a este curso" si el alumno no está inscrito.
  - En E3 se suma un guard de ruta que comprueba la inscripción.
  - Ambos son **protección visual de demostración**; la seguridad real corresponde al backend (RN-16).
- **Rutas (E3, sin implementar en E2):**
  - `/panel` muestra el tablero y `/cursos/:courseId` el aula del curso.
  - Las rutas actuales (`/curso`, `/examen/...`) se conservan con redirecciones.
- **Migración (P9):** el curso existente `c1` se migra **conservando** su nombre, descripción, videos, inscripciones, intentos y certificados, con `coverImage: null`, de modo que muestra la de respaldo sin sustituirla. Si la migración falla, se mostrará un aviso visible.

### 6.3 Asuntos sin definir

| # | Asunto |
|---|---|
| P-D1 | **Carga de imágenes en la administración (E5) sin backend.** Si la imagen se guarda en `localStorage` como dato en base64, puede superar el límite del navegador, que suele rondar los 5 MB. Opciones: solo una ruta o URL en la demo, o un tamaño máximo con aviso. El almacenamiento real depende del hosting (S8, D19). |
| P-D2 | Formato, tamaño, proporción y peso máximo de las portadas oficiales (S6). |
| P-D3 | Qué ve el alumno en la tarjeta si el curso asignado está en **borrador** (relacionado con D4). |
| P-D4 | **Resuelto (26/10/2026, decisión del equipo):** `c1` se conserva temporalmente como tercer curso demo. Contexto: **destino del curso actual `c1`** ("Curso de demostración", 6 videos de marcador de posición). Hoy es el único curso que cumple RN-03, así que es el **único que permite mostrar el flujo completo** de examen y certificado. Los cursos de IA y Marketing quedan con el examen bloqueado (M3). Opciones: mantenerlo como tercer curso demo o retirarlo de la semilla. Retirarlo no borraría los datos ya guardados en el navegador (P9). |

---

## 7. Decisiones del equipo para E2 (26/10/2026)

Son decisiones del equipo de desarrollo, **no de la empresa**.

| # | Decisión | Implementación en E2 |
|---|---|---|
| E2-1 | Conservar `c1` como tercer curso demo, con sus 6 videos de prueba, para mantener el flujo de examen y certificado. | La semilla v3 se genera migrando el `c1` del estado v2; las pantallas actuales siguen usándolo (`DEMO_CONFIG.legacyCourseId`). |
| E2-2 | Preparar la creación de varios cursos desde la administración. **La ampliación respecto de RN-02 está solicitada en R2 y debe formalizarse con la empresa (S1, S2).** | `createCourse` y `updateCourseById` en el repositorio. Sin interfaz hasta E5. |
| E2-3 | Los cursos en borrador solo son visibles para los alumnos en modo demostración, identificados como tales. El examen y el certificado siguen bloqueados mientras el curso no cumpla las reglas. **RN-03 no cambia.** | `DEMO_CONFIG.showDraftCoursesToParticipants` y `ParticipantCourse.preview`. Para rendir el examen, el curso debe estar publicado, cumplir RN-03 y tener un examen activo con preguntas. |
| E2-4 | El modelo admite varios exámenes por curso; la interfaz provisional usa uno activo. | `Exam.active` y `getActiveExam`. Los intentos se cuentan por examen; el estado del alumno es por curso. |
| E2-5 | Portadas SVG propias y abstractas en `public/demo/covers/`, sin logotipos, texto ni imágenes de terceros. Portada de respaldo en `public/images/portada-respaldo.svg`. | `CourseRecord.coverImage` (ruta relativa o https, validada) y `DEMO_CONFIG.coverFallback`. |

---

## 8. Etapa E3: experiencia del alumno (27/10/2026)

| Tema | Implementación | Pendiente |
|---|---|---|
| Tablero de cursos (S4, vista 1) | `/panel` muestra una tarjeta por curso asignado, con portada, nombre, descripción, progreso, estado y la etiqueta «Borrador · demo». | — |
| Aula interna (S4, vista 2) | `/cursos/:courseId` y `/cursos/:courseId/videos/:videoId`. Panel lateral con módulos, videos (duración real en m:ss), examen y certificado del curso. | El título de cada módulo solo se muestra si el curso tiene más de uno. Reproductor: ver sección 9. |
| Examen por curso | `/cursos/:courseId/examen`, `/examen/rendir` y `/examen/resultado`, con el examen activo del curso. | Política de varios exámenes (D1). Un intento activo a la vez para todos los cursos del alumno (decisión provisional sobre D3). |
| Acceso | `courseAccessGuard` y el repositorio: sin asignación se redirige a `/panel?aviso=sin-acceso`. | Protección visual; la real va en el backend (RN-16). |
| Rutas anteriores | `/curso`, `/curso/:videoId`, `/examen/instrucciones`, `/examen` y `/examen/resultado` redirigen al curso principal (`c1`). | Retirarlas cuando ya no se necesiten. |
| Reportes (S4, vista 3) | «Mis certificados» muestra los certificados de todos los cursos y el estado de los cursos sin certificado. | Contenido definitivo de los reportes (D20). |
| Aviso de migración | — | `getStorageStatus()` todavía no se muestra en la interfaz. |

---

## 9. Etapa E4: reproductor de video (27/10/2026)

### 9.1 Aclaraciones del equipo (vigentes en esta etapa)

- Por ahora, cada curso nuevo tiene **un solo video de demostración**; no se implementan los 5 a 7 videos de RN-03. `c1` conserva sus 6 videos de demostración. RN-03 no cambia: los cursos demo siguen en borrador y su examen sigue bloqueado.
- **Se conserva el video de Marketing de 10:03**, sin recortarlo ni reemplazarlo. La duración de los videos definitivos se gestionará con el contenido real (V2).
- No se crean preguntas, exámenes nuevos ni interfaz administrativa. Los cursos sin examen real configurado siguen bloqueados.

### 9.2 Implementación

| Tema | Implementación |
|---|---|
| Reproductor | `shared/components/video-player.ts`: `iframe` de `youtube-nocookie.com` (privacidad mejorada) en 16:9 responsive, con título accesible, `referrerpolicy` y sin reproducción automática. **No se carga ningún script de YouTube** en la aplicación. |
| Seguridad | Solo se integra un identificador validado (`core/utils/youtube.ts`). Los enlaces de YouTube guardados como URL se reconocen; otros enlaces https se ofrecen aparte (pestaña nueva, `noopener`); el resto se rechaza. |
| Estados informativos | Cargando; sin conexión (vuelve a cargar al recuperarla); sin archivo de reproducción (videos de `c1`); enlace inválido; video alojado fuera de la plataforma; aviso si tarda más de 15 s. Siempre se muestra el enlace «Ver en YouTube». |
| Avance | **No se marca automáticamente.** El alumno usa «Marcar como visto» (V6). |

### 9.3 Limitaciones

| # | Limitación |
|---|---|
| E4-1 | Sin la IFrame API de YouTube, la aplicación **no detecta** los errores que ocurren dentro del reproductor (video eliminado, privado o con la integración deshabilitada). En esos casos YouTube muestra su propio mensaje (por ejemplo, «Este video no está disponible») y queda disponible el enlace de respaldo. Detectarlos requeriría cargar el script de YouTube en la aplicación: **decisión pendiente**. |
| E4-2 | Medir el tiempo real de visualización tampoco es posible sin la IFrame API, y en el navegador siempre sería manipulable (V6). |
| E4-3 | El reproductor de YouTube indica 8:32 para el video de IA; el dato registrado es 513 s (8:33). La diferencia viene del redondeo de YouTube. |

---

## 10. Etapa E5.1: repositorio de administración por curso (27/10/2026)

### 10.1 Decisión de arquitectura (equipo)

> **Sustituida el 07/11/2026 (sección 24.1, D-8):** los videos se alojan en **Google Drive y YouTube** y se reproducen
> integrados en el aula. No se almacenan archivos MP4 propios. Se conserva el texto original como historial.

El Aula Virtual tendrá **backend propio** y **almacenamiento privado de archivos MP4 en la nube**. Supabase Storage es una alternativa candidata, aún no contratada ni configurada. Se implementará después de auditar y aprobar su arquitectura. **Esto reemplaza a YouTube como alojamiento definitivo (M4, S8).** Hoy no existe una fuente de video para archivos privados y no se simula la subida.

### 10.2 Reglas implementadas en el repositorio

| Regla | Implementación |
|---|---|
| Videos por curso | `saveCourseVideo`, `moveCourseVideo`, `setCourseVideoPublished` y `deleteCourseVideo`, con el curso explícito. No operan sobre videos ni módulos de otro curso. Máximo de 7 videos (RN-03). |
| Duración | Se guarda la **duración real** en segundos. RN-03 (5 a 10 min) se exige **al publicar** y **mientras el curso esté publicado**; en borrador solo se informa. Así se conserva el video de Marketing de 10:03 sin modificar la regla. **Actualizado el 20/11/2026:** sin límite de duración (sección 43). |
| Enlace | Vacío = sin archivo; YouTube (cualquier formato) o un enlace https. Se rechaza el resto. |
| Examen y preguntas | `updateExamConfigById`, `saveExamQuestion` y `deleteExamQuestion` sobre el examen indicado. El examen activo de un curso publicado no puede quedarse sin preguntas. |
| Publicación | `getPublicationCheck`. **Bloquean:** RN-03 y que falte un examen activo con preguntas. **Advierten:** horas sin definir y falta de portada. |
| Retiro de asignaciones | `unenrollParticipant` solo procede si el participante no tiene avance, intentos ni certificados en el curso (C8). |
| Compatibilidad con c1 | Los métodos anteriores conservan sus validaciones y mensajes, y delegan en las mismas funciones internas. |

### 10.3 Pendientes

- **Exigir las horas de formación para publicar (C6):** sin decisión; hoy es solo una advertencia.
- **Ediciones de un examen con intentos registrados (RN-15, C7):** sin restricción, como hasta ahora.
- **Borrar cursos (C9):** no implementado.
- **Fuente de video «archivo privado» (MP4 en la nube):** se definirá con la arquitectura del backend.

---

## 11. Etapa E5.2: administración de cursos (27/10/2026)

| Tema | Implementación |
|---|---|
| Lista | Todos los cursos con portada, estado, videos publicados, horas y resumen de requisitos. En pantallas angostas, cada fila se muestra como una tarjeta. |
| Crear y editar | `createCourse` y `updateCourseById`: nombre, descripción, horas opcionales (vacío = «Por definir») y portada. Los cursos nuevos se crean en borrador. |
| Portada | Sin portada (respaldo), portada de demostración o dirección https. Vista previa con la portada de respaldo. **Sin subida de archivos.** |
| Publicación | Panel con requisitos obligatorios y advertencias (`getPublicationCheck`). «Publicar» solo se habilita si se cumplen, y con el formulario guardado; el repositorio vuelve a validar. «Pasar a borrador» pide confirmación. |
| Aviso RN-02 | La pantalla indica que la gestión de varios cursos está pendiente de formalizar (S1, S2). |

**Cambios de comportamiento respecto de la pantalla anterior:**
- El estado ya no se elige en el formulario: se publica o se pasa a borrador desde el panel de publicación.
- Las horas de `c1` pueden dejarse vacías («Por definir»), como en el resto de cursos.

**Pendiente:** borrar cursos (C9, no implementado). El selector de curso compartido se creó en E5.3.

---

## 12. Etapa E5.3: administración de videos por curso (27/10/2026)

| Tema | Implementación |
|---|---|
| Selector de curso | `admin-course-select.ts` (reutilizable): nombre y estado de cada curso. La selección queda en la URL (`?curso=`); con un curso inexistente se avisa y se muestra el curso principal. |
| Operaciones | Agregar, editar, ordenar, publicar o despublicar y eliminar, solo con `saveCourseVideo`, `moveCourseVideo`, `setCourseVideoPublished` y `deleteCourseVideo`. Las reglas quedan en el repositorio. |
| Duración | Se ingresa la duración real en **mm:ss** (`core/utils/duration.ts`) y se guarda en segundos. Aviso «Fuera de RN-03» cuando no está entre 5:00 y 10:00. **Actualizado el 20/11/2026:** sin límite de duración (sección 43). |
| RN-03 | En un **curso publicado**, el repositorio rechaza publicar un video fuera de 5 a 10 minutos o dejar menos de 5 videos publicados; la pantalla muestra el motivo. En **borrador**, solo se avisa: así el video de Marketing (10:03) se conserva y puede editarse sin cambiar su duración. Máximo de 7 videos por curso. **Actualizado el 20/11/2026:** sin límite de duración (sección 43). |
| Enlaces | YouTube u otro enlace https; vacío = sin archivo. Se rechazan `http:`, `javascript:`, `ftp:` y textos que no son enlaces. |
| Vista previa | Con el reproductor de E4, solo para enlaces de YouTube. **Sin subida de archivos.** |

**Cambio respecto de la pantalla anterior (c1):** antes la duración se pedía en minutos enteros (5 a 10) y se aceptaba cualquier texto como enlace. Ahora se usa la duración real (mm:ss) y solo enlaces de YouTube o https. Para `c1`, que está publicado, RN-03 se sigue exigiendo a los videos publicados.

---

## 13. Etapa E5.4: administración de evaluaciones por curso (27/10/2026)

| Tema | Implementación |
|---|---|
| Selector de curso | Reutiliza `AdminCourseSelect` y `?curso=`, como en Videos. Con un curso inexistente se avisa y se muestra el curso principal. |
| Estado de la evaluación | Nombre, estado del curso, cantidad de preguntas y puntaje total. Mensaje según los requisitos del repositorio: sin preguntas, curso en borrador o evaluación habilitada. |
| Configuración | Solo los campos existentes del modelo (tiempo, escala, nota mínima, intentos), guardados con `updateExamConfigById` en el examen activo del curso. Las validaciones las hace el repositorio. |
| Preguntas | Crear, editar y eliminar (con confirmación) con `saveExamQuestion` y `deleteExamQuestion`: selección única, múltiple y verdadero/falso, con la respuesta correcta y el puntaje (RN-12). Los rechazos del repositorio se muestran al administrador. |
| Curso sin evaluación | Se informa que los participantes no pueden rendir el examen ni obtener el certificado, y no se ofrece editar. |

**Verificado:** 150 pruebas (11 de E5.4), TypeScript de aplicación y pruebas, compilación de producción y 8 comprobaciones en navegador (escritorio y 390 px), sin errores de consola. Los demás cursos, los intentos y los certificados no cambian.

**Pendientes:**
- **Crear evaluaciones:** resuelto en E5.5 (sección 14).
- **Varios exámenes por curso (D1):** la interfaz trabaja con el examen activo.
- **Ediciones de un examen con intentos registrados (RN-15, C7):** sin restricción.
- **Publicar IA y Marketing** sigue requiriendo 5 a 7 videos publicados de 5 a 10 minutos (RN-03), además de preguntas.

---

## 14. Etapa E5.5: creación de evaluaciones (27/10/2026)

| Tema | Implementación |
|---|---|
| Crear evaluación | `createCourseExam(courseId)` en el repositorio y botón «Crear evaluación» en la pantalla, solo cuando el curso **no tiene una evaluación activa**. Se crea con la misma configuración que al crear un curso (demostración: 20 min, sobre 100, nota mínima 60; desde la sección 15, 1 intento) y sin preguntas. |
| Sin duplicados | Si el curso ya tiene una evaluación activa, el repositorio la rechaza («El curso ya tiene una evaluación activa.») y la pantalla muestra el motivo. Se conserva **un examen activo por curso** (D1). |
| Exámenes inactivos | Si el curso conserva un examen inactivo, no se reactiva ni se modifica: se crea uno activo con otro identificador. |
| Reutilización | `createCourse` y `createCourseExam` comparten la misma función interna; el comportamiento de `createCourse` no cambió. |

**Verificado:** 157 pruebas (7 nuevas), TypeScript de aplicación y pruebas, compilación de producción y 7 comprobaciones en navegador (escritorio y 390 px), sin errores de consola. Crear la evaluación de un curso no altera los demás cursos, ni los intentos y certificados.

**Pendiente de decisión (RN-15, D6):** no se implementó ninguna restricción a la edición de un examen con intentos registrados. RN-15 dice que los videos y las preguntas de un curso publicado «no podrán modificarse de manera que alteren una evaluación activa» y que «los cambios se aplicarán de forma controlada», pero no define qué es una evaluación activa (un intento en curso o el examen vigente) ni qué significa «de forma controlada». Los intentos y certificados ya registrados conservan su nota y su escala. Un intento en curso se guarda en el navegador del alumno y el repositorio simulado no puede detectarlo.

---

## 15. Regla de negocio: un solo intento por examen (27/10/2026)

> **Sustituida el 07/11/2026 (sección 24.1, D-8):** un intento regular más **una recuperación excepcional autorizada
> por el Instructor** (máximo dos intentos). Lo implementado (`MAX_ATTEMPTS = 1`) sigue vigente en el frontend hasta la
> fase B6 del backend; no se ha modificado código. Se conserva el texto original como historial.
>
> **Actualización 11/11/2026:** la regla D-8 ya está implementada en el frontend, en modo demostración (Etapa 2B,
> Bloque 2, sección 28). En el backend sigue pendiente (fase B6).

**Decisión de negocio confirmada el 27/10/2026 (comunicada por el equipo).** Reemplaza a **RN-07** y **RN-10** únicamente en lo relativo al número de intentos y a su configuración; el resto de ambas reglas se conserva.

| Regla anterior | Regla vigente |
|---|---|
| RN-07: «El administrador podrá configurar el número máximo de intentos permitidos». Valor recomendado: 2, con posibilidad de cambiarlo. | **Máximo de 1 intento por alumno y examen.** El administrador **no puede configurar 2 o más intentos**. |
| RN-07: «Si el participante desaprueba y todavía tiene intentos disponibles, podrá volver a rendir el examen». | **Una vez consumido el intento, aprobado o no, el alumno no puede volver a iniciar ni rendir ese examen.** |
| RN-10: el administrador configura «el tiempo, la nota mínima y los intentos permitidos». | El administrador configura el tiempo y la nota mínima (y la escala). Los intentos se muestran fijos en 1. |
| — | **Límites independientes por curso:** consumir el intento de un curso no impide rendir el examen de otro curso. |

**Se conservan de RN-07:** cada intento se registra por separado; si aprueba, se marca la evaluación como aprobada y se habilita el certificado; si se agotan los intentos sin aprobar, el sistema informa que alcanzó el límite («Alcanzaste el límite de intentos permitidos.»).

### 15.1 Implementación

| Tema | Implementación |
|---|---|
| Regla | Constante `MAX_ATTEMPTS = 1` (`exam.model.ts`). `DEMO_CONFIG.exam.maxAttempts` pasa a 1, que usan los exámenes nuevos. |
| Dónde se aplica | En el repositorio: la disponibilidad del examen (`getExamAvailability`), que también controla la entrega (`submitExamAttempt` y `submitAttempt`), usa **siempre** `MAX_ATTEMPTS`, nunca el valor guardado. |
| Datos guardados antes de la regla | Los exámenes guardados con `maxAttempts: 2` (estado v3 o migrado desde v2) **no permiten un segundo intento**. El dato no se reescribe: el repositorio entrega los exámenes con el límite en 1 y el valor antiguo deja de usarse. Solo se corrige a 1 si el administrador guarda la configuración. |
| Configuración | El repositorio rechaza cualquier valor distinto de 1: «Cada alumno tiene un solo intento por examen: los intentos permitidos deben ser 1.». En Evaluaciones, «Intentos permitidos» se muestra fijo en 1, sin campo editable. |
| Alumno | Con el intento consumido, las instrucciones muestran «0 de 1» y «Comenzar examen» queda deshabilitado. La ruta directa del examen sin sesión vuelve a las instrucciones. Una sesión iniciada por otra vía no puede entregar: el repositorio la rechaza y no registra otro intento. |
| Datos de demostración | Carla (u3) conserva su intento ficticio (50/100, desaprobado); su descripción pasa a «desaprobada, sin intentos restantes». Los intentos y certificados históricos no cambian. |

**Verificado:** 167 pruebas (las existentes adaptadas a la regla, sin eliminar ninguna, más 10 nuevas), TypeScript de aplicación y pruebas, compilación de producción y 9 comprobaciones en navegador (perfil temporal aislado), sin errores de consola.

### 15.2 Pendientes

- **RN-15 (D6):** la regla de un intento no define qué ocurre si el administrador modifica preguntas o configuración después de que alguien rindió. Los resultados históricos se conservan (cada intento y certificado guarda su nota y su escala). Sigue sin definir si esas modificaciones deben bloquearse, versionarse o solo advertirse.
- **Textos sin uso en el resultado del examen:** los mensajes «Puedes volver a intentarlo» y el botón «Volver a intentarlo» solo aparecen si el examen sigue disponible, lo que ya no ocurre tras el único intento. No se modificaron las pantallas del alumno.
- **Sin backend**, la regla se controla en el navegador (repositorio simulado). El control definitivo corresponde al servidor (RN-14).

---

## 16. Etapas F1 y F2: administración multicurso y vistas en móvil (27/10/2026)

### 16.1 F1: administración multicurso

| Pantalla | Implementación |
|---|---|
| Dashboard | Selector de curso con «Todos los cursos» (parámetro `?curso=`; un curso inexistente muestra todos). Con todos los cursos distingue **participantes registrados** (únicos, e indica cuántos no tienen cursos) de **inscripciones** (un participante puede tener varios cursos). Con un curso: participantes inscritos, inscripciones, capacitaciones en progreso, aprobaciones y certificados de ese curso. «Últimos intentos» muestra el curso y la nota con la escala guardada en cada intento. Estados vacíos por curso. |
| Participantes | Cada participante muestra **todos sus cursos asignados**, con estado y avance, o «Sin cursos asignados». El alta mantiene las validaciones de nombre, correo y DNI y permite elegir uno o varios cursos (opcional). Se puede **asignar** un curso a un participante existente (solo se ofrecen los que no tiene; el repositorio rechaza duplicados) y **retirar** un curso con confirmación. Retirar no elimina al participante ni su historial, y solo se permite si la inscripción no tiene avance, intentos ni certificados (el repositorio lo explica si no se cumple). |
| Seguimiento y resultados | Selector de curso con «Todos los cursos». «Estado por inscripción» muestra una fila por participante y curso, con «Intentos n de 1» y la última nota con su escala guardada. «Historial de intentos» conserva los intentos de cursos que el alumno ya no tiene asignados (etiqueta «Ya no asignado»). El filtro no mezcla cursos. |

No se modificaron el repositorio, los modelos, los datos de demostración, la clave de `localStorage` ni las migraciones. c1, c-ia y c-mkt se conservan sin cambios.

### 16.2 F2: vistas en móvil

- Las tablas de Dashboard («Últimos intentos»), Participantes, Resultados y Certificados (administración) se muestran **como tarjetas** a 700 px o menos (clase `.table-cards`: cada celda con su etiqueta; el encabezado queda solo para lectores de pantalla).
- En el Dashboard de escritorio, «Últimos intentos» ocupa más ancho que el resumen de estados, para que se vean todas sus columnas; por debajo de 1100 px los dos paneles se apilan.
- Vista previa del certificado (alumno y diálogo de administración): se eliminó el ancho mínimo de 640 px que obligaba a desplazarse; el certificado ya escalaba en proporción (unidades `cqw`). **No se cambió el diseño del certificado ni el PDF.**
- En móvil, el detalle del certificado del alumno muestra además **el mismo QR ampliado** (180 px) con su código, porque dentro del certificado mide unos 36 px.

### 16.3 Verificado

- **182 pruebas** (15 nuevas: Dashboard, Participantes y Resultados, con el repositorio simulado real), TypeScript de aplicación y pruebas, y compilación de producción.
- **22 comprobaciones en Chrome sin interfaz** (perfil temporal aislado), a **1280 × 900** y **390 × 844**, con revisión visual de las capturas: sin desbordes ni columnas recortadas; filtro del Dashboard (todos, c-ia, c1, todos); alta con cursos, retiro y asignación; filtro de Resultados (Marketing); vista previa del certificado completa con el nombre entero en ambos tamaños; **descarga del PDF** desde administración y desde el alumno (archivo generado, 241 KB); sin errores de consola.
- La revisión visual detectó y corrigió dos defectos: la columna «Resultado» del Dashboard de escritorio quedaba oculta y, en el alta en móvil, una casilla se separaba del nombre de su curso.

### 16.4 Limitaciones

- En el diálogo de administración en móvil, el QR dentro del certificado mide unos 34 px y no se muestra ampliado (la ampliación se añadió solo en el detalle del alumno, que es la vista para escanear).
- Retirar un curso con avance, intentos o certificados sigue bloqueado; no hay «archivar inscripción».
- Sin backend, todo se guarda en el navegador (repositorio simulado).

### 16.5 Decisiones registradas para etapas posteriores (no implementadas)

**Decisión A: pantalla «Mi progreso» del alumno (futura F4).** Será una pantalla separada; «Mis certificados» seguirá dedicada solo a certificados. Mostrará únicamente datos que ya existen en el modelo:

| Dato | Origen en el modelo | Situación |
|---|---|---|
| Cursos asignados y su estado | Inscripciones (`status`) | Existe |
| Avance por curso | Videos vistos frente a videos publicados del curso (`ParticipantCourse`: `completedVideos`, `totalVideos`, `percent`) | Existe; en la demostración se registra en el navegador |
| Intento del examen: fecha, nota, escala, correctas, duración, resultado | Intentos (`date`, `score`, `scaleMax`, `correctCount`/`totalQuestions`, `durationSec`, `passed`) | Existe |
| Certificado obtenido (enlace) | Certificados | Existe |

Es demostrativo: el avance y los intentos se guardan en `localStorage`, se pueden manipular desde el navegador y no se sincronizan entre dispositivos. Para que sea fiable se necesita un backend: registro del avance en el servidor (incluido el tiempo de visualización real), control del intento en el servidor (RN-14) y autenticación real. No se mostrarán datos que el modelo no tiene (por ejemplo, tiempo total de estudio o ranking).

**Decisión B: RN-15 (D6).** Se bloquearán los cambios en la **configuración** y en las **preguntas** de un examen cuando exista **al menos un intento** registrado. Queda planificado para una etapa posterior; **no se implementó en F1 ni F2**. Queda por definir en esa etapa: el mensaje al administrador, si se permitirá crear una nueva versión del examen y cómo se tratará un intento en curso, que el repositorio simulado no puede detectar.

---

## 17. Etapa F3: correcciones de la experiencia del alumno (27/10/2026)

### 17.1 Correcciones

| Tema | Hallazgo | Corrección |
|---|---|---|
| F3.1 Inicio de sesión | **Confirmado.** El aviso «Correo o contraseña incorrectos.» solo se borraba con «Usar» o al reenviar un formulario válido: seguía visible al editar los campos o al enviarlos vacíos. | El aviso se borra en cuanto se edita cualquier campo y al enviar un formulario inválido. Se mantienen las validaciones (obligatorio, formato de correo, 6 caracteres) y el mismo mensaje genérico para correo inexistente o contraseña incorrecta (no revela si la cuenta existe). |
| F3.2 Instrucciones | «Intentos disponibles» se calculaba con el valor guardado (`maxAttempts`) y el aviso decía que los intentos eran un valor de demostración por confirmar. Un examen bloqueado mostraba las instrucciones «Antes de comenzar» y el botón «Comenzar examen» deshabilitado, con el motivo al final. | Los intentos se muestran con la regla (`MAX_ATTEMPTS`): «n de 1», más «Tienes un solo intento para este examen…». El aviso de valores de demostración ya no menciona intentos. Con el examen bloqueado se muestra primero «El examen no está disponible» y el motivo del repositorio (borrador, videos pendientes, intento consumido…), sin instrucciones ni botón para comenzar. Se conserva RN-04 («un examen en curso a la vez»). |
| F3.3 Temporizador y entrega | **Confirmado y reproducido** en una prueba: con el tiempo en 0 y la entrega rechazada, el temporizador la reenviaba cada segundo (4 envíos en 3,5 s). | El envío automático por tiempo agotado se intenta **una sola vez**. Tras un rechazo, la pantalla consulta al repositorio: si el examen ya no está disponible (rechazo definitivo), cierra la sesión del navegador, oculta el envío y muestra «No se registró la entrega.» con «Volver a las instrucciones». Si el error no es definitivo, conserva la sesión y permite reenviar a mano. No se navega al resultado sin la confirmación del repositorio. Se mantiene el bloqueo de envíos duplicados. |
| F3.4 Resultado | No indicaba el curso. Con un solo intento, «Puedes volver a intentarlo…» y «Volver a intentarlo» eran inalcanzables para el examen rendido. | Muestra «Curso: …» (también si aún no hay intentos o si el curso ya no está asignado). Se eliminaron la invitación a volver a rendir y su botón. Solo si el último intento es de un examen anterior (inactivo) y el curso tiene una **evaluación nueva** disponible, se indica y se ofrece «Ir a la nueva evaluación»; en ese caso no se muestra la nota mínima del examen nuevo junto a la nota antigua. Se conservan los mensajes de aprobación y desaprobación, la nota, la escala y el certificado. |
| F3.5 Página 404 | «Ir al inicio» apuntaba siempre a `/login`; con sesión funcionaba solo porque el guard de `/login` redirigía. | Apunta al inicio del rol (`/panel` o `/admin`) o a `/login` sin sesión. Los guards no cambiaron: un alumno que intenta abrir `/admin` sigue volviendo a `/panel`. |
| F3.6 Aviso de migración | `getStorageStatus()` existía desde E1 (con pruebas), pero **ninguna pantalla lo consultaba**. | Aviso discreto en el panel de administración, solo cuando `warning` tiene texto: informativo tras migrar datos v2; de advertencia si los datos no eran válidos (con copia de respaldo) o la migración falló, con el detalle de diferencias si las hay. Se puede ocultar durante la visita. Solo lee el estado: no migra, no borra (no se ofrece `removeLegacyState`) y no cambia la persistencia. |

### 17.2 Verificado

- **206 pruebas** en 20 archivos (24 nuevas: inicio de sesión, instrucciones y resultado, entrega del examen, página 404 y aviso de datos). Una prueba existente se adaptó: con el examen bloqueado ya no espera un botón «Comenzar examen» deshabilitado, sino que no exista; conserva el resto de sus comprobaciones. TypeScript de aplicación y pruebas y compilación de producción, correctos.
- **18 comprobaciones en Chrome sin interfaz** (perfil temporal aislado), a 1280 × 900 y 390 × 844, con revisión visual de las capturas y sin errores de consola: inicio de sesión (aviso y validaciones), instrucciones bloqueadas (borrador, videos pendientes, intento consumido) y disponibles, entrega manual con doble pulsación (1 intento registrado) y resultado con curso, tiempo agotado con rechazo definitivo (sesión cerrada, sin intento nuevo), 404 según el rol, y el aviso de datos (ausente con datos válidos; visible con datos inválidos preparados **solo en el perfil temporal**, con su copia de respaldo intacta).

### 17.3 Pendientes

- **RN-15** sigue sin implementar (decisión B, sección 16.5).
- El aviso de datos refleja la carga al abrir la aplicación; tras recargar con datos v3 válidos desaparece, aunque el estado v2 siga guardado. Eliminar el estado v2 (`removeLegacyState`) no tiene pantalla: requiere una decisión del equipo.
- Distinguir un rechazo definitivo de un error temporal depende de volver a consultar la disponibilidad. Con un backend real habrá que usar códigos de error del servidor (RN-14).
- Tras un rechazo definitivo, la cabecera del examen sigue mostrando el contador en 00:00 y el número de preguntas.
- Sin backend: el temporizador, la sesión del examen y la autenticación siguen simulados en el navegador.

---

## 18. Etapa F4: pantalla «Mi progreso» del alumno (27/10/2026)

Implementa la **decisión A** (sección 16.5). «Mis certificados» no cambió y sigue dedicada solo a certificados.

### 18.1 Implementación

| Tema | Implementación |
|---|---|
| Acceso | Ruta `/progreso` dentro de la zona del participante (`roleGuard('participant')`): sin sesión lleva a `/login`; un administrador vuelve a `/admin`. Enlace «Mi progreso» en el menú del alumno, entre «Mis cursos» y «Mis certificados», con `aria-current` cuando está activo. |
| Datos | Solo del alumno autenticado y de fuentes existentes: `getParticipantCourses` (cursos asignados visibles, estado de la inscripción, videos completados frente a publicados y porcentaje), `listAttempts`, `listCertificates`, `getExamAvailability` y `getActiveExam`. No se modificaron el repositorio ni los modelos. |
| Por curso | Nombre, estado de la inscripción, avance («n de m videos completados» y %), estado de la evaluación, intentos registrados (fecha, nota con **la escala guardada en el intento**, correctas, duración, resultado) y botón para entrar al curso («Comenzar», «Continuar» o «Revisar curso»). Según el estado, «Ir a la evaluación», «Continuar evaluación» o «Ver resultado». |
| Estado de la evaluación | **Pendiente** (con el motivo que da el repositorio: borrador, videos pendientes, sin examen o sin preguntas), **Disponible**, **En curso** (sesión de examen abierta en este navegador), **Aprobada** o **Desaprobada** (según el intento registrado). |
| Certificados | Solo un enlace al certificado emitido del curso, o «Certificado pendiente de emisión.» si se aprobó sin certificado. No se listan, previsualizan ni descargan certificados (eso sigue en «Mis certificados»). |
| Estados vacíos | Sin cursos asignados: aviso claro, sin resumen ni lista. Con cursos pero sin avance ni intentos: «Todavía no registras avance…». |
| Resumen | Cursos asignados, cursos con todos los videos vistos y evaluaciones aprobadas, calculados con los mismos datos. |

### 18.2 Verificado

- **220 pruebas** en 21 archivos (14 nuevas en `my-progress.spec.ts`, con las rutas reales y sus guards): deducción de cada estado de la evaluación; alumno con varios cursos sin avance; progreso parcial; curso completo con evaluación disponible y en curso; evaluación desaprobada con su resultado histórico; escala guardada en el intento; aprobada con certificado emitido o pendiente; alumno sin cursos; solo datos propios; menú; separación de «Mis certificados»; protección de rutas (sin sesión, administrador) y guard de acceso al curso. TypeScript de aplicación y pruebas y compilación de producción, correctos.
- **16 comprobaciones en Chrome sin interfaz** (perfil temporal aislado) a 1280 × 900 y 390 × 844, con revisión visual de las capturas y sin errores de consola: Pedro (3 cursos sin avance), Luis (parcial y completo), Carla (desaprobada), Ana (aprobada con certificado), un participante sin cursos creado desde administración **solo en el perfil temporal**, menú y enlace al curso, «Mis certificados» independiente, y redirecciones de administrador y sin sesión. La revisión visual detectó y corrigió un espaciado faltante entre el resumen, las tarjetas y sus botones.

### 18.3 Limitaciones y decisiones pendientes

- **«Rendida»** no se muestra como estado propio: con un solo intento, toda evaluación rendida queda **aprobada** o **desaprobada**, y así se muestra (con su fecha).
- **«En curso»** solo se detecta en el navegador donde se abrió el examen (la sesión se guarda en `sessionStorage`). En otro navegador se mostraría «Disponible».
- El avance y los intentos se guardan en `localStorage` (demostración): se pueden manipular desde el navegador y no se sincronizan entre dispositivos. Para que sean fiables se necesita un backend (registro del avance y del intento en el servidor, RN-14, y autenticación real).
- No se muestran datos que el modelo no tiene: tiempo total de estudio, fecha de cada video visto, ranking o progreso por módulo.
- Los cursos en borrador aparecen solo porque la demostración los muestra (igual que en «Mis cursos»); fuera del modo demostración el repositorio no los devuelve.
- **RN-15** sigue sin implementar (decisión B).

---

## 19. Etapa RN-15: bloqueo de edición de evaluaciones con intentos registrados (27/10/2026)

Implementa la **decisión B** (sección 16.5). Sustituye a lo indicado como pendiente sobre RN-15 en las secciones 14, 15.2, 16.5, 17.3 y 18.3.

### 19.1 Regla implementada

Si un examen tiene **al menos un intento registrado**, no se puede modificar su configuración (tiempo, escala, nota mínima) ni agregar, editar o eliminar sus preguntas. Se rechaza aunque los valores no cambien. El motivo informado es el bloqueo, antes que cualquier validación de formato:

> «Esta evaluación no se puede modificar porque ya existen intentos registrados. Los cambios podrían afectar la integridad de los resultados históricos. La creación de una nueva versión de la evaluación aún no está disponible.»

| Capa | Implementación |
|---|---|
| Regla y mensaje | Constante `EXAM_LOCKED_MESSAGE` en `exam.model.ts`, junto a `MAX_ATTEMPTS`. No cambia la forma de ningún modelo. |
| Repositorio (donde se aplica) | `examLockReason(exam)` cuenta los intentos de **ese examen** (`examId`). Se comprueba en las **seis** operaciones que escriben en una evaluación: `updateExamConfigById`, `saveExamQuestion` y `deleteExamQuestion` (por examen), y `updateExamConfig`, `saveQuestion` y `deleteQuestion` (heredadas del curso principal, sin uso en la interfaz). No se cambió el contrato `DataRepository`. |
| Por evaluación | El bloqueo es de cada examen, activo o no. Una evaluación de otro curso, o una nueva del mismo curso sin intentos, sigue editable. |
| Pantalla «Evaluaciones» | Consulta los intentos del examen con `listAttempts({ examId })`. Si hay intentos, muestra el aviso «Edición bloqueada» (`role="status"`, enlazado al formulario con `aria-describedby`) con el número de intentos. La configuración queda en solo lectura (campos desactivados y sin «Guardar configuración»). Las preguntas se ven sin «Agregar pregunta», «Editar» ni «Eliminar» («Solo lectura» en cada fila). Si el repositorio rechaza un cambio por RN-15 (por ejemplo, porque alguien rindió con la pantalla abierta), se muestra el mensaje y la pantalla se recarga en solo lectura. |
| Datos | No se borra, migra ni reescribe nada: intentos, notas, escalas, certificados y preguntas se conservan. |

**Consecuencia en la demostración:** el examen de c1 (`c1-e1`) tiene 3 intentos en la semilla (Ana, Carla y Jorge), así que su configuración y sus preguntas quedan **en solo lectura**. Los exámenes de IA y de Marketing (sin intentos) siguen editables.

### 19.2 Pruebas

- **234 pruebas** en 23 archivos (14 nuevas en `mock-data-repository.rn15.spec.ts` y `admin-evaluations.rn15.spec.ts`), TypeScript de aplicación y pruebas, y compilación de producción, correctos.
  - Cobertura nueva: sin intentos se permite configurar y agregar, editar y eliminar preguntas; con intentos se bloquean las seis operaciones (también con los mismos valores o con valores inválidos); basta un intento real para bloquear; un cambio rechazado no altera exámenes, preguntas, intentos, notas, escalas, certificados ni inscripciones; el bloqueo es por curso y por evaluación (una evaluación nueva del mismo curso es editable y la anterior sigue bloqueada); el alumno puede rendir una evaluación bloqueada y se mantiene la regla de un intento; la pantalla informa el bloqueo de forma accesible, en solo lectura; el repositorio rechaza aunque se invoque sin la interfaz; una evaluación que se bloquea con la pantalla abierta pasa a solo lectura; y el bloqueo se recalcula al cambiar de curso.
  - **8 pruebas existentes adaptadas, sin eliminar ninguna:** editaban el examen de c1, que ahora tiene intentos. Comprueban otras reglas (validaciones, RN-12, pregunta mínima, escala al calificar, que no cambien las demás preguntas), así que ahora preparan c1 **sin intentos**, solo en el `localStorage` aislado de la prueba, y conservan sus aserciones.
- **12 comprobaciones en Chrome sin interfaz** (perfil temporal aislado), a 1280 × 900 y 390 × 844, con revisión visual de las capturas y sin errores de consola: c1 en solo lectura con el aviso; IA editable y su configuración guardada; Rosa rinde c1 y ve su resultado y «Mi progreso»; c1 pasa a mostrar 4 intentos con el examen, las preguntas y los intentos anteriores sin cambios; Resultados, Certificados y Dashboard siguen funcionando.

### 19.3 Evaluación en curso

El modelo **no permite detectar de forma fiable** un examen en curso: la sesión de examen se guarda en el `sessionStorage` del navegador del alumno, que el administrador no ve. Por eso el bloqueo solo cuenta **intentos entregados**. Si un alumno tiene el examen abierto y todavía no entregó, el administrador aún puede modificar la evaluación, y la entrega se calificará con las preguntas y la configuración vigentes al entregar. Para evitarlo hace falta un backend que registre el inicio del intento (RN-13, RN-14) y bloquee desde ese momento.

### 19.4 Limitaciones y pendientes

- **Nuevas versiones de una evaluación:** no están disponibles. Para cambiar una evaluación bloqueada habría que definir con el equipo:
  - cómo se crea la nueva versión: copiar la configuración y las preguntas, desactivar la anterior y activar la nueva;
  - quién puede rendir la nueva versión: hoy cada alumno tiene un intento **por examen**, así que una versión nueva daría un nuevo intento a quien ya rindió;
  - qué ocurre con los certificados emitidos con la versión anterior;
  - cómo se muestra el historial por versión en Resultados y en «Mi progreso».
  
  El repositorio ya permite un examen nuevo cuando no hay uno activo (`createCourseExam`), pero no hay una pantalla para desactivar el actual ni para copiarlo.
- **Videos:** RN-15 también menciona que los videos de un curso publicado no deben alterar una evaluación activa. Esta etapa solo bloquea la configuración y las preguntas del examen. Los cambios de videos siguen sujetos a RN-03.
- **Publicación del curso:** pasar un curso a borrador no está bloqueado por RN-15 y sigue bloqueando el examen para los alumnos (sin borrar intentos).
- Sin backend: el bloqueo se aplica en el repositorio simulado del navegador. El control definitivo corresponde al servidor.

---

## 20. Rediseño visual V3: panel de administración (28/10/2026)

Continúa el rediseño visual: V0 (sistema de diseño en `styles.css` e Inter), V1 (componentes compartidos: `.btn-sm`, `.btn-icon`, `.table-cards`, `dl.data`, `app-icon`, pipe `attemptDuration`) y V2 (área del alumno y modo enfoque del examen). V3 es **solo de presentación**: no cambia lógica, reglas, rutas, guards, datos, almacenamiento ni textos de negocio.

### 20.1 Cambios

| Pantalla | Cambios visuales |
|---|---|
| Layout de administración | Menú lateral con iconos y marca de página activa; barra superior con «Administración / sección actual», iniciales y nombre del administrador, y «Salir» con icono; contenido centrado (máx. 1240 px). Nuevo enlace «Saltar al contenido» (el layout del alumno ya lo tenía). Móvil (≤ 900 px): cajón con botón «Cerrar menú», cierre con Escape y enlaces fuera del orden de tabulación mientras está cerrado; el botón «Menú» usa un icono SVG en lugar del carácter ☰. |
| Estilo común (`styles.css`, limitado a `.admin`) | Encabezado de página con la acción principal a la derecha; títulos de tarjeta de 18 px; tablas con cabecera sobria, fila resaltada al pasar el puntero y, en móvil, cada fila como tarjeta separada; acciones destructivas («Eliminar», «Retirar curso») en rojo; acciones de fila en una sola línea en escritorio. |
| Dashboard | Métricas con icono en una fila de cinco en escritorio. |
| Participantes | Botón principal con icono («Registrar participante» / «Cancelar»); «Retirar curso» en rojo; separación correcta entre encabezado y buscador. |
| Cursos, Videos y Evaluaciones | Botones principales con icono (crear curso, agregar video, crear evaluación, agregar pregunta); «Eliminar» en rojo. Se conservan el bloqueo RN-15, las confirmaciones en línea y las validaciones. |
| Resultados y Certificados | Encabezado común; en Certificados, «Visualizar» y «Descargar» con icono. |

`app-icon` suma 7 iconos propios (grid, users, video, clipboard, plus, menu, x). No se añadieron dependencias.

### 20.2 Verificado

- **241 pruebas** en 26 archivos (2 nuevas en `admin-layout.nav.spec.ts`: sección actual, iconos, enlace de salto, cajón con botón de cierre y Escape). Las 239 anteriores pasan sin modificarse. TypeScript de aplicación y pruebas y compilación de producción, correctos (18 avisos de CommonJS ya existentes; ningún estilo de componente supera su presupuesto).
- **Chrome** (perfil temporal aislado), administración a 1280, 390, 360 y 320 px: Dashboard, Participantes (lista y alta con validaciones), Cursos (lista y formulario), Videos (lista y formulario), Evaluaciones (bloqueada por RN-15 y editable con el formulario de pregunta), Resultados, Certificados (lista y vista previa) y el menú móvil, sin desbordes, recortes, controles de menos de 32 px ni caracteres Unicode como iconos, y sin errores de consola. Foco visible con teclado en el menú y la barra (escritorio y cajón móvil). Contraste de las combinaciones nuevas ≥ 5,5:1.
- **Funcionalidad de administración** con los recorridos de etapas anteriores: F1/F2 (métricas por curso, alta con cursos, retiro y asignación, resultados filtrados, vista previa y descarga del certificado) y RN-15 (bloqueo, edición permitida sin intentos, alumno que rinde): todos correctos.
- **Alumno y públicas sin cambios**: sus capturas de las 26 rutas son idénticas byte a byte a las de V2, salvo el aula con el video de YouTube incrustado, cuyo contenido externo varía entre cargas (composición idéntica).

### 20.3 Pendientes

- Con el cajón del menú abierto en móvil, el foco no queda atrapado dentro: al tabular se pasa a «Menú» y «Salir» de la barra. Conviene un control de foco (y devolverlo al botón «Menú» al cerrar).
- El diálogo de vista previa del certificado (administración) y el de confirmación del examen (alumno) no mueven el foco al abrirse ni se cierran con Escape.
- La barra «Versión de demostración» y los avisos de demostración siguen sin unificar (fase posterior).
- El logo sigue siendo provisional.

---

## 21. Rediseño visual V4: inicio de sesión y pantallas públicas (28/10/2026)

Solo presentación: no cambian la autenticación, las contraseñas de demostración, los guards, las rutas, la lógica de verificación de certificados ni la persistencia. Rutas revisadas: `/login`, `/verificar`, `/verificar/:codigo` (misma pantalla, con el código precargado) y la página 404 (`**`).

### 21.1 Cambios

| Pantalla | Cambios visuales y de accesibilidad |
|---|---|
| Layout público | Panel de marca con fondo decorativo (solo CSS) y tres líneas con icono que resumen lo que ya ofrece la plataforma (cursos asignados, evaluación en línea, certificado verificable). Se conservan el título, el texto y el aviso de demostración. En móvil, cabecera compacta con el logo. |
| Inicio de sesión | Aviso de credenciales con icono; cada mensaje de validación asociado a su campo (`aria-describedby`, `aria-invalid`); «Mostrar» dentro del campo de contraseña, con icono y `aria-pressed` (el campo conserva todo el ancho a 320 px); usuarios de prueba más compactos con «Usar» compacto; contraseña de demostración destacada; al pie, «Verificar un certificado» y, separada y en rojo, «Restablecer datos de demostración» (su confirmación sigue pendiente, según lo acordado). |
| Verificación | Encabezado con escudo; selector «Por código» / «Por DNI» con `aria-pressed`; error de campo vacío asociado al campo; resultado con icono y borde de color según el estado (válido, revocado, no encontrado). Se conservan los datos, los códigos, los estados y el aviso de que es una verificación de demostración: no se presenta como verificación oficial. |
| 404 | Logo, icono, tarjeta con mejor jerarquía y fondo con la marca. «Ir al inicio» sigue llevando al inicio del rol (`/panel` o `/admin`) o a `/login` sin sesión; los guards no cambian. |

### 21.2 Verificado

- **248 pruebas** en 28 archivos (7 nuevas: `verify.spec.ts` y `login.a11y.spec.ts`); las 241 anteriores pasan sin modificarse. TypeScript de aplicación y pruebas y compilación de producción, correctos (18 avisos de CommonJS ya existentes).
- **Chrome** (perfil temporal aislado) a 1280, 390, 360 y 320 px: inicio de sesión (vacío con validaciones, credenciales incorrectas), «Mostrar», acceso por rol (alumno a `/panel`, administrador a `/admin`), verificación (vacía, por código válido, por DNI, código inexistente), 404 para invitado, alumno y administrador, y navegación con teclado en el login (foco visible). 38 de 38 comprobaciones sin desbordes, recortes, controles de menos de 32 px, campos sin etiqueta ni errores de consola.
- **Sin cambios en el alumno ni en la administración**: sus capturas son idénticas a las del final de V3 (píxel a píxel en administración; byte a byte en el área del alumno).

### 21.3 Pendientes

- **Confirmación de «Restablecer datos de demostración»**: sigue ejecutándose sin preguntar; queda para la fase acordada.
- El layout público no tiene enlace «Saltar al contenido» (el formulario es lo primero tras el logo, que no es un enlace).
- Las etiquetas de las cuentas de prueba vienen de los datos de demostración y mezclan el rol y el estado en un solo texto.
- El logo sigue siendo provisional.

---

## 22. Etapa V5: accesibilidad, acciones destructivas y revisión responsive (28/10/2026)

No cambian la autenticación, los roles, los guards, las rutas, las reglas de exámenes, los intentos, los certificados ni la persistencia. El único cambio de comportamiento es la confirmación antes de restablecer los datos de demostración, pedida expresamente. No se agregaron dependencias.

### 22.1 Cambios

| Área | Cambio |
|---|---|
| Restablecer datos de demostración (login) | Antes de restablecer se muestra una confirmación en línea (`role="alertdialog"`) que explica qué se pierde: participantes, cursos, videos, preguntas, avances, intentos y certificados creados o modificados en este navegador; las cuentas de prueba y su contraseña no cambian. El foco pasa a «Cancelar». «Cancelar» o Escape cierran sin tocar nada y devuelven el foco al botón. «Sí, restablecer» ejecuta el mismo `resetDemo()` de siempre, una sola vez. |
| Cuentas de prueba (login) | Cada cuenta muestra el rol como etiqueta («Participante» o «Administrador») y debajo el estado en negrita. Solo cambia la presentación: los datos, los correos y la contraseña son los mismos. |
| «Saltar al contenido» | Nuevo en el layout público. Se corrigió un defecto real en los tres layouts: el enlace `#contenido` no movía el foco, que quedaba en `BODY`. Ahora un manejador común (`shared/a11y/skip-link.ts`) enfoca `main#contenido`, que tiene `tabindex="-1"`, sin cambiar la URL. Solo es visible cuando recibe el foco. |
| Menú móvil de administración | Al abrir, el foco pasa a «Cerrar menú» y el resto del panel queda `inert`, así que Tab no sale del cajón. Escape, el botón «Cerrar menú» y el clic en el fondo lo cierran y devuelven el foco a «Menú». Elegir un enlace navega y lo cierra. En escritorio no cambia nada. |
| Vista previa del certificado (administración) | Al abrir, el foco pasa a «Cerrar» y Tab y Mayús+Tab quedan dentro del diálogo (`shared/a11y/focus-trap.ts`). Escape cierra y el foco vuelve a «Visualizar». |
| Confirmación del examen (alumno) | Al abrir, el foco pasa a «Seguir revisando» y Tab alterna entre «Sí, enviar» y «Seguir revisando». Escape o «Seguir revisando» cierran sin enviar y el foco vuelve a «Finalizar y enviar». La calificación y el envío no cambian. |

**Evaluados y no cambiados:**
- **Avisos de demostración:** no se unificaron. Cada uno explica una limitación distinta (barra general, verificación, progreso simulado, borrador) y ya comparten el mismo estilo; fusionarlos haría perder información.
- **Logo:** no se modificó. Un cambio podría confundirse con el logo oficial; el texto «LOGO» es decorativo y está oculto para lectores de pantalla.

### 22.2 Verificado (resultados reales)

**Pruebas automáticas**

| Comprobación | Resultado |
|---|---|
| `npx ng test --watch=false` | Código de salida 0: **262 de 262** pruebas en 32 archivos. Las 14 nuevas de V5 están en `login.reset.spec.ts`, `admin-layout.focus.spec.ts`, `admin-certificates.spec.ts` y `exam-dialog.spec.ts`. |
| `npx tsc -p tsconfig.app.json --noEmit` | Código de salida 0, sin mensajes. |
| `npx tsc -p tsconfig.spec.json --noEmit` | Código de salida 0, sin mensajes. |
| `npx ng build` | Código de salida 0. Total inicial: 346,02 kB. 18 avisos de CommonJS ya existentes, ajenos a V5 (`qrcode`; `html2canvas` vía jspdf; módulos de `core-js`, `raf` y `rgbcolor` vía canvg). |

**Chrome**

Cada comprobación se ejecutó por separado, sin interfaz, con un perfil temporal nuevo, un puerto propio, un límite de 90 s por comprobación y otro global por ejecución. Los resultados se guardan al terminar cada comprobación.

| Comprobación | Anchos | Resultado |
|---|---|---|
| Restablecer: cancelar, Escape y confirmar | Cancelar a 1280, 390, 360 y 320; Escape y confirmar a 1280 | **Aprobada, 8 de 8.** Al cancelar o con Escape los datos guardados quedan idénticos y se conserva el participante creado en el perfil temporal. Al confirmar vuelven los 7 usuarios de prueba y aparece «Datos de demostración restablecidos.». |
| «Saltar al contenido» (público, alumno y administración) | Público a 1280, 390, 360 y 320; alumno y administración a 1280 y 320 | **Aprobada, 9 de 9.** Es visible con el foco, lleva a `MAIN#contenido`, la URL no cambia y el siguiente Tab llega al primer control del contenido. |
| Menú móvil de administración | 390, 360 y 320; escritorio a 1280 | **Aprobada, 16 de 16.** El foco pasa a «Cerrar menú», los 7 enlaces se recorren sin salir del cajón y Mayús+Tab también queda dentro. Escape, el botón y el fondo devuelven el foco visible a «Menú». Un enlace navega y cierra el cajón. Escape con el menú cerrado no mueve el foco. |
| Vista previa del certificado | 1280, 390, 360 y 320 | **Aprobada, 6 de 6.** El foco pasa a «Cerrar», Tab y Mayús+Tab quedan dentro y Escape y «Cerrar» devuelven el foco a «Visualizar». |
| Confirmación del examen (Rosa, sin intentos) | 1280, 390, 360 y 320 | **Aprobada, 8 de 8.** El foco inicial está en «Seguir revisando» y Tab alterna entre los dos botones. Con Escape o «Seguir revisando» el examen no se envía: Rosa sigue con 0 intentos y en `/cursos/c1/examen/rendir`. |
| Regresión de 26 rutas en escritorio y móvil | — | **Aprobada, 44 de 44.** Las capturas del alumno y de la administración son idénticas a las de V4 (ver la nota sobre las diferencias). El login difiere a propósito por las etiquetas de cuentas. |
| Flujos F1/F2 (multicurso), RN-15 y examen o descargas de V2 | — | **Aprobados:** 22 de 22, 12 de 12 y 9 de 9. |
| Consola | Todas las ejecuciones | Sin errores ni advertencias; solo los mensajes de desarrollo de Vite y Angular. |

**Notas sobre las diferencias de capturas**
- `21-admin-participantes-d`: 30 píxeles con diferencia máxima de 3/255. En la ejecución siguiente volvió a ser idéntica a V4, así que es ruido de renderizado.
- `19-aula-borrador`: la diferencia está solo dentro del reproductor de YouTube incrustado, que en esa ejecución cargó su título. Es contenido externo, no un cambio de la aplicación.

**Comprobaciones que fallaron durante la etapa y cómo se resolvieron**

| Ejecución | Qué pasó | Tipo | Resolución |
|---|---|---|---|
| `v5a` | Interrumpida por el tiempo límite en «examen · confirmación con teclado»: el Enter simulado no llevaba carácter y no activaba el botón, y la espera quedó colgada. | Script | Enter con su carácter; límites por comprobación y por ejecución; resultados guardados al terminar cada una. |
| `v5b` | «Saltar al contenido» no movía el foco (quedaba en `BODY`). | **Defecto real** | Corregido en los tres layouts. |
| `v5b` | Falla aparente del cajón: tras el último enlace el foco pasa a la interfaz del navegador (`BODY`) y luego vuelve a «Cerrar menú». | Script | La comprobación acepta ese paso, pero exige volver a «Cerrar menú» y que ningún control fuera del cajón reciba el foco. |
| Regresión de 26 rutas | «fuente Inter» fallaba siempre, también en V3 y V4: el script llamaba a `evaluate()` sin expresión. | Script | Corregido; ahora mide la fuente y aprueba. |
| `rn15-check` (primera ejecución) | Superó 500 s sin resultados. Al repetirla con límites y registro de diálogos nativos aprobó 12 de 12 en 31 s. No se abrió ningún diálogo nativo ni quedaron procesos. | Bloqueo puntual, no reproducido | No requirió cambios en la aplicación. |
| Examen (primera ejecución separada) | La comprobación esperaba la URL `/cursos/c1/examen`, pero la página del examen es `/cursos/c1/examen/rendir`; foco, Escape y 0 intentos ya eran correctos. Un reintento se agotó en el inicio de sesión, que estaba fuera de cualquier comprobación. | Script | URL corregida e inicio de sesión dentro de una comprobación; la repetición aprobó 8 de 8. |

### 22.3 Pendientes

- El logo sigue siendo provisional, a la espera del logo oficial.
- Los avisos de demostración se mantienen separados (ver 22.1).
- No se revisó con lectores de pantalla reales (NVDA o VoiceOver): la verificación se hizo con atributos ARIA, foco y teclado en Chrome.
- Los pendientes de foco de 20.3 y de confirmación, «Saltar al contenido» y etiquetas de cuentas de 21.3 quedan resueltos en esta etapa.

### 22.4 Archivos

- **Modificados (15):**
  - `features/auth/login/`: `login.ts`, `login.html`, `login.css`;
  - `layouts/auth-layout/`, `layouts/admin-layout/` y `layouts/participant-layout/`: sus archivos `.ts`, `.html` y `.css`;
  - `features/administration/admin-certificates.ts`;
  - `features/exam/exam/`: `exam.ts` y `exam.html`.
- **Este documento:** `docs/PENDIENTES.md`.
- **Nuevos:**
  - `shared/a11y/skip-link.ts` y `shared/a11y/focus-trap.ts`;
  - pruebas: `features/auth/login/login.reset.spec.ts`, `layouts/admin-layout/admin-layout.focus.spec.ts`, `features/administration/admin-certificates.spec.ts` y `features/exam/exam-dialog.spec.ts`.

### 22.5 Estado de Git

- HEAD sigue en `17e9ea6` (rama `master`): sin commits, stash, reset, clean ni restauraciones.
- La línea base de V5 tenía 96 entradas en `git status --short`; ahora hay 101. Las 5 nuevas son las 4 pruebas y la carpeta `src/app/shared/a11y/`.
- De los 107 archivos con checksum en la línea base, solo cambiaron los 15 de V5 (y este documento). Los cambios pendientes de etapas anteriores se conservan intactos.

---

## 23. Mejoras funcionales M1 a M8: módulos, tipos de pregunta, Google Drive, certificados obtenidos y verificación (29/10/2026)

Frontend solamente: sin backend, sin servicios externos, con el repositorio simulado y `localStorage` (`imc-demo-state-v3`). No se reiniciaron datos reales, no se hicieron commits ni operaciones destructivas de Git, y no se agregaron dependencias.

### 23.1 Decisiones de negocio aplicadas (autorizadas el 29/10/2026)

| Tema | Decisión |
|---|---|
| RN-03 y módulos (D2) | Se mantiene **5 a 7 videos publicados por curso**, repartidos libremente entre módulos. No cambian los límites ni las reglas de publicación. |
| Selección múltiple | **Todo o nada**: el puntaje solo se obtiene si el conjunto marcado coincide exactamente con las correctas. |
| Preguntas abiertas | **Excepción a RN-12** (sin respuesta correcta). El intento queda **«En revisión»** y lo califica el **administrador** en Seguimiento y resultados; no hay rol de profesor. El certificado se emite **solo al completar la calificación y si aprueba**. |
| Google Drive | **Fuente provisional**: se valida el formato del enlace, se usa el visor de Drive, se informa sobre los permisos y se ofrece «Abrir en Google Drive». |

Decisiones de implementación (no cambian reglas de negocio, se documentan para revisión):

- Una calificación completada **no se modifica**. Así se protegen los resultados históricos, el mismo criterio que RN-15.
- Se admiten **medios puntos** en las preguntas abiertas.
- La **fecha de aprobación** del certificado de un examen con preguntas abiertas es la fecha en que se completa la calificación.
- Las preguntas de selección admiten hasta **8 alternativas**; antes eran 5.

### 23.2 Cambios por fase

| Fase | Implementado |
|---|---|
| **M1** Modelos y compatibilidad | Campos opcionales: descripción de módulo, fuente `drive`, pregunta `open` con criterio, respuestas y revisión del intento, estado `en_revision`. Nueva utilidad `core/utils/drive.ts`. Un estado guardado antes de M1 se carga **sin migración y sin reescribirse**. |
| **M2** Módulos | `saveCourseModule`, `moveCourseModule`, `deleteCourseModule` y `assignCourseVideoToModule`. Al eliminar un módulo, sus videos pasan a otro y **nunca se borran**; el último módulo no se elimina. Sección **«Contenido del curso»** en Editar curso: acordeón, crear, editar, ordenar, eliminar con confirmación, mover videos y agregar videos existentes del mismo curso. Desde ahí se puede crear un video en un módulo. En Videos se agregan el campo y la columna «Módulo», y las flechas ordenan solo dentro del módulo. |
| **M3** Aula del alumno | Con varios módulos: acordeón con contador de vistos y descripción, el módulo actual se despliega solo, «Módulo N · título» en el encabezado del video y navegación continua entre módulos. Con un solo módulo el aula **no cambia**. |
| **M4** YouTube y Google Drive | Selector «Fuente del video» (YouTube, Google Drive, otro enlace https, sin archivo) con ayuda, orientación inmediata y vista previa. El repositorio valida que el enlace corresponda a la fuente y rechaza carpetas y documentos de Drive. El reproductor usa el visor de Drive, muestra siempre el aviso de permisos y ofrece «Abrir en Google Drive». Los videos de YouTube existentes no cambian; un enlace vacío sigue siendo «sin archivo». |
| **M5** Preguntas abiertas | Tipo «Respuesta abierta» en Evaluaciones, con puntaje máximo y criterio opcional. El alumno responde en un campo de texto. El intento con abiertas queda «En revisión», sin nota, aprobado ni certificado. Calificación manual con confirmación en Seguimiento y resultados; al completarla se calculan la nota, aprobado o desaprobado y el certificado. «En revisión» aparece en resultado, Mi progreso, aula, dashboard, resultados y estados. |
| **M6** Certificados obtenidos | Tarjeta en Mi progreso: certificados **vigentes** del alumno autenticado, calculados de sus datos en cada carga. No cuenta revocados ni evaluaciones en revisión o desaprobadas. |
| **M7** Verificación pública | **Ya estaba implementada y no se reconstruyó.** Se auditó y se agregaron pruebas: acceso sin sesión, búsqueda por código y por DNI, estados válido, revocado y no encontrado, la ruta que codifica el QR, que el código o nombre de un curso no valida nada y que no se muestran DNI, correo ni nota. |

### 23.3 Verificado (resultados reales)

**Pruebas automáticas** (ejecución final, con la máquina sin el servidor de desarrollo)

| Comprobación | Resultado |
|---|---|
| `npx ng test --watch=false` | Código 0: **342 de 342** pruebas en 45 archivos. Antes de M1 eran 262; hay 13 archivos de prueba nuevos. |
| `npx tsc -p tsconfig.app.json --noEmit` | Código 0, sin mensajes. |
| `npx tsc -p tsconfig.spec.json --noEmit` | Código 0, sin mensajes. |
| `npx ng build` | Código 0. Total inicial: 354,88 kB. Los mismos 18 avisos de CommonJS ya existentes (`qrcode`, `html2canvas` vía jspdf; `core-js`, `raf` y `rgbcolor` vía canvg). |

Pruebas existentes modificadas, solo porque cambió lo que debían comprobar:

- `admin-courses.spec.ts`: se agregó el router a su configuración, porque la pantalla ahora contiene un enlace a Videos.
- `admin-videos.spec.ts`: el texto de la vista previa ahora menciona Google Drive.
- `my-progress.spec.ts`: el resumen incluye la nueva tarjeta.

**Chrome** (sin interfaz, cada comprobación con un perfil temporal nuevo; consola sin errores en todas)

| Comprobación | Anchos | Resultado |
|---|---|---|
| Flujo M5 → M6 → M7 | 1280, 390 y 320 | **Aprobado, 21 de 21.** El administrador crea la pregunta abierta. Rosa la responde y queda «En revisión», con Certificados = 0. RN-07: sin nuevo intento. RN-15: evaluación bloqueada. Calificación: 96 / 100, aprobado y certificado IMC-DEMO-0002; Certificados = 1. Verificación pública válida sin DNI ni correo. «No encontrado» para un código inexistente. |
| M2 Contenido del curso | 1280, 390 y 320 | **Aprobado, 7 de 7.** Sin desbordes; avance y RN-03 intactos. |
| M3 Aula con módulos | 1280, 390 y 320 | **Aprobado, 6 de 6.** Incluye teclado. |
| M4 Google Drive | 1280, 390 y 320 | **Aprobado, 10 de 10.** Formulario, vista previa y aula con aviso; YouTube sin cambios. |
| V5: restablecer, saltar al contenido, menú móvil, certificado y examen | 1280 a 320 | **Aprobado: 8, 9, 16, 6 y 8.** |
| Regresión: 26 rutas, F1/F2, RN-15 y examen o descargas | — | **Aprobado: 44, 22, 12 y 9.** |

**Diferencias de capturas frente al final de V5**

- Esperadas: Mi progreso (tarjeta nueva), Videos (columna «Módulo» y fuente), Resultados (columna de acción) y Dashboard (fila «En revisión» en el estado de las inscripciones).
- Ruido ya documentado: el reproductor de YouTube incrustado y 30 píxeles en Participantes.
- Las demás capturas del alumno y de la administración son idénticas.

**Incidencias durante la validación (ninguna era un defecto de la aplicación)**

- Una ejecución de la suite falló por sobrecarga de la máquina: CPU al 93 %, unos 1 GB de memoria libre y un worker terminado (SIGTERM). Las pruebas de M3 y F3.3 fallaron por tiempo. Al repetir sin carga aprobó 330 de 330, y la ejecución final 342 de 342.
- Una interrupción de la sesión dejó dos ejecuciones de Chrome a la vez. Se detuvo la duplicada y su carpeta se apartó como `m8z-m2-colision`, sin borrar nada; M2 se repitió en una carpeta nueva.
- Primera ejecución del flujo M8: el script elegía la primera opción de cada pregunta (por eso desaprobó correctamente con 29 / 100) y leía la tabla antes de que se actualizara. Se corrigió el script, no la aplicación, y la repetición aprobó 21 de 21.

Defectos reales encontrados y corregidos durante la etapa:

- **M4:** al volver a hacer clic en la fuente ya elegida no se registraba como elección explícita.
- **M2:** en Videos, las flechas no hacían nada en silencio en el límite entre módulos; ahora se deshabilitan.

### 23.4 Pendientes

- **Permisos de Google Drive:** sin backend ni la API de Google no se puede comprobar si un archivo está compartido. Se avisa siempre; la comprobación real requiere backend (S8).
- **Calificación:** quien califica es el administrador; no existe rol de profesor (decisión del 29/10/2026). No hay recalificación ni comentarios al alumno.
- **Dashboard:** «Capacitaciones en progreso» no cuenta las inscripciones «En revisión». Se mantuvo el criterio existente; queda para confirmar con la empresa.
- **Numeración de módulos:** el aula numera solo los módulos con videos publicados, así que puede diferir de la administración si hay módulos vacíos.
- **Enlace del QR:** usa el origen del sitio más `/verificar/<código>`. Si la aplicación se publica en una subcarpeta, habrá que ajustarlo al definir el hosting (S8).
- Siguen vigentes los pendientes anteriores: logo provisional, lectores de pantalla y backend.

### 23.5 Archivos

- **Modificados (26):**
  - modelos: `course.model.ts` y `exam.model.ts`;
  - servicios: `data-repository.ts` y `mock-data-repository.ts`;
  - componentes compartidos: `status-badge.ts`, `icon.ts` y `video-player.ts`;
  - administración:
    - `admin-courses.ts`, `admin-videos.ts`, `admin-evaluations.ts` y `admin-results.ts`;
    - `admin-dashboard.ts` y `admin-utils.ts`;
  - alumno: `course-room.ts/.html/.css`, `exam.ts/.html/.css`, `result.ts/.html` y `my-progress.ts/.html`;
  - pruebas existentes: `admin-courses.spec.ts`, `admin-videos.spec.ts` y `my-progress.spec.ts`.
- **Este documento:** `docs/PENDIENTES.md`.
- **Nuevos:**
  - `core/utils/drive.ts` y `features/administration/admin-course-content.ts`;
  - 13 archivos de prueba:
    - `drive.spec.ts` y `compat-m1.spec.ts`;
    - `mock-data-repository.modules`, `.drive` y `.open`;
    - `admin-course-content`, `admin-videos.modules` y `admin-videos.drive`;
    - `course-room.modules`, `video-player.drive` y `open-questions`;
    - `my-progress.certificates` y `verify.m7`.

### 23.6 Estado de Git

- HEAD sigue en `17e9ea6` (rama `master`), sin commits ni stash.
- La línea base de esta etapa tenía 101 entradas en `git status --short`; ahora hay 114. Las nuevas son los archivos de M1 a M7 y `status-badge.ts`, que antes no tenía cambios.
- De los 112 archivos con checksum en la línea base, cambiaron 26: los 25 listados arriba que ya tenían cambios y este documento. `status-badge.ts` no estaba en esa lista porque antes no tenía cambios. Los otros 86 son idénticos, así que los cambios pendientes de etapas anteriores se conservan.

---

## 24. Fase 0 del backend: decisiones aprobadas (07/11/2026)

Decisiones comunicadas por el equipo el 07/11/2026 tras revisar `docs/ARQUITECTURA_BACKEND.md`. **No se modificó código
en esta fase:** el frontend sigue funcionando con las reglas anteriores hasta la fase del backend que corresponda.

### 24.1 Decisiones aprobadas

| # | Decisión | Sustituye o afecta | Fase |
|---|---|---|---|
| D-1 | El backend vive en `backend/`, dentro de este repositorio, como proyecto independiente. | — | B1 |
| D-3 | MySQL instalado localmente para desarrollo, sin Docker. Verificado: MySQL Community Server **8.0.42**, servicio `MySQL80` en ejecución. | — | B1 |
| D-4 | **Administrador pasa a llamarse Instructor**, de forma completa y compatible: sin romper sesiones guardadas, datos de `localStorage` ni enlaces existentes. Solo dos perfiles: Instructor y Estudiante. **Precisión posterior (decisión institucional confirmada el 12/11/2026, B2.2a):** se mantienen exclusivamente los roles `INSTRUCTOR` y `STUDENT`. La administración general de IMC **no es un tercer rol**: es un **permiso administrativo especial** (`IMC_GENERAL_ADMIN`) que tienen solo algunos Instructores, cuya cuenta conserva el rol `INSTRUCTOR`. Se asigna únicamente por un mecanismo administrativo seguro, nunca por registro público ni por una petición desde Angular (sección 34). | Rol `admin` del frontend | B1 |
| D-5 | Token de acceso de corta duración y renovación con cookie `HttpOnly`, `Secure` y `SameSite`, con rotación y revocación de sesiones. | Sesión simulada (`imc-demo-session`) | B1 |
| D-6 | **Un curso no puede publicarse si sus videos obligatorios no superan la validación de reproducción.** Interpretación propuesta (por confirmar): son obligatorios todos los videos publicados del curso, porque RN-11 exige verlos todos para rendir el examen. | Amplía RN-03 y `getPublicationCheck` | B3 |
| D-7 | No eliminar ni descartar datos de demostración. Respaldo previo y estrategia de migración documentada (24.4). | — | B0–B1 |
| D-8 | **Intentos:** un intento regular más una recuperación excepcional autorizada por el Instructor; máximo dos. El alumno no ve un botón para solicitarla; la recuperación es un intento nuevo con preguntas elegidas por el Instructor y conserva la configuración académica del examen original. **Videos:** alojados en Google Drive y YouTube, reproducidos dentro del aula. **Intentos: implementado en el frontend, modo demostración, el 11/11/2026 (sección 28); pendiente en el backend (B6).** **Precisión posterior (reglas del Bloque 2 comunicadas por el equipo el 10/11/2026; armonizada en la corrección final de B0.2):** el Instructor elige la **modalidad** de cada recuperación. **Original:** reutiliza el examen regular tal cual, sin modificarlo. **Independiente:** usa un examen de recuperación independiente creado por el Instructor (R5) a partir de preguntas del examen regular que él elige; las preguntas se copian, se pueden editar después y deben sumar exactamente la nota máxima. En ambas modalidades se conserva la configuración académica del original (escala, nota mínima y duración). La frase «preguntas elegidas por el Instructor» se cumple de forma literal en la modalidad independiente; en la original, el Instructor decide reutilizar las preguntas del examen regular. Detalle en 28.8. | Sección 15 y sección 10.1 | B6 / B3 |
| D-9 | Campos separados para **nombres** y **apellidos**. Los estudiantes se identifican con **DNI**. Las empresas tienen **RUC**. | Campo único `fullName` (D18 resuelto) | B1 (modelo) / B2 (pantallas) |
| D-10 | Usar la **API del reproductor de YouTube** (IFrame API) para detectar errores de reproducción. **No mide el tiempo real de visualización** y no debe presentarse como tal; el avance sigue siendo manual. | Limitación E4-1 | B3 |
| D-11 | La nota del certificado es la del intento con el que el estudiante aprobó. Con la regla D-8 solo puede existir un intento aprobado por examen (la recuperación solo existe si el regular desaprobó). Es lo que ya hace `issueCertificate`. Se mantiene con la recuperación (sección 28): el certificado usa la nota del intento aprobado y no se modificaron certificados emitidos. **Precisión posterior (reglas del Bloque 2 comunicadas por el equipo el 10/11/2026; armonizada en la corrección final de B0.2):** el paréntesis «la recuperación solo existe si el regular desaprobó» refleja la situación del 07/11/2026. Desde el Bloque 2, la recuperación se autoriza a quien **desaprobó** el examen regular **o a quien estuvo ausente**: sin intento regular y sin haberlo iniciado; al ausente no se le crea un intento ficticio. No corresponde si aprobó, si está pendiente de calificación o si está rindiendo el regular (28.8). Lo que dispone D-11 no cambia: como la recuperación solo se autoriza a quien no aprobó, sigue habiendo como máximo un intento aprobado por estudiante y curso, entre el regular y la recuperación (en la modalidad independiente la recuperación se rinde con otro examen). El certificado lleva la nota de ese intento. | — | B7 |
| D-12 | Las notas se muestran con **dos decimales** y redondeo convencional (mitad hacia arriba). Hoy el frontend redondea a enteros (`Math.round`); el cambio se implementará con el cálculo en el servidor, usando aritmética decimal, sin reescribir notas ya registradas. **Estado (aclarado en la corrección final de B0.2, sin cambiar la decisión):** (1) **decisión funcional aprobada:** dos decimales y redondeo convencional, mitad hacia arriba; (2) **regla implementada hoy en el frontend:** la nota del intento se redondea a **entero** (`Math.round`); los puntos por pregunta se guardan sin redondear y la suma de puntajes se compara en centésimas (2A). Esta regla sigue vigente en modo demostración y no se modifica; (3) **implementación pendiente en el backend** (B5–B6): cálculo decimal en el servidor (`ARQUITECTURA_BACKEND.md` 6.5). Cómo se muestran las notas decimales en las pantallas y si el aprobado se compara con la nota ya redondeada **no lo define D-12**: son pendientes aparte (24.2, B0-8). | Cálculo de nota actual | B5–B6 |

### 24.2 Pendientes de confirmación

| # | Asunto | Estado |
|---|---|---|
| D-2 | Características del hosting contratado (lista H1–H17 en `ARQUITECTURA_BACKEND.md`, sección 11.2). | **Pendiente:** se espera la información del proveedor. No se asume ninguna capacidad. |
| D-6b | Credenciales de Google. Análisis de qué requiere API y qué no: `ARQUITECTURA_BACKEND.md`, sección 10.5. | Pendiente de decisión tras el análisis. |
| D-6 (alcance) | Confirmar que «videos obligatorios» son todos los videos publicados. | Pendiente. |
| D-9 (formato) | DNI de 8 dígitos (validación actual) y RUC de 11 dígitos. | Propuesto; pendiente de confirmar. B0.2: también si se admitirán carné de extranjería o pasaporte (hoy no). |

**Agregados en B0.2 (11/11/2026).** Detalle técnico y numeración (B0-1 a B0-18) en `ARQUITECTURA_BACKEND.md`, 14.1.
Ninguno está aprobado.

| # | Asunto | Estado |
|---|---|---|
| D17 / B0-1 | **Credenciales de los estudiantes creados por el Instructor:** cómo se generan y entregan, y si se exige cambiarlas al primer ingreso. | **Resuelto el 13/11/2026:** enlace de activación único, temporal y de un solo uso enviado al correo; el estudiante crea su contraseña (sección 39). Falta el proveedor de correo real (B2.3c-1). |
| S1 / B0-2 | **Varios cursos** frente a RN-02 («un solo curso configurable»). | Solicitado, pendiente de validación formal (sección 2). |
| B0-3 | **RUC ficticios** para las empresas de demostración `emp-a` y `emp-b`. | **Pendiente.** No se inventan en B0.2. |
| B0-4 | **`emp-demo` y los estudiantes existentes** en `aula_imc_dev` (u1–u6 están en `emp-demo`; en el frontend, en `emp-a` y `emp-b`). | **Resuelto el 11/11/2026 (B2.1):** se conservan `emp-demo` y sus asociaciones, sin reasignar (sección 33). |
| B0-6 | **RN-15 desde el primer inicio** (hoy, desde el primer intento entregado). | Propuesta técnica, por validar. |
| B0-7 | **Intervalo y mecanismo del cierre automático** en el servidor. | Propuesta técnica, pendiente. |
| B0-8 | **Aplicación de D-12 en las pantallas:** formato de las notas decimales (por ejemplo, coma decimal) y si el aprobado se compara con la nota ya redondeada. No es una decisión nueva sobre D-12, que ya está aprobada (24.1): es cómo aplicarla. | **Pendiente.** Cambio de pantallas que requiere autorización; hasta entonces, el frontend sigue con notas enteras. |
| B0-9 | **Formato de las fechas de la API** (propuesta: ISO con `-05:00`). | Propuesta técnica, pendiente. |
| B0-10 | **Revocación de certificados** y su interfaz: el frontend muestra el estado `revocado`, pero no tiene operación ni pantalla para revocar. | **Pendiente.** |
| B0-11 | **Reemisión** de un certificado revocado. | **Pendiente.** |
| B0-12 | **Validación formal de IMC** de las reglas de las Etapas 1, 2A y 2B (secciones 28 a 31). | **Pendiente.** |
| B0-13 | **Excel de dos hojas** (Resumen y Detalle, 24.3). | **Aplazado.** Vigente: R8 (sección 28). |
| B0-17 | **Cambios del frontend en B2:** nombres, apellidos y empresa en el alta; pantallas de Empresas e Instructores, que no existen en R1–R9. | **Pendiente de autorización.** |

**Agregados en B2.1 (11/11/2026).** Detalle en la sección 33.4 y en `ARQUITECTURA_BACKEND.md`, 20.8. Ninguno está
aprobado.

| # | Asunto | Estado |
|---|---|---|
| B2.1-1 | **Estudiantes sin empresa:** con la regla de alcance por empresa, ningún Instructor puede verlos ni gestionarlos. | **Pendiente de decisión** antes de B2.2. |
| B2.1-2 | **Quién asigna instructores a empresas** y quién crea empresas (no hay perfil administrador). | **Resuelto el 12/11/2026:** la administración general de IMC (permiso especial de algunos Instructores, no un rol). Operaciones pendientes de B2.2b (sección 34). |
| B2.1-3 | **Visibilidad entre instructores** en `GET /users/:id` (hoy, como en B1.1). | **Pendiente de confirmar.** |
| B2.1-4 | **Historial de bajas** de empresas y matrículas (fila borrada con registro en la bitácora, o baja lógica). | **Empresas: resuelto en B2.2b** (baja lógica con `active` y bitácora, sin borrado físico; sección 35). **Asignaciones de instructores: resuelto en B2.2c** (se borra la relación y queda en la bitácora; sección 36). **Matrículas: pendiente.** |
| B2.1-5 | **RUC** obligatorio de 11 caracteres (B1.1): impide registrar empresas sin RUC mientras no se defina. | **Pendiente.** |
| B2.1-6 | Tipo `ApiUser.student.company` del frontend desactualizado (el backend devuelve `companies`). | Ajuste de Angular **pendiente de autorización**. |
| B2.1-7 | Aplicar la migración de B2.1 y ejecutar `test:db`. | **Pendiente de autorización expresa.** |

**Agregados en B2.2a (12/11/2026).** Detalle en la sección 34.4 y en `ARQUITECTURA_BACKEND.md`, 21.8. Ninguno está
aprobado.

| # | Asunto | Estado |
|---|---|---|
| B2.2a-1 | Otorgar el permiso de administración general a más cuentas y retirarlo (hoy solo se habilita la primera, por consola). | **Pendiente de decisión.** |
| B2.2a-2 | Si la administración general consulta o gestiona estudiantes (hoy no: el permiso no amplía el alcance por empresa). | **Pendiente de confirmar.** |
| B2.2a-3 | Informar el permiso al frontend para las pantallas de administración. | Pendiente; requiere autorizar Angular. |
| B2.2a-4 | Aplicar las migraciones de B2.1 y B2.2a, en ese orden, y ejecutar `test:db`. | **Pendiente de autorización expresa.** |
| B2.2a-5 | Cuenta de demostración con el permiso (la semilla no lo otorga). | Pendiente de decisión. |

**Agregados en B2.2b (12/11/2026).** Detalle en la sección 35.5 y en `ARQUITECTURA_BACKEND.md`, 22.8. Ninguno está
aprobado.

| # | Asunto | Estado |
|---|---|---|
| B2.2b-1 | **Efecto de desactivar una empresa.** | **Resuelto el 12/11/2026:** se conservan historial, asociaciones y acceso; sin nuevas asignaciones ni matrículas vinculadas (35.6). |
| B2.2b-2 | **¿El RUC se puede corregir después del registro?** | **Resuelto el 12/11/2026:** sí, con bitácora del valor anterior y el nuevo. |
| B2.2b-3 | **Reactivar una empresa.** | **Confirmada el 12/11/2026.** |
| B2.2b-4 | **Validación con MySQL** de la gestión de empresas (requiere aplicar las migraciones de B2.1 y B2.2a). | **Pendiente de autorización expresa.** |
| B2.2b-6 | **Qué es una matrícula «vinculada a una empresa inactiva»** (la matrícula no guarda empresa). | **Pendiente de precisión**, antes de B2.4. |
| B2.2b-7 | Semilla de demostración frente a una `emp-demo` inactiva. | Pendiente de decisión. |
| B2.2b-8 | Retirar asignaciones de una empresa inactiva. | **Instructores: resuelto en B2.2c. Estudiantes: resuelto el 13/11/2026 (P6), implementado en B2.3b.** |

**Agregados en B2.2c (12/11/2026).** Detalle en la sección 36.4 y en `ARQUITECTURA_BACKEND.md`, 23.8. Ninguno está
aprobado.

| # | Asunto | Estado |
|---|---|---|
| B2.2c-1 | Asignar instructores con la cuenta desactivada. | **Resuelto el 12/11/2026:** no reciben asignaciones nuevas (409); las existentes se conservan. |
| B2.2c-2 | Autoasignación del administrador a empresas. | **Resuelto el 12/11/2026:** permitida si cumple los requisitos de Instructor, con registro en la bitácora. |
| B2.2c-3 | Validación con MySQL de las asignaciones. | **Pendiente de autorización expresa.** |
| B2.2c-4 | Registro (alta) de Instructores por la administración general; requiere decidir D17. | Pendiente de bloque y autorización. |

### 24.3 Requisitos de la nueva etapa (comunicados el 07/11/2026, pendientes de implementar)

Gestión de **empresas** (cada estudiante pertenece a una sola) e **instructores**; **banco de preguntas** con categorías
y estado activo o inactivo; evaluación con nombre, escala 20 o 100 elegida al crearla y **suma de puntajes igual a la
escala** (no se guarda ni publica si no coincide); aviso emergente a los 5 minutos que se cierra sin detener el
temporizador; **no revelar al alumno** las respuestas correctas ni cuántas acertó; observaciones del Instructor en la
revisión; **reportes** por empresa, curso, estudiante, fechas, estado y tipo de intento, con exportación Excel en dos
hojas (Resumen y Detalle); portadas de escritorio y móvil. El detalle y su estado están en la auditoría del 07/11/2026
y en `ARQUITECTURA_BACKEND.md`.

**Estado al 11/11/2026 (solo frontend, modo demostración; el backend sigue pendiente):**

| Requisito | Estado |
|---|---|
| Aviso emergente a los 5 minutos, sin detener el temporizador | Implementado en el frontend (Etapa 1, sección 29). |
| No revelar al alumno las respuestas correctas ni cuántas acertó | Implementado en el frontend (Etapa 1, sección 29); se mantiene en las vistas de recuperación (sección 28). |
| Suma de puntajes igual a la escala | Implementado en el frontend (Etapa 2A, sección 30); también se exige al crear un examen de recuperación independiente (sección 28). |
| Exportación Excel | **Vigente: R8 (sección 28).** Un archivo `.xlsx` de una hoja y exactamente cinco columnas desde «Evaluaciones rendidas», según las reglas del Bloque 2 comunicadas por el equipo el 10/11/2026 (secciones 28.2 y 28.8). **El Excel de dos hojas (Resumen y Detalle) queda aplazado** (B0.2, 11/11/2026): no está implementado y no es una decisión formal de la empresa. Los reportes por fechas y tipo de intento siguen pendientes. Los filtros por empresa, curso y estudiante existen en la pantalla (R7). |
| Empresas | Parcial: existe el modelo `Company`, sin RUC, con dos empresas de demostración (`emp-a` y `emp-b`) que solo sirven para filtrar, y el valor «Sin empresa». **No hay gestión de empresas en la demostración** (no se pueden crear ni editar). En el backend existe la tabla `companies`, con `emp-demo` (B1.1); la diferencia está sin resolver (24.2, B0-3 y B0-4). **B2.1 (backend):** estudiantes en varias empresas o en ninguna, instructores con empresas y alcance por empresa (sección 33); la gestión sigue pendiente (B2.2). |

> **Sustituido el 11/11/2026 (B2.1, regla confirmada por el equipo):** «cada estudiante pertenece a una sola» (texto de
> arriba, requisito del 07/11/2026) pasa a ser **«un estudiante puede pertenecer a varias empresas o a ninguna»**. Se
> conserva el texto original como historial. Detalle en la sección 33.
| Instructores, banco de preguntas, observaciones del Instructor, portadas | Pendientes. |

### 24.4 Respaldo y estrategia de migración de datos de demostración (D-7)

**Respaldo realizado el 07/11/2026** en `C:\aulavirtual01\respaldos\aula-virtual-imc_20261107-030046_pre-B1\`
(fuera del repositorio):

- copia completa del proyecto, incluidos `.git` y `node_modules`: 23 938 archivos, 0 errores;
- verificación SHA-256 de los 397 archivos fuera de `node_modules` y `.angular`: idénticos;
- estado de Git, parche de los 60 archivos modificados, lista de los 70 no rastreados y `git bundle --all` verificado;
- instrucciones de restauración en su `LEEME.md`.

**No incluye** los datos que cada navegador guarda en `localStorage`, porque viven en el perfil del navegador. Para
conservarlos antes de B1, en el navegador con la demo abierta: herramientas de desarrollo → Consola →
`copy(localStorage.getItem('imc-demo-state-v3'))` y pegar el resultado en un archivo `.json` (repetir con
`imc-demo-state-v2` si existe).

**Estrategia de migración (se aplica en B1, sin borrar nada):**

| Dato | Estrategia |
|---|---|
| Estado del navegador (`imc-demo-state-v3`) con rol `admin` o `fullName` | Al cargar se convierte a un estado nuevo (v4) con rol `instructor` y nombres y apellidos. Antes de convertir se copia v3 tal cual en `imc-demo-state-v3-respaldo-b1`. **v3 se conserva sin cambios**, igual que se hizo con v2 en E2. Si la conversión no se puede verificar, se usa v3 tal cual y se avisa. |
| Sesión guardada (`imc-demo-session`) con rol `admin` | Se interpreta como `instructor` al restaurarla; no se cierra la sesión. |
| Enlaces a `/admin/...` | Siguen funcionando (redirección a la ruta nueva, si se aprueba en el plan de B1). |
| Separación de `fullName` | Semilla: separación manual conocida (por ejemplo, «Ana» / «Torres Quispe»). Datos creados en el navegador: primera palabra como nombres y el resto como apellidos, conservando `fullName` original y marcando el registro para revisión. |
| Semilla del backend (MySQL) | `backend/prisma/seed.ts` reproduce la semilla actual con los mismos identificadores, más una empresa de demostración (con RUC ficticio). Solo en desarrollo. |
| Datos del navegador hacia MySQL | No se importan automáticamente. Si se necesitan, se hará un script de importación desde el JSON exportado (decisión futura). |
| Certificados ya emitidos | Conservan el nombre del participante tal como se emitió (RN-08). |

---

## 25. Fase B1.1: backend base y autenticación (07/11/2026)

Autorizada el 07/11/2026 junto con las decisiones B1-a a B1-e (registradas en `ARQUITECTURA_BACKEND.md`, sección 15.6).
Estado completo, diferencias con el plan y resultados de pruebas: `ARQUITECTURA_BACKEND.md`, sección 16.

- **Implementado** en `backend/` (proyecto independiente): NestJS 12, Prisma 7 + MySQL, configuración validada,
  autenticación con argon2id, bloqueo por intentos, límite por IP, renovación rotativa con revocación, guards de
  autenticación y roles, Swagger, health check, semilla de demostración y pruebas.
- **Sin cambios en el frontend:** el inicio de sesión de Angular sigue en modo demostración (B1.2 y B1.3 pendientes).
- **No se hicieron commits** (D-0 sin autorizar). Respaldo previo: sección 24.4.

### 25.1 Pendiente de ejecución manual

1. Ejecutar `backend/prisma/sql/crear-bases-locales.local.sql` en MySQL Workbench con root (crea las bases y el
   usuario `aula_imc`; no borra nada).
2. En `backend/`: `npm run db:migrate` y `npm run db:seed`.
3. `npm run test:db` para validar contra MySQL real.

### 25.2 Pendientes

- B1.2 (rol Instructor en el frontend) y B1.3 (conexión opcional del inicio de sesión), con autorización.
- B1.3 debe enviar `X-Requested-With: XMLHttpRequest` en `/auth/refresh` y `/auth/logout`, y serializar las
  renovaciones.

### 25.3 Incidencia P1000 al migrar (07/11/2026)

- **Causa (error del equipo de desarrollo al generar el script local):** en `crear-bases-locales.local.sql` solo se
  reemplazó la primera aparición del marcador `CAMBIAR_ESTA_CLAVE`, que estaba en un comentario. El usuario `aula_imc`
  quedó creado con el marcador como contraseña, distinta de la de `backend/.env`. Verificado comparando huellas, sin
  mostrar contraseñas.
- **Solución:** `backend/prisma/sql/sincronizar-clave-aula-imc.local.sql` (no versionado) aplica `ALTER USER` con la
  contraseña existente del `.env`. No se regeneraron credenciales ni se borraron bases o datos. El script local de
  creación quedó corregido.
- **Segundo hallazgo:** MySQL 8 sin SSL exige que el driver obtenga la clave pública del servidor
  (`ER_CANNOT_RETRIEVE_RSA_KEY`). Se agregó `DB_ALLOW_PUBLIC_KEY_RETRIEVAL` (por defecto `false`; solo se admite con
  MySQL en localhost; con otro servidor se debe usar SSL). En el `.env` local está en `true`.

### 25.4 Producción limpia: protecciones A–D (07/11/2026)

Autorizadas tras la validación de MySQL real (`npm run test:db`: 9 de 9). Requisito confirmado: **producción empieza
sin empresas, usuarios ni estudiantes de demostración**; los datos reales se crean desde la plataforma.

- **A.** `npm run db:check-clean` comprueba, solo leyendo, que la base no tenga datos de demostración.
- **B.** La semilla exige `NODE_ENV` ≠ production, base `*_dev`/`*_test`, `SEED_DEMO_ALLOWED=true` y ausencia de datos
  reales; la API no arranca en producción con `SEED_DEMO_ALLOWED=true`.
- **C.** `npm run admin:create` crea el primer Instructor con contraseña temporal y registro en la bitácora.
- **D.** Con `mustChangePassword`, la API solo permite perfil, cambio de contraseña y cierre de sesión.

Detalle: `ARQUITECTURA_BACKEND.md` 16.5 y `backend/README.md` («Producción: empezar con una base limpia»).
La base `aula_imc_dev` conserva sus datos (1 empresa, 7 usuarios, 6 estudiantes). Pendiente para B1.3: la pantalla del
frontend debe reaccionar al error `PasswordChangeRequired` llevando al cambio de contraseña, y la compilación de
producción del frontend no debe mostrar cuentas de prueba ni el modo demostración.

---

## 26. Fase B1.2: rol Instructor en el frontend (08/11/2026)

Autorizada el 08/11/2026 con estas decisiones: nombres y apellidos en v4 (conservando `fullName`); a1 pasa a
«Instructor de Prueba» solo si conserva el nombre original; se conserva el correo `admin@ejemplo.test`; si la
verificación v3 → v4 falla se cargan los datos de prueba con aviso y v3 queda intacto (**sustituye** lo indicado en
24.4, «se usa v3 tal cual»); barra «Panel del instructor»; `src/styles.css` se conserva como está.

### 26.1 Implementado

| Tema | Implementación |
|---|---|
| Rol | `Role = 'participant' \| 'instructor'`. `normalizeRole()` interpreta el valor anterior «admin» como «instructor». |
| Estado v4 | Clave `imc-demo-state-v4`. Usuarios con `firstNames`/`lastNames` (y `fullName`); separación conocida para las cuentas demo y automática (con `nameReview: true`) para las demás. El resto de colecciones se copia sin cambios. |
| Migración | Orden de carga v4 → v3 → v2 → semilla. Antes de migrar, copia exacta de v3 en `imc-demo-state-v3-respaldo-b1` (solo si no existe). Verificación (`verifyMigrationV4`): mismas colecciones, mismos usuarios, correos y DNI, roles válidos y nombres coherentes. v3 y v2 **solo se leen**: nunca se modifican ni se borran. Las copias de datos dañados nunca sobrescriben otra copia (se usa una clave con fecha). |
| Sesión | Una sesión guardada con rol «admin» se restaura como Instructor, solo en memoria: la clave no se reescribe hasta el siguiente inicio de sesión. |
| Rutas | `/instructor/...` (mismos componentes `admin-*`). `/admin/...` redirige conservando segmentos, parámetros y fragmento; sin bucles; los guards siguen aplicando. |
| Textos | «Panel del instructor», «Menú del instructor», cuenta de prueba «Instructor» y «el instructor» en los mensajes al alumno y en Evaluaciones. |
| Sin cambios | Backend, `styles.css`, nombres internos `admin-*`, `AdminLayout`, clases `.admin`. El inicio de sesión sigue en modo demostración (B1.3). |

### 26.2 Verificado

- Respaldo previo: `C:\aulavirtual01\respaldos\aula-virtual-imc_20261108-201627_pre-B1.2\` (51 010 archivos, 442 SHA-256
  correctos). El respaldo anterior (pre-B1) sigue íntegro.
- `ng test`: **377 de 377** (342 originales + 35 nuevas). 8 pruebas existentes se adaptaron solo en el valor esperado
  (versión 4, rutas `/instructor`, textos «instructor»), sin quitar comprobaciones; se agregaron 2 comprobaciones.
  `tsc` de aplicación y pruebas, y `ng build` (359,18 kB; los mismos 18 avisos de CommonJS).
- Chrome sin interfaz (perfil temporal por ancho) a 1280, 390 y 320 px: **26 de 26**, sin errores de consola. Incluye
  la migración de un estado v3 auténtico con sesión anterior: v3, v2 y la sesión guardada quedan idénticos byte a
  byte; la recarga no vuelve a migrar; restablecer la demo no toca v3 ni v2.
- Backend: sus 90 archivos idénticos al respaldo.
- Incidencia: la primera ejecución de la línea base (sin cambios en el código) falló 5 de 342 por sobrecarga del equipo
  (1,1 GB de RAM libre); la repetición pasó 342 de 342.

### 26.3 Pendientes

- Con una sesión anterior, la barra muestra el nombre guardado («Administrador de Prueba») hasta volver a iniciar sesión.
- El formulario de participantes sigue pidiendo el nombre completo; los campos separados llegan en B2.
- `removeLegacyState` sigue sin pantalla; v3 no se elimina en ninguna circunstancia.
- B1.3: conectar el inicio de sesión a la API (con `X-Requested-With`, `PasswordChangeRequired` y conversión de roles
  `participant`/`instructor` ↔ `STUDENT`/`INSTRUCTOR`).

---

## 27. Fase B1.3: inicio de sesión opcional con la API (08/11/2026)

Autorizada el 08/11/2026: modo API con `development-api` y `npm run start:api` (el modo demostración sigue siendo el
predeterminado); panel de cuentas de prueba conservado en modo API con el aviso «Modo API (desarrollo)»; Web Locks
para coordinar renovaciones entre pestañas; tras cambiar la contraseña se vuelve al login; pruebas E2E solo sobre
`aula_imc_test`; la compilación de producción no cambia. La implementación se interrumpió una vez por desconexión y se
retomó desde el estado guardado, sin repetir trabajo.

### 27.1 Implementado

| Tema | Implementación |
|---|---|
| Modos | `src/environments/environment.ts` (`authMode: 'demo'`, usado por `npm start`, `ng build` y las pruebas) y `environment.api.ts` (`'api'`, solo en la configuración `development-api` con `proxy.conf.json` → `http://localhost:3000`). |
| Sesión | `AuthService` conserva su interfaz y delega en `DemoAuthBackend` (código anterior, sin cambios de comportamiento) o en `ApiSession`. Estado único en `SessionStore`. |
| Token y cookie | El token de acceso vive solo en memoria (`ApiSession`). La cookie `imc_refresh` (HttpOnly, SameSite=Strict, Path=/api/v1/auth) la gestiona el navegador; en modo API no se escribe `imc-demo-session`. |
| Arranque | `provideAppInitializer` restaura la sesión con `POST /auth/refresh` antes del primer ruteo, con tiempo máximo (5 s) que cubre también la espera del cerrojo entre pestañas. |
| Interceptor | Añade `X-Requested-With: XMLHttpRequest` a la API, `withCredentials` solo en `/auth/*` y el token salvo en login/refresh/logout. Ante un 401: una renovación compartida y un único reintento; si la renovación es rechazada o el reintento falla, cierra la sesión y lleva a `/login?aviso=sesion-expirada`. Ante 403 `PasswordChangeRequired`, lleva a `/cambiar-clave`. |
| Renovaciones | Una sola por pestaña (promesa compartida) y, con Web Locks, una a la vez entre pestañas (`imc-auth-refresh`). Cada renovación tiene un límite de 15 s. **Sin Web Locks** (navegadores antiguos) solo se coordina dentro de la pestaña: dos pestañas que renueven a la vez pueden cerrar la sesión. |
| Roles | `INSTRUCTOR` ↔ `instructor`, `STUDENT` ↔ `participant`; un rol desconocido rechaza el inicio de sesión. |
| Contraseña temporal | Pantalla `/cambiar-clave` (misma política que el backend). Los guards llevan ahí desde cualquier ruta protegida. Al terminar se vuelve al login con «Contraseña actualizada…». |
| Errores | Mensajes del servidor para 4xx; «No se pudo conectar con el servidor» sin conexión, con 502/504 o con un 5xx sin el formato de la API (proxy con el backend detenido); nunca se pasa en silencio al modo demostración. |
| Login | En modo API: indicador «Modo API (desarrollo)» y aclaración de que «Restablecer datos de demostración» solo afecta este navegador. En modo demostración se ve igual que antes. |

### 27.2 Verificado

- Respaldo previo: `C:\aulavirtual01\respaldos\aula-virtual-imc_20261108-214528_pre-B1.3\` (51 015 archivos, 447 SHA-256).
- `ng test`: **437 de 437** (377 anteriores sin modificar + 60 nuevas). `tsc` de aplicación y pruebas; `ng build` de
  producción con `authMode: demo` (configuración de producción idéntica; el paquete inicial pasa de 359 a 384 kB porque
  ahora incluye HttpClient) y de `development-api` con `authMode: api`.
- E2E con backend real sobre `aula_imc_test` (backend, semilla y `admin:create` ejecutados desde una carpeta sin `.env`,
  con la base verificada en el servidor antes de cada borrado), Angular en modo API y Chrome a 1280, 390 y 320 px:
  **28 de 28**. Incluye cookie HttpOnly y almacenamiento sin token, recarga, cierre de sesión, sesión revocada, bloqueo,
  dos pestañas con recargas simultáneas sin reutilización detectada, contraseña temporal con renovación automática de
  un token vencido, y API detenida.
- `aula_imc_dev`: huella de solo lectura idéntica antes y después. Backend: 90 archivos sin cambios.
- Modo demostración en Chrome: las 26 comprobaciones de B1.2 siguen aprobadas.

### 27.3 Pendientes

- En B1.3 las pantallas no consultan la API: una sesión revocada desde otro dispositivo se detecta al recargar o al
  hacer la siguiente solicitud a la API (B2 añadirá solicitudes de datos).
- Los datos siguen siendo los de demostración: un usuario del backend sin identificador de la demo (por ejemplo, el
  creado con `admin:create`) verá pantallas vacías hasta B2.
- `aula_imc_test` quedó con los datos de la última prueba E2E (se vacía en cada `npm run test:db`).
- Producción: retirar el modo demostración y definir dominios, cookies y CORS al conocer el hosting (H1–H17).

## 28. Etapa 2B, Bloque 2: recuperación de exámenes (R1–R8) y validación final R9 (10–11/11/2026)

Implementa en el frontend, **solo en modo demostración** (`MockDataRepository`, `localStorage` `imc-demo-state-v4`),
la regla D-8: un intento regular más **una recuperación excepcional autorizada por el Instructor**. No se modificaron
el backend, Prisma, MySQL, `.env` ni migraciones. Respaldo previo:
`C:\aulavirtual01\respaldos\aula-virtual-imc_20261110-045504_pre-Etapa2B-Bloque2\`.

### 28.1 Alcance por fase

| Fase | Contenido |
|---|---|
| R1 | Modelo: `Recovery`, `RecoveryInput`, `RecoveryState`/`RecoveryStatus`, `ExamStart`; tipo de examen (`regular`/`recuperacion`, `parentExamId`) y de intento (`kind`, `recoveryId`); colecciones de recuperación en el estado guardado con normalización de estados anteriores (`normalizeDemoState`); empresas de demostración (`Company`, `companyId`). |
| R2 | Registro del inicio del examen en el repositorio, consulta del examen del estudiante y recuperación del inicio registrado (`startExam`, `getStudentExam`). |
| R3 (y corrección) | Autorización y cancelación de recuperaciones, validación de elegibilidad, ventanas de apertura y cierre, estados y reglas de recuperación. |
| R4 | Resultado del curso (`courseResult`): la nota final es la de la recuperación si existe (aunque sea menor) y si no la del regular; condiciones aprobado, desaprobado, en revisión y sin resultado. |
| R5 | Examen de recuperación **independiente** (preguntas propias, suma exacta de la escala) o modo **original** (mismo examen). |
| R6 | Vistas del estudiante: Panel, Aula, Instrucciones, Examen, Resultado y Mi progreso con el estado de la recuperación. |
| R7 | «Evaluaciones rendidas» (antes «Resultados»; `/admin/resultados` redirige): filtros, detalle del intento, calificación de preguntas abiertas, pendientes y gestión de recuperaciones. |
| R8 | Exportación `.xlsx` (ZIP sin compresión + SpreadsheetML, CRC-32, celdas de texto, sin fórmulas): una hoja con Estudiante, Curso, Nota final, Estado y Certificación; nombre `evaluaciones-rendidas-AAAA-MM-DD.xlsx`. |
| R9 | Validación final y esta documentación. Sin cambios de código. |

### 28.2 Reglas y decisiones aplicadas

- Máximo dos intentos por estudiante y examen; la recuperación corresponde a quien **desaprobó** el examen regular o
  **no lo rindió** (ausente, sin intento ficticio); el alumno no ve un botón para solicitarla. *(Corrección de B0.2: la
  versión de R9 decía «solo si el regular desaprobó», lo que omitía a los ausentes; el código y las reglas del
  10/11/2026 los incluyen.)*
- El estudiante ve **solo la nota final**; el Instructor ve nota regular, nota de recuperación y nota final.
- Intento pendiente de calificación: el alumno ve «Pendiente de calificación».
- RN-07, RN-15 (bloqueo de edición con intentos) y la suma exacta de 2A se aplican también a la recuperación.
- Exportación (decisiones del 11/11/2026): se exportan solo resultados definitivos; se **excluyen** estudiantes con
  recuperación en curso, intentos pendientes de calificación y quienes no rindieron (la pantalla muestra el resumen de
  exclusiones antes de descargar); un certificado revocado figura como **«Pendiente»**.
- Tolerancia de entrega tardía: 5 s (`TIMEOUT_TOLERANCE_SEC`); fechas en hora de Lima.

### 28.3 Verificación R9 (11/11/2026, resultados reales)

- `ng test`: **754 de 754** (82 archivos), 0 fallos. `tsc` de aplicación y de pruebas: 0 errores.
- `ng build` de producción: correcto; paquete inicial 403,76 kB (110,22 kB transferidos); 18 advertencias CommonJS
  preexistentes (canvg, qrcode, html2canvas), sin cambios.
- Chrome sin interfaz a 1280, 390 y 320 px, vistas del Instructor (Panel, menú móvil, Participantes, Cursos, Videos,
  Evaluaciones, Evaluaciones rendidas con filtros, exportación y exclusiones, recuperaciones, detalle y pendientes,
  Certificados) y del Estudiante (Panel, Aula, Instrucciones, Examen, Resultado, Mi progreso, Certificados, recuperación
  abierta, resultado pendiente): **56 de 59** comprobaciones aprobadas, **sin errores de consola**. Las 3 fallidas son
  la observación O-1 (28.5).
- Backend: **90 de 90** archivos idénticos al manifiesto del respaldo; ninguno faltante ni adicional.
- `package.json`, `package-lock.json`, `angular.json`, `tsconfig*.json` y `proxy.conf.json`: idénticos al respaldo
  previo al Bloque 2 (los cambios de `angular.json` y `package.json` respecto del último commit son de B1.3).
- La exportación fue abierta en Excel por el equipo sin errores.
- **Tras la corrección autorizada de O-1 (11/11/2026):** `ng test` **754 de 754**; `tsc` de aplicación y pruebas sin
  errores; `ng build` correcto (403,76 kB iniciales, 110,18 kB transferidos; las mismas 18 advertencias); Chrome a
  1280, 390 y 320 px **59 de 59**, sin errores de consola.

### 28.4 Estado por categoría

| Categoría | Contenido |
|---|---|
| Implementado en frontend | Modelo y reglas de recuperación, cierre automático, resultado final, examen independiente, vistas del estudiante, «Evaluaciones rendidas» y exportación `.xlsx` de una hoja. |
| Modo demostración | Todo lo anterior vive en `localStorage` del navegador; la consistencia entre pestañas se obtiene releyendo el almacenamiento (`sync`). El cierre automático se ejecuta al consultar datos, no en un servidor. Empresas de demostración ficticias. |
| Pendiente para backend | D-8 en el servidor (B6): autorización, ventana, cierre automático y cálculo de nota con hora del servidor; persistencia de respuestas; **D-12** (dos decimales, redondeo mitad hacia arriba; hoy el frontend sigue con `Math.round`); D-11 en la emisión de certificados (B7); auditoría de quién autoriza o cancela. |
| Pendiente de implementación futura | Reportes por fechas y tipo de intento; gestión de empresas e instructores; revocación de certificados con su pantalla (B0-10); banco de preguntas; observaciones del Instructor; portadas. **Aplazado (B0.2):** Excel de dos hojas (Resumen y Detalle). |
| Limitaciones | Sin servidor, el reloj es el del navegador y un usuario podría manipular el almacenamiento local; la exportación usa celdas de texto (sin tipos numéricos ni formato); una sola hoja; O-1 (28.5, corregida). |

### 28.5 Observaciones de R9

- **O-1 (corregida el 11/11/2026, con autorización expresa).** Se agregó `.table-wrap { position: relative; }` a los
  estilos de `admin-recoveries.ts`. Ya no hay desplazamiento horizontal general a 1280 px, y la tabla sigue
  desplazándose dentro de su contenedor. Texto original de R9:
- **O-1 (abierta, pendiente de autorización para corregir):** en «Evaluaciones rendidas» a **1280 px**, el documento
  mide 1402 px de ancho y aparece una barra de desplazamiento horizontal general; al desplazarse se ve una franja vacía
  y se oculta parte del menú lateral. Causa: el texto accesible «Acciones» (`span.sr-only`, posición absoluta) del
  último encabezado de la tabla de recuperaciones (`admin-recoveries.ts`) escapa del contenedor `.table-wrap`, que no
  tiene posición relativa. A 390 y 320 px no ocurre (vista en tarjetas). Corrección propuesta: `position: relative` en
  `.table-wrap` del componente. No se corrigió en R9.

### 28.6 Archivos

- Nuevos: `core/models/recovery.model.ts`, `core/utils/xlsx-export.ts`, `features/administration/admin-attempt-detail.ts`,
  `features/administration/admin-recoveries.ts`; utilidades de prueba `core/services/testing/exam-starts.ts` y
  `core/utils/testing/read-xlsx.ts`; 15 archivos de prueba nuevos.
- Modificados: `app.routes.ts`, `core/data/demo-state.ts`, `core/data/seed.ts`, `core/models/exam.model.ts`,
  `core/models/user.model.ts`, `core/services/data-repository.ts`, `core/services/mock-data-repository.ts`,
  `core/services/exam-session.service.ts`, `features/administration/admin-evaluations.ts`, `admin-results.ts`,
  `features/courses/course-room.*`, `features/dashboard/panel.html`, `features/exam/exam/*`,
  `features/exam/instructions/*`, `features/exam/result/*`, `features/progress/my-progress.*`,
  `layouts/admin-layout/admin-layout.ts`, `shared/components/status-badge.ts` y 4 archivos de prueba existentes
  (ajustados a las nuevas reglas, sin eliminar pruebas).

### 28.7 Estado de Git

Sin commits ni push en el Bloque 2; el último commit sigue siendo `17e9ea6`. Los cambios quedan en el árbol de trabajo
para revisión. `backend/` sigue sin agregarse al repositorio.

### 28.8 Reglas del Bloque 2 y su categoría (B0.2, 11/11/2026)

**Origen:**
- Reglas funcionales del Bloque 2 comunicadas por el equipo el 10/11/2026 («Etapa 2B – Bloque 2: recuperación de
  exámenes»).
- Precisiones posteriores del equipo:
  - corrección de R3 y su ajuste final (la ventana solo limita el inicio), del 10/11;
  - qué nota ve el estudiante (R4), del 10/11;
  - exclusiones y certificado revocado en la exportación (R8), del 11/11.

**Categoría:** aprobadas por el equipo e **implementadas en el frontend (modo demostración); pendientes de validación
formal de IMC** (24.2, B0-12). **Deben preservarse** al implementar el backend; no se modifican para adaptarlas al
diseño anterior (`ARQUITECTURA_BACKEND.md`, 2.6).

| Regla | Detalle |
|---|---|
| Perfiles | Solo Instructor y Estudiante; no hay perfil administrador. |
| Quién autoriza | **Solo el Instructor** autoriza o anula recuperaciones. |
| A quién | A quien **desaprobó** el examen regular o a quien **no lo rindió** (ausente: sin intento y sin haberlo iniciado). Al ausente no se le crea un intento ficticio. No corresponde si aprobó, si está pendiente de calificación o si está rindiendo el regular. |
| Cuántas | Como máximo **una recuperación no anulada por estudiante y curso**. |
| Modalidad | **Original** (el examen regular tal cual, sin modificarlo) o **independiente** (examen de recuperación del mismo curso que conserva escala, nota mínima y duración del original, con preguntas propias y suma exacta, R5). |
| Ventana | Apertura y cierre exactos, con zona horaria. La ventana **limita solo el inicio**: quien inicia a tiempo tiene la duración completa, aunque termine después del cierre. No se exige que la ventana dure al menos lo que el examen. |
| Anulación | Solo **antes del inicio**. No consume la oportunidad: se puede volver a autorizar. Una vez iniciada, ni se anula ni se autoriza otra. |
| No presentado | Si la ventana cierra sin inicio, queda **«No rindió recuperación»** de forma **definitiva** (`noShowAt`): sin intento ni nota, sin reprogramación individual. |
| Inicio y respuestas | Inicio **persistente e idempotente** (una recarga u otra pestaña no reinician el tiempo); respuestas guardadas mientras se responde; cierre automático con las respuestas guardadas si el tiempo termina sin entrega (sin respuestas, nota 0; con abiertas, «En revisión»). |
| Nota final | La **nota de recuperación reemplaza siempre a la regular**, incluso si es menor. El estudiante ve una sola nota final y no se le indica el reemplazo; el Instructor ve la regular, la de recuperación y la final; se conserva el historial. |
| Preguntas abiertas | «Pendiente de calificación» hasta que el Instructor califique; luego la nota final se actualiza sola, sin notificaciones. |
| Certificado | Se emite automáticamente al aprobar (regular o recuperación), con la nota del intento aprobado (D-11); es inmodificable. No hay certificado si desaprueba o no rinde la recuperación. |
| Evaluaciones rendidas | Exámenes regulares y de recuperación, filtros por curso, estudiante y empresa, revisión de respuestas, calificación, pendientes, estado de las recuperaciones y exportación. Sin pantalla aparte de historial de recuperaciones. |
| Exportación (R8) | **Una hoja y exactamente cinco columnas:** Estudiante, Curso, Nota final, Estado, Certificación. Sin columna «Recuperación». Se excluyen pendientes de calificación, quienes no rindieron y quienes tienen una recuperación en curso; un certificado revocado figura como «Pendiente». |
| Tolerancia | 5 s entre el temporizador del navegador y el límite (`TIMEOUT_TOLERANCE_SEC`). Es una **decisión técnica de implementación** (Bloque 1, P4), no una regla comunicada por el equipo. |

---

## 29. Etapa 1: ajustes del frontend (09/11/2026), registro retrospectivo

**Registrada en B0.2 (11/11/2026).** La etapa se implementó y aprobó el 09/11/2026, pero no tenía sección en este
documento. El contenido sale de la solicitud del equipo, del código y de las pruebas. No se modificó código para
documentarla.

- **Origen:** solicitud del equipo del 09/11/2026 («Etapa 1 — Ajustes del frontend»), sobre pendientes de la auditoría
  de la transcripción original. Corresponde a dos requisitos de 24.3.
- **Categoría:** aprobado por el equipo e implementado en el frontend; **pendiente de validación formal de IMC**
  (24.2, B0-12).
- **Respaldo previo:** `C:\aulavirtual01\respaldos\aula-virtual-imc_20261109-021226_pre-Etapa1\`.

### 29.1 Reglas implementadas

| Regla | Detalle |
|---|---|
| Aviso de cinco minutos | Aviso **no modal** cuando quedan 5 minutos (300 s) o cuando el contador cruza ese umbral. Se muestra **una sola vez por intento**, también al recargar (`ExamSessionService` lo recuerda); si se retoma un intento ya pasado el umbral sin haberlo visto, se muestra una vez. **No detiene el temporizador** ni bloquea la respuesta, no mueve el foco y desaparece al agotarse el tiempo. No aparece en exámenes de 5 minutos o menos. El envío automático al llegar a cero no cambia. |
| Recuento de respuestas correctas | Se quitó del estudiante «Respuestas correctas X de Y» (resultado) y «Correctas X de Y» (Mi progreso). El estudiante ve su nota y los demás datos permitidos, pero **no las respuestas correctas ni cuántas acertó**. El Instructor conserva la información para calificar y consultar. |

### 29.2 Archivos (comparación de los manifiestos SHA-256 de los respaldos previos a la Etapa 1 y a la 2A)

- **Modificados:** `core/services/exam-session.service.ts`, `features/exam/exam/exam.ts` y `exam.html`,
  `features/exam/result/result.html`, `features/progress/my-progress.html` y la prueba `my-progress.spec.ts`.
- **Nuevos:** `features/exam/exam/time-warning.ts` y `features/exam/etapa1.spec.ts`.

### 29.3 Pendiente para el backend

- El temporizador real corresponde al servidor (D15, `ARQUITECTURA_BACKEND.md` 6.4); el aviso seguirá en el
  navegador.
- Las respuestas al estudiante **no deben incluir** las respuestas correctas ni el recuento (`ARQUITECTURA_BACKEND.md`
  7.2).

---

## 30. Etapa 2A: validación de puntajes de las evaluaciones (09/11/2026), registro retrospectivo

**Registrada en B0.2 (11/11/2026).**

- **Origen:** solicitud del equipo del 09/11/2026 («Etapa 2A — Validación de puntajes de las evaluaciones»), requisito
  18 de la auditoría de la transcripción original (24.3).
- **Categoría:** aprobado por el equipo e implementado en el frontend; **pendiente de validación formal de IMC**.
- **Respaldo previo:** `C:\aulavirtual01\respaldos\aula-virtual-imc_20261109-024741_pre-Etapa2A\`.

### 30.1 Reglas implementadas

| Regla | Detalle |
|---|---|
| Suma exacta | La suma de los puntajes de las preguntas debe ser **exactamente** la nota máxima (escala 20 o 100). Se compara con redondeo a centésimas, porque se admiten medios puntos (`scoreDistribution`). |
| Mensajes | Total frente a nota máxima y diferencia: «La suma de los puntajes es N. Debe ser exactamente M (faltan/sobran X puntos).» o «La distribución de puntajes es correcta.» |
| Dónde se exige | **En el repositorio**, no solo en la pantalla. Con el curso **publicado** (examen activo), no se puede guardar un cambio de preguntas ni de escala que deje la suma distinta, y el curso no se publica si la suma no coincide. Con el curso en **borrador**, se edita libremente y la pantalla informa el total. |
| Rendir | No se puede rendir un examen cuya suma no coincide con la nota máxima. |
| Datos históricos | Las evaluaciones **con intentos registrados** se conservan como están (RN-15): no se les aplica la regla nueva, solo se informa. No se recalcula ninguna nota. |
| Calificación | La Etapa 2A **no cambió el cálculo**: mantuvo «todo o nada». La calificación proporcional llegó con la Etapa 2B Bloque 1 (sección 31). |
| Recuperación (R5, sección 28) | El examen de recuperación independiente también exige la suma exacta para crearse y para rendirse. |

### 30.2 Archivos (comparación de manifiestos; el intervalo hasta el respaldo previo al Bloque 1 incluye solo esta etapa)

- **Modificados:** `core/models/exam.model.ts`, `core/services/mock-data-repository.ts`,
  `features/administration/admin-evaluations.ts` y 6 archivos de prueba existentes, ajustados a la regla sin eliminar
  pruebas.
- **Nuevos:** `core/services/testing/exam-points.ts`, `mock-data-repository.scores.spec.ts` y
  `admin-evaluations.scores.spec.ts`.

### 30.3 Pendiente para el backend

La validación se hará en el servicio, dentro de una transacción, porque MySQL no admite CHECK sobre agregados
(`ARQUITECTURA_BACKEND.md` 6.2, B5).

---

## 31. Etapa 2B, Bloque 1: calificación proporcional (09/11/2026), registro retrospectivo

**Registrada en B0.2 (11/11/2026).**

- **Origen:**
  - reglas de negocio aclaradas por el equipo el 09/11/2026;
  - «Autorización de implementación — Etapa 2B, Bloque 1», que lista las **decisiones funcionales aprobadas** P1–P4 y
    D1–D4.
- **Categoría:** aprobado por el equipo e implementado en el frontend; **pendiente de validación formal de IMC**.
- **Respaldo previo:** `C:\aulavirtual01\respaldos\aula-virtual-imc_20261109-114744_pre-Etapa2B-Bloque1\`.

### 31.1 Decisiones aprobadas por el equipo

| # | Decisión | Implementación |
|---|---|---|
| P1 | El Instructor configura **cuántas alternativas debe marcar** el estudiante en selección múltiple, con `correctas ≤ cantidad exigida < total de alternativas`. Se rechaza lo que esté fuera de ese rango. | `Question.selectCount`; `selectionError()` en el modelo y validación en el repositorio. |
| P2 | Al marcar las correctas, el valor inicial de la cantidad exigida es el número de correctas; el Instructor puede cambiarlo respetando P1. | Formulario de Evaluaciones. Si falta (preguntas anteriores), vale la cantidad de correctas (`requiredSelections`). |
| P3 | En los resultados del Instructor, la columna «Correctas» pasa a **«Puntos obtenidos»** (obtenido frente a máximo). | `attemptPoints()`; los intentos anteriores sin detalle no se recalculan. |
| P4 | **Tiempo agotado:** el examen se cierra y se envían solo las respuestas registradas. Las completas se califican normalmente, las parciales reciben puntaje proporcional y las vacías, cero. No se inventan respuestas ni se exige completar. | `SubmitMode = 'tiempo'`. |
| D1 | **Todos los intentos nuevos**, regulares y de recuperación, usan la calificación proporcional. Los históricos **no se recalculan**. | `gradingRule = 'proporcional'` en cada intento nuevo. |
| D2 | Fórmula: `(correctas marcadas / correctas configuradas) × puntaje máximo de la pregunta`. Las incorrectas no restan, pero ocupan espacios de selección. Nunca negativa ni mayor que el máximo. | `questionPoints()`. Más marcas que las exigidas (solo posible manipulando el envío) vale 0. |
| D3 | **Entrega voluntaria:** todas las preguntas completas, con exactamente la cantidad exigida en selección múltiple y texto no vacío en las abiertas. Se indica qué preguntas faltan. Se valida en la interfaz y en el repositorio. | `isComplete()`, `submissionError()`. |
| D4 | Protección histórica: no recalcular notas ni resultados ni alterar certificados. Los intentos antiguos conservan su regla, y los que quedaron «En revisión» se terminan de calificar con la regla con la que se enviaron. Los nuevos guardan explícitamente la regla. | Sin `gradingRule` = `todo_o_nada` (`attemptRule()`); `questionScores` y `maxPoints` en los intentos nuevos. |

Ejemplo aprobado (pregunta de 10 puntos, 4 alternativas, 2 correctas, 2 marcas exigidas):

| Respuesta | Puntos |
|---|---|
| 2 correctas | 10 |
| 1 correcta y 1 incorrecta | 5 |
| 1 correcta (envío por tiempo) | 5 |
| 2 incorrectas | 0 |
| Sin respuesta | 0 |

**Decisión técnica de implementación (no comunicada por el equipo):** tolerancia de **5 s** (`TIMEOUT_TOLERANCE_SEC`)
entre el temporizador del navegador y el límite del examen, para admitir la entrega por tiempo. Desde R2, con el inicio
registrado, el límite lo decide el repositorio.

### 31.2 Archivos (comparación de los manifiestos de los respaldos previos al Bloque 1 y al Bloque 2)

- **Modificados:** `core/models/exam.model.ts`, `core/services/data-repository.ts`, `mock-data-repository.ts`,
  `features/administration/admin-evaluations.ts` y `admin-results.ts`, `features/exam/exam/exam.ts`, `.html` y `.css`,
  y 8 archivos de prueba existentes, ajustados sin eliminar pruebas.
- **Nuevos:** `exam.model.grading.spec.ts`, `mock-data-repository.proportional.spec.ts`,
  `admin-evaluations.selection.spec.ts`, `admin-results.points.spec.ts` y `exam-selection.spec.ts`.

### 31.3 Pendiente para el backend

- La calificación se hará en el servidor con la misma regla y guardará `grading_rule` y los puntos por pregunta
  (`ARQUITECTURA_BACKEND.md` 6.2 y 6.5).
- Los intentos importados sin regla quedan como «todo o nada».
- **D-12** (dos decimales) sigue pendiente. Hoy la nota del intento se redondea a entero (`Math.round`), aunque los
  puntos por pregunta se guardan sin redondear.

---

## 32. B0.1 y B0.2: diagnóstico y alineación de la arquitectura backend (11/11/2026)

- **B0.1 (solo lectura):**
  - diagnóstico del backend: B1.1 implementada; B2–B9 sin empezar;
  - pruebas del backend: unitarias 51 de 51 y HTTP con base simulada 26 de 26; `test:db` no se ejecutó;
  - incompatibilidades entre el diseño del 07/11/2026 y el frontend R1–R9.
- **B0.2 (solo documentación):** actualización de `ARQUITECTURA_BACKEND.md` y de este documento. No se modificó código,
  `schema.prisma`, migraciones, `.env`, datos ni respaldos. No se ejecutaron migraciones, semillas ni operaciones sobre
  `aula_imc_dev` o `aula_imc_test`.

### 32.1 Qué se registró

| Tema | Dónde |
|---|---|
| Estado real del proyecto (frontend R1–R9, backend B1.1, pruebas, Git) | `ARQUITECTURA_BACKEND.md` 2 y 19 |
| Reglas de R1–R9 que debe respetar el backend | `ARQUITECTURA_BACKEND.md` 2.6; aquí, 28.8, 29, 30 y 31 |
| Modelo de datos propuesto (`recoveries`, cambios en `exam_attempts`, `exams`, `questions`, `certificates`) | `ARQUITECTURA_BACKEND.md` 6 (propuesta) |
| Inicio persistente, cierre automático, decimales, fechas, certificados y exportación | `ARQUITECTURA_BACKEND.md` 6.4 a 6.7 (propuesta) |
| Endpoints propuestos | `ARQUITECTURA_BACKEND.md` 8 (propuesta) |
| Integración por grupos completos | `ARQUITECTURA_BACKEND.md` 9.2 (propuesta) |
| Orden de implementación y estimaciones | `ARQUITECTURA_BACKEND.md` 13 (estimaciones orientativas) |
| Pendientes y propuestas sin aprobar | `ARQUITECTURA_BACKEND.md` 14.1; aquí, 24.2 |

### 32.2 Correcciones de documentación hechas en B0.2

No cambia ninguna regla. Se corrigen textos que no coincidían con lo implementado:

- **28.2:** la recuperación también corresponde a los ausentes (la versión de R9 decía «solo si el regular
  desaprobó»).
- **28.3 y 28.5:** se registra que O-1 se corrigió con autorización (Chrome 59 de 59).
- **24.3:** el Excel de dos hojas pasa a **aplazado**. Las empresas de la demostración no tienen gestión (solo filtro).

### 32.3 Condición

**B2 no está autorizada.** La autorización de B0.2 no implica la de B2. Antes de B2 se necesitan las decisiones de
24.2 (en especial D17, las empresas y los cambios del frontend).

### 32.4 Corrección final de B0.2 (11/11/2026)

Autorizada expresamente para resolver las tres contradicciones documentales que quedaron en B0.2. No se cambió ninguna
regla ni se agregó una decisión: los textos originales de D-8, D-11 y D-12 (24.1) se conservan intactos y se les añade
una precisión fechada.

| Decisión | Contradicción | Cómo se armonizó |
|---|---|---|
| D-11 | Decía «la recuperación solo existe si el regular desaprobó», pero las reglas del Bloque 2 (10/11/2026) también admiten a los ausentes. | Precisión en 24.1: la recuperación se autoriza a quien desaprobó o estuvo ausente (28.8). Lo que dispone D-11 (nota del intento aprobado) no cambia. |
| D-8 | Decía «preguntas elegidas por el Instructor», pero el Bloque 2 permite además reutilizar el examen regular (modalidad original). | Precisión en 24.1: dos modalidades, original e independiente (R5); ambas conservan la configuración académica del original. |
| D-12 | Las referencias mezclaban la decisión aprobada, su implementación pendiente y la regla vigente del frontend. | En 24.1, 24.2 (B0-8) y `ARQUITECTURA_BACKEND.md` (2.6, 6.2, 6.5 y 14) se distinguen: decisión aprobada (dos decimales, mitad hacia arriba), regla vigente del frontend (nota entera, `Math.round`) e implementación pendiente en el backend (B5–B6). |

---

## 33. B2.1: modelo de datos de empresas, instructores y matrículas (11/11/2026)

**Solo backend.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 20.
- La migración está **generada pero no aplicada**.
- No se ejecutaron semillas ni `test:db`.
- No se modificaron MySQL, `.env`, respaldos ni Angular.
- No hay commits.

### 33.1 Decisiones confirmadas por el equipo (11/11/2026)

| Regla | Efecto en la documentación |
|---|---|
| Un estudiante puede pertenecer a **varias empresas** o a **ninguna**. | **Sustituye** a «cada estudiante pertenece a una sola» (24.3). |
| El DNI es obligatorio para estudiantes nuevos: 8 dígitos y único. | Sin cambios (D-9). |
| Un Instructor puede estar asociado a **varias empresas**; registra estudiantes y los asigna a empresas. | Nueva. |
| **Cada Instructor solo ve y gestiona a los estudiantes de las empresas que tiene asignadas**, también si manipula las peticiones; el control está en el backend. | Nueva. |
| Un estudiante puede matricularse en varios cursos; no se permiten matrículas duplicadas. | Nueva para el backend (el frontend ya lo hace). |
| Se conservan `emp-demo` y sus asociaciones, sin reasignar a nadie. | Resuelve B0-4. |
| RUC: sigue pendiente. No se inventan valores ni reglas, y se mantienen las restricciones de B1.1. | Sigue pendiente (D-9 formato, B0-3). |
| Solo los roles `INSTRUCTOR` y `STUDENT`. | Sin cambios (D-4). |

### 33.2 Implementado (backend)

- **Tablas nuevas:**
  - `instructors`: perfil 1:1 del Instructor;
  - `student_companies` y `instructor_companies`: muchos a muchos, con clave compuesta y quién y cuándo asignó;
  - `courses`: solo id y nombre;
  - `enrollments`: única por estudiante y curso, sin estado.
- **Tabla modificada:** `students` pierde `company_id`, que se traslada a `student_companies`.
- **Contrato de autenticación:** el perfil de estudiante devuelve `companies` (colección; vacía si no tiene empresas) en
  lugar de `company`. El resto de la autenticación no cambia.
- **Autorización por empresa** (`CompanyScopeService`):
  - la identidad sale siempre del token;
  - un estudiante es visible si comparte una empresa con el Instructor; si no, 404;
  - para asignar, todas las empresas deben ser del Instructor;
  - se aplica en `GET /users/:id`.
- **Semilla de demostración** (sin ejecutar):
  - crea el perfil del Instructor `a1` y lo asocia a `emp-demo`;
  - asocia cada estudiante nuevo a `emp-demo`;
  - **no asigna empresas a estudiantes que ya existían**.
- **`admin:create`:** crea el Instructor con su perfil y sin empresas.

**Propuestas técnicas aplicadas en B2.1** (autorizadas con el bloque):
- el perfil `Instructor`;
- `courses` mínima;
- `enrollments` sin estado;
- respuesta 404 para lo que está fuera del alcance.

### 33.3 Migración y preservación de datos

Archivo: `backend/prisma/migrations/20261111000000_b2_1_empresas_instructores_matriculas/migration.sql`.

**Cómo se generó:** sin conexión, con el mismo método de B1.1 (`prisma migrate diff`), y se **reordenó**. Prisma
retiraba `students.company_id` antes de crear la tabla nueva, lo que habría perdido las asociaciones.

**Orden final:**
1. Crear las tablas y sus claves foráneas.
2. Crear el perfil de cada Instructor existente, sin empresas.
3. **Copiar todas las asociaciones** de `students.company_id` a `student_companies`.
4. Solo al final, retirar la columna.

**Qué no hace:** no borra filas, no crea empresas ni RUC y no reasigna a nadie.

**Pendiente:** no se aplicó ni se probó en MySQL; requiere autorización expresa.

### 33.4 Pendientes de decisión

| # | Asunto |
|---|---|
| B2.1-1 | **Estudiantes sin empresa:** con el alcance por empresa, **ningún Instructor puede verlos ni gestionarlos**. Hay que decidir si debe haber una excepción, por ejemplo para quien lo registró, o si todo estudiante debe tener al menos una empresa del Instructor que lo crea. Se necesita antes de B2.2. |
| B2.1-2 | **Quién asigna instructores a empresas** y quién crea empresas: no hay perfil administrador. |
| B2.1-3 | **Visibilidad entre instructores:** hoy un Instructor puede consultar a otro (como en B1.1). |
| B2.1-4 | **Historial de bajas** de empresas y matrículas: borrar con registro en la bitácora, o baja lógica. |
| B2.1-5 | **RUC:** sigue obligatorio, de 11 caracteres y único; no se pueden registrar empresas sin RUC hasta definirlo. |
| B2.1-6 | El tipo `ApiUser` del frontend todavía declara `student.company` (no lo usa); ajustarlo requiere autorizar cambios en Angular. |
| B2.1-7 | Aplicar la migración (`aula_imc_dev`) y ejecutar `test:db` (`aula_imc_test`). |
| B2.1-8 | Tras migrar `aula_imc_dev`, `a1` no tiene empresas, porque la migración no las inventa. No verá estudiantes en modo API hasta que se ejecute la semilla (autorización) o se le asigne una empresa. |

---

## 34. B2.2a: permiso de administración general de IMC (12/11/2026)

**Solo backend e infraestructura de autorización.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 21.
- **No hay operaciones administrativas funcionales** todavía: ni empresas, ni registro de Instructores, ni asignaciones.
- La migración está **generada pero no aplicada**.
- No se ejecutaron semillas, `test:db` ni los comandos de creación.
- No se modificaron MySQL, `.env`, respaldos ni Angular.
- No hay commits.

### 34.1 Decisiones confirmadas por la institución (12/11/2026)

| Regla | Efecto en la documentación |
|---|---|
| Se mantienen **exclusivamente dos roles**: `INSTRUCTOR` y `STUDENT`. | Precisión de D-4 (24.1); el texto original se conserva. |
| La administración general de IMC tiene facultades administrativas especiales, pero **no es un tercer rol académico**: es un **permiso administrativo independiente**. | Nueva. |
| Una cuenta administrativa tiene el rol `INSTRUCTOR` y, además, el permiso. **No todos** los Instructores lo tienen. | Nueva. |
| El permiso se asigna solo por un **mecanismo administrativo seguro**, nunca por registro público ni por una petición modificable desde Angular. | Nueva. |
| La autorización se verifica en el backend; ocultar botones o pantallas en Angular no basta. | Nueva. |
| La administración general crea empresas, registra Instructores y los asigna o reasigna a empresas (uno o varios por empresa). Los Instructores gestionan solo a los estudiantes de sus empresas. | Resuelve B2.1-2. **Operaciones pendientes** (B2.2b y siguientes). |

### 34.2 Implementado (backend)

| Elemento | Detalle |
|---|---|
| **Permiso** | `IMC_GENERAL_ADMIN`, en la tabla nueva `instructor_permissions`. Sin fila no hay permiso. La base impide dárselo a quien no tiene perfil de Instructor. Registra quién lo otorgó y cuándo. |
| **Protección de rutas** | Una ruta administrativa exige el rol Instructor **y** el permiso. Se comprueba en la base **en cada solicitud** y no viaja en el token, así que retirarlo surte efecto de inmediato. Un Instructor sin el permiso y un estudiante reciben 403, y el intento queda en la bitácora. |
| **Rutas futuras** | Se declararán con `@AdminController` (prefijo `/admin`) o `@GeneralAdmin`. **La API no arranca** si una ruta `/admin` no exige el permiso. |
| **Primera cuenta** | Comando nuevo `admin:grant-general`: otorga el permiso a un Instructor que ya existe, activo y con perfil. Se niega si ya hay una cuenta activa con el permiso. No cambia el rol, la contraseña ni las sesiones. Queda en la bitácora. `admin:create` no cambia. |
| **Sin elevación** | Ninguna ruta HTTP otorga ni retira permisos. Los permisos enviados en encabezados, parámetros, cuerpo o en el token se ignoran. |
| **Sin cambios** | El rol, el token de acceso, `/auth/me`, el cambio obligatorio de contraseña, el bloqueo, las sesiones y el alcance por empresa de B2.1. El permiso **no** permite ver estudiantes de empresas ajenas. |

### 34.3 Funcionalidades implementadas y pendientes

| Implementado en B2.2a | Pendiente |
|---|---|
| Permiso persistente, verificación en el backend, decoradores, comprobación al arrancar, comando de la primera cuenta, pruebas | Crear y editar empresas; registrar Instructores; asignar y reasignar Instructores a empresas (B2.2b y siguientes) |
| — | Gestión de estudiantes por el Instructor y matrículas |
| — | Pantallas de administración en Angular (requiere autorización) |
| — | Aplicar las migraciones y ejecutar `test:db` |

### 34.4 Pendientes de decisión

| # | Asunto |
|---|---|
| B2.2a-1 | **Más cuentas con el permiso y su retiro:** hoy solo se habilita la primera, por consola. ¿Las demás las habilita la administración general desde la plataforma, o solo por consola? |
| B2.2a-2 | **¿La administración general consulta o gestiona estudiantes?** Hoy no: el permiso no amplía el alcance por empresa. Propuesta técnica: no (mínimo privilegio). |
| B2.2a-3 | **Informar el permiso al frontend** (por ejemplo, en `/auth/me`) para mostrar las pantallas de administración. Cambia el contrato y requiere autorizar Angular. |
| B2.2a-4 | **Aplicar las migraciones** de B2.1 y B2.2a, en ese orden, y ejecutar `test:db`. Tras aplicarlas, nadie tiene el permiso hasta ejecutar `admin:grant-general`. |
| B2.2a-5 | **Cuenta de demostración con el permiso:** la semilla no se modificó y `a1` no lo tiene. |
| B2.2a-6 | Prueba del comando `admin:grant-general` contra MySQL, junto con `test:db`. |

---

## 35. B2.2b: gestión de empresas en el backend (12/11/2026)

**Solo backend.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 22.
- **No requirió migración:** se usa la tabla `companies` de B1.1.
- No se aplicaron migraciones ni se ejecutaron semillas, `test:db` o comandos.
- No se modificaron MySQL, `.env`, respaldos ni Angular.
- No hay commits.

### 35.1 Qué puede hacer la administración general

Todas las operaciones exigen el permiso `IMC_GENERAL_ADMIN`:
- **Registrar** una empresa: nombre, RUC y, si se desea, correo de contacto.
- **Listar** empresas, con búsqueda por nombre o RUC y filtro por estado.
- **Consultar** una empresa.
- **Actualizar** nombre, RUC o correo de contacto.
- **Desactivar** una empresa, sin borrarla, y **reactivarla**.

### 35.2 Estado

| Estado | Qué incluye |
|---|---|
| **Implementado y probado** (base simulada) | Las operaciones, el control de acceso (Instructor sin permiso y estudiante: 403; sin sesión: 401), la validación y la bitácora de cada cambio |
| **Implementado, pendiente de validación con MySQL** | Unicidad real de nombre y RUC; que cada operación y su registro en la bitácora se confirmen juntos. Antes hay que aplicar las migraciones de B2.1 y B2.2a |
| **Pendiente de decisión institucional** | 35.5 |

### 35.3 Reglas respetadas

- **RUC:** solo lo que ya exigía B1.1: obligatorio, 11 caracteres y único. **No se valida su contenido**: su formato institucional sigue pendiente.
- **Sin borrado físico:** la empresa se desactiva.
- **Sin cambios:** las asignaciones de instructores, las empresas de los estudiantes, el alcance de los Instructores y la autenticación.
- **Sin datos ficticios:** no se crearon empresas ni se modificaron cuentas.

### 35.4 Bitácora

Se registran el alta, los cambios, la desactivación y la reactivación, con el actor tomado del token.
- Del correo de contacto solo se registra que cambió, no su valor.
- El registro se escribe en la misma operación: si falla, el cambio no se confirma.

### 35.5 Pendientes de decisión

| # | Asunto |
|---|---|
| B2.2b-1 | **Qué implica desactivar una empresa.** **Resuelto el 12/11/2026** (35.6). |
| B2.2b-2 | **¿Se puede corregir el RUC después del registro?** **Resuelto el 12/11/2026:** sí (35.6). |
| B2.2b-3 | **Reactivar una empresa.** **Confirmada el 12/11/2026** (35.6). |
| B2.2b-4 | **Validación con MySQL:** aplicar las migraciones de B2.1 y B2.2a y ejecutar `test:db` (autorización expresa). |
| B2.2b-5 | Listado sin paginación (propuesta técnica: agregarla si el número de empresas lo exige). |

### 35.6 Cierre de B2.2b: decisiones confirmadas por la institución (12/11/2026)

| Decisión | Estado |
|---|---|
| **Desactivar una empresa** conserva la empresa, su historial, las asociaciones de estudiantes e instructores y el acceso a los registros académicos existentes. No elimina ni altera información histórica. | **Implementado y probado.** |
| Una empresa inactiva **no admite nuevas asignaciones** vinculadas a ella. | **Regla documentada:** todavía no existe ninguna operación que asigne. Se aplicará en B2.2c (instructores) y B2.3 (estudiantes). |
| Una empresa inactiva **no admite nuevas matrículas** vinculadas a ella. | **Regla documentada** para B2.4. Falta precisar el vínculo, porque la matrícula no guarda empresa (B2.2b-6). |
| La administración general puede **corregir el RUC**: obligatorio, 11 caracteres y único, sin reglas de formato nuevas, con bitácora del valor anterior y el nuevo. | **Implementado y probado.** |
| **Reactivar:** solo la administración general, con bitácora y conservando las asociaciones. Al reactivar vuelven a permitirse las operaciones de una empresa activa. | **Implementado y probado.** |

**Pendientes nuevos:**
- **B2.2b-6:** qué es una matrícula «vinculada a una empresa inactiva». Opciones:
  - rechazarla si el estudiante tiene alguna empresa inactiva;
  - solo si todas sus empresas lo están;
  - guardar en la matrícula la empresa por la que se matricula.
- **B2.2b-7:** la semilla de demostración frente a una `emp-demo` inactiva.
- **B2.2b-8:** retirar asignaciones de una empresa inactiva.

Detalle técnico en `ARQUITECTURA_BACKEND.md`, 22.9.

---

## 36. B2.2c: asignación de instructores a empresas en el backend (12/11/2026)

**Solo backend.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 23.
- **No requirió migración.**
- No se aplicaron migraciones ni se ejecutaron semillas, `test:db` o comandos.
- No se modificaron MySQL, `.env`, respaldos ni Angular.
- No hay commits.

### 36.1 Qué puede hacer la administración general

Todo exige el permiso `IMC_GENERAL_ADMIN`:
- **Consultar** los instructores con sus empresas, el detalle de un instructor y los instructores de una empresa.
- **Asignar** uno o varios instructores a una o varias empresas en una sola operación. Lo que ya estaba asignado no
  se duplica.
- **Reasignar:** dejar a un instructor exactamente con las empresas indicadas.
- **Retirar** una asignación.

### 36.2 Reglas

| Regla | Estado |
|---|---|
| Una empresa **inactiva no admite asignaciones nuevas** (409). Las existentes se conservan y se pueden retirar. Al reactivarla vuelve a admitirlas. | **Implementado y probado** |
| Un instructor con la **cuenta inactiva no recibe asignaciones nuevas** (409). Sus asignaciones existentes se conservan y se pueden retirar. | **Confirmado el 12/11/2026; implementado y probado** |
| El administrador general **puede asignarse a sí mismo** si cumple los requisitos de Instructor (rol y perfil válido); queda en la bitácora como cualquier asignación. Ser administrador no da empresas automáticamente. | **Confirmado el 12/11/2026; implementado y probado** |
| **Retirar** solo elimina la relación instructor–empresa. No se borran instructores, empresas, estudiantes, matrículas ni registros académicos. El retiro queda en la bitácora. | **Implementado y probado** |
| Tras retirar, el Instructor **pierde** el acceso a los estudiantes que solo compartía por esa empresa y **conserva** el de los que comparte por otra. | **Implementado y probado** |
| Cada operación es **atómica**: si una parte falla, no se aplica nada. | **Implementado y probado** con la base simulada; **pendiente de validación con MySQL** |
| El actor sale siempre del token; tener el permiso no amplía el alcance académico. | **Implementado y probado** |

### 36.3 Bitácora

Cada asignación creada o retirada deja un registro con:
- el administrador que la hizo;
- el instructor y la empresa afectados;
- el tipo de operación (asignar, reasignar o retirar);
- la IP y la fecha y hora.

No se registran datos personales.

### 36.4 Pendientes

| # | Asunto |
|---|---|
| B2.2c-1 | ¿Se puede asignar un instructor cuya cuenta está desactivada? **Resuelto el 12/11/2026:** no recibe asignaciones nuevas. |
| B2.2c-2 | ¿El administrador puede asignarse empresas a sí mismo? **Resuelto el 12/11/2026:** sí, si cumple los requisitos de Instructor, con registro en la bitácora. |
| B2.2c-3 | Validación con MySQL (autorización expresa). |
| B2.2c-4 | **Registro (alta) de Instructores** por la administración general: no forma parte de B2.2c; requiere también decidir D17. |
| B2.2c-5 | Listados sin paginación (propuesta técnica). |

---

## 37. B2.3a: consulta de estudiantes en el backend (13/11/2026)

**Solo backend y solo lectura.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 24.
- Sin migraciones y sin operaciones sobre MySQL.
- Sin cambios en Angular, `.env` ni respaldos.
- Sin commits.
- **D17 sigue pendiente.**

### 37.1 Qué puede hacer el Instructor

- **Listar** los estudiantes que comparten al menos una empresa con él, con:
  - búsqueda por nombres, apellidos, correo o DNI;
  - filtro por una de sus empresas;
  - paginación (hasta 100 por página).
- **Consultar** el detalle de uno de esos estudiantes.

### 37.2 Reglas

| Regla | Estado |
|---|---|
| Solo los estudiantes de sus empresas. Sin empresas asignadas, lista vacía. Los estudiantes sin empresas no aparecen. | **Implementado y probado** |
| Empresa ajena en el filtro, o estudiante ajeno, sin empresas o inexistente: «no encontrado» (404), sin distinguir los casos. | **Implementado y probado** |
| Solo se muestran las empresas del estudiante que pertenecen al Instructor. | **Confirmado el 13/11/2026; implementado y probado** |
| La administración general no ve estudiantes por tener el permiso, solo los de las empresas que tenga asignadas. | **Implementado y probado** |
| La respuesta no incluye contraseñas, tokens, datos de bloqueo, roles ni permisos. | **Implementado y probado** |

### 37.3 Pendientes (para B2.3b, B2.3c y B2.3d)

| # | Pregunta |
|---|---|
| D17 | ¿Cómo recibe el estudiante sus credenciales? **Resuelto el 13/11/2026:** enlace de activación por correo (sección 39). |
| P1-b | ¿Qué datos personales puede editar el Instructor (nombres, apellidos, correo, DNI) y cualquiera que comparta empresa con el estudiante? (B2.3d) |
| P2 | Si se intenta dar de alta a alguien que ya existe en otra empresa. **Resuelto el 13/11/2026:** se rechaza; no se vincula (sección 39). |
| P3 | ¿Se puede retirar la última empresa de un estudiante? **Resuelto el 13/11/2026:** no; sin mecanismo de recuperación (sección 38). |
| P4 | ¿El alta exige al menos una empresa del Instructor? **Resuelto el 13/11/2026:** sí, válida y activa (sección 39). |
| P5 | ¿Un estudiante con la cuenta inactiva puede recibir nuevas empresas? **Resuelto el 13/11/2026:** no (sección 38). |
| P6 | ¿Se puede retirar a un estudiante de una empresa inactiva? **Resuelto el 13/11/2026:** sí (sección 38). |
| P8 | ¿Entran en B2.3 activar, desactivar o desbloquear cuentas y restablecer contraseñas? |

---

## 38. B2.3b: asignación y retiro de empresas de estudiantes en el backend (13/11/2026)

**Solo backend.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 25.
- Sin migraciones y sin operaciones sobre MySQL.
- Sin cambios en Angular, `.env` ni respaldos.
- Sin commits.

### 38.1 Decisiones confirmadas (13/11/2026)

| # | Decisión | Estado |
|---|---|---|
| P3 | **No se puede retirar la última empresa** de un estudiante: debe conservar al menos una. No hay recuperación de estudiantes sin empresas. | **Implementado y probado**, también ante dos retiros simultáneos (protección pendiente de validar con MySQL) |
| P5 | Un estudiante con la **cuenta inactiva** no recibe nuevas empresas. | **Implementado y probado** |
| P6 | Se puede **retirar** a un estudiante de una **empresa inactiva**. | **Implementado y probado** |

### 38.2 Qué puede hacer el Instructor

- **Asignar** una o varias de **sus** empresas a un estudiante que ya ve.
  - No se permite con empresas ajenas, inexistentes o inactivas, ni a estudiantes con la cuenta inactiva.
  - Todo o nada; lo ya asignado no se duplica.
- **Retirar** a un estudiante de una de **sus** empresas, salvo que sea la única.
  - Si deja de compartir empresas con él, deja de verlo, pero el estudiante y sus datos se conservan.

Cada asignación y cada retiro quedan en la bitácora, sin datos personales.

### 38.3 Pendientes

- Validación con MySQL (autorización expresa).
- **D17**, P1-b, P2, P4 y P8 siguen pendientes (37.3).

---

## 39. B2.3c: registro de estudiantes y activación de la cuenta por correo (13/11/2026)

**Solo backend.** Detalle técnico en `ARQUITECTURA_BACKEND.md`, sección 26.
- **Hay una migración nueva, generada pero no aplicada.**
- No se ejecutaron migraciones, semillas ni `test:db`.
- No se modificaron MySQL, `.env`, respaldos ni Angular.
- **No se envió ningún correo real:** todavía no hay un proveedor de correo integrado.
- Sin commits.

### 39.1 Decisiones confirmadas (13/11/2026)

| # | Decisión | Estado |
|---|---|---|
| P4 | El registro exige **al menos una empresa** válida, activa y del Instructor. | **Implementado y probado** |
| P2 | Si el DNI o el correo ya existen, se **rechaza**; no se vincula con la cuenta existente. | **Implementado y probado** (mensajes del frontend) |
| D17 | El estudiante activa su cuenta con un **enlace único, temporal y de un solo uso** enviado a su correo, y **crea su propia contraseña**. Nunca se envían contraseñas. No puede iniciar sesión antes de activar. | **Implementado y probado** con un correo simulado. El envío real requiere un proveedor de correo (pendiente, 39.3) |
| — | El registro **no matricula** en ningún curso (B2.4). | **Implementado y probado** |

### 39.2 Cómo funciona

1. **Registro:** el Instructor registra al estudiante (nombres, apellidos, correo, DNI y una o más de sus empresas).
   La cuenta queda **pendiente de activación**.
2. **Correo:** el sistema intenta enviar un correo con un enlace que vence en **72 horas** (configurable). La respuesta
   indica si el correo se entregó al proveedor, si falló o si no hay proveedor configurado.
3. **Activación:** el estudiante abre el enlace y crea su contraseña (al menos 8 caracteres, con letras y números). El
   enlace deja de servir.
4. **Si el correo no llegó o el enlace venció**, el Instructor puede **reenviarlo**: se crea uno nuevo y el anterior
   deja de servir.

### 39.3 Pendientes

| # | Asunto |
|---|---|
| B2.3c-1 | **Proveedor de correo real** (servicio SMTP o API, sus credenciales y la configuración DNS del dominio remitente). Sin él, ningún estudiante recibe el enlace. Depende del hosting (D-2). |
| B2.3c-2 | **Pantalla de activación** en el frontend (requiere autorizar cambios en Angular). |
| B2.3c-3 | ¿Debe el listado de estudiantes mostrar si la cuenta está **pendiente de activación**? Hoy no (no se cambió el contrato de B2.3a). |
| B2.3c-4 | Validación con MySQL y aplicación de las migraciones pendientes (B2.1, B2.2a y B2.3c), con autorización expresa. |
| B2.3c-6 / B2.3c-7 | Limpieza de enlaces antiguos y envío del correo en segundo plano (propuestas técnicas). |
| P1-b, P8 | Edición de datos (B2.3d) y gestión de cuentas: siguen pendientes. |

---

## 40. Módulo académico conectado a MySQL (18/11/2026)

**Backend (NestJS):** módulo `src/modules/academic` con las reglas portadas de la demostración (RN-03, RN-07, RN-09,
RN-11, RN-12, RN-14, RN-15, Etapa 2A y calificación proporcional de la 2B). Migración **generada y no aplicada**:
`20261118000000_modulo_academico` (solo agrega columnas y tablas). Cada Instructor gestiona solo **sus cursos**
(`courses.created_by`) y **sus estudiantes** (`students.registered_by`); el estudiante, solo su información (`/me`).

**Frontend (Angular, modo API):** `ApiDataRepository` implementa el contrato `DataRepository` con la API, así que las
pantallas existentes (Dashboard, Cursos, Videos, Evaluaciones, Evaluaciones rendidas, Certificados, Mis cursos, aula,
examen, resultado, Mi progreso, Mis certificados y verificación) usan datos reales. Participantes: registro, activación
y **asignación de cursos**. Cursos: **activar y desactivar**. El PDF del certificado ya no lleva la leyenda de
demostración en modo API.

### 40.1 Pendientes y decisiones

| # | Asunto |
|---|---|
| A-1 | **Aplicar la migración** `20261118000000_modulo_academico` en `aula_imc_dev` (con respaldo y autorización). |
| A-2 | **Recuperaciones de exámenes (R1–R8):** sin backend. En modo API se informan vacías; autorizar o anular responde «módulo en preparación». |
| A-3 | **Reportes en PDF** y filtros por fecha: no implementados (existe la exportación a Excel de «Evaluaciones rendidas»). |
| A-4 | **Gestión de instructores** desde la interfaz (alta segura, sin tercer panel) y **pantalla de empresas**: el backend de empresas y asignaciones existe; faltan las pantallas y el alta de instructores (B2.2c-4). |
| A-5 | **Recuperación de contraseña olvidada** y **proveedor de correo real**: pendientes (hoy, cambio de contraseña y `MAIL_DEV_CONSOLE` en local). |
| A-6 | Formulario: **fecha de disponibilidad** del examen y **material complementario** del video ya existen en la API, pero aún no en los formularios. |
| A-7 | **Pruebas contra MySQL** (`test/db`) del módulo académico: por escribir; requieren autorización para `test:db`. |

## 41. Subida de portadas de curso (19/11/2026)

**Problema corregido:** al pegar una dirección https muy larga (por ejemplo, copiada de un buscador de imágenes), el backend rechazaba el curso con `coverImage must be shorter than or equal to 500 characters`, en inglés. No existía subida de archivos.

**Solución:**
- **Opción nueva en modo API:** «Portada personalizada: imagen desde el equipo». Incluye vista previa local antes de guardar, «Reemplazar imagen», «Quitar imagen», indicador de subida y validación de JPG, PNG o WebP de hasta 2 MB.
- **Almacenamiento:** el archivo se guarda en `backend/storage/course-covers/` con nombre UUID; en MySQL queda solo la ruta (ver backend/README.md, «Portadas de curso»).
- **Al crear:** primero se crea el curso y luego se sube la imagen. Si la subida falla, el curso se conserva y se puede reintentar con «Guardar cambios».
- **Opciones que se mantienen:** sin portada, portada de demostración y dirección https, esta última ahora limitada a 500 caracteres con mensaje en español.
- **Modo demostración:** la subida aparece desactivada y no se guardan imágenes ni Base64.

**Pendientes:**
- La verificación visual en el navegador contra MySQL requiere que `20261118000000_modulo_academico` esté aplicada en `aula_imc_dev`.
- Producción: definir el respaldo de `backend/storage/` o mover el almacenamiento a un servicio de objetos. El código lo aísla en `CourseCoverStorage`.
- No se recorta ni se redimensiona la imagen; se recomienda una proporción de 16:9.

## 42. RN-03 por módulo y sin máximo de videos (19/11/2026)

**Problema corregido:** había un máximo de 7 videos por curso. La pantalla Videos mostraba «7 de 7 videos» y bloqueaba «Agregar video» aunque los videos estuvieran en módulos distintos.

**Reglas vigentes** (backend y modo demostración):

| Regla | Detalle |
|---|---|
| Sin máximo | Ya no hay límite de videos por curso ni por módulo. Cada video conserva su `moduleId` |
| Publicar desde borrador | Cada módulo necesita **al menos 5 videos publicados propios**; los de un módulo no cuentan para otro. Un módulo sin videos publicados también bloquea. Sin límite de duración desde el 20/11/2026 |
| Cursos ya publicados | Conservan el acceso de sus estudiantes con la regla anterior, sin máximo: al menos 5 videos publicados en total. No se bloquean de forma retroactiva por módulos con menos de 5 |
| Avisos | Si un curso publicado no cumple el mínimo por módulo, los requisitos de publicación lo muestran como advertencia: «Para volver a publicarlo desde borrador: …» |
| Cambios en un curso publicado | Se mantiene la protección existente: no se puede despublicar ni eliminar si quedan menos de 5 videos publicados en total. Reorganizar videos entre módulos se sigue permitiendo |

**Pantallas:**
- **Videos:** muestra el total y el número de módulos, y en el formulario el conteo del módulo elegido. «Agregar video» ya no se bloquea por cantidad.
- **Contenido del curso:** cada módulo muestra «N de 5 publicados» y siempre permite «Crear video en este módulo».

No hubo cambios en MySQL ni en los datos existentes.

## 43. Duración libre, sesiones en vivo con Google Meet y empresas de participantes (20/11/2026)

### 43.1 Duración de los videos sin límite
- **Regla anterior eliminada:** RN-03 ya no exige que cada video dure de 5 a 10 minutos. Solo se exige una duración real válida: segundos enteros mayores que 0, con el tope técnico de la columna INT.
- **Se mantiene:** al menos 5 videos publicados **por módulo** para publicar desde borrador, y al menos 5 en total en los cursos ya publicados.
- **Formulario:** acepta `mm:ss` (45:00, 90:00) y `h:mm:ss` (1:30:00, 2:05:09).
- **Visualización:** desde una hora se muestra como `h:mm:ss`.
- Se quitaron el aviso y la insignia «Fuera de RN-03». La pantalla heredada de c1 acepta cualquier cantidad entera de minutos mayor que 0.

### 43.2 Sesiones en vivo (Google Meet)
- **Tabla nueva:** `course_live_sessions`, en la migración **`20261120000000_sesiones_en_vivo`**. Es aditiva y está **pendiente de aplicar**: respaldo previo y luego `npm run db:migrate`.
- **Instructor:** programa, edita, cancela y vuelve a programar sesiones en **Cursos › Editar curso › Contenido del curso**, dentro de cada módulo. Opera solo sobre sus cursos; lo ajeno responde 404.
- **Validaciones:** título obligatorio; fecha y hora de Lima futura; solo enlaces `https://meet.google.com/abc-defg-hij`; módulo del mismo curso.
- **Estudiante:** en el aula del curso, la tarjeta «Sesiones en vivo» muestra título, módulo, fecha y hora de Lima.
  - El botón **«Unirse a la sesión en vivo»** abre Meet en una pestaña nueva (`noopener noreferrer`).
  - Las canceladas se ven como «Cancelada», sin botón.
  - Solo con matrícula en un curso disponible.
- **Eliminar un módulo:** sus sesiones pasan al módulo de destino; nunca se borran.
- **Rutas:**
  - `GET/POST /courses/:id/live-sessions`, `PUT /courses/:id/live-sessions/:sid` y `PUT …/:sid/status` (Instructor);
  - `GET /me/courses/:id/live-sessions` (estudiante).
- **Antes de la migración:** en modo API, la sección muestra un aviso y el aula simplemente no muestra sesiones; el resto funciona igual.

### 43.3 Empresas de los participantes (opción A)
- **Selector:** el Instructor puede elegir **cualquier empresa activa registrada**, con búsqueda por razón social (sin distinguir tildes ni mayúsculas) o por RUC. Admite selección múltiple, y registrar sin empresa sigue siendo válido.
- **Backend:**
  - `GET /students/companies` devuelve todas las empresas activas.
  - La asignación acepta cualquier empresa existente; una inactiva se rechaza con 409, como antes.
  - La lista y el detalle muestran todas las empresas de **sus** participantes.
- **Aislamiento sin cambios:** cada Instructor ve y gestiona **solo** a los participantes que registró (`students.registered_by`). Elegir una empresa nunca da acceso a participantes de otro Instructor.
- No se crearon empresas ni se modificaron registros existentes.

## 44. Participantes con empresa por RUC, clases en vivo como sección propia y aula en cuatro áreas (20/11/2026)

### 44.1 Empresas y participantes
- **Registro:** el formulario ofrece «Sin empresa», «Empresa registrada» (buscador con selección múltiple) o «Empresa nueva (razón social y RUC)».
  - Con un RUC que ya existe y está activo, se reutiliza esa empresa, sin duplicar.
  - Con un RUC de una empresa desactivada, responde 409: no se duplica ni se reactiva.
  - Si la razón social ya existe con otro RUC, responde 409.
  - Si no existe, la empresa se registra en MySQL dentro de la misma transacción que el participante; si el registro falla, la empresa no queda creada. Queda en la bitácora como `COMPANY_CREATED`.
- **Listado y detalle:** muestran la empresa y su RUC, o «Sin empresa».
- **Búsqueda:** por nombres, apellidos, nombre completo, DNI, correo, razón social o RUC, sin distinguir mayúsculas ni tildes y solo entre los participantes propios.
- **«Empresa de demostración» (RUC 00000000001):** en modo API **no** es un dato simulado del frontend. Es una fila real de `aula_imc_dev` que creó la semilla de desarrollo, y se ofrece porque está activa. No se modificó. Para que no aparezca, puede desactivarse desde **Empresas** (administración general); los datos se conservan.
- **Error al cargar empresas:** el formulario muestra el mensaje y el botón «Reintentar»; nunca usa datos de demostración.

### 44.2 Clases en vivo
- **Instructor:** sección propia «Clases en vivo» en **Cursos › Editar curso**, después de «Contenido del curso».
  - El módulo relacionado es **opcional**.
  - Acciones: programar, editar o reprogramar, cancelar, volver a programar y **agregar o quitar la grabación** (solo en clases ya realizadas y no canceladas; enlace https de Drive, YouTube u otra fuente).
- **Estudiante:** en el aula, las clases se separan en «Próximas clases» y «Clases anteriores».
  - Estados: Programada, En curso, Finalizada y Cancelada.
  - «Unirse a la clase» se ofrece hasta 4 horas después del inicio (la ventana no es configurable todavía).
  - «Ver grabación» aparece solo si existe.
- **Eliminar un módulo:** sus clases pasan al módulo de destino o quedan como clases de todo el curso.
- **Ruta nueva:** `PUT /courses/:id/live-sessions/:sid/recording`.
- **Migración `20261120000000_sesiones_en_vivo`:** regenerada antes de aplicarse en ninguna base. Agrega `module_id` NULL y `recording_url`; sigue siendo un único `CREATE TABLE` aditivo. **Pendiente de autorización.**

### 44.3 Aula del estudiante
- **Menú de secciones:** Contenido del curso · Clases en vivo · Evaluaciones · Progreso y certificados.

## 45. Recuperación de exámenes en el servidor, publicación desde 1 video y sin «Sin archivo» (21/11/2026)

### 45.1 Recuperación de exámenes (modo API)
- **Backend:** se portaron las reglas ya validadas en la demostración (Etapa 2B, Bloque 2, R3–R8). Las pantallas existentes (Resultados › Recuperaciones, Evaluaciones › Recuperación independiente, aula y examen del estudiante) ahora también funcionan en modo API.
- **Autorización:** solo la hace el **Instructor dueño del curso** y solo para quien **desaprobó** el examen regular (intento calificado y no aprobado). Nunca se habilita sola; los aprobados, quien tiene el regular en revisión y quien no rindió reciben 409. Hay una sola oportunidad no anulada por estudiante y curso.
- **Modalidades:**
  - **original:** reabre el examen regular sin modificarlo (RN-15);
  - **independiente:** examen `kind = RECUPERACION` con preguntas copiadas del original que luego se editan, agregan o quitan. Conserva la escala, la nota mínima y la duración del original (regla del proyecto) y la suma de puntajes debe ser igual a la escala (Etapa 2A).
- **Ventana:** limita solo el inicio. La recuperación se puede anular antes del inicio; al vencer sin inicio queda «No rindió recuperación».
- **Al rendir:** inicio registrado en el servidor, respuestas guardadas, entrega voluntaria o automática por tiempo y un solo intento (RN-07, por índice único `estudiante + examen + kind`).
- **Nota final (regla del proyecto, R4/R6; no se inventó):** la nota de la recuperación pasa a ser la vigente, aunque sea menor. Actualiza la condición y, si aprueba, emite el certificado con esa nota. El intento regular **no se modifica** y queda en el historial.
- **Datos:** nueva tabla `exam_recoveries` en la migración **`20261121000000_recuperaciones_examen`** (aditiva). **Pendiente de autorización para aplicarla.** Hasta aplicarla, las rutas de recuperación fallan contra `aula_imc_dev`.
- **Decisiones pendientes de confirmar:**
  - (a) La demostración también autoriza a **ausentes** (sin intento regular); el servidor, por la regla del 21/11/2026, solo a desaprobados. Confirmar si la demostración debe alinearse.
  - (b) El valor de la recuperación se configura con los puntajes de sus preguntas; la escala, la nota mínima y la duración se heredan del original (regla vigente). Si la empresa quiere una escala o nota mínima distinta, debe definirse.

### 45.2 Publicación desde un video
- **Regla nueva:** basta **1 video publicado por módulo** para publicar el curso (antes eran 5); el Instructor decide cuántos agrega.
- **Cursos publicados:** deben mantener al menos 1 video publicado.
- **Alcance:** backend, demostración, mensajes y pantallas (Videos y Contenido del curso).

### 45.3 Sin «Sin archivo»
- **Formulario:** se eliminó la opción. Un video nuevo necesita enlace de YouTube, Google Drive u otro https, y el backend rechaza el video nuevo sin fuente (400).
- **Videos existentes:** los que no tienen fuente (solo en la demostración; en `aula_imc_dev` hay 0) se conservan tal cual y se pueden editar sin agregarles enlace; la tabla los muestra como «Sin fuente».
- **Sin cambios:** «Sin portada» y las demás opciones que no son de videos no se tocaron.

## 46. Filtros de certificados, recuperación solo con el examen original y validación pública (20/11/2026)

### 46.1 Certificados del Instructor
- **Filtros combinables:** estudiante (nombre, apellido o completo; parcial; sin mayúsculas ni tildes), código (completo o parcial), empresa y fechas de emisión. Botones «Buscar» y «Limpiar filtros», contador de resultados (vigentes y revocados) y columna «Empresa».
- **Modo API:** los filtros se aplican en el servidor (`GET /certificates`, `CertificateQueryDto`) con consultas fijas, sin N+1.
- **Aislamiento:** cursos propios **y** participantes registrados por el Instructor (`registered_by`). La empresa nunca amplía el alcance.
- **Exportaciones:** PDF y Excel incluyen **todos** los resultados filtrados (no hay paginación), con la empresa y los filtros aplicados en el encabezado del PDF.
- **Cambio de alcance:** antes, `GET /certificates` solo exigía que el curso fuera propio. Ahora también exige que el participante lo haya registrado el Instructor, igual que Participantes y Matrículas. Los certificados de participantes sin `registered_by` (anteriores al 17/11/2026) ya no aparecen en esta lista.

### 46.2 Recuperaciones (decisión definitiva)
- **Solo el examen original:** se retiraron la selección de modalidad, la sección «Recuperación independiente» de Evaluaciones y la ruta `POST /courses/:id/recovery-exams`. `POST /recoveries` rechaza `mode: 'independiente'` (400).
- **Datos históricos:** se conservan. Las filas con modalidad independiente se siguen leyendo y rindiendo, y no se eliminó ninguna columna.
- **Instructor:** tabla de desaprobados con DNI, empresa, curso, nota regular y estado; luego «Autorizar recuperación», fechas de apertura y cierre, resumen («nueva oportunidad para rendir el examen original») y «Confirmar autorización». La lista de autorizadas muestra además la fecha de autorización.
- **Aislamiento:** autorizar, listar y consultar estados se limita a los participantes registrados por el Instructor (404 para los ajenos).
- **Estudiante:** tarjeta en la sección del examen del aula con el estado (Recuperación disponible, autorizada, en curso, rendida o vencida), el curso, el examen, la apertura, el cierre y la oportunidad. El botón «Rendir examen de recuperación» solo se habilita dentro de la ventana, o si ya la inició.
- **Decisión 45 (a), resuelta:** la demostración se alineó con el servidor: solo desaprobados; los ausentes ya no reciben recuperación.
- **Decisión 45 (b):** ya no aplica a exámenes nuevos. La recuperación usa la escala, la nota mínima y la duración del examen original.

### 46.3 Validación pública de certificados
- **En /login:** sección «¿Necesitas verificar un certificado?» con el botón «Validar certificado», que abre **`/validar-certificado` en una pestaña nueva** (`target="_blank"`, `rel="noopener noreferrer"`). La pestaña del inicio de sesión no cambia.
- **La página pública:** reutiliza el componente de `/verificar` en modo «solo DNI» y el endpoint `GET /public/certificates/dni/:dni`. No pide sesión y valida el DNI de 8 dígitos.
- **Resultados:** por cada certificado, solo titular, curso, código, emisión, estado (Vigente o Anulado) y resultado («Certificado válido» o «Este certificado no se encuentra vigente»). Sin certificados: «No se encontraron certificados asociados al DNI ingresado».
- **Endpoint público por DNI:** ya no devuelve nota, escala, horas, entidad ni fecha de aprobación. Mantiene el límite de solicitudes existente.
- **`/verificar` (flujo anterior):** sin cambios. En el modo por DNI deja de mostrar «Horas de formación» porque el endpoint ya no las envía; la consulta por código sigue mostrándolas.

## 47. Cierre funcional (23/11/2026)

Migración aplicada en `aula_imc_dev`: `20261123000000_cierre_funcional` (aditiva). Respaldo previo de las tablas
afectadas: `C:\aulavirtual01\respaldos\respaldo_aula_imc_dev_20261123_pre_cierre_funcional.json`. Se comprobó fila por
fila que los datos anteriores no cambiaron.

### 47.1 Soporte por WhatsApp
- Botón «Contactar soporte» en el área del estudiante. No se muestra durante el examen ni envía datos del usuario.
- **Número provisional y ficticio.** Se reemplaza en un solo lugar: `src/app/core/config/support.config.ts`
  (`whatsappNumber`; poner `provisional: false` para quitar el aviso).

### 47.2 WhatsApp de participantes
- `students.whatsapp`, opcional. Acepta celular de 9 dígitos que empiece con 9 o número con prefijo internacional.
- Se registra al crear y se edita en el detalle (`PATCH /students/:id/contact`). Los registros anteriores quedan sin número.

### 47.3 Reportes
- Evaluaciones rendidas y Certificados exportan nombre completo, DNI y empresa en Excel, PDF y CSV (nuevo).
- Varias empresas van en una sola fila. Un dato faltante se indica («No registrado», «Sin empresa»).

### 47.4 Certificados
- Al emitir se guardan nombres, apellidos, DNI, empresa y nivel. Los certificados históricos no se modifican: muestran
  solo lo que ya tenían.
- **Pendiente institucional:** logotipo, firma y plantilla oficial siguen como marcadores provisionales.

### 47.5 Importación masiva
- Guía completa: `docs/IMPORTACION_CERTIFICADOS.md`. Plantillas: `docs/plantillas/`.
- Decisión: importación parcial de las filas válidas, en una sola transacción.
- Exige `IMC_GENERAL_ADMIN` y se limita a los cursos y participantes del propio Instructor.
- **Pendiente:** al 23/11/2026 ningún Instructor de `aula_imc_dev` tiene ese permiso. Se otorga con `npm run admin:grant-general`.

### 47.6 Niveles de curso
- Persona autorizada, Persona competente y Persona certificada (`courses.level`).
- Los cursos existentes quedan «Pendiente de clasificación» hasta que un Instructor les asigne su nivel.

### 47.7 Verificaciones no realizadas
- `npm run test:db` no se ejecutó: vacía las tablas de `aula_imc_test`.
- El flujo con sesión real contra MySQL no se probó en navegador porque no se usaron credenciales reales.

## 48. Estabilización y preparación para publicar (23/11/2026)

### 48.1 Estado verificado
- MySQL 8.0.42, base `aula_imc_dev`, 9 migraciones aplicadas y esquema al día. Esta etapa no agregó migraciones.
- Una sola cuenta Instructor (`a1`), sin el permiso `IMC_GENERAL_ADMIN`. 12 estudiantes (6 sin `registered_by`), 3 cursos sin nivel y 2 certificados.
- Pruebas: backend 175 unitarias y 220 e2e; frontend 869. TypeScript, lint, Prisma y builds correctos.
- Chrome (escritorio y móvil) con el build `production-api`, la API y MySQL reales, **sin iniciar sesión**: rutas protegidas, validación pública y activación sin token.

### 48.2 Activación manual por WhatsApp
- «Enviar enlace por WhatsApp» genera un enlace de un solo uso, anula los anteriores y abre `wa.me` con el mensaje preparado. El Instructor revisa y pulsa enviar.
- El mensaje no lleva nombre, DNI, correo ni contraseña. Un celular de 9 dígitos usa el prefijo 51 solo en el enlace; el dato guardado no cambia.
- Estados registrados: enlace generado y WhatsApp abierto. **La plataforma no puede saber si el mensaje se envió o se entregó.**
- Rutas: `POST /students/:id/activation-whatsapp`, `POST /students/:id/activation-whatsapp/opened`, `GET /students/:id/activation-status`.

### 48.3 Publicación
- Nuevo `npm run build:api`: build de producción conectado a la API. `npm run build` sigue generando la demostración.
- Requisitos y pasos: `docs/PUBLICACION.md`.

### 48.4 Bloqueado por autorización
- Recorrido real con sesión en MySQL: registro, activación, examen, certificado, importación y reportes.
- Permiso `IMC_GENERAL_ADMIN` para la cuenta administradora.
- `npm run test:db`, porque vacía las tablas de `aula_imc_test`.

## 49. Retiro de la gestión de instructores (23/11/2026)

**Decisión:** la plataforma tiene solo dos paneles: administración (lo usa el Instructor, que también administra) y alumno. Las secciones anteriores que describen el registro de instructores o su asignación a empresas quedan como historial.

### 49.1 Retirado
- **Frontend:** opción «Instructores», ruta `/instructor/instructores`, pantalla `admin-instructors`, y sus métodos y modelos. Las URL antiguas muestran «Página no encontrada».
- **Backend:** módulo `instructor-assignments` y las rutas `/admin/instructors` (listar, crear, detalle, reenviar enlace, reemplazar y retirar empresas), `GET /admin/companies/:companyId/instructors` y `POST /admin/instructor-assignments`.
- **Pruebas:** las de la función retirada, reemplazadas por `backend/test/instructors-retired.e2e-spec.ts`.

### 49.2 Conservado
- Cuenta administradora, autenticación, sesiones, activación de alumnos, `IMC_GENERAL_ADMIN`, `npm run admin:create` y `npm run admin:grant-general`.
- `GET /me/permissions` (ahora en `modules/my-permissions`): el panel la necesita para mostrar Empresas e Importar certificados.
- Empresas, participantes, cursos, matrículas, evaluaciones, certificados, importación y reportes.

### 49.3 Base de datos
- **Sin cambios en Prisma, sin migraciones y sin datos modificados.** Conteos después del retiro: 1 Instructor con su permiso, 4 empresas, 13 participantes, 5 cursos, 6 matrículas, 6 intentos, 4 certificados y 1 importación.
- `instructors` e `instructor_permissions` se conservan porque sostienen la cuenta administradora.
- `instructor_companies` (0 filas en `aula_imc_dev`) queda sin uso funcional. Eliminarla sería una migración destructiva y requiere autorización expresa.

### 49.4 Verificación
- Backend: TypeScript, lint, Prisma, build, 156 unitarias y 212 e2e correctas. Frontend: TypeScript, 870 pruebas y builds correctos.
- Chrome (escritorio y móvil): menús y rutas antiguas comprobados con API simulada para los dos roles. API real sin sesión: rutas retiradas 404.
- **No ejecutado:** `npm run test:db`, porque vacía `aula_imc_test`; incluye dos archivos ajustados en esta etapa. Tampoco se repitió el recorrido con sesión real.

### 49.5 Pendientes de la validación real
- **Registros QA conservados en `aula_imc_dev`:** participante DNI 99000001 (`qa.participante@prueba.test`), «QA Empresa de Prueba» (RUC 20999999991), cursos «QA Curso de Evaluación» y «QA Importación», certificados `IMC-2026-416C6F9986` y `QA-IMPORT-0001`, y una importación.
- Sin validar con sesión real: detección de duplicados tras importar, descarga de plantillas, los seis reportes, móvil con sesión y cierre de sesión.
- **Decisión pendiente:** `/auth/refresh` admite 10 solicitudes por minuto e IP y cada recarga consume una. Varios alumnos detrás de una misma red pueden volver al inicio de sesión.

## 50. Anonimización para publicar (23/11/2026)

- En este documento, «Responsable A» y «Responsable B» sustituyen nombres de personas que participaron en las reuniones. El sentido de cada decisión no cambia.
- `Reglas de negocio Aula Virtual IMC.pdf`: se quitaron los metadatos de autoría; su contenido no cambió.
- Las transcripciones de reuniones son privadas y no se publican.

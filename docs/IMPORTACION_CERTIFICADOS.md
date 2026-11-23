# Importación masiva de certificados

Guía para quien administra el Aula Virtual IMC. Vigente desde el 23/11/2026.

## Quién puede importar

La sección **Importar certificados** aparece en el panel del Instructor solo para cuentas con el permiso de
administración general (`IMC_GENERAL_ADMIN`). Para otorgarlo a un Instructor existente:

```powershell
cd C:\aulavirtual01\aula-virtual-imc\backend
npm.cmd run build
npm.cmd run admin:grant-general
```

El comando pide el correo y una confirmación. El permiso no amplía el alcance: cada Instructor importa solo sobre **sus
cursos** y sobre **los participantes que él registró**.

## Pasos

1. Descarga la plantilla Excel o CSV desde la pantalla. También están en `docs/plantillas/`.
2. Reemplaza las filas de ejemplo. Las que conservan el código `EJEMPLO-…` se rechazan.
3. Selecciona el archivo y pulsa **Analizar archivo**. Este paso no guarda nada.
4. Revisa los totales, los errores por fila y campo y los duplicados. Puedes descargar los errores en CSV.
5. Marca la confirmación y pulsa **Importar**.
6. Revisa el resumen. La operación queda en **Importaciones realizadas**.

## Columnas

| Columna | Obligatoria | Regla |
|---|---|---|
| `nombres` | Sí | Debe coincidir con el participante de ese DNI (sin distinguir mayúsculas ni tildes). |
| `apellidos` | Sí | Igual que `nombres`. |
| `dni` | Sí | 8 dígitos, de un participante registrado por ti. Guárdalo como texto para conservar los ceros iniciales. |
| `empresa` | Si el participante tiene empresa | Debe ser una de sus empresas. |
| `curso` | Sí | Nombre exacto de uno de tus cursos. |
| `codigo_certificado` | Sí | De 4 a 40 letras, números o guiones. Único en toda la plataforma. |
| `fecha_emision` | Sí | `AAAA-MM-DD` o `DD/MM/AAAA`. No puede ser futura. |
| `nivel_curso` | No | `persona_autorizada`, `persona_competente` o `persona_certificada`. Debe coincidir con el nivel del curso. |

Límites: archivos `.xlsx` o `.csv`, hasta 2 MB y 5000 registros. El CSV puede usar coma o punto y coma.

## Reglas de la importación

- **Importación parcial de los válidos, en una sola transacción.** Las filas con errores o duplicadas se omiten y se
  informan. Las válidas se guardan todas juntas: si la base falla, no se guarda ninguna.
- **No se crean** participantes, cursos ni empresas.
- Un certificado importado **no tiene nota, intento ni fecha de aprobación**, porque el archivo no los trae. El
  certificado muestra «por haber completado el curso» y omite esos datos.
- Son duplicados: un código ya registrado o repetido en el archivo, y un participante que ya tiene un certificado
  vigente del mismo curso.
- El servidor vuelve a validar todo al confirmar y exige que sea el mismo archivo analizado.
- Se rechazan fórmulas de Excel, celdas que empiezan con `=`, `+`, `-` o `@`, macros, archivos protegidos y archivos
  dañados.
- Los certificados importados se verifican igual que los demás, por código o por DNI.

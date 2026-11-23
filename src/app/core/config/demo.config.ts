/**
 * VALORES DE DEMOSTRACIÓN. Ninguno es definitivo: están pendientes de confirmar con la empresa.
 */
export const DEMO_CONFIG = {
  appName: 'Aula Virtual IMC',
  // Confirmar cómo debe figurar la entidad capacitadora en el certificado.
  entityName: 'IM Corporación SST Perú',
  demoPassword: 'demo1234', // solo para la demostración; NO es autenticación real
  exam: {
    timeMinutes: 20, // pendiente
    passScore: 60, // pendiente
    maxAttempts: 1, // regla de negocio: un solo intento por examen (MAX_ATTEMPTS); no es un valor de demostración
    scaleMax: 100, // pendiente: 100 o 20
  },
  // Curso que usan las pantallas actuales de un solo curso, hasta que E3 incorpore la navegación por curso.
  legacyCourseId: 'c1',
  // Solo en modo demostración: los alumnos ven sus cursos en borrador, identificados como tales.
  // El examen y el certificado siguen bloqueados mientras el curso no cumpla las reglas.
  showDraftCoursesToParticipants: true,
  // Portada que se muestra si un curso no tiene imagen o no se puede cargar.
  coverFallback: 'images/portada-respaldo.svg',
};

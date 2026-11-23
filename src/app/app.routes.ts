import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { roleGuard, guestGuard, passwordChangeGuard } from './core/guards/role.guard';
import { courseAccessGuard } from './core/guards/course-access.guard';
import { apiModeMatch } from './core/guards/api-mode.guard';
import { generalAdminMatch } from './core/guards/general-admin.guard';
import { DEMO_CONFIG } from './core/config/demo.config';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { ParticipantLayout } from './layouts/participant-layout/participant-layout';
import { AdminLayout } from './layouts/admin-layout/admin-layout';

const verify = () =>
  import('./features/certificates/verify/verify').then((m) => m.Verify);
const myCertificates = () =>
  import('./features/certificates/my-certificates/my-certificates').then((m) => m.MyCertificates);
const certificateDetail = () =>
  import('./features/certificates/certificate-detail/certificate-detail').then((m) => m.CertificateDetail);

const panel = () => import('./features/dashboard/panel').then((m) => m.Panel);
const myProgress = () => import('./features/progress/my-progress').then((m) => m.MyProgress);
const courseRoom = () => import('./features/courses/course-room').then((m) => m.CourseRoom);
const examInstructions = () =>
  import('./features/exam/instructions/instructions').then((m) => m.ExamInstructions);
const exam = () => import('./features/exam/exam/exam').then((m) => m.Exam);
const examResult = () => import('./features/exam/result/result').then((m) => m.ExamResult);

const adminDashboard = () => import('./features/administration/admin-dashboard').then((m) => m.AdminDashboard);
const adminParticipants = () => import('./features/administration/admin-participants').then((m) => m.AdminParticipants);
const adminCourses = () => import('./features/administration/admin-courses').then((m) => m.AdminCourses);
const adminVideos = () => import('./features/administration/admin-videos').then((m) => m.AdminVideos);
const adminEvaluations = () => import('./features/administration/admin-evaluations').then((m) => m.AdminEvaluations);
const adminResults = () => import('./features/administration/admin-results').then((m) => m.AdminResults);
const adminCertificates = () => import('./features/administration/admin-certificates').then((m) => m.AdminCertificates);

// Modo API: versiones conectadas al servidor. Las pantallas de la demostración se conservan sin cambios.
const adminCompanies = () => import('./features/administration/admin-companies').then((m) => m.AdminCompanies);
const adminCertificateImport = () => import('./features/administration/admin-certificate-import').then((m) => m.AdminCertificateImport);
const adminStudentsApi = () => import('./features/administration/admin-students-api').then((m) => m.AdminStudentsApi);

// Rutas anteriores (un solo curso): redirigen al curso principal para no romper enlaces guardados.
const LEGACY_COURSE = `/cursos/${DEMO_CONFIG.legacyCourseId}`;

/**
 * /admin/<sección>?<parámetros>#<fragmento> → /instructor/<sección>?<parámetros>#<fragmento>.
 * Conserva todos los segmentos, los parámetros y el fragmento. /instructor nunca redirige a /admin: no hay bucles.
 * La redirección ocurre antes de los guards: quien no es Instructor sigue sin poder entrar.
 */
export const legacyAdminRedirect: RedirectFunction = ({ url, queryParams, fragment }) =>
  // R7: /admin/resultados va directo a la sección nueva (sin una segunda redirección).
  inject(Router).createUrlTree(['/instructor', ...url.map((segment, i) => (i === 0 && segment.path === 'resultados' ? 'evaluaciones-rendidas' : segment.path))], {
    queryParams,
    fragment: fragment ?? undefined,
  });

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  // Zona pública
  {
    path: '',
    component: AuthLayout,
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
      },
      // Verificación pública de certificados (modo API: endpoint público del servidor, sin datos privados).
      { path: 'verificar', loadComponent: verify },
      { path: 'verificar/:codigo', loadComponent: verify },
      // Validación pública por DNI (20/11/2026): se abre en una pestaña nueva desde /login. Sin sesión ni guards; reutiliza
      // la verificación existente (mismo componente y endpoint) en modo «solo DNI» con los textos para terceros.
      { path: 'validar-certificado', loadComponent: verify, data: { publicDni: true }, title: 'Validación de certificados · Aula Virtual IMC' },
      // Activación de la cuenta del estudiante con el enlace del correo (solo modo API; pública).
      {
        path: 'activar-cuenta',
        canMatch: [apiModeMatch],
        loadComponent: () => import('./features/auth/activate-account/activate-account').then((m) => m.ActivateAccount),
      },
      // Cambio obligatorio de la contraseña temporal (modo API, B1.3).
      {
        path: 'cambiar-clave',
        canActivate: [passwordChangeGuard],
        loadComponent: () => import('./features/auth/change-password/change-password').then((m) => m.ChangePassword),
      },
    ],
  },

  // Instructor (B1.2). Los componentes conservan sus nombres internos admin-* (decisión B1-b).
  {
    path: 'instructor',
    component: AdminLayout,
    canActivate: [roleGuard('instructor')],
    // Modo API (18/11/2026): todos los módulos están conectados al servidor. «Participantes» usa su versión conectada.
    children: [
      { path: '', pathMatch: 'full', loadComponent: adminDashboard },
      { path: 'participantes', canMatch: [apiModeMatch], loadComponent: adminStudentsApi },
      { path: 'participantes', loadComponent: adminParticipants },
      { path: 'cursos', loadComponent: adminCourses },
      { path: 'videos', loadComponent: adminVideos },
      { path: 'evaluaciones', loadComponent: adminEvaluations },
      // R7: «Evaluaciones rendidas» (antes «Seguimiento y resultados»). La ruta anterior redirige y conserva sus filtros.
      { path: 'evaluaciones-rendidas', loadComponent: adminResults },
      { path: 'resultados', redirectTo: 'evaluaciones-rendidas' },
      { path: 'certificados', loadComponent: adminCertificates },
      // Administración general de IMC (modo API, permiso IMC_GENERAL_ADMIN): dentro del panel del Instructor.
      { path: 'empresas', canMatch: [generalAdminMatch], loadComponent: adminCompanies },
      { path: 'importar-certificados', canMatch: [generalAdminMatch], loadComponent: adminCertificateImport, title: 'Importación masiva de certificados · Aula Virtual IMC' },
    ],
  },

  // Rutas anteriores /admin/... (B1-a): redirigen a /instructor/... para no romper enlaces guardados.
  { path: 'admin', children: [{ path: '**', redirectTo: legacyAdminRedirect }] },

  // Participante
  {
    path: '',
    component: ParticipantLayout,
    canActivate: [roleGuard('participant')],
    // Modo API (18/11/2026): cursos, avance, exámenes y certificados se sirven desde el servidor (MySQL).
    children: [
      { path: 'panel', loadComponent: panel },
      { path: 'cursos/:courseId', canActivate: [courseAccessGuard], loadComponent: courseRoom },
      { path: 'cursos/:courseId/videos/:videoId', canActivate: [courseAccessGuard], loadComponent: courseRoom },
      { path: 'cursos/:courseId/examen', canActivate: [courseAccessGuard], loadComponent: examInstructions },
      { path: 'cursos/:courseId/examen/rendir', canActivate: [courseAccessGuard], loadComponent: exam },
      { path: 'cursos/:courseId/examen/resultado', canActivate: [courseAccessGuard], loadComponent: examResult },
      { path: 'curso', pathMatch: 'full', redirectTo: LEGACY_COURSE },
      { path: 'curso/:videoId', redirectTo: `${LEGACY_COURSE}/videos/:videoId` },
      { path: 'examen/instrucciones', redirectTo: `${LEGACY_COURSE}/examen` },
      { path: 'examen/resultado', redirectTo: `${LEGACY_COURSE}/examen/resultado` },
      { path: 'examen', pathMatch: 'full', redirectTo: `${LEGACY_COURSE}/examen/rendir` },
      { path: 'progreso', loadComponent: myProgress },
      { path: 'certificados', loadComponent: myCertificates },
      { path: 'certificados/:id', loadComponent: certificateDetail },
    ],
  },

  {
    path: '**',
    loadComponent: () => import('./shared/components/not-found').then((m) => m.NotFound),
  },
];

import { Routes } from '@angular/router';
import { roleGuard, guestGuard } from './core/guards/role.guard';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { ParticipantLayout } from './layouts/participant-layout/participant-layout';
import { AdminLayout } from './layouts/admin-layout/admin-layout';

const placeholder = () =>
  import('./shared/components/placeholder-page').then((m) => m.PlaceholderPage);

const verify = () =>
  import('./features/certificates/verify/verify').then((m) => m.Verify);
const myCertificates = () =>
  import('./features/certificates/my-certificates/my-certificates').then((m) => m.MyCertificates);
const certificateDetail = () =>
  import('./features/certificates/certificate-detail/certificate-detail').then((m) => m.CertificateDetail);

const panel = () => import('./features/dashboard/panel').then((m) => m.Panel);
const courseRoom = () => import('./features/courses/course-room').then((m) => m.CourseRoom);
const examInstructions = () =>
  import('./features/exam/instructions/instructions').then((m) => m.ExamInstructions);
const exam = () => import('./features/exam/exam/exam').then((m) => m.Exam);
const examResult = () => import('./features/exam/result/result').then((m) => m.ExamResult);

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
      { path: 'verificar', loadComponent: verify },
      { path: 'verificar/:codigo', loadComponent: verify },
    ],
  },

  // Administrador
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [roleGuard('admin')],
    children: [
      { path: '', loadComponent: placeholder, data: { title: 'Dashboard', stage: 5 } },
      { path: 'participantes', loadComponent: placeholder, data: { title: 'Participantes', stage: 5 } },
      { path: 'cursos', loadComponent: placeholder, data: { title: 'Cursos', stage: 5 } },
      { path: 'videos', loadComponent: placeholder, data: { title: 'Videos', stage: 5 } },
      { path: 'evaluaciones', loadComponent: placeholder, data: { title: 'Evaluaciones', stage: 5 } },
      { path: 'resultados', loadComponent: placeholder, data: { title: 'Seguimiento y resultados', stage: 5 } },
      { path: 'certificados', loadComponent: placeholder, data: { title: 'Certificados emitidos', stage: 5 } },
    ],
  },

  // Participante
  {
    path: '',
    component: ParticipantLayout,
    canActivate: [roleGuard('participant')],
    children: [
      { path: 'panel', loadComponent: panel },
      { path: 'curso', loadComponent: courseRoom },
      { path: 'curso/:videoId', loadComponent: courseRoom },
      { path: 'examen/instrucciones', loadComponent: examInstructions },
      { path: 'examen/resultado', loadComponent: examResult },
      { path: 'examen', loadComponent: exam },
      { path: 'certificados', loadComponent: myCertificates },
      { path: 'certificados/:id', loadComponent: certificateDetail },
    ],
  },

  {
    path: '**',
    loadComponent: () => import('./shared/components/not-found').then((m) => m.NotFound),
  },
];

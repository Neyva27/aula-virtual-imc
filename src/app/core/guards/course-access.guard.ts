import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DataRepository } from '../services/data-repository';

/**
 * Protección VISUAL: solo se abre un curso que el alumno tiene asignado (y visible).
 * Conocer la dirección no basta. La seguridad real va en el backend (RN-16).
 */
export const courseAccessGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const repo = inject(DataRepository);
  const router = inject(Router);
  const denied = router.createUrlTree(['/panel'], { queryParams: { aviso: 'sin-acceso' } });

  const user = auth.user();
  const courseId = route.paramMap.get('courseId');
  if (!user || !courseId) return denied;
  return repo.getParticipantCourses(user.id).pipe(
    map((courses) => courses.some((p) => p.course.id === courseId) || denied),
    catchError(() => of(denied)),
  );
};

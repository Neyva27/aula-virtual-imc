/** Nombre del cerrojo compartido por todas las pestañas del mismo origen. */
export const REFRESH_LOCK_NAME = 'imc-auth-refresh';

type LockManagerLike = {
  request<T>(name: string, options: { mode: 'exclusive'; signal?: AbortSignal }, task: () => Promise<T>): Promise<T>;
};

function browserLocks(): LockManagerLike | undefined {
  const locks = (globalThis.navigator as (Navigator & { locks?: LockManagerLike }) | undefined)?.locks;
  return typeof locks?.request === 'function' ? locks : undefined;
}

/** El navegador ofrece la Web Locks API (coordinación entre pestañas). */
export function refreshLockSupported(locks: LockManagerLike | undefined = browserLocks()): boolean {
  return !!locks;
}

/**
 * Ejecuta la renovación de sesión de forma exclusiva entre pestañas (Web Locks API). El backend rota la cookie en cada
 * renovación y trata dos renovaciones simultáneas con la misma cookie como reutilización (cierra la sesión): con el
 * cerrojo, la segunda pestaña espera y renueva con la cookie ya actualizada.
 *
 * `signal` limita la ESPERA del cerrojo (por ejemplo, al abrir la aplicación): si otra pestaña lo retiene más tiempo,
 * se desiste y la promesa se rechaza, en lugar de bloquear el arranque.
 *
 * LIMITACIÓN: si el navegador no ofrece Web Locks, la tarea se ejecuta sin coordinación entre pestañas (solo se evitan
 * las renovaciones simultáneas dentro de la misma pestaña) y dos pestañas que renueven a la vez pueden cerrar la sesión.
 */
export function withRefreshLock<T>(
  task: () => Promise<T>,
  locks: LockManagerLike | undefined = browserLocks(),
  signal?: AbortSignal,
): Promise<T> {
  if (!locks) return task();
  return locks.request(REFRESH_LOCK_NAME, signal ? { mode: 'exclusive', signal } : { mode: 'exclusive' }, task);
}

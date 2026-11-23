import { REFRESH_LOCK_NAME, refreshLockSupported, withRefreshLock } from './refresh-lock';

/** Cerrojo exclusivo simulado (como Web Locks): ejecuta las tareas de una en una. */
function fakeLocks() {
  const calls: string[] = [];
  let tail = Promise.resolve();
  return {
    calls,
    request<T>(name: string, _options: { mode: 'exclusive' }, task: () => Promise<T>): Promise<T> {
      calls.push(name);
      const run = tail.then(task);
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

describe('Coordinación de renovaciones entre pestañas (Web Locks, B1.3)', () => {
  it('con Web Locks, usa el cerrojo compartido y ejecuta las renovaciones de una en una', async () => {
    const locks = fakeLocks();
    const order: string[] = [];
    const task = (id: string) => () => new Promise<string>((resolve) => {
      order.push(`inicio ${id}`);
      setTimeout(() => {
        order.push(`fin ${id}`);
        resolve(id);
      }, 10);
    });
    const results = await Promise.all([withRefreshLock(task('A'), locks), withRefreshLock(task('B'), locks)]);
    expect(results).toEqual(['A', 'B']);
    expect(locks.calls).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME]);
    expect(order).toEqual(['inicio A', 'fin A', 'inicio B', 'fin B']); // nunca dos a la vez
    expect(refreshLockSupported(locks)).toBe(true);
  });

  it('sin Web Locks, ejecuta la tarea directamente (limitación documentada: sin coordinación entre pestañas)', async () => {
    expect(refreshLockSupported(undefined)).toBe(false);
    await expect(withRefreshLock(() => Promise.resolve('ok'), undefined)).resolves.toBe('ok');
  });
});

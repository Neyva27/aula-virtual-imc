export type Role = 'participant' | 'admin';

export interface User {
  id: string;
  fullName: string;
  email: string;
  dni?: string; // DNI ficticio de prueba
  role: Role;
}

export type CourseStatus = 'borrador' | 'publicado';

export interface Video {
  id: string;
  order: number;
  title: string;
  description?: string;
  durationMin: number; // RN-03: entre 5 y 10 minutos
  published: boolean;
  url?: string;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  status: CourseStatus;
  trainingHours: number; // dato configurable (pendiente de definición)
  videos: Video[]; // RN-03: entre 5 y 7 videos
}

// RN-09
export type ParticipantStatus =
  | 'pendiente'
  | 'en_progreso'
  | 'listo_examen'
  | 'aprobado'
  | 'desaprobado';

export interface Enrollment {
  userId: string;
  courseId: string;
  completedVideoIds: string[];
  startDate?: string; // ISO
  status: ParticipantStatus;
}

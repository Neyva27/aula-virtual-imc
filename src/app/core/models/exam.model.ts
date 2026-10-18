export interface ExamConfig {
  timeMinutes: number;
  passScore: number;
  maxAttempts: number;
  scaleMax: number; // 100 o 20: pendiente de definición
}

export interface Attempt {
  id: string;
  userId: string;
  date: string; // ISO
  durationSec: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
}

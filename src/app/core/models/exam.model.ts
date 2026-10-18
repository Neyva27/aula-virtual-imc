export interface ExamConfig {
  timeMinutes: number;
  passScore: number;
  maxAttempts: number;
  scaleMax: number; // 100 o 20: pendiente de definición
}

export type QuestionType = 'single' | 'multiple' | 'truefalse';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correct: string[]; // RN-12: respuesta correcta definida
  points: number; // RN-12: puntuación asignada
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

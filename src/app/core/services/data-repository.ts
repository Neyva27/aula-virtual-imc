import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { Course, CoursePatch, Enrollment, ParticipantInput, VideoInput } from '../models/course.model';
import { Attempt, ExamConfig, Question } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';

/**
 * Contrato de datos de la aplicación. Hoy lo implementa MockDataRepository;
 * luego se sustituye por una implementación con HttpClient sin tocar las pantallas.
 */
export abstract class DataRepository {
  // ----- Lecturas -----
  abstract getUsers(): Observable<User[]>;
  abstract getCourse(): Observable<Course>;
  abstract getEnrollment(userId: string): Observable<Enrollment | null>;
  abstract getEnrollments(): Observable<Enrollment[]>;
  abstract getExamConfig(): Observable<ExamConfig>;
  abstract getQuestions(): Observable<Question[]>;
  abstract getAttempts(userId?: string): Observable<Attempt[]>;
  abstract getCertificates(userId?: string): Observable<Certificate[]>;
  abstract findCertificateByCode(code: string): Observable<Certificate | null>;
  abstract findCertificatesByDni(dni: string): Observable<Certificate[]>;

  // ----- Participante (simulado) -----
  abstract markVideoCompleted(userId: string, videoId: string): Observable<Enrollment>;
  abstract submitAttempt(
    userId: string,
    answers: Record<string, string[]>,
    durationSec: number,
  ): Observable<Attempt>;

  // ----- Administración (simulado) -----
  abstract addParticipant(input: ParticipantInput): Observable<User>;
  abstract updateCourse(patch: CoursePatch): Observable<Course>;
  abstract saveVideo(input: VideoInput): Observable<Course>;
  abstract moveVideo(videoId: string, delta: -1 | 1): Observable<Course>;
  abstract setVideoPublished(videoId: string, published: boolean): Observable<Course>;
  abstract deleteVideo(videoId: string): Observable<Course>;
  abstract updateExamConfig(config: ExamConfig): Observable<ExamConfig>;
  abstract saveQuestion(question: Question): Observable<Question[]>;
  abstract deleteQuestion(questionId: string): Observable<Question[]>;

  /** Solo demostración: restablece los datos de prueba. */
  abstract resetDemo(): void;
}

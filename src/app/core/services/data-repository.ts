import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { Course, Enrollment } from '../models/course.model';
import { Attempt, ExamConfig } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';

/**
 * Contrato de datos de la aplicación. Hoy lo implementa MockDataRepository;
 * luego se sustituye por una implementación con HttpClient sin tocar las pantallas.
 */
export abstract class DataRepository {
  abstract getUsers(): Observable<User[]>;
  abstract getCourse(): Observable<Course>;
  abstract getEnrollment(userId: string): Observable<Enrollment | null>;
  abstract getEnrollments(): Observable<Enrollment[]>;
  abstract getExamConfig(): Observable<ExamConfig>;
  abstract getAttempts(userId?: string): Observable<Attempt[]>;
  abstract getCertificates(userId?: string): Observable<Certificate[]>;
  abstract findCertificateByCode(code: string): Observable<Certificate | null>;
  abstract findCertificatesByDni(dni: string): Observable<Certificate[]>;
}

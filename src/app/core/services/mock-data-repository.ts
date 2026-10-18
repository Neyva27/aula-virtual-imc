import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { DataRepository } from './data-repository';
import { User } from '../models/user.model';
import { Course, Enrollment } from '../models/course.model';
import { Attempt, ExamConfig } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';
import {
  SEED_ATTEMPTS,
  SEED_CERTIFICATES,
  SEED_COURSE,
  SEED_ENROLLMENTS,
  SEED_EXAM,
  SEED_USERS,
} from '../data/seed';

const LATENCY_MS = 250; // simula la espera de una API

function respond<T>(value: T): Observable<T> {
  return of(structuredClone(value)).pipe(delay(LATENCY_MS));
}

@Injectable()
export class MockDataRepository extends DataRepository {
  getUsers(): Observable<User[]> {
    return respond(SEED_USERS);
  }

  getCourse(): Observable<Course> {
    return respond(SEED_COURSE);
  }

  getEnrollment(userId: string): Observable<Enrollment | null> {
    return respond(SEED_ENROLLMENTS.find((e) => e.userId === userId) ?? null);
  }

  getEnrollments(): Observable<Enrollment[]> {
    return respond(SEED_ENROLLMENTS);
  }

  getExamConfig(): Observable<ExamConfig> {
    return respond(SEED_EXAM);
  }

  getAttempts(userId?: string): Observable<Attempt[]> {
    return respond(userId ? SEED_ATTEMPTS.filter((a) => a.userId === userId) : SEED_ATTEMPTS);
  }

  getCertificates(userId?: string): Observable<Certificate[]> {
    return respond(userId ? SEED_CERTIFICATES.filter((c) => c.userId === userId) : SEED_CERTIFICATES);
  }

  findCertificateByCode(code: string): Observable<Certificate | null> {
    const wanted = code.trim().toUpperCase();
    return respond(SEED_CERTIFICATES.find((c) => c.code.toUpperCase() === wanted) ?? null);
  }

  findCertificatesByDni(dni: string): Observable<Certificate[]> {
    return respond(SEED_CERTIFICATES.filter((c) => c.participantDni === dni.trim()));
  }
}

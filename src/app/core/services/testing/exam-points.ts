import { firstValueFrom } from 'rxjs';
import { CourseStatus } from '../../models/course.model';
import { ExamQuestion, Question } from '../../models/exam.model';
import { DataRepository } from '../data-repository';

/**
 * SOLO PARA PRUEBAS (Etapa 2A). Con el curso publicado, la suma de los puntajes debe ser exactamente la nota máxima
 * y cada cambio debe mantenerla. Estas ayudas preparan los datos con el mismo flujo que usaría el Instructor:
 * pasar el curso a borrador, reorganizar los puntajes y volver a publicarlo (la publicación vuelve a validar la suma).
 */
export async function setCourseStatus(repo: DataRepository, courseId: string, status: CourseStatus): Promise<void> {
  const course = (await firstValueFrom(repo.getCourses())).find((c) => c.id === courseId);
  if (!course) throw new Error(`No existe el curso ${courseId}`);
  const { name, description, trainingHours, coverImage } = course;
  await firstValueFrom(repo.updateCourseById(courseId, { name, description, trainingHours, coverImage, status }));
}

/**
 * Agrega `question` al examen y reparte por igual el resto de la escala entre las preguntas existentes, de modo que la
 * suma total sea exactamente la nota máxima. Si el curso estaba publicado, lo pasa a borrador mientras tanto y lo
 * vuelve a publicar. Devuelve las preguntas del examen.
 */
export async function addQuestionKeepingScale(
  repo: DataRepository,
  courseId: string,
  examId: string,
  question: Question,
): Promise<ExamQuestion[]> {
  const exam = (await firstValueFrom(repo.getExams(courseId))).find((e) => e.id === examId);
  if (!exam) throw new Error(`No existe el examen ${examId}`);
  const wasPublished = (await firstValueFrom(repo.getCourses())).find((c) => c.id === courseId)?.status === 'publicado';
  if (wasPublished) await setCourseStatus(repo, courseId, 'borrador');

  const current = await firstValueFrom(repo.getExamQuestions(examId));
  const each = (exam.scaleMax - question.points) / current.length;
  if (!(each > 0)) throw new Error('La pregunta nueva no deja puntos para las demás');
  // En paralelo: cada guardado cambia una pregunta distinta y el repositorio simulado los aplica en orden; así se
  // espera una sola vez su latencia simulada (250 ms) en lugar de una por pregunta.
  await Promise.all(current.map(({ examId: _e, ...q }) => firstValueFrom(repo.saveExamQuestion(examId, { ...q, points: each }))));
  const list = await firstValueFrom(repo.saveExamQuestion(examId, question));

  if (wasPublished) await setCourseStatus(repo, courseId, 'publicado');
  return list;
}

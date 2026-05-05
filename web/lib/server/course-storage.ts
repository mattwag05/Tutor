import { promises as fs } from 'fs';
import path from 'path';
import type { Course } from '@/lib/types/course';
import { writeJsonFileAtomic } from './classroom-storage';

export const COURSES_DIR = path.join(process.cwd(), 'data', 'courses');

export function isValidCourseId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isValidSectionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function ensureCoursesDir() {
  await fs.mkdir(COURSES_DIR, { recursive: true });
}

export function courseAudioPath(courseId: string, sectionId: string): string {
  return path.join(COURSES_DIR, courseId, 'audio', `${sectionId}.mp3`);
}

export function courseImagePath(courseId: string, blockId: string): string {
  return path.join(COURSES_DIR, courseId, 'images', `${blockId}.jpg`);
}

export async function writeSectionAudio(
  courseId: string,
  sectionId: string,
  data: Buffer,
): Promise<string> {
  if (!isValidCourseId(courseId) || !isValidSectionId(sectionId)) {
    throw new Error('Invalid course or section id');
  }
  const filePath = courseAudioPath(courseId, sectionId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return filePath;
}

export type PodcastMode = 'solo' | 'conversational';

export function isValidPodcastMode(mode: string): mode is PodcastMode {
  return mode === 'solo' || mode === 'conversational';
}

export function coursePodcastPath(courseId: string, mode: PodcastMode): string {
  return path.join(COURSES_DIR, courseId, 'podcast', `${mode}.mp3`);
}

export async function writePodcastAudio(
  courseId: string,
  mode: PodcastMode,
  data: Buffer,
): Promise<string> {
  if (!isValidCourseId(courseId) || !isValidPodcastMode(mode)) {
    throw new Error('Invalid course id or podcast mode');
  }
  const filePath = coursePodcastPath(courseId, mode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function readCourse(id: string): Promise<Course | null> {
  const filePath = path.join(COURSES_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Course;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCourse(course: Course): Promise<void> {
  await ensureCoursesDir();
  const filePath = path.join(COURSES_DIR, `${course.id}.json`);
  await writeJsonFileAtomic(filePath, course);
}

export async function deleteCourse(id: string): Promise<boolean> {
  const filePath = path.join(COURSES_DIR, `${id}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export type CourseSummary = { id: string; title: string; topic: string; createdAt: string; sectionCount: number };

export async function listCourses(): Promise<CourseSummary[]> {
  try {
    const files = await fs.readdir(COURSES_DIR);
    const summaries = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            const content = await fs.readFile(path.join(COURSES_DIR, f), 'utf-8');
            const c = JSON.parse(content) as Course;
            return {
              id: c.id,
              title: c.title,
              topic: c.topic,
              createdAt: c.createdAt,
              sectionCount: c.sections.length,
            };
          } catch {
            return null;
          }
        }),
    );
    return summaries.filter((s): s is CourseSummary => s !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

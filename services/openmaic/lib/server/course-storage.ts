/**
 * Server-side storage for Course Builder documents.
 * Mirrors classroom-storage.ts pattern: atomic JSON file write under
 * data/courses/<id>.json.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Course } from '@/lib/types/course';
import { writeJsonFileAtomic } from './classroom-storage';

export const COURSES_DIR = path.join(process.cwd(), 'data', 'courses');

export function isValidCourseId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function ensureCoursesDir() {
  await fs.mkdir(COURSES_DIR, { recursive: true });
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

export async function listCourses(): Promise<Array<{ id: string; title: string; createdAt: string }>> {
  try {
    const files = await fs.readdir(COURSES_DIR);
    const summaries = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            const content = await fs.readFile(path.join(COURSES_DIR, f), 'utf-8');
            const c = JSON.parse(content) as Course;
            return { id: c.id, title: c.title, createdAt: c.createdAt };
          } catch {
            return null;
          }
        }),
    );
    return summaries.filter((s): s is { id: string; title: string; createdAt: string } => s !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

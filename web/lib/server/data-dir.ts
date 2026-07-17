import path from 'path';

export function dataDir(): string {
  return process.env.TUTOR_DATA_DIR || path.join(process.cwd(), 'data');
}

export function settingsPath(filename: string): string {
  return path.join(dataDir(), 'user', 'settings', filename);
}

export function coursesDir(): string {
  return path.join(dataDir(), 'courses');
}

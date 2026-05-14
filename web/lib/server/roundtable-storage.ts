import { promises as fs } from 'fs';
import path from 'path';
import { dataDir } from '@/lib/server/data-dir';

export const ROUNDTABLES_DIR = path.join(dataDir(), 'roundtables');

export interface RoundtableSession {
  id: string;
  topic: string;
  prompt?: string;
  sourceType: 'course' | 'kb' | 'classroom';
  sourceId: string;
  createdAt: string;
  agentIds: string[];
}

function sessionPath(id: string): string {
  return path.join(ROUNDTABLES_DIR, `${id}.json`);
}

function isValidSessionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function ensureDir() {
  await fs.mkdir(ROUNDTABLES_DIR, { recursive: true });
}

export async function createRoundtableSession(session: RoundtableSession): Promise<void> {
  await ensureDir();
  const filePath = sessionPath(session.id);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

export async function readRoundtableSession(id: string): Promise<RoundtableSession | null> {
  if (!isValidSessionId(id)) return null;
  try {
    const content = await fs.readFile(sessionPath(id), 'utf-8');
    return JSON.parse(content) as RoundtableSession;
  } catch {
    return null;
  }
}

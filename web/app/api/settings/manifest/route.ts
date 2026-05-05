import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { DEFAULT_MANIFEST_PROFILES, type ManifestTier } from '@/lib/ai/manifest/profiles';
import type { ManifestProfileConfig } from '@/lib/ai/manifest/profiles';

const PROFILES_PATH = path.join(process.cwd(), 'data/user/settings/manifest_profiles.json');

interface ProfilesFile {
  profiles: Partial<Record<ManifestTier, ManifestProfileConfig>>;
}

async function loadProfiles(): Promise<Partial<Record<ManifestTier, ManifestProfileConfig>>> {
  try {
    const raw = await fs.readFile(PROFILES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ProfilesFile;
    return parsed.profiles ?? {};
  } catch {
    return {};
  }
}

export async function GET() {
  const saved = await loadProfiles();
  // Merge saved overrides on top of defaults so the UI always sees all three tiers
  const merged: Record<ManifestTier, ManifestProfileConfig> = {
    'tutor-cheap': { ...DEFAULT_MANIFEST_PROFILES['tutor-cheap'], ...saved['tutor-cheap'] },
    'tutor-balanced': { ...DEFAULT_MANIFEST_PROFILES['tutor-balanced'], ...saved['tutor-balanced'] },
    'tutor-premium': { ...DEFAULT_MANIFEST_PROFILES['tutor-premium'], ...saved['tutor-premium'] },
  };
  return NextResponse.json({ profiles: merged });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { profiles: Partial<Record<ManifestTier, ManifestProfileConfig>> };
    if (!body?.profiles || typeof body.profiles !== 'object') {
      return NextResponse.json({ error: 'profiles object required' }, { status: 422 });
    }
    const validTiers: ManifestTier[] = ['tutor-cheap', 'tutor-balanced', 'tutor-premium'];
    const invalidKeys = Object.keys(body.profiles).filter((k) => !validTiers.includes(k as ManifestTier));
    if (invalidKeys.length > 0) {
      return NextResponse.json({ error: `Unknown tiers: ${invalidKeys.join(', ')}` }, { status: 422 });
    }

    await fs.mkdir(path.dirname(PROFILES_PATH), { recursive: true });
    const file: ProfilesFile = { profiles: body.profiles };
    await fs.writeFile(PROFILES_PATH, JSON.stringify(file, null, 2), 'utf-8');
    return NextResponse.json({ profiles: body.profiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'write failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

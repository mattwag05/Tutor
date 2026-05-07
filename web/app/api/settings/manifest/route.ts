import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { DEFAULT_MANIFEST_PROFILES, MANIFEST_TIERS, type ManifestTier } from '@/lib/ai/manifest/profiles';
import type { ManifestProfileConfig } from '@/lib/ai/manifest/profiles';
import { settingsPath } from '@/lib/server/data-dir';

const PROFILES_PATH = settingsPath('manifest_profiles.json');

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
  const merged = Object.fromEntries(
    MANIFEST_TIERS.map((tier) => [tier, { ...DEFAULT_MANIFEST_PROFILES[tier], ...saved[tier] }]),
  ) as Record<ManifestTier, ManifestProfileConfig>;
  return NextResponse.json({ profiles: merged });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { profiles: Partial<Record<ManifestTier, ManifestProfileConfig>> };
    if (!body?.profiles || typeof body.profiles !== 'object') {
      return NextResponse.json({ error: 'profiles object required' }, { status: 422 });
    }
    const invalidKeys = Object.keys(body.profiles).filter((k) => !MANIFEST_TIERS.includes(k as ManifestTier));
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

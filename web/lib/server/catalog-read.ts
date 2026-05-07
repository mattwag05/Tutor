import fs from 'fs';
import fsp from 'fs/promises';
import { settingsPath } from './data-dir';

export const PROFILED_SERVICES = ['llm', 'embedding', 'tts', 'asr', 'image', 'video'] as const;
export type ProfiledService = (typeof PROFILED_SERVICES)[number];
export type CatalogService = ProfiledService | 'search';

export interface CatalogProfile {
  id?: string;
  binding?: string;
  provider?: string;
  api_key?: string;
  base_url?: string;
  proxy?: string;
  models?: Array<Record<string, unknown>>;
}

interface RawCatalogService {
  active_profile_id?: string;
  profiles?: CatalogProfile[];
}

export interface RawCatalog {
  services?: Record<string, RawCatalogService>;
}

const CATALOG_PATH = settingsPath('model_catalog.json');

function parse(raw: string): RawCatalog | null {
  try {
    return JSON.parse(raw) as RawCatalog;
  } catch {
    return null;
  }
}

// Sync reader: catalog edits land via PUT /api/v1/settings/catalog and need to
// take effect on the next request without a restart, so we re-read on each
// call rather than caching. The file is small (single-digit KB) and the
// callers are themselves dispatching network calls that dwarf the sync I/O.
export function readCatalogSync(): RawCatalog | null {
  try {
    return parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export async function readCatalog(): Promise<RawCatalog | null> {
  try {
    return parse(await fsp.readFile(CATALOG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function getActiveProfile(
  catalog: RawCatalog | null,
  service: CatalogService,
): CatalogProfile | null {
  const svc = catalog?.services?.[service];
  if (!svc) return null;
  const profiles = svc.profiles ?? [];
  return profiles.find((p) => p.id === svc.active_profile_id) ?? profiles[0] ?? null;
}

export function profileBinding(profile: CatalogProfile): string | undefined {
  return profile.binding ?? profile.provider;
}

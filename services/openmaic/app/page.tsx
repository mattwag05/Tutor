'use client';

// The unified capture page lives at web/(workspace)/page.tsx (port 3782).
// Caddy routes / to 3782 on the unified origin, so this file is unreachable
// in production. It exists as a stub so Next.js doesn't warn about a missing
// root page entry. Phase B.4 removes this file when the OpenMAIC service
// is retired.

export default function OpenMAICRootRedirect() {
  return null;
}

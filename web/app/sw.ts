import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/api\/v1\/spaced-review\/today/,
      handler: new StaleWhileRevalidate({
        cacheName: "spaced-review-cache",
        plugins: [{ cacheWillUpdate: async ({ response }) => (response.ok ? response : null) }],
      }),
    },
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({ cacheName: "next-static" }),
    },
    {
      // Exclude SSE streaming routes — accept:text/event-stream responses can't be meaningfully cached
      matcher: ({ url, request }) =>
        url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/v1/spaced-review") &&
        request.headers.get("accept") !== "text/event-stream",
      handler: new NetworkFirst({ cacheName: "api-cache" }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

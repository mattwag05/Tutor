import fs from "fs";
import path from "path";
import vm from "vm";

const APP_SERVER_DIR = path.resolve(".next/server/app");
const APP_OUTPUT_DIR = path.resolve(".next");

const ROUTE_BUDGETS_KB = {
  "/": 340,
  "/book": 700,
  "/chat/[[...sessionId]]": 540,
  "/course": 390,
  "/course/[id]": 740,
  "/course/[id]/word-quest": 740,
  "/knowledge": 450,
  "/memory": 450,
  "/notebook": 380,
  "/settings": 390,
  "/space": 350,
  "/space/chat-history": 360,
  "/space/memory": 370,
  "/space/notebooks": 370,
  "/space/questions": 380,
  "/space/skills": 380,
};

const ROOT_SHELL_BUDGET_KB = 220;

function walkManifestFiles(rootDir) {
  const entries = [];
  for (const item of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, item.name);
    if (item.isDirectory()) {
      entries.push(...walkManifestFiles(fullPath));
      continue;
    }
    if (item.name.endsWith("_client-reference-manifest.js")) {
      entries.push(fullPath);
    }
  }
  return entries.sort();
}

function evaluateManifest(filePath) {
  const context = { globalThis: { __RSC_MANIFEST: {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context);
  const manifestEntries = Object.entries(context.globalThis.__RSC_MANIFEST);
  if (manifestEntries.length !== 1) {
    throw new Error(`Expected exactly one manifest in ${filePath}`);
  }
  const [manifestKey, manifest] = manifestEntries[0];
  return { manifestKey, manifest };
}

function normalizePublicRoute(manifestKey) {
  const withoutGroups = manifestKey.replace(/\/\([^/]+\)/g, "");
  const withoutPageSuffix = withoutGroups.replace(/\/page$/, "");
  return withoutPageSuffix || "/";
}

function resolveChunkSize(chunkPath) {
  const filePath = path.join(APP_OUTPUT_DIR, chunkPath.replace(/^\/+/, ""));
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function sumChunkSizes(chunkPaths) {
  const assetPaths = chunkPaths.filter(
    (chunkPath) => typeof chunkPath === "string" && /^static\/.+\.(css|js)$/.test(chunkPath),
  );
  return assetPaths.reduce((total, chunkPath) => total + resolveChunkSize(chunkPath), 0);
}

function getLegacyEntryRoute(manifest) {
  if (!manifest.entryJSFiles) {
    return null;
  }
  const entryFiles = manifest.entryJSFiles;
  const rootLayoutFiles = entryFiles["[project]/app/layout"] || [];
  const routeEntryKey = Object.keys(entryFiles).find(
    (key) => key.startsWith("[project]/app/") && key.endsWith("/page") && !key.includes("/layout"),
  );
  if (!routeEntryKey) {
    return { rootLayoutFiles, routeChunkPaths: [] };
  }
  return {
    rootLayoutFiles,
    routeChunkPaths: entryFiles[routeEntryKey] || [],
  };
}

function getClientModuleRoute(manifest) {
  if (!manifest.clientModules) {
    return null;
  }

  const rootLayoutFiles = new Set();
  const routeChunkPaths = new Set();
  for (const [moduleName, moduleEntry] of Object.entries(manifest.clientModules)) {
    const chunks = Array.isArray(moduleEntry?.chunks) ? moduleEntry.chunks : [];
    if (moduleName.includes("/app/layout") || moduleName.endsWith("/app/globals.css")) {
      for (const chunkPath of chunks) {
        rootLayoutFiles.add(chunkPath);
      }
    }
    for (const chunkPath of chunks) {
      routeChunkPaths.add(chunkPath);
    }
  }

  return {
    rootLayoutFiles: [...rootLayoutFiles],
    routeChunkPaths: [...routeChunkPaths],
  };
}

function getRouteAssets(manifest) {
  return getLegacyEntryRoute(manifest) || getClientModuleRoute(manifest);
}

if (!fs.existsSync(APP_SERVER_DIR)) {
  console.error("Missing .next/server/app. Run `npm run build` before `npm run perf:check`.");
  process.exit(1);
}

const manifestFiles = walkManifestFiles(APP_SERVER_DIR).filter(
  (filePath) => !filePath.includes("_global-error") && !filePath.includes("_not-found"),
);

const routeRows = [];
let rootShellSize = 0;

for (const manifestFile of manifestFiles) {
  const { manifestKey, manifest } = evaluateManifest(manifestFile);
  const route = normalizePublicRoute(manifestKey);
  const routeAssets = getRouteAssets(manifest);

  if (!routeAssets) {
    continue;
  }

  const { rootLayoutFiles, routeChunkPaths } = routeAssets;
  if (!rootShellSize && rootLayoutFiles.length > 0) {
    rootShellSize = sumChunkSizes(rootLayoutFiles);
  }

  if (routeChunkPaths.length === 0) {
    continue;
  }

  routeRows.push({
    route,
    sizeBytes: sumChunkSizes(routeChunkPaths),
    chunks: routeChunkPaths
      .filter((chunkPath) => typeof chunkPath === "string" && /^static\/.+\.(css|js)$/.test(chunkPath))
      .map((chunkPath) => path.basename(chunkPath)),
  });
}

let hasFailure = false;

if (routeRows.length === 0) {
  console.error("No route budget data found in .next/server/app client reference manifests.");
  console.error("Run `npm run build` and check whether Next.js changed the manifest format.");
  process.exit(1);
}

console.log("Route budgets:");
const routeWidth = Math.max(
  "root-shell".length,
  ...routeRows.map((row) => row.route.length),
);
for (const row of routeRows) {
  const sizeKb = Math.round(row.sizeBytes / 1024);
  const budget = ROUTE_BUDGETS_KB[row.route];
  const status = budget && sizeKb > budget ? "FAIL" : "OK";
  if (status === "FAIL") {
    hasFailure = true;
  }
  console.log(
    `${status.padEnd(4)} ${row.route.padEnd(routeWidth)} ${String(sizeKb).padStart(4)}KB` +
      (budget ? ` / budget ${budget}KB` : ""),
  );
}

if (rootShellSize) {
  const rootShellKb = Math.round(rootShellSize / 1024);
  const rootStatus = rootShellKb > ROOT_SHELL_BUDGET_KB ? "FAIL" : "OK";
  if (rootStatus === "FAIL") {
    hasFailure = true;
  }
  console.log(
    `${rootStatus.padEnd(4)} ${"root-shell".padEnd(routeWidth)} ${String(rootShellKb).padStart(4)}KB / budget ${ROOT_SHELL_BUDGET_KB}KB`,
  );
}

if (hasFailure) {
  process.exit(1);
}

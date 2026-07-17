import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const testRoot = path.join(webRoot, "tests");

function collectNodeTests(dir) {
  const entries = readdirSync(dir)
    .map((name) => path.join(dir, name))
    .sort((a, b) => a.localeCompare(b));
  const files = [];

  for (const entry of entries) {
    const stats = statSync(entry);
    if (stats.isDirectory()) {
      files.push(...collectNodeTests(entry));
      continue;
    }
    if (!entry.endsWith(".test.ts")) continue;

    const source = readFileSync(entry, "utf8");
    if (source.includes('"node:test"') || source.includes("'node:test'")) {
      files.push(path.relative(webRoot, entry));
    }
  }

  return files;
}

const testFiles = collectNodeTests(testRoot);
if (testFiles.length === 0) {
  console.error("No node:test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);

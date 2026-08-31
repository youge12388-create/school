import path from "node:path";
import { access, cp, mkdir } from "node:fs/promises";

const projectRoot = process.cwd();
const nextRoot = path.join(projectRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone");

await access(standaloneRoot);
await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(path.join(nextRoot, "static"), path.join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});

// Runtime database initialization reads the migration SQL files relative to
// the standalone server's working directory. Releases therefore need these
// versioned assets alongside server.js, while the mutable SQLite database
// itself remains outside the release tree.
await cp(path.join(projectRoot, "drizzle"), path.join(standaloneRoot, "drizzle"), {
  recursive: true,
  force: true,
});

const publicDir = path.join(projectRoot, "public");
try {
  await access(publicDir);
  await cp(publicDir, path.join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Standalone assets copied: .next/static, public, and drizzle");

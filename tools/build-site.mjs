// Builds ./dist — only what the game serves — so a direct `wrangler pages deploy` can never upload .env, .git/,
// server/, tools/, docs/, node_modules/ or the local asset archives (zips, unitypackages, bbdoc).
//   node tools/build-site.mjs            (npm run build:site)
//   npm run deploy                       (build:site, then wrangler pages deploy dist)
// Assets are taken from `git ls-files`, so anything gitignored (source archives) stays out by construction.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z", "index.html", "src", "data", "assets", "og.png", "og2.png", "og3.png", "cover.png"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
let n = 0, bytes = 0;
for (const f of files) {
  const from = path.join(root, f);
  if (!existsSync(from)) continue;
  const to = path.join(out, f);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
  n++; bytes += statSync(from).size;
}
console.log(`dist/: ${n} files, ${(bytes / 1048576).toFixed(0)} MB`);

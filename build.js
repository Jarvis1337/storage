// build.js — runs ONCE at deploy time (Netlify/Vercel build step).
// It never runs in the browser and is not part of the client bundle.
// It walks StorageBox/ (which already exists on disk because Netlify/Vercel
// clone your repo — private repos included — before running the build)
// and writes storagebox-manifest.json, which script.js fetches at runtime.
// No GitHub API calls, no tokens, no CORS, works with private repos.

const fs = require("fs");
const path = require("path");

const STORAGE_PATH = "StorageBox";
const OUT_FILE = "storagebox-manifest.json";

function walk(dir, relBase = "") {
  const node = { folders: {}, files: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue; // skip .gitkeep etc.
    const abs = path.join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      node.folders[entry.name] = walk(abs, rel);
      node.folders[entry.name].name = entry.name;
      node.folders[entry.name].path = rel;
    } else if (entry.isFile()) {
      node.files.push({
        name: entry.name,
        path: rel,
        size: fs.statSync(abs).size
      });
    }
  }
  return node;
}

function main() {
  if (!fs.existsSync(STORAGE_PATH)) {
    console.warn(`[build.js] "${STORAGE_PATH}/" not found — writing an empty manifest.`);
    fs.writeFileSync(OUT_FILE, JSON.stringify({ name: STORAGE_PATH, path: "", folders: {}, files: [] }, null, 2));
    return;
  }
  const tree = walk(STORAGE_PATH);
  tree.name = STORAGE_PATH;
  tree.path = "";
  fs.writeFileSync(OUT_FILE, JSON.stringify(tree, null, 2));
  console.log(`[build.js] Wrote ${OUT_FILE} from "${STORAGE_PATH}/".`);
}

main();

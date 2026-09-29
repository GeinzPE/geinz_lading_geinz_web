// find-configs.js
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

function extractConfigs(content) {
  const regex = /tailwind\.config\s*=\s*(\{[\s\S]*?\n\s*\}\s*;)/g;
  const matches = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function extractCdnPlugins(content) {
  const regex = /cdn\.tailwindcss\.com\?plugins=([a-zA-Z0-9,_-]+)/g;
  const matches = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

const htmlFiles = walk(ROOT);
let found = 0;

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, "utf8");
  const configs = extractConfigs(content);
  const plugins = extractCdnPlugins(content);

  if (configs.length === 0 && plugins.length === 0) continue;

  found++;
  console.log("\n" + "=".repeat(70));
  console.log("ARCHIVO:", path.relative(ROOT, file));
  console.log("=".repeat(70));

  if (plugins.length > 0) {
    console.log("Plugins del CDN detectados:", plugins.join(", "));
  }

  configs.forEach((cfg, i) => {
    console.log(`\n--- config #${i + 1} ---`);
    console.log(cfg);
  });
}

if (found === 0) {
  console.log("No se encontró ningún tailwind.config ni ?plugins= en los HTML escaneados.");
} else {
  console.log(`\n\nTotal de archivos con config encontrados: ${found}`);
}

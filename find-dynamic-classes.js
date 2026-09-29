// find-dynamic-classes.js
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build"]);
const EXTENSIONS = new Set([".js", ".html"]);

const PREFIXES = [
  "bg", "text", "border", "ring", "from", "via", "to", "fill", "stroke",
  "outline", "shadow", "divide", "placeholder", "accent", "caret", "decoration"
];

const pattern = new RegExp(
  `(?:${PREFIXES.join("|")})-[a-zA-Z0-9-]*\\$\\{[^}]*\\}[a-zA-Z0-9-]*`,
  "g"
);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT);
let totalHits = 0;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const matches = line.match(pattern);
    if (matches) {
      if (totalHits === 0) console.log("");
      console.log(`${path.relative(ROOT, file)}:${idx + 1}`);
      matches.forEach((m) => console.log(`   -> ${m}`));
      totalHits += matches.length;
    }
  });
}

console.log("\n" + "=".repeat(70));
if (totalHits === 0) {
  console.log("No se encontraron clases dinámicas obvias con los prefijos revisados.");
} else {
  console.log(`Total de clases dinámicas encontradas: ${totalHits}`);
  console.log("Para cada una, decime todos los valores posibles que puede tomar la variable.");
}

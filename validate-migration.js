// validate-migration.js
// Valida, sin abrir el navegador, que cada página migrada esté bien:
// 1) El <script> del CDN está comentado (no activo)
// 2) Existe un <link> apuntando a un archivo tailwind*.css
// 3) Ese archivo CSS realmente existe en el disco, resolviendo la ruta
//    relativa desde la ubicación del HTML (esto detecta 404 sin abrir nada)
//
// Uso:  node validate-migration.js

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

// Lista de páginas que ya migramos. Agregá acá cada una a medida que la migres.
const MIGRATED = [
  "public/dasboard/trabajadores.html",
  "public/carrito/carrito.html",
  "public/dasboard/historial_venta.html",
  "public/dasboard/legal.html",
  "public/dasboard/mozo.html",
  "public/fidelizacion/fidelizacion_client.html",
  "public/landing/index.html",
  "public/legal/libro_reclamaciones.html",
  "public/legal/politicas_privacidad.html",
  "public/legal/seguimiento_reclamaciones.html",
  "public/legal/terminos_condiciones.html",
  "public/redirect/perfil_negocio.html",
  "public/dasboard/historial_gasto_geinz.html",
];

function check(relPath) {
  const fullPath = path.join(ROOT, relPath.replace(/\//g, path.sep));

  if (!fs.existsSync(fullPath)) {
    return { relPath, status: "FAIL", reason: "El archivo HTML no existe en esa ruta" };
  }

  const content = fs.readFileSync(fullPath, "utf8");

  // 1) CDN debe estar comentado o ausente, nunca activo
  const activeCdn = /(?<!<!--\s*)<script[^>]*src=["']https:\/\/cdn\.tailwindcss\.com["'][^>]*>/;
  if (activeCdn.test(content)) {
    return { relPath, status: "FAIL", reason: "El <script> del CDN sigue activo (no comentado)" };
  }

  // 2) Debe existir un <link> a un css compilado de tailwind
  const linkMatch = content.match(/<link[^>]*href=["']([^"']*tailwind[^"']*\.css)["'][^>]*>/);
  if (!linkMatch) {
    return { relPath, status: "FAIL", reason: "No se encontró <link> a ningún tailwind*.css" };
  }

  const hrefValue = linkMatch[1];

  // 3) Resolver esa ruta relativa desde la carpeta del HTML y confirmar que exista
  const htmlDir = path.dirname(fullPath);
  const resolvedCssPath = path.resolve(htmlDir, hrefValue);

  if (!fs.existsSync(resolvedCssPath)) {
    return {
      relPath,
      status: "FAIL",
      reason: `El <link> apunta a "${hrefValue}" pero ese archivo no existe (sería un 404 en el navegador). Ruta resuelta: ${resolvedCssPath}`,
    };
  }

  return { relPath, status: "OK", reason: `link -> ${hrefValue} (existe)` };
}

let okCount = 0;
let failCount = 0;

console.log("Validando páginas migradas...\n");

for (const rel of MIGRATED) {
  const result = check(rel);
  const icon = result.status === "OK" ? "✅" : "❌";
  console.log(`${icon} ${result.relPath}`);
  console.log(`   ${result.reason}\n`);
  if (result.status === "OK") okCount++; else failCount++;
}

console.log("=".repeat(60));
console.log(`Total: ${okCount} OK, ${failCount} con problemas, de ${MIGRATED.length} revisadas`);
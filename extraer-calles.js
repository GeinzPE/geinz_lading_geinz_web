const fs = require("fs");

// Caja solo de Barranca ciudad (sur, oeste, norte, este)
const bbox = "-10.78,-77.78,-10.72,-77.72";

const query = `
[out:json][timeout:30];
way["highway"]["name"](${bbox});
out center;
`;

const servidores = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function pedirDatos() {
  for (const url of servidores) {
    try {
      console.log("Probando:", url);
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "calles-barranca-script/1.0",
        },
        body: "data=" + encodeURIComponent(query),
      });

      const texto = await res.text();

      if (!res.ok || texto.trim().startsWith("<")) {
        console.log(`  Falló (HTTP ${res.status}), pasando al siguiente...`);
        continue;
      }

      return JSON.parse(texto);
    } catch (err) {
      console.log("  No respondió a tiempo, pasando al siguiente...");
    }
  }
  throw new Error("Ningún servidor respondió. Intenta de nuevo en unos minutos.");
}

async function main() {
  const data = await pedirDatos();

  const unicas = new Map();
  for (const e of data.elements) {
    const nombre = e.tags.name;
    if (!e.center) continue;
    if (!unicas.has(nombre)) {
      unicas.set(nombre, { nombre, lat: e.center.lat, lng: e.center.lon });
    }
  }

  const calles = [...unicas.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre)
  );
  fs.writeFileSync("calles-barranca.json", JSON.stringify(calles, null, 2));
  console.log(`Se guardaron ${calles.length} calles`);
}

main().catch((e) => console.error(e.message));
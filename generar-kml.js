const fs = require("fs");

const calles = JSON.parse(fs.readFileSync("calles-barranca.json", "utf8"));

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const placemarks = calles
  .map(
    (c) => `    <Placemark>
      <name>${esc(c.nombre)}</name>
      <Point><coordinates>${c.lng},${c.lat},0</coordinates></Point>
    </Placemark>`
  )
  .join("\n");

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Calles de Barranca</name>
${placemarks}
  </Document>
</kml>`;

fs.writeFileSync("calles-barranca.kml", kml, "utf8");
console.log(`Listo: ${calles.length} pines en calles-barranca.kml`);
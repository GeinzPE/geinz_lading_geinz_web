/* ════════════════════════════════════════════════════════════════
   exportar_publicaciones.js
   - Exportar estadísticas a Excel (.xlsx) y PDF
     · por publicación (desde el modal)
     · de todas las publicaciones (botón "Exportar" arriba)
   - Panel de "Reactivar" rediseñado
   Las librerías (ExcelJS, jsPDF, autoTable) se cargan SOLO cuando
   el usuario exporta, así no pesan al abrir el dashboard.
   ════════════════════════════════════════════════════════════════ */

const CDN = {
  exceljs: "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable:
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
};

let ctx = { getPromos: () => [], esExpirado: () => false };
const cargados = {};

function cargarScript(src) {
  if (!cargados[src]) {
    cargados[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }
  return cargados[src];
}

/* ───────────── utilidades ───────────── */
const n = (v) => Number(v) || 0;
const inter = (e = {}) =>
  n(e.clics_detalle) + n(e.clics_comprar) + n(e.clics_whatsapp) + n(e.clics_compartir);
const hoyISO = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const ahoraTxt = () =>
  new Date()
    .toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" })
    .replace(/[\u202f\u00a0]/g, " ");
const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 30) || "promo";
const etiqueta = (p) => {
  const t = String(p.informacion?.titulo || p.informacion?.nombre_tienda || p.id || "");
  return t.length > 42 ? t.slice(0, 41) + "..." : t;
};
const ultimosDias = (k) => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
  return Array.from({ length: k }, (_, i) =>
    fmt.format(new Date(Date.now() - (k - 1 - i) * 86400000)),
  );
};

function descargar(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function filaResumen(p) {
  const i = p.informacion || {};
  const d = p.datos_hora_fecha || {};
  const e = p.estadisticas || {};
  const vistas = n(e.vistas);
  const it = inter(e);
  return {
    id: i.id_promocion ?? "",
    tienda: i.nombre_tienda || "—",
    titulo: i.titulo || "Sin título",
    estado: ctx.esExpirado(p) ? "Expirada" : "Activa",
    exclusiva: p.exclusivo ? "Sí" : "No",
    inicio: `${d.fecha_inicio || "?"} ${d.hora_inicio || ""}`.trim(),
    fin: `${d.fecha_fin || "?"} ${d.hora_fin || ""}`.trim(),
    vistas,
    detalle: n(e.clics_detalle),
    comprar: n(e.clics_comprar),
    wa: n(e.clics_whatsapp),
    compartir: n(e.clics_compartir),
    carrito: n(e.clics_carrito),
    pedidos: n(e.pedidos),
    ventas: n(e.ventas_total),
    inter: it,
    ctr: vistas ? it / vistas : 0,
  };
}

function filasSegmentos(p) {
  const e = p.estadisticas || {};
  const nombres = { genero: "Género", edad: "Edad", localidad: "Localidad", acceso: "Acceso" };
  const out = [];
  Object.keys(nombres).forEach((campo) => {
    const v = e.seg_vistas?.[campo] || {};
    const c = e.seg_clics?.[campo] || {};
    [...new Set([...Object.keys(v), ...Object.keys(c)])].forEach((k) =>
      out.push({ seg: nombres[campo], valor: k.replace(/_/g, " "), vistas: n(v[k]), clics: n(c[k]) }),
    );
  });
  return out;
}

/* ═════════════════════════ EXCEL ═════════════════════════ */
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const borde = {
  top: { style: "thin", color: { argb: "FFE4E4E7" } },
  bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
  left: { style: "thin", color: { argb: "FFE4E4E7" } },
  right: { style: "thin", color: { argb: "FFE4E4E7" } },
};

function hoja(wb, nombre, titulo, cols, filas, totales = false) {
  const ws = wb.addWorksheet(nombre, {
    views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
  });
  const nc = cols.length;
  ws.columns = cols.map((c) => ({ width: c.w || 14 }));

  ws.mergeCells(1, 1, 1, nc);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = fill("FF7C3AED");
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, nc);
  const s = ws.getCell(2, 1);
  s.value = `Geinz · Generado el ${ahoraTxt()}`;
  s.font = { size: 10, italic: true, color: { argb: "FF71717A" } };
  s.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;

  const hr = ws.getRow(3);
  hr.height = 26;
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = fill("FF18181B");
    cell.alignment = { horizontal: c.num ? "center" : "left", vertical: "middle", indent: c.num ? 0 : 1 };
    cell.border = borde;
  });

  filas.forEach((f, idx) => {
    const r = ws.addRow(cols.map((c) => f[c.k]));
    r.height = 21;
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { horizontal: c.num ? "center" : "left", vertical: "middle", indent: c.num ? 0 : 1 };
      cell.border = borde;
      if (idx % 2) cell.fill = fill("FFF8F8FA");
      if (c.k === "estado") {
        cell.font = { bold: true, color: { argb: cell.value === "Activa" ? "FF059669" : "FFE11D48" } };
      }
    });
  });

  if (totales && filas.length) {
    const first = 4;
    const last = 3 + filas.length;
    const L = (k) => ws.getColumn(cols.findIndex((c) => c.k === k) + 1).letter;
    const r = ws.addRow(
      cols.map((c, i) => {
        if (i === 0) return "TOTAL";
        if (c.sum) return { formula: `SUM(${L(c.k)}${first}:${L(c.k)}${last})` };
        if (c.k === "ctr") return { formula: `IFERROR(${L("inter")}${last + 1}/${L("vistas")}${last + 1},0)` };
        return null;
      }),
    );
    r.height = 24;
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.fmt) cell.numFmt = c.fmt;
      cell.font = { bold: true, color: { argb: "FF4C1D95" } };
      cell.fill = fill("FFEDE9FE");
      cell.border = borde;
      cell.alignment = { horizontal: c.num ? "center" : "left", vertical: "middle", indent: c.num ? 0 : 1 };
    });
  }

  if (filas.length) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + filas.length, column: nc } };
  }
  return ws;
}

async function exportarExcel(lista, nombreBase) {
  await cargarScript(CDN.exceljs);
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Geinz";
  wb.created = new Date();

  const soles = '"S/" #,##0.00';

  hoja(
    wb,
    "Resumen",
    "Resumen de publicaciones",
    [
      { h: "ID", k: "id", w: 8 },
      { h: "Tienda", k: "tienda", w: 24 },
      { h: "Título", k: "titulo", w: 34 },
      { h: "Estado", k: "estado", w: 12 },
      { h: "Exclusiva", k: "exclusiva", w: 11 },
      { h: "Inicio", k: "inicio", w: 18 },
      { h: "Fin", k: "fin", w: 18 },
      { h: "Vistas", k: "vistas", w: 10, num: 1, sum: 1 },
      { h: "Abrió detalle", k: "detalle", w: 14, num: 1, sum: 1 },
      { h: "Comprar", k: "comprar", w: 11, num: 1, sum: 1 },
      { h: "WhatsApp", k: "wa", w: 11, num: 1, sum: 1 },
      { h: "Compartir", k: "compartir", w: 11, num: 1, sum: 1 },
      { h: "Al carrito", k: "carrito", w: 11, num: 1, sum: 1 },
      { h: "Pedidos", k: "pedidos", w: 10, num: 1, sum: 1 },
      { h: "Ventas", k: "ventas", w: 13, num: 1, sum: 1, fmt: soles },
      { h: "Interacciones", k: "inter", w: 14, num: 1, sum: 1 },
      { h: "% Interacción", k: "ctr", w: 14, num: 1, fmt: "0.0%" },
    ],
    lista.map(filaResumen),
    true,
  );

  // Diario
  const diario = [];
  lista.forEach((p) => {
    const pd = p.estadisticas?.por_dia || {};
    Object.keys(pd)
      .sort()
      .forEach((d) =>
        diario.push({
          pub: etiqueta(p),
          fecha: d,
          vistas: n(pd[d]?.vistas),
          inter: inter(pd[d]),
          comprar: n(pd[d]?.clics_comprar),
          wa: n(pd[d]?.clics_whatsapp),
          compartir: n(pd[d]?.clics_compartir),
        }),
      );
  });
  if (diario.length) {
    hoja(wb, "Actividad diaria", "Actividad por día", [
      { h: "Publicación", k: "pub", w: 40 },
      { h: "Fecha", k: "fecha", w: 14 },
      { h: "Vistas", k: "vistas", w: 11, num: 1 },
      { h: "Interacciones", k: "inter", w: 15, num: 1 },
      { h: "Comprar", k: "comprar", w: 11, num: 1 },
      { h: "WhatsApp", k: "wa", w: 11, num: 1 },
      { h: "Compartir", k: "compartir", w: 11, num: 1 },
    ], diario);
  }

  // Por hora
  const horas = [];
  lista.forEach((p) => {
    const ph = p.estadisticas?.por_hora || {};
    for (let h = 0; h < 24; h++) {
      const v = n(ph[h]?.vistas);
      const it = inter(ph[h]);
      if (v || it) horas.push({ pub: etiqueta(p), hora: `${String(h).padStart(2, "0")}:00`, vistas: v, inter: it });
    }
  });
  if (horas.length) {
    hoja(wb, "Por hora", "Horas con más movimiento", [
      { h: "Publicación", k: "pub", w: 40 },
      { h: "Hora", k: "hora", w: 11, num: 1 },
      { h: "Vistas", k: "vistas", w: 11, num: 1 },
      { h: "Interacciones", k: "inter", w: 15, num: 1 },
    ], horas);
  }

  // Segmentos
  const segs = [];
  lista.forEach((p) => filasSegmentos(p).forEach((r) => segs.push({ pub: etiqueta(p), ...r })));
  if (segs.length) {
    hoja(wb, "Audiencia", "Audiencia por segmento", [
      { h: "Publicación", k: "pub", w: 40 },
      { h: "Segmento", k: "seg", w: 14 },
      { h: "Valor", k: "valor", w: 22 },
      { h: "Vistas", k: "vistas", w: 11, num: 1 },
      { h: "Clics", k: "clics", w: 11, num: 1 },
    ], segs);
  }

  const buf = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nombreBase + ".xlsx",
  );
}

/* ═════════════════════════ PDF ═════════════════════════ */
async function exportarPDF(lista, nombreBase, unica) {
  await cargarScript(CDN.jspdf);
  await cargarScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const MORADO = [124, 58, 237];
  const TXT = [24, 24, 27];
  const GRIS = [113, 113, 122];
  const CLARO = [244, 244, 245];

  const banda = (titulo, sub) => {
    doc.setFillColor(...MORADO);
    doc.rect(0, 0, W, 84, "F");
    doc.setFillColor(168, 85, 247);
    doc.rect(0, 84, W, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(titulo, M, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(sub, M, 58);
    doc.setFontSize(9);
    doc.text("Generado: " + ahoraTxt(), W - M, 40, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("GEINZ", W - M, 62, { align: "right" });
  };

  const seccion = (t, y) => {
    doc.setFillColor(...MORADO);
    doc.roundedRect(M, y - 9, 3, 12, 1.5, 1.5, "F");
    doc.setTextColor(...TXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(t, M + 10, y);
    return y + 16;
  };

  const espacio = (y, alto) => {
    if (y + alto > H - 50) {
      doc.addPage();
      return M;
    }
    return y;
  };

  const tarjetas = (items, y, cols = 3) => {
    const gap = 10;
    const w = (W - 2 * M - gap * (cols - 1)) / cols;
    const h = 52;
    items.forEach((it, i) => {
      const x = M + (i % cols) * (w + gap);
      const yy = y + Math.floor(i / cols) * (h + gap);
      doc.setFillColor(...CLARO);
      doc.roundedRect(x, yy, w, h, 8, 8, "F");
      doc.setFillColor(...(it.color || MORADO));
      doc.roundedRect(x, yy + 12, 3, h - 24, 1.5, 1.5, "F");
      doc.setTextColor(...TXT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text(String(it.v), x + 14, yy + 28);
      doc.setTextColor(...GRIS);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(it.t, x + 14, yy + 42);
    });
    return y + Math.ceil(items.length / cols) * (h + gap) + 4;
  };

  // Recorta el texto SOLO si no cabe en el ancho disponible (mide en puntos reales)
  const ajustar = (texto, ancho) => {
    let t = String(texto);
    if (doc.getTextWidth(t) <= ancho) return t;
    while (t.length > 1 && doc.getTextWidth(t + "...") > ancho) t = t.slice(0, -1);
    return t + "...";
  };

  // Etiqueta arriba (ancho completo) y barra debajo
  const barras = (items, y) => {
    const max = Math.max(1, ...items.map((i) => i.v));
    const bw = W - 2 * M - 40;
    items.forEach((it, i) => {
      const yy = y + i * 34;
      doc.setTextColor(...TXT);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(ajustar(it.t, bw), M, yy + 8);
      doc.setFillColor(...CLARO);
      doc.roundedRect(M, yy + 13, bw, 10, 5, 5, "F");
      if (it.v) {
        doc.setFillColor(...(it.color || MORADO));
        doc.roundedRect(M, yy + 13, Math.max(10, (bw * it.v) / max), 10, 5, 5, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TXT);
      doc.text(String(it.v), W - M, yy + 22, { align: "right" });
    });
    return y + items.length * 34 + 6;
  };

  const columnas = (dias, serieA, serieB, y, alto = 90) => {
    const w = W - 2 * M;
    const gw = w / dias.length;
    const max = Math.max(1, ...serieA, ...serieB);
    // leyenda
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setFillColor(161, 161, 170);
    doc.rect(W - M - 130, y - 20, 8, 8, "F");
    doc.setTextColor(...GRIS);
    doc.text("Vistas", W - M - 118, y - 13);
    doc.setFillColor(...MORADO);
    doc.rect(W - M - 70, y - 20, 8, 8, "F");
    doc.text("Interacciones", W - M - 58, y - 13);

    doc.setDrawColor(228, 228, 231);
    doc.line(M, y + alto, M + w, y + alto);
    dias.forEach((d, i) => {
      const gx = M + i * gw;
      const bw = gw * 0.32;
      const ha = (alto * serieA[i]) / max;
      const hb = (alto * serieB[i]) / max;
      if (ha) {
        doc.setFillColor(161, 161, 170);
        doc.rect(gx + gw * 0.14, y + alto - ha, bw, ha, "F");
      }
      if (hb) {
        doc.setFillColor(...MORADO);
        doc.rect(gx + gw * 0.14 + bw + 1, y + alto - hb, bw, hb, "F");
      }
      doc.setTextColor(...GRIS);
      doc.setFontSize(6.5);
      doc.text(d.slice(5), gx + gw / 2, y + alto + 11, { align: "center" });
    });
    return y + alto + 28;
  };

  const tabla = (head, body, y, extra = {}) => {
    doc.autoTable({
      startY: y,
      head: [head],
      body,
      theme: "striped",
      margin: { left: M, right: M, top: M },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: TXT, lineColor: [228, 228, 231] },
      headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      ...extra,
    });
    return doc.lastAutoTable.finalY + 18;
  };

  const nota = (txt, y) => {
    doc.setTextColor(...GRIS);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(txt, M, y);
    return y + 20;
  };

  const VERDE = [16, 185, 129];
  const AMBAR = [245, 158, 11];
  const CELESTE = [56, 189, 248];
  const ROSA = [244, 63, 94];

  if (unica) {
    const p = lista[0];
    const f = filaResumen(p);
    const e = p.estadisticas || {};
    banda("Reporte de estadísticas", "Publicación individual");

    let y = 116;
    doc.setTextColor(...TXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const tit = doc.splitTextToSize(f.titulo, W - 2 * M);
    doc.text(tit, M, y);
    y += tit.length * 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(`${f.tienda}   |   ${f.estado}${f.exclusiva === "Sí" ? "   |   Exclusiva" : ""}`, M, y);
    y += 14;
    doc.text(`Vigencia: ${f.inicio}  a  ${f.fin}`, M, y);
    y += 24;

    y = tarjetas(
      [
        { t: "VISTAS", v: f.vistas },
        { t: "ABRIÓ DETALLE", v: f.detalle, color: [168, 85, 247] },
        { t: "COMPRAR", v: f.comprar, color: VERDE },
        { t: "WHATSAPP", v: f.wa, color: [34, 197, 94] },
        { t: "COMPARTIR", v: f.compartir, color: CELESTE },
        { t: "AL CARRITO", v: f.carrito, color: AMBAR },
        { t: "PEDIDOS", v: f.pedidos },
        { t: "VENTAS", v: "S/ " + f.ventas.toFixed(2), color: VERDE },
        { t: "% INTERACCIÓN", v: (f.ctr * 100).toFixed(1) + "%", color: [168, 85, 247] },
      ],
      y,
    );

    y = espacio(y, 210);
    y = seccion("Embudo de conversión", y + 6);
    y = barras(
      [
        { t: "Vistas", v: f.vistas, color: [113, 113, 122] },
        { t: "Abrió detalle", v: f.detalle, color: [124, 58, 237] },
        { t: "Clic en comprar", v: f.comprar, color: VERDE },
        { t: "Fue al carrito", v: f.carrito, color: AMBAR },
        { t: "Pedidos", v: f.pedidos, color: [34, 197, 94] },
      ],
      y,
    );

    y = espacio(y, 190);
    y = seccion("Actividad de los últimos 14 días", y + 14);
    const dias = ultimosDias(14);
    y = columnas(
      dias,
      dias.map((d) => n(e.por_dia?.[d]?.vistas)),
      dias.map((d) => inter(e.por_dia?.[d])),
      y + 14,
    );

    y = espacio(y, 120);
    y = seccion("Detalle por día", y + 4);
    y = tabla(
      ["Fecha", "Vistas", "Interacciones", "Comprar", "WhatsApp", "Compartir"],
      dias.map((d) => [
        d,
        n(e.por_dia?.[d]?.vistas),
        inter(e.por_dia?.[d]),
        n(e.por_dia?.[d]?.clics_comprar),
        n(e.por_dia?.[d]?.clics_whatsapp),
        n(e.por_dia?.[d]?.clics_compartir),
      ]),
      y,
    );

    const topHoras = Array.from({ length: 24 }, (_, h) => ({
      h,
      v: n(e.por_hora?.[h]?.vistas),
      i: inter(e.por_hora?.[h]),
    }))
      .filter((x) => x.v || x.i)
      .sort((a, b) => b.v + b.i - (a.v + a.i))
      .slice(0, 8);
    y = espacio(y, 100);
    y = seccion("Horas con más movimiento", y + 4);
    y = topHoras.length
      ? tabla(
          ["Hora", "Vistas", "Interacciones"],
          topHoras.map((x) => [`${String(x.h).padStart(2, "0")}:00`, x.v, x.i]),
          y,
        )
      : nota("Aún no hay datos por hora.", y + 6);

    const segs = filasSegmentos(p);
    y = espacio(y, 100);
    y = seccion("Audiencia", y + 4);
    y = segs.length
      ? tabla(["Segmento", "Valor", "Vistas", "Clics"], segs.map((s) => [s.seg, s.valor, s.vistas, s.clics]), y)
      : nota("Aún no hay datos de audiencia.", y + 6);
  } else {
    banda("Reporte de estadísticas", `${lista.length} publicaciones`);
    const filas = lista.map(filaResumen);
    const sum = (k) => filas.reduce((s, f) => s + f[k], 0);
    let y = 116;

    y = tarjetas(
      [
        { t: "PUBLICACIONES", v: filas.length },
        { t: "ACTIVAS", v: filas.filter((f) => f.estado === "Activa").length, color: VERDE },
        { t: "EXPIRADAS", v: filas.filter((f) => f.estado === "Expirada").length, color: ROSA },
        { t: "VISTAS", v: sum("vistas") },
        { t: "INTERACCIONES", v: sum("inter"), color: [168, 85, 247] },
        { t: "CLICS EN COMPRAR", v: sum("comprar"), color: VERDE },
        { t: "CLICS EN WHATSAPP", v: sum("wa"), color: [34, 197, 94] },
        { t: "PEDIDOS", v: sum("pedidos"), color: AMBAR },
        { t: "VENTAS", v: "S/ " + sum("ventas").toFixed(2), color: VERDE },
      ],
      y,
    );

    const top = [...filas].sort((a, b) => b.vistas - a.vistas).slice(0, 5);
    y = espacio(y, 210);
    y = seccion("Top 5 por vistas", y + 6);
    y = barras(
      top.map((f) => ({ t: f.titulo, v: f.vistas })),
      y,
    );

    const dias = ultimosDias(14);
    const porDia = (fn) =>
      dias.map((d) => lista.reduce((s, p) => s + fn(p.estadisticas?.por_dia?.[d]), 0));
    y = espacio(y, 190);
    y = seccion("Actividad de los últimos 14 días", y + 14);
    y = columnas(dias, porDia((o) => n(o?.vistas)), porDia((o) => inter(o)), y + 14);

    y = espacio(y, 120);
    y = seccion("Detalle por publicación", y + 4);
    tabla(
      ["#", "Publicación", "Estado", "Vistas", "Inter.", "Comprar", "WhatsApp", "Pedidos", "% Inter."],
      filas.map((f, i) => [
        i + 1,
        f.titulo,
        f.estado,
        f.vistas,
        f.inter,
        f.comprar,
        f.wa,
        f.pedidos,
        (f.ctr * 100).toFixed(1) + "%",
      ]),
      y,
      {
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 165 } },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 2) {
            d.cell.styles.fontStyle = "bold";
            d.cell.styles.textColor = d.cell.raw === "Activa" ? [5, 150, 105] : [225, 29, 72];
          }
        },
      },
    );
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 228, 231);
    doc.line(M, H - 34, W - M, H - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text("Geinz  |  Reporte de estadísticas", M, H - 20);
    doc.text(`Página ${i} de ${total}`, W - M, H - 20, { align: "right" });
  }

  doc.save(nombreBase + ".pdf");
}

/* ═════════════════════════ API pública ═════════════════════════ */
async function exportar(lista, formato, unica) {
  const base = unica
    ? `geinz-estadisticas-${slug(lista[0].informacion?.titulo || lista[0].id)}-${hoyISO()}`
    : `geinz-estadisticas-publicaciones-${hoyISO()}`;
  if (formato === "xlsx") return exportarExcel(lista, base);
  return exportarPDF(lista, base, unica);
}

async function correr(btn, fn) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = "1";
  btn.classList.add("is-loading");
  try {
    await fn();
    toast("Archivo descargado");
  } catch (err) {
    console.error(err);
    toast("No se pudo exportar. Revisa tu conexión e intenta de nuevo.", true);
  } finally {
    delete btn.dataset.busy;
    btn.classList.remove("is-loading");
  }
}

function toast(msg, error = false) {
  const t = document.createElement("div");
  t.className = "exp-toast" + (error ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2400);
  setTimeout(() => t.remove(), 2700);
}

/* ── Botón "Exportar" (todas las publicaciones) ── */
export function initExport({ getPromos, esExpirado }) {
  ctx = { getPromos, esExpirado };
  inyectarEstilos();

  const sel = document.getElementById("orden-promos");
  if (!sel || document.getElementById("exp-wrap")) return;

  const filaOrden = sel.parentElement;
  const grupo = document.createElement("div");
  grupo.className = "flex items-center gap-2 ml-auto flex-wrap";
  filaOrden.classList.remove("ml-auto");
  filaOrden.before(grupo);
  grupo.appendChild(filaOrden);

  const wrap = document.createElement("div");
  wrap.id = "exp-wrap";
  wrap.className = "exp-wrap";
  wrap.innerHTML = `
    <button type="button" class="exp-trigger" id="exp-trigger">
      ${ICONO_DESCARGA}<span>Exportar</span>
    </button>
    <div class="exp-menu" id="exp-menu">
      <button type="button" class="exp-item" data-exp-all="xlsx">
        <span class="exp-ico xls">XLS</span>
        <span><b>Excel de todas</b><small>Resumen, actividad diaria, horas y audiencia</small></span>
      </button>
      <button type="button" class="exp-item" data-exp-all="pdf">
        <span class="exp-ico pdf">PDF</span>
        <span><b>PDF de todas</b><small>Reporte con totales, gráficos y ranking</small></span>
      </button>
    </div>`;
  grupo.appendChild(wrap);

  const menu = wrap.querySelector("#exp-menu");
  wrap.querySelector("#exp-trigger").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", () => menu.classList.remove("open"));

  wrap.querySelectorAll("[data-exp-all]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const lista = ctx.getPromos();
      menu.classList.remove("open");
      if (!lista.length) return toast("Aún no tienes publicaciones para exportar", true);
      correr(b, () => exportar(lista, b.dataset.expAll, false));
    }),
  );
}

/* ── Botones flotantes dentro del modal (una publicación) ── */
export function botonesExportDetalleHtml() {
  return `
    <div class="exp-float">
      <button type="button" class="exp-chip" data-exp-one="pdf">${ICONO_DESCARGA}PDF</button>
      <button type="button" class="exp-chip" data-exp-one="xlsx">${ICONO_DESCARGA}Excel</button>
    </div>`;
}

export function enlazarExportDetalle(promo) {
  document.querySelectorAll("[data-exp-one]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      correr(b, () => exportar([promo], b.dataset.expOne, true));
    }),
  );
}

/* ── Panel de reactivar rediseñado (mismos ids que antes) ── */
export function panelReactivarHtml(duracionTexto) {
  return `
    <div id="panel-reactivar" class="react-panel">
      <div class="react-head">
        <div class="react-badge">⏱</div>
        <div>
          <p class="react-title">Esta promoción expiró</p>
          <p class="react-sub">Reactívala para que vuelva a mostrarse a tus clientes.</p>
        </div>
      </div>

      ${
        duracionTexto
          ? `<button id="btn-react-igual" type="button" class="react-btn-primary">
               ${ICONO_REFRESH}<span>Reactivar con el mismo plazo</span><em>${duracionTexto}</em>
             </button>`
          : ""
      }

      <div class="react-sep"><span>o elige otro plazo</span></div>

      <div class="react-row">
        <input id="react-cant" type="number" min="1" value="1" class="react-field react-num">
        <select id="react-unidad" class="react-field react-sel">
          <option value="horas">Horas</option>
          <option value="dias" selected>Días</option>
        </select>
        <button id="btn-react-custom" type="button" class="react-btn-secondary">Reactivar</button>
      </div>
      <p id="react-msg" class="react-msg"></p>
    </div>`;
}

/* ── Iconos ── */
const ICONO_DESCARGA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>`;
const ICONO_REFRESH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;

/* ── Estilos (se inyectan una sola vez) ── */
function inyectarEstilos() {
  if (document.getElementById("exp-styles")) return;
  const st = document.createElement("style");
  st.id = "exp-styles";
  st.textContent = `
    /* Botón y menú Exportar */
    .exp-wrap{position:relative}
    .exp-trigger{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 15px;border:none;border-radius:12px;
      background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;font:700 12px 'Plus Jakarta Sans',sans-serif;cursor:pointer;
      box-shadow:0 8px 22px -10px rgba(124,58,237,.9);transition:transform .18s,filter .18s}
    .exp-trigger:hover{transform:translateY(-1px);filter:brightness(1.1)}
    .exp-menu{position:absolute;right:0;top:calc(100% + 8px);width:272px;padding:6px;border-radius:16px;background:#0e0e14;
      border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 50px -12px rgba(0,0,0,.9);z-index:60;
      opacity:0;transform:translateY(-6px) scale(.98);pointer-events:none;transition:opacity .16s,transform .16s}
    .exp-menu.open{opacity:1;transform:none;pointer-events:auto}
    .exp-item{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:none;background:transparent;
      border-radius:12px;text-align:left;cursor:pointer;color:#e4e4e7;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s}
    .exp-item:hover{background:rgba(255,255,255,.06)}
    .exp-item b{display:block;font-size:12.5px;font-weight:700;color:#fff}
    .exp-item small{display:block;font-size:10.5px;color:#8b8b95;margin-top:2px;line-height:1.3}
    .exp-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;letter-spacing:.3px;flex-shrink:0}
    .exp-ico.pdf{background:rgba(244,63,94,.15);color:#fda4af}
    .exp-ico.xls{background:rgba(34,197,94,.15);color:#86efac}

    /* Chips flotantes en el modal */
    .exp-float{position:absolute;left:12px;bottom:12px;display:flex;gap:6px;z-index:3}
    .exp-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:99px;cursor:pointer;
      background:rgba(5,5,8,.72);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);color:#fff;
      font:700 11px 'Plus Jakarta Sans',sans-serif;transition:background .15s,border-color .15s}
    .exp-chip:hover{background:rgba(124,58,237,.85);border-color:rgba(196,181,253,.6)}
    .is-loading{opacity:.55;pointer-events:none}

    /* Toast */
    .exp-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:10001;
      background:#fff;color:#111;font:600 13px 'Plus Jakarta Sans',sans-serif;padding:12px 18px;border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.35);animation:expIn .25s ease forwards}
    .exp-toast.error{background:#fee2e2;color:#991b1b}
    .exp-toast.out{animation:expOut .25s ease forwards}
    @keyframes expIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
    @keyframes expOut{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,14px)}}

    /* Panel reactivar */
    .react-panel{padding:20px;border-bottom:1px solid rgba(39,39,42,.8);display:flex;flex-direction:column;gap:16px;
      background:linear-gradient(180deg,rgba(244,63,94,.09),rgba(244,63,94,0) 85%)}
    .react-head{display:flex;align-items:center;gap:12px}
    .react-badge{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:17px;
      background:rgba(244,63,94,.14);border:1px solid rgba(244,63,94,.28);flex-shrink:0}
    .react-title{margin:0;font-size:14px;font-weight:800;color:#fff;line-height:1.2}
    .react-sub{margin:2px 0 0;font-size:11.5px;color:#a1a1aa;line-height:1.35}
    .react-btn-primary{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;border:none;border-radius:14px;
      background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;font:700 13px 'Plus Jakarta Sans',sans-serif;cursor:pointer;
      box-shadow:0 12px 28px -10px rgba(124,58,237,.8);transition:transform .18s,filter .18s}
    .react-btn-primary em{font-style:normal;font-weight:600;font-size:11.5px;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.18)}
    .react-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .react-btn-primary:active{transform:translateY(0)}
    .react-sep{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:600;color:#71717a}
    .react-sep::before,.react-sep::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.08)}
    .react-row{display:grid;grid-template-columns:76px 1fr auto;gap:8px}
    .react-field{height:42px;box-sizing:border-box;border-radius:12px;background:#14141b;border:1px solid rgba(255,255,255,.1);
      color:#e4e4e7;font:600 13px 'Plus Jakarta Sans',sans-serif;padding:0 12px;outline:none;transition:border-color .15s}
    .react-field:focus{border-color:rgba(168,85,247,.7)}
    .react-num{text-align:center;padding:0 6px}
    .react-sel{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:34px;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 12px center}
    .react-btn-secondary{height:42px;padding:0 20px;border-radius:12px;cursor:pointer;
      background:rgba(168,85,247,.14);border:1px solid rgba(168,85,247,.4);color:#e9d5ff;
      font:700 13px 'Plus Jakarta Sans',sans-serif;transition:background .15s,color .15s}
    .react-btn-secondary:hover{background:#a855f7;color:#fff}
    .react-msg{margin:0;min-height:14px;font-size:11px;color:#a1a1aa}
  `;
  document.head.appendChild(st);
}
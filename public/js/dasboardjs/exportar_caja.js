/* ═══════════════════════════════════════════════════════════════════
   EXPORTAR CAJA Y GASTOS  (CSV · Excel · PDF)
   Mismas librerías y mismo método que Historial de ventas:
   se descargan solo la primera vez que se exporta.
   Ubicación: js/dasboardjs/exportar_caja.js
   ═══════════════════════════════════════════════════════════════════ */
import { METODOS_INFO } from "./cuadre.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const AUTOTABLE_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";

const _cargados = {};
function cargarScript(src) {
  if (_cargados[src]) return _cargados[src];
  _cargados[src] = new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => {
      delete _cargados[src];
      fail(new Error("No se pudo cargar " + src));
    };
    document.head.appendChild(s);
  });
  return _cargados[src];
}
async function libExcel() {
  if (!window.XLSX) await cargarScript(XLSX_URL);
}
async function libPDF() {
  if (!window.jspdf) await cargarScript(JSPDF_URL);
  if (!(window.jspdf && window.jspdf.jsPDF.API.autoTable)) await cargarScript(AUTOTABLE_URL);
}

const f2 = (n) => (Number(n) || 0).toFixed(2);
const nombreMetodo = (k) => (METODOS_INFO[k] || ["", k])[1];

/* ctx = { tienda, periodo, archivo, vista, ventas, gastosRes, cuadre, inicio,
           gastos:[{fecha,hora,nombre,tipo,quien,turno,monto,por}],
           turnos:[{fecha,turno,horario,esperado,contado,diferencia,entregado,por,nota}],
           dias:[{dia,vendiste,gasto,quedo}] } */

function filasResumen(c) {
  const f = [
    ["Período", c.periodo],
    ["", ""],
    ["VENTAS (pedidos entregados)", ""],
    ...c.ventas.porMetodo.map((m) => [`   ${nombreMetodo(m.clave)} · ${m.cant} pedido(s) (S/)`, f2(m.monto)]),
    ["Total vendido (S/)", f2(c.ventas.total)],
    ["", ""],
    ["GASTOS Y RETIROS", ""],
    ["Gastó el negocio, sale de la caja (S/)", f2(c.gastosRes.negocio)],
    ["Pagó el dueño con su plata, no baja la caja (S/)", f2(c.gastosRes.bolsillo)],
    ["Retiros del dueño (S/)", f2(c.gastosRes.retiros)],
    ["", ""],
    ["TE QUEDÓ (ventas − gastos del negocio) (S/)", f2(c.cuadre.queda)],
    ["", ""],
    ["EFECTIVO", ""],
  ];
  if (c.inicio) f.push(["Empezó la caja con (S/)", f2(c.inicio)]);
  f.push(
    ["+ Ventas en efectivo (S/)", f2(c.ventas.efectivo)],
    ["− Gastos pagados con la caja (S/)", f2(c.gastosRes.negocio)],
    ["− Retiros (S/)", f2(c.gastosRes.retiros)],
    ["= Efectivo del período (S/)", f2(c.cuadre.efectivoNeto)],
    ["Yape, Plin y tarjeta (no están en el cajón) (S/)", f2(c.ventas.otros)],
  );
  return f;
}

const COLS_GASTO = ["Fecha", "Hora", "¿Qué fue?", "Tipo", "Quién pagó", "Turno", "Monto (S/)", "Anotado por"];
const filaGasto = (g) => [g.fecha, g.hora, g.nombre, g.tipo, g.quien, g.turno, f2(g.monto), g.por];
const COLS_TURNO = ["Día", "Turno", "Horario", "Debía haber (S/)", "Contaron (S/)", "Diferencia (S/)", "Entregado (S/)", "Cerró", "Nota"];
const filaTurno = (t) => [t.fecha, t.turno, t.horario, f2(t.esperado), f2(t.contado), f2(t.diferencia), f2(t.entregado), t.por, t.nota];
const COLS_DIA = ["Día", "Vendiste (S/)", "Gastó el negocio (S/)", "Te quedó (S/)"];
const filaDia = (d) => [d.dia, f2(d.vendiste), f2(d.gasto), f2(d.quedo)];

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(c) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linea = (r) => r.map(esc).join(",");
  const out = [linea([`${c.tienda ? c.tienda + " · " : ""}Caja y gastos`]), ...filasResumen(c).map(linea)];
  if (c.vista === "mes" && c.dias.length) out.push("", linea(["CUADRE POR DÍA"]), linea(COLS_DIA), ...c.dias.map((d) => linea(filaDia(d))));
  if (c.turnos.length) out.push("", linea(["CIERRES DE CAJA"]), linea(COLS_TURNO), ...c.turnos.map((t) => linea(filaTurno(t))));
  out.push("", linea(["GASTOS Y MOVIMIENTOS"]), linea(COLS_GASTO), ...c.gastos.map((g) => linea(filaGasto(g))));
  descargar(new Blob(["\uFEFF" + out.join("\n")], { type: "text/csv;charset=utf-8;" }), `caja_${c.archivo}.csv`);
}

async function excel(c) {
  await libExcel();
  const X = window.XLSX;
  const wb = X.utils.book_new();
  const ws = X.utils.aoa_to_sheet([["Concepto", "Valor"], ...filasResumen(c)]);
  ws["!cols"] = [{ wch: 52 }, { wch: 22 }];
  X.utils.book_append_sheet(wb, ws, "Resumen");
  if (c.vista === "mes" && c.dias.length) {
    const w = X.utils.aoa_to_sheet([COLS_DIA, ...c.dias.map(filaDia)]);
    w["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, w, "Por día");
  }
  if (c.turnos.length) {
    const w = X.utils.aoa_to_sheet([COLS_TURNO, ...c.turnos.map(filaTurno)]);
    w["!cols"] = COLS_TURNO.map(() => ({ wch: 16 }));
    X.utils.book_append_sheet(wb, w, "Cierres de caja");
  }
  const wg = X.utils.aoa_to_sheet([COLS_GASTO, ...c.gastos.map(filaGasto)]);
  wg["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 32 }, { wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  X.utils.book_append_sheet(wb, wg, "Gastos");
  X.writeFile(wb, `caja_${c.archivo}.xlsx`);
}

async function pdf(c) {
  await libPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(`${c.tienda ? c.tienda + " · " : ""}Caja y gastos`, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Período: ${c.periodo}`, 40, 58);

  const estilo = {
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: [30, 30, 30], overflow: "linebreak" },
    headStyles: { fillColor: [136, 85, 255], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 242, 255] },
    margin: { left: 40, right: 40 },
  };
  const resumen = filasResumen(c).filter((r) => r[0] !== "Período" && (r[0] || r[1]));
  doc.autoTable({
    ...estilo,
    head: [["Resumen", "S/"]],
    body: resumen,
    startY: 72,
    columnStyles: { 1: { halign: "right", cellWidth: 90 } },
  });
  if (c.vista === "mes" && c.dias.length)
    doc.autoTable({ ...estilo, head: [COLS_DIA], body: c.dias.map(filaDia), startY: doc.lastAutoTable.finalY + 18, columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
  if (c.turnos.length)
    doc.autoTable({ ...estilo, head: [COLS_TURNO], body: c.turnos.map(filaTurno), startY: doc.lastAutoTable.finalY + 18, styles: { ...estilo.styles, fontSize: 7 } });
  doc.autoTable({ ...estilo, head: [COLS_GASTO], body: c.gastos.map(filaGasto), startY: doc.lastAutoTable.finalY + 18, styles: { ...estilo.styles, fontSize: 7.5 }, columnStyles: { 6: { halign: "right" } } });
  doc.save(`caja_${c.archivo}.pdf`);
}

export async function exportarCaja(formato, ctx) {
  if (formato === "csv") return csv(ctx);
  if (formato === "excel") return excel(ctx);
  if (formato === "pdf") return pdf(ctx);
}
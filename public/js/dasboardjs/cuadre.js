/* ═══════════════════════════════════════════════════════════════════
   CUADRE COMPARTIDO
   Lo usan "Historial de ventas" y "Caja y gastos".
   Una sola forma de clasificar el método de pago y de sumar gastos,
   así las dos pantallas SIEMPRE muestran las mismas cifras.
   Ubicación: js/dasboardjs/cuadre.js
   ═══════════════════════════════════════════════════════════════════ */

export const num = (v) => Math.max(0, parseFloat(v) || 0);
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n) => "S/ " + (isFinite(n) ? n : 0).toFixed(2);
export const suma = (arr) => arr.reduce((s, g) => s + num(g.monto), 0);
export const esReal = (g) => g.tipo === "compra_insumo" || g.tipo === "gasto_general";

export const METODOS_INFO = {
  efectivo: ["💵", "Efectivo"],
  yape: ["📱", "Yape"],
  plin: ["📱", "Plin"],
  yape_plin: ["📱", "Yape / Plin"],
  visa_mastercard: ["💳", "Visa / Mastercard"],
  agora: ["🏦", "Agora"],
  otros: ["❔", "Sin especificar"],
};

export function metodoPagoDe(p, vacio = "Sin especificar") {
  if (p.pago_metodo?.label) return p.pago_metodo.label;
  const pago = p.pago;
  if (typeof pago === "string" && pago !== "pendiente") return pago;
  if (pago && typeof pago === "object") {
    const m = pago.metodo || pago.método || pago.tipo || pago.label;
    if (m) return m;
  }
  return p.metodo_pago || p.metodoPago || vacio;
}

export function claveMetodo(p) {
  if (p.pago_metodo?.clave) return p.pago_metodo.clave;
  const t = String(metodoPagoDe(p)).toLowerCase();
  if (t.includes("yape") && t.includes("plin")) return "yape_plin";
  if (t.includes("yape")) return "yape";
  if (t.includes("plin")) return "plin";
  if (t.includes("efectivo")) return "efectivo";
  if (/visa|master|tarjeta/.test(t)) return "visa_mastercard";
  if (t.includes("agora")) return "agora";
  return "otros";
}

/* list = pedidos ENTREGADOS. getClave por defecto lee p.clave */
export function cuadreVentas(list, getClave = (p) => p.clave) {
  const m = {};
  let total = 0;
  for (const p of list) {
    const k = getClave(p);
    const t = Number(p.total) || 0;
    (m[k] ??= { clave: k, cant: 0, monto: 0 });
    m[k].cant++;
    m[k].monto += t;
    total += t;
  }
  const porMetodo = Object.values(m)
    .map((x) => ({ ...x, monto: r2(x.monto) }))
    .sort((a, b) => b.monto - a.monto);
  const efectivo = r2(m.efectivo?.monto || 0);
  return { total: r2(total), cant: list.length, efectivo, otros: r2(total - efectivo), porMetodo };
}

/* gastos = documentos de gastos_insumos que ya están dentro del período */
export function cuadreGastos(gastos) {
  const reales = gastos.filter(esReal);
  return {
    negocio: r2(suma(reales.filter((g) => g.descuenta_caja))), // sale de la caja
    bolsillo: r2(suma(reales.filter((g) => g.es_inversion))), // lo pagó el dueño con su plata
    retiros: r2(suma(gastos.filter((g) => g.tipo === "retiro"))), // el dueño sacó plata
    saldoInicial: r2(suma(gastos.filter((g) => g.tipo === "saldo_inicial"))),
    operativos: r2(suma(gastos.filter((g) => g.tipo === "gasto_general"))),
  };
}

/* Te quedó = ventas − gastos del negocio.  Efectivo = inicio + ventas efectivo − gastos − retiros */
export function cuadreCaja(v, g, inicio = 0) {
  return {
    queda: r2(v.total - g.negocio),
    efectivoNeto: r2(inicio + v.efectivo - g.negocio - g.retiros),
  };
}
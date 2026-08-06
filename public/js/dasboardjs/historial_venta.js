import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { tiendaSubCol } from "../rutas/rutas.js";

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

/* ---------------- Adaptación de textos según categoría de negocio ---------------- */
function normalizarCategoria(cat) {
  return (cat || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

let categoriaTienda = sessionStorage.getItem("categoriaTienda") || null;
let nombreTienda = sessionStorage.getItem("nombreTienda") || null;
let esRestaurante = normalizarCategoria(categoriaTienda) === "comida y restaurantes";

const TEXTOS_RESTAURANTE = {
  itemsVendidosLabel: "Platos vendidos",
  topProductoLabel: "🏆 Plato más vendido",
  gananciaProductoLabel: "Ganancia por plato",
  emptyStateIcon: "🍽️",
};

const TEXTOS_GENERAL = {
  itemsVendidosLabel: "Productos vendidos",
  topProductoLabel: "🏆 Producto más vendido",
  gananciaProductoLabel: "Ganancia por producto",
  emptyStateIcon: "📦",
};

function textosActuales() {
  return esRestaurante ? TEXTOS_RESTAURANTE : TEXTOS_GENERAL;
}

function aplicarTextosPorCategoria() {
  const t = textosActuales();
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("labelItemsVendidos", t.itemsVendidosLabel);
  setText("labelTopProducto", t.topProductoLabel);
  setText("labelGananciaProducto", t.gananciaProductoLabel);
  setText("emptyStateIcon", t.emptyStateIcon);
}
aplicarTextosPorCategoria();

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
    if (e.data.categoriaTienda) {
      categoriaTienda = e.data.categoriaTienda;
      esRestaurante = normalizarCategoria(categoriaTienda) === "comida y restaurantes";
    }
    if (e.data.nombreTienda) {
      nombreTienda = e.data.nombreTienda;
    }
    aplicarTextosPorCategoria();
    listenPedidos();
  });
}

let pedidosRaw = [];
let currentRange = "hoy";
let currentOrder = null;

function setConnStatus(text, ok) {
  const el = document.getElementById("connStatus");
  const dot = document.getElementById("connDot");
  if (el && el.lastChild) {
    el.lastChild.textContent = " " + text;
  }
  if (dot) {
    dot.className =
      "w-2 h-2 rounded-full " +
      (ok === true
        ? "bg-primary shadow-[0_0_8px_#8855FF]"
        : ok === false
          ? "bg-red-500"
          : "bg-inkfaint animate-pulse");
  }
}

let unsubscribePedidos = null;

function ocultarLoader() {
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    loadingScreen.style.transition = "opacity 0.3s ease";
    loadingScreen.style.opacity = "0";
    setTimeout(() => loadingScreen.classList.add("hidden"), 300);
  }
}

function mostrarCargaRango() {
  const bar = document.getElementById("rangeLoadingBar");
  if (bar) bar.classList.remove("hidden");
  const metricsWrap = document.getElementById("metricsSections");
  if (metricsWrap) metricsWrap.classList.add("opacity-40", "pointer-events-none");
  mostrarSkeletonLista();
}

function ocultarCargaRango() {
  const bar = document.getElementById("rangeLoadingBar");
  if (bar) bar.classList.add("hidden");
  const metricsWrap = document.getElementById("metricsSections");
  if (metricsWrap) metricsWrap.classList.remove("opacity-40", "pointer-events-none");
}

function mostrarSkeletonLista() {
  const tbody = document.getElementById("tableBody");
  const cards = document.getElementById("cardsBody");
  const empty = document.getElementById("emptyState");
  const resultCount = document.getElementById("resultCount");
  if (empty) empty.classList.add("hidden");
  if (resultCount) resultCount.textContent = "";

  if (tbody) {
    tbody.innerHTML = Array.from({ length: 6 })
      .map(
        () => `
      <tr>
        <td class="px-4 py-3" colspan="7"><div class="skeleton-element h-4 w-full rounded"></div></td>
      </tr>`,
      )
      .join("");
  }
  if (cards) {
    cards.innerHTML = Array.from({ length: 4 })
      .map(
        () => `
      <div class="bg-panel border border-line rounded-2xl p-4">
        <div class="flex justify-between items-start mb-2">
          <div class="space-y-1.5 w-2/3">
            <div class="skeleton-element h-3 w-20 rounded"></div>
            <div class="skeleton-element h-4 w-32 rounded"></div>
          </div>
          <div class="skeleton-element h-5 w-16 rounded-full"></div>
        </div>
        <div class="flex justify-between items-center">
          <div class="skeleton-element h-3 w-16 rounded"></div>
          <div class="skeleton-element h-4 w-14 rounded"></div>
        </div>
      </div>`,
      )
      .join("");
  }
}

// Trae SOLO los pedidos dentro del rango de fecha seleccionado — nunca 2000 al azar
function listenPedidos() {
  if (unsubscribePedidos) {
    unsubscribePedidos();
    unsubscribePedidos = null;
  }
  mostrarCargaRango();

  const [from, to] = getRangeBounds();
  const col = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const q = query(
    col,
    where("timestamp", ">=", Timestamp.fromDate(from)),
    where("timestamp", "<=", Timestamp.fromDate(to)),
    orderBy("timestamp", "desc"),
    limit(2000),
  );

  // "Hoy" sí se queda en vivo (es la vista operativa del día).
  // Cualquier otro rango es histórico: una sola lectura, sin listener permanente.
  if (currentRange === "hoy") {
    unsubscribePedidos = onSnapshot(
      q,
      (snap) => {
        pedidosRaw = snap.docs.map((d) => normalizarPedido(d.id, d.data()));
        setConnStatus(`conectado · ${pedidosRaw.length} pedidos hoy`, true);
        renderAll();
        ocultarLoader();
        ocultarCargaRango();
      },
      (err) => {
        console.error(err);
        setConnStatus("⚠️ Error de conexión / permisos en Firestore", false);
        ocultarCargaRango();
      },
    );
  } else {
    setConnStatus("cargando…", null);
    getDocs(q)
      .then((snap) => {
        pedidosRaw = snap.docs.map((d) => normalizarPedido(d.id, d.data()));
        setConnStatus(`conectado · ${pedidosRaw.length} pedidos en el rango`, true);
        renderAll();
        ocultarLoader();
        ocultarCargaRango();
      })
      .catch((err) => {
        console.error(err);
        setConnStatus("⚠️ Error de conexión / permisos en Firestore", false);
        ocultarLoader();
        ocultarCargaRango();
      });
  }
}

// Los pedidos de mesa se guardan como { estado: "ocupado", pago: "pendiente", pedido: {...datos reales...} }
// mientras que los normales guardan los datos directamente en la raíz.
// Esta función los deja a todos con la misma forma para que el resto del código no tenga que distinguir.
function normalizarPedido(id, raw) {
  if (raw && raw.pedido) {
    return { id, ...raw.pedido, esMesa: true };
  }
  return { id, ...raw, esMesa: false };
}
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtMoney(n) {
  return (
    "S/ " +
    (Number(n) || 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtFechaHora(p) {
  const d = toDate(p.timestamp) || toDate(p.actualizado);
  if (!d) return `${p.fecha || ""} · ${p.hora || ""}`;
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const hora = d.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay(d, hoy)) return `Hoy, ${hora}`;
  if (sameDay(d, ayer)) return `Ayer, ${hora}`;
  return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}, ${hora}`;
}

function estadoBadge(estado) {
  const e = (estado || "").toLowerCase();
  const map = {
    pendiente: { key: "pendiente", label: "Pendiente" },
    "en proceso": { key: "en_proceso", label: "En proceso" },
    entregado: { key: "entregado", label: "Completado" },
    rechazado: { key: "rechazado", label: "Rechazado" },
  };
  const info = map[e] || { key: "pendiente", label: estado || "—" };
  return `<span data-est="${info.key}" class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">${info.label}</span>`;
}

function esBilleteraDigital(metodo) {
  const m = (metodo || "").toLowerCase();
  return m.includes("yape") || m.includes("plin");
}
function codigoPedido(p) {
  return "#" + (p.id || "").slice(-6).toUpperCase();
}
function telefonoCliente(p) {
  return (
    (p.cliente &&
      (p.cliente.telefono || p.cliente.phone || p.cliente.whatsapp || p.cliente.celular)) ||
    ""
  );
}
function waLink(tel, msg) {
  const clean = (tel || "").replace(/\D/g, "");
  const pref = clean.startsWith("51") ? clean : "51" + clean;
  return `https://wa.me/${pref}?text=${encodeURIComponent(msg || "")}`;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function getRangeBounds() {
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (currentRange === "hoy") return [startOf(now), endOf(now)];
  if (currentRange === "ayer") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [startOf(y), endOf(y)];
  }
  if (currentRange === "semana") {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    return [startOf(monday), endOf(now)];
  }
  if (currentRange === "mes") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return [startOf(first), endOf(now)];
  }
  if (currentRange === "custom") {
    const from = document.getElementById("customFrom").value;
    const to = document.getElementById("customTo").value;
    const f = from ? startOf(new Date(from + "T00:00:00")) : new Date(0);
    const t = to ? endOf(new Date(to + "T00:00:00")) : endOf(now);
    return [f, t];
  }
  return [new Date(0), endOf(now)];
}

function getFilteredOrders() {
  const [from, to] = getRangeBounds();
  const estadoF = document.getElementById("filterEstado").value;
  const q = document.getElementById("searchBox").value.trim().toLowerCase();

  return pedidosRaw
    .filter((p) => {
      const d = toDate(p.timestamp);
      if (!d || d < from || d > to) return false;

      if (estadoF !== "todos" && (p.estado || "").toLowerCase() !== estadoF) return false;
      if (q) {
        const nombre = ((p.cliente && p.cliente.nombre) || "").toLowerCase();
        const tel = telefonoCliente(p).toLowerCase();
        const cod = codigoPedido(p).toLowerCase();
        if (!nombre.includes(q) && !tel.includes(q) && !cod.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = toDate(a.timestamp) || 0,
        db_ = toDate(b.timestamp) || 0;
      return db_ - da;
    });
}
function renderMetrics(list) {
  const entregados = list.filter((p) => (p.estado || "").toLowerCase() === "entregado");
  const otros = list.length - entregados.length;

  const total = entregados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const count = entregados.length;
  const ticket = count ? total / count : 0;
  const items = entregados.reduce(
    (s, p) =>
      s +
      (Number(p.total_items) ||
        (p.productos || []).reduce((x, pr) => x + (Number(pr.cantidad) || 0), 0)),
    0,
  );

  document.getElementById("kpiTotal").textContent = fmtMoney(total);
  document.getElementById("kpiCount").textContent = count;
  document.getElementById("kpiOtros").textContent = otros;
  document.getElementById("kpiTicket").textContent = fmtMoney(ticket);
  document.getElementById("kpiItems").textContent = items;

  const digitalCount = entregados.filter((p) => esBilleteraDigital(p.pago && p.pago.metodo)).length;
  const efectivoCount = count - digitalCount;
  renderBarPair(
    "barPago",
    { label: "📱 Yape / Plin", value: digitalCount, color: "bg-primary" },
    { label: "💵 Efectivo / Tarjeta", value: efectivoCount, color: "bg-primary/40" },
    count,
  );

  const [from, to] = getRangeBounds();
  renderInteligente(entregados, from, to);
  renderRentabilidad(entregados);
}

function renderBarPair(containerId, a, b, total) {
  const el = document.getElementById(containerId);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  el.innerHTML = [a, b]
    .map(
      (item) => `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-white">${item.label}</span>
        <span class="font-mono text-inkfaint">${item.value} · ${pct(item.value)}%</span>
      </div>
      <div class="h-2 rounded-full bg-panel2 overflow-hidden border border-line">
        <div class="${item.color} h-full rounded-full transition-all" style="width:${pct(item.value)}%"></div>
      </div>
    </div>
  `,
    )
    .join("");
}

function getPreviousRangeBounds(from, to) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return [prevFrom, prevTo];
}

function computeTopProducto(list) {
  const counts = {};
  list.forEach((p) => {
    (p.productos || []).forEach((pr) => {
      const nombre = pr.nombre || "Sin nombre";
      counts[nombre] = (counts[nombre] || 0) + (Number(pr.cantidad) || 0);
    });
  });
  let top = null;
  Object.entries(counts).forEach(([nombre, cant]) => {
    if (!top || cant > top.cant) top = { nombre, cant };
  });
  return top;
}

function computeHoraPico(list) {
  const franjas = Array(24).fill(0);
  list.forEach((p) => {
    const d = toDate(p.timestamp) || toDate(p.actualizado);
    if (d) franjas[d.getHours()]++;
  });
  let maxIdx = 0;
  franjas.forEach((v, i) => {
    if (v > franjas[maxIdx]) maxIdx = i;
  });
  return { franjas, horaTop: maxIdx, cantTop: franjas[maxIdx] };
}

function computeComparativaTotal(from, to) {
  const [prevFrom, prevTo] = getPreviousRangeBounds(from, to);
  const prevEntregados = pedidosRaw.filter((p) => {
    const d = toDate(p.timestamp) || toDate(p.actualizado);
    return d && d >= prevFrom && d <= prevTo && (p.estado || "").toLowerCase() === "entregado";
  });
  const prevTotal = prevEntregados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  return { prevTotal, prevCount: prevEntregados.length };
}

function renderInteligente(entregados, from, to) {
  const top = computeTopProducto(entregados);
  document.getElementById("topProductoNombre").textContent = top ? top.nombre : "Sin datos";
  document.getElementById("topProductoCant").textContent = top ? top.cant : 0;

  const { franjas, horaTop, cantTop } = computeHoraPico(entregados);
  const labelHora = (h) => `${String(h).padStart(2, "0")}:00 – ${String((h + 1) % 24).padStart(2, "0")}:00`;
  document.getElementById("horaPicoLabel").textContent = cantTop > 0 ? labelHora(horaTop) : "Sin datos";
  document.getElementById("horaPicoCant").textContent = cantTop;

  const maxFranja = Math.max(...franjas, 1);
  const horaChart = document.getElementById("horaChart");
  if (horaChart) {
    horaChart.innerHTML = franjas
      .map((v, h) => {
        const alturaPct = Math.round((v / maxFranja) * 100);
        const activo = h === horaTop && v > 0;
        return `<div class="flex-1 flex flex-col items-center justify-end h-full" title="${String(h).padStart(2, "0")}:00 · ${v} pedidos">
        <div class="w-full rounded-t ${activo ? "bg-primary" : "bg-primary/25"}" style="height:${Math.max(alturaPct, 4)}%"></div>
      </div>`;
      })
      .join("");
  }

  const totalActual = entregados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const { prevTotal } = computeComparativaTotal(from, to);
  const comparativaLabel = document.getElementById("comparativaLabel");
  const comparativaSub = document.getElementById("comparativaSub");
  if (prevTotal > 0) {
    const cambio = ((totalActual - prevTotal) / prevTotal) * 100;
    const signo = cambio >= 0 ? "+" : "";
    comparativaLabel.textContent = `${signo}${cambio.toFixed(1)}%`;
    comparativaLabel.className = `font-display font-extrabold text-lg ${cambio >= 0 ? "text-primary" : "text-red-400"}`;
    comparativaSub.textContent = `${fmtMoney(totalActual)} vs ${fmtMoney(prevTotal)} anterior`;
  } else {
    comparativaLabel.textContent = totalActual > 0 ? "Nuevo" : "—";
    comparativaLabel.className = "font-display font-extrabold text-lg text-white";
    comparativaSub.textContent = "sin ventas en el período anterior para comparar";
  }
}

const COST_STORAGE_KEY = "apr_costos_config_v1";

function loadCostosConfig() {
  try {
    const raw = localStorage.getItem(COST_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer config de costos", e);
  }
  return { porcentaje: 35, gastosOperativos: 0, overrides: {} };
}

function saveCostosConfig(cfg) {
  try {
    localStorage.setItem(COST_STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn("No se pudo guardar config de costos", e);
  }
}

let costosConfig = loadCostosConfig();

function getCostoUnitario(nombre, precioUnitario) {
  const override = costosConfig.overrides && costosConfig.overrides[nombre];
  if (override !== undefined && override !== null && override !== "") return Number(override);
  const pct = Number(costosConfig.porcentaje) || 0;
  return (Number(precioUnitario) || 0) * (pct / 100);
}

function computeFinanzas(entregados) {
  let ingresos = 0,
    costos = 0;
  entregados.forEach((p) => {
    ingresos += Number(p.total) || 0;
    (p.productos || []).forEach((pr) => {
      const precioUnit = pr.precio_unitario ?? (pr.subtotal && pr.cantidad ? pr.subtotal / pr.cantidad : 0);
      const costoUnit = getCostoUnitario(pr.nombre, precioUnit);
      costos += costoUnit * (Number(pr.cantidad) || 0);
    });
  });
  const margenBruto = ingresos - costos;
  const gastosOp = Number(costosConfig.gastosOperativos) || 0;
  const utilidadNeta = margenBruto - gastosOp;
  return { ingresos, costos, margenBruto, utilidadNeta };
}

function computeGananciaPorProducto(entregados) {
  const map = {};
  entregados.forEach((p) => {
    (p.productos || []).forEach((pr) => {
      const nombre = pr.nombre || "Sin nombre";
      const cantidad = Number(pr.cantidad) || 0;
      const precioUnit = pr.precio_unitario ?? (pr.subtotal && pr.cantidad ? pr.subtotal / pr.cantidad : 0);
      const costoUnit = getCostoUnitario(nombre, precioUnit);
      if (!map[nombre]) map[nombre] = { nombre, cantidad: 0, ingreso: 0, costo: 0 };
      map[nombre].cantidad += cantidad;
      map[nombre].ingreso += precioUnit * cantidad;
      map[nombre].costo += costoUnit * cantidad;
    });
  });
  return Object.values(map)
    .map((x) => ({
      ...x,
      ganancia: x.ingreso - x.costo,
      margenPct: x.ingreso ? ((x.ingreso - x.costo) / x.ingreso) * 100 : 0,
    }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

function renderRentabilidad(entregados) {
  const { ingresos, costos, margenBruto, utilidadNeta } = computeFinanzas(entregados);

  document.getElementById("kpiIngresos").textContent = fmtMoney(ingresos);
  document.getElementById("kpiCostos").textContent = fmtMoney(costos);
  document.getElementById("kpiMargenBruto").textContent = fmtMoney(margenBruto);
  document.getElementById("kpiMargenPct").textContent = `${ingresos ? ((margenBruto / ingresos) * 100).toFixed(1) : "0.0"}% sobre ingresos`;

  const kpiUtilidad = document.getElementById("kpiUtilidadNeta");
  kpiUtilidad.textContent = fmtMoney(utilidadNeta);
  kpiUtilidad.className = `font-display font-extrabold text-2xl ${utilidadNeta >= 0 ? "text-white" : "text-red-400"}`;

  renderBarPair(
    "barIngresoCosto",
    { label: "💰 Ingresos", value: ingresos, color: "bg-primary" },
    { label: "📦 Costos", value: costos, color: "bg-primary/40" },
    ingresos + costos,
  );

  const ganancias = computeGananciaPorProducto(entregados).slice(0, 8);
  const listEl = document.getElementById("gananciaProductoList");
  if (listEl) {
    listEl.innerHTML = ganancias.length
      ? ganancias
          .map(
            (g) => `
      <div class="flex items-center justify-between gap-2 bg-panel2 border border-line rounded-xl px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-white truncate">${g.nombre}</p>
          <p class="text-[11px] text-inkfaint">${g.cantidad} unid · margen ${g.margenPct.toFixed(0)}%</p>
        </div>
        <span class="font-mono text-sm font-bold shrink-0 ${g.ganancia >= 0 ? "text-primary" : "text-red-400"}">${fmtMoney(g.ganancia)}</span>
      </div>
    `,
          )
          .join("")
      : '<p class="text-sm text-inkfaint py-3">Sin datos en el rango</p>';
  }
}

function poblarCostoProductosList() {
  const nombres = new Set();
  pedidosRaw.forEach((p) => (p.productos || []).forEach((pr) => nombres.add(pr.nombre || "Sin nombre")));
  const el = document.getElementById("costoProductosList");
  if (!el) return;
  el.innerHTML = [...nombres]
    .sort()
    .map(
      (nombre) => `
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm text-inkdim truncate">${nombre}</span>
      <input type="number" min="0" step="0.1" placeholder="auto"
        class="w-24 text-sm border border-line rounded-lg px-2 py-1 bg-panel2 text-white focus:border-primary outline-none costo-override-input"
        data-nombre="${nombre}"
        value="${costosConfig.overrides && costosConfig.overrides[nombre] !== undefined ? costosConfig.overrides[nombre] : ""}">
    </div>
  `,
    )
    .join("");
}

function openCostModal() {
  document.getElementById("inputCostoPct").value = costosConfig.porcentaje ?? 35;
  document.getElementById("inputGastosOp").value = costosConfig.gastosOperativos ?? 0;
  poblarCostoProductosList();
  const overlay = document.getElementById("costModalOverlay");
  if (overlay) overlay.classList.remove("hidden");
}
function closeCostModal() {
  const overlay = document.getElementById("costModalOverlay");
  if (overlay) overlay.classList.add("hidden");
}
window.closeCostModal = closeCostModal;

const costModalOverlay = document.getElementById("costModalOverlay");
if (costModalOverlay) {
  costModalOverlay.addEventListener("click", (e) => {
    if (e.target.id === "costModalOverlay") closeCostModal();
  });
}
const btnCostConfig = document.getElementById("btnCostConfig");
if (btnCostConfig) btnCostConfig.addEventListener("click", openCostModal);

const btnGuardarCostos = document.getElementById("btnGuardarCostos");
if (btnGuardarCostos) {
  btnGuardarCostos.addEventListener("click", () => {
    const overrides = {};
    document.querySelectorAll(".costo-override-input").forEach((input) => {
      if (input.value !== "") overrides[input.dataset.nombre] = Number(input.value);
    });
    costosConfig = {
      porcentaje: Number(document.getElementById("inputCostoPct").value) || 0,
      gastosOperativos: Number(document.getElementById("inputGastosOp").value) || 0,
      overrides,
    };
    saveCostosConfig(costosConfig);
    closeCostModal();
    renderAll();
    showToast("Configuración de costos guardada");
  });
}

function renderList(list) {
  const tbody = document.getElementById("tableBody");
  const cards = document.getElementById("cardsBody");
  const empty = document.getElementById("emptyState");
  const resultCount = document.getElementById("resultCount");
  if (resultCount) {
    resultCount.textContent = `(${list.length})`;
  }

  if (!list.length) {
    tbody.innerHTML = "";
    cards.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");

  tbody.innerHTML = list
    .map(
      (p) => `
    <tr class="row-hover cursor-pointer fade-in" onclick="window.openModal('${p.id}')">
      <td class="px-4 py-3 font-mono text-xs font-semibold text-primary">${codigoPedido(p)}</td>
      <td class="px-4 py-3 text-inkdim">${fmtFechaHora(p)}</td>
      <td class="px-4 py-3">
        <p class="font-medium text-white">${(p.cliente && p.cliente.nombre) || "Sin nombre"}</p>
      </td>
      <td class="px-4 py-3 text-right font-mono font-semibold text-white">${fmtMoney(p.total)}</td>
      <td class="px-4 py-3 text-inkdim">${(p.pago && p.pago.metodo) || "—"}</td>
      <td class="px-4 py-3">${estadoBadge(p.estado)}</td>
      <td class="px-4 py-3 text-primary">›</td>
    </tr>
  `,
    )
    .join("");

  cards.innerHTML = list
    .map(
      (p) => `
    <div class="bg-panel border border-line rounded-2xl p-4 fade-in active:scale-[.98] transition hover:border-primary/50" onclick="window.openModal('${p.id}')">
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="font-mono text-xs font-semibold text-primary">${codigoPedido(p)}</p>
          <p class="font-medium text-white">${(p.cliente && p.cliente.nombre) || "Sin nombre"}</p>
        </div>
        ${estadoBadge(p.estado)}
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-inkfaint text-xs">${fmtFechaHora(p)}</span>
        <span class="font-mono font-bold text-white">${fmtMoney(p.total)}</span>
      </div>
    </div>
  `,
    )
    .join("");
}

function openModal(id) {
  const p = pedidosRaw.find((x) => x.id === id);
  if (!p) return;
  currentOrder = p;

  const productosHtml = (p.productos || [])
    .map((pr) => {
      const extra = pr.variaciones || pr.adicionales || pr.comentario || "";
      return `
      <div class="flex justify-between items-start py-2 border-b border-line last:border-0">
        <div class="pr-3">
          <p class="text-sm font-medium text-white">${pr.cantidad}x ${pr.nombre}</p>
          ${extra ? `<p class="text-xs text-inkfaint mt-0.5">${extra}</p>` : ""}
        </div>
        <span class="font-mono text-sm shrink-0 text-white">${fmtMoney(pr.subtotal ?? pr.cantidad * pr.precio_unitario)}</span>
      </div>`;
    })
    .join("");

  const tel = telefonoCliente(p);
  const waMsg = `Hola ${(p.cliente && p.cliente.nombre) || ""}, te contactamos por tu pedido ${codigoPedido(p)}.`;

  const modalContent = document.getElementById("modalContent");
  if (modalContent) {
    modalContent.innerHTML = `
      <div class="flex justify-between items-start mb-5">
        <div>
          <p class="font-mono text-xs text-primary font-semibold mb-0.5">${codigoPedido(p)}</p>
          <h3 class="font-display font-bold text-xl text-white">${(p.cliente && p.cliente.nombre) || "Sin nombre"}</h3>
          <p class="text-xs text-inkfaint mt-1">${fmtFechaHora(p)}</p>
        </div>
        <button onclick="window.closeModal()" class="w-8 h-8 rounded-full bg-panel2 hover:bg-line flex items-center justify-center text-lg text-white">✕</button>
      </div>

      <div class="flex flex-wrap gap-2 mb-5">
        ${estadoBadge(p.estado)}
        <span class="px-2.5 py-1 rounded-lg bg-panel2 border border-line text-white text-xs font-medium">${(p.pago && p.pago.metodo) || "—"}</span>
      </div>

      ${
        tel
          ? `
      <a href="${waLink(tel, waMsg)}" target="_blank" class="flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl mb-5 hover:brightness-110 active:scale-95 transition shadow-lg shadow-primary/20">
        💬 Escribir por WhatsApp · ${tel}
      </a>`
          : `
      <div class="text-xs text-inkfaint bg-panel2 border border-line rounded-xl px-3 py-2.5 mb-5">Este pedido no tiene teléfono registrado.</div>
      `
      }

      ${
        p.cliente && p.cliente.direccion
          ? `
      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Dirección</p>
        <p class="text-sm bg-panel2 border border-line rounded-xl px-3 py-2.5 text-white">${p.cliente.direccion}</p>
      </div>`
          : ""
      }

      ${
        p.nota
          ? `
      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Nota del cliente</p>
        <p class="text-sm bg-primary/10 border border-primary/30 rounded-xl px-3 py-2.5 text-white">📝 ${p.nota}</p>
      </div>`
          : ""
      }

      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Productos</p>
        <div class="bg-panel2 border border-line rounded-xl px-3">${productosHtml || '<p class="text-sm text-inkfaint py-3">Sin productos</p>'}</div>
      </div>

      <div class="bg-panel2 border border-line rounded-xl px-4 py-3 flex justify-between items-center mb-5">
        <div>
          <p class="text-xs text-inkfaint">${p.total_items || ""} ítem(s) · ${(p.pago && p.pago.metodo) || ""}</p>
          ${p.pago && p.pago.vuelto ? `<p class="text-xs text-inkfaint">Vuelto: S/ ${p.pago.vuelto}</p>` : ""}
        </div>
        <p class="font-display font-extrabold text-xl text-white">${fmtMoney(p.total)}</p>
      </div>

      <div class="flex gap-2">
        <button onclick="window.reimprimirTicket()" class="flex-1 bg-panel2 border border-line font-semibold text-sm py-2.5 rounded-xl hover:bg-line transition text-white">🖨️ Reimprimir</button>
        <button onclick="window.exportarTicketWhatsApp()" class="flex-1 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:brightness-110 transition shadow-lg shadow-primary/20">📤 Enviar comprobante</button>
      </div>
    `;
  }

  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) modalOverlay.classList.remove("hidden");
}

function closeModal() {
  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) modalOverlay.classList.add("hidden");
  currentOrder = null;
}
const modalOverlay = document.getElementById("modalOverlay");
if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

function ticketTextoPlano(p) {
  const lineas = (p.productos || [])
    .map((pr) => `${pr.cantidad}x ${pr.nombre} — ${fmtMoney(pr.subtotal ?? pr.cantidad * pr.precio_unitario)}`)
    .join("\n");
  return `${codigoPedido(p)}  ·  ${fmtFechaHora(p)}\nCliente: ${(p.cliente && p.cliente.nombre) || ""}\n${(p.cliente && p.cliente.direccion) ? "Dirección: " + p.cliente.direccion + "\n" : ""}------------------------------\n${lineas}\n------------------------------\nTOTAL: ${fmtMoney(p.total)}\nPago: ${(p.pago && p.pago.metodo) || ""}\n${p.nota ? "Nota: " + p.nota : ""}`;
}

function reimprimirTicket() {
  if (!currentOrder) return;
  const w = window.open("", "_blank", "width=380,height=600");
  w.document.write(
    `<pre style="font-family:'JetBrains Mono',monospace;font-size:13px;white-space:pre-wrap;padding:16px;background:#000000;color:#FFFFFF;">${ticketTextoPlano(currentOrder)}</pre>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

function exportarTicketWhatsApp() {
  if (!currentOrder) return;
  const tel = telefonoCliente(currentOrder);
  const msg = ticketTextoPlano(currentOrder);
  if (tel) {
    window.open(waLink(tel, msg), "_blank");
  } else {
    navigator.clipboard.writeText(msg);
    showToast("Sin teléfono registrado. Comprobante copiado al portapapeles.");
  }
}

function exportarCSV() {
  const list = getFilteredOrders();
  if (!list.length) {
    showToast("No hay pedidos para exportar con estos filtros.");
    return;
  }

  const headers = [
    "Codigo",
    "Fecha",
    "Hora",
    "Cliente",
    "Telefono",
    "Productos",
    "Metodo de pago",
    "Estado",
    "Total (S/)",
  ];
  const rows = list.map((p) => {
    const productos = (p.productos || []).map((pr) => `${pr.cantidad}x ${pr.nombre}`).join(" | ");
    return [
      codigoPedido(p),
      p.fecha || "",
      p.hora || "",
      (p.cliente && p.cliente.nombre) || "",
      telefonoCliente(p),
      productos,
      (p.pago && p.pago.metodo) || "",
      p.estado || "",
      (Number(p.total) || 0).toFixed(2),
    ];
  });

  const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const [from, to] = getRangeBounds();
  const fmtF = (d) => d.toISOString().slice(0, 10);
  a.href = url;
  a.download = `pedidos_${fmtF(from)}_a_${fmtF(to)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exportados ${list.length} pedidos a CSV`);
}

function exportarExcel() {
  const list = getFilteredOrders();
  if (!list.length) {
    showToast("No hay pedidos para exportar con estos filtros.");
    return;
  }

  const rows = list.map((p) => {
    const productos = (p.productos || []).map((pr) => `${pr.cantidad}x ${pr.nombre}`).join(" | ");
    return {
      Código: codigoPedido(p),
      Fecha: p.fecha || "",
      Hora: p.hora || "",
      Cliente: (p.cliente && p.cliente.nombre) || "",
      Teléfono: telefonoCliente(p),
      Productos: productos,
      "Método de pago": (p.pago && p.pago.metodo) || "",
      Estado: p.estado || "",
      "Total (S/)": Number(p.total) || 0,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 22 },
    { wch: 14 },
    { wch: 40 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedidos");

  const [from, to] = getRangeBounds();
  const entregados = list.filter((p) => (p.estado || "").toLowerCase() === "entregado");
  const totalVendido = entregados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const resumen = [
    { Métrica: "Rango", Valor: `${from.toLocaleDateString("es-PE")} - ${to.toLocaleDateString("es-PE")}` },
    { Métrica: "Pedidos entregados", Valor: entregados.length },
    { Métrica: "Total vendido (S/)", Valor: totalVendido.toFixed(2) },
    {
      Métrica: "Ticket promedio (S/)",
      Valor: entregados.length ? (totalVendido / entregados.length).toFixed(2) : "0.00",
    },
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 22 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  const fmtFExcel = (d) => d.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `pedidos_${fmtFExcel(from)}_a_${fmtFExcel(to)}.xlsx`);
  showToast(`Exportados ${list.length} pedidos a Excel`);
}

function exportarPDF() {
  const list = getFilteredOrders();
  if (!list.length) {
    showToast("No hay pedidos para exportar con estos filtros.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  const [from, to] = getRangeBounds();
  const entregados = list.filter((p) => (p.estado || "").toLowerCase() === "entregado");
  const totalVendido = entregados.reduce((s, p) => s + (Number(p.total) || 0), 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const nombreParaPdf = nombreTienda || "Historial de Pedidos";
  doc.text(nombreTienda ? `${nombreParaPdf} · Historial de Pedidos` : nombreParaPdf, 40, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Rango: ${from.toLocaleDateString("es-PE")} - ${to.toLocaleDateString("es-PE")}`, 40, 58);
  doc.text(`Pedidos entregados: ${entregados.length}   ·   Total vendido: ${fmtMoney(totalVendido)}`, 40, 72);

  const headers = [["Código", "Fecha/Hora", "Cliente", "Teléfono", "Productos", "Pago", "Estado", "Total"]];
  const body = list.map((p) => [
    codigoPedido(p),
    fmtFechaHora(p),
    (p.cliente && p.cliente.nombre) || "",
    telefonoCliente(p),
    (p.productos || []).map((pr) => `${pr.cantidad}x ${pr.nombre}`).join(", "),
    (p.pago && p.pago.metodo) || "",
    p.estado || "",
    fmtMoney(p.total),
  ]);

  doc.autoTable({
    head: headers,
    body: body,
    startY: 90,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [30, 30, 30] },
    headStyles: { fillColor: [136, 85, 255], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 242, 255] },
    columnStyles: { 4: { cellWidth: 200 }, 7: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  const fmtFPdf = (d) => d.toISOString().slice(0, 10);
  doc.save(`pedidos_${fmtFPdf(from)}_a_${fmtFPdf(to)}.pdf`);
  showToast(`Exportados ${list.length} pedidos a PDF`);
}

const btnExport = document.getElementById("btnExport");
const exportMenu = document.getElementById("exportMenu");
if (btnExport && exportMenu) {
  btnExport.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => exportMenu.classList.add("hidden"));
  exportMenu.addEventListener("click", (e) => e.stopPropagation());
}
const btnExportCSV = document.getElementById("btnExportCSV");
if (btnExportCSV)
  btnExportCSV.addEventListener("click", () => {
    exportarCSV();
    exportMenu.classList.add("hidden");
  });
const btnExportExcel = document.getElementById("btnExportExcel");
if (btnExportExcel)
  btnExportExcel.addEventListener("click", () => {
    exportarExcel();
    exportMenu.classList.add("hidden");
  });
const btnExportPDF = document.getElementById("btnExportPDF");
if (btnExportPDF)
  btnExportPDF.addEventListener("click", () => {
    exportarPDF();
    exportMenu.classList.add("hidden");
  });
const dateChips = document.getElementById("dateChips");
if (dateChips) {
  dateChips.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    document.querySelectorAll("#dateChips .chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    const customRangeBox = document.getElementById("customRangeBox");
    if (customRangeBox) {
      customRangeBox.classList.toggle("hidden", currentRange !== "custom");
    }
    if (currentRange !== "custom") listenPedidos(); // custom espera a que se llenen las 2 fechas
  });
}

const customFrom = document.getElementById("customFrom");
if (customFrom)
  customFrom.addEventListener("change", () => {
    if (currentRange === "custom") listenPedidos();
  });
const customTo = document.getElementById("customTo");
if (customTo)
  customTo.addEventListener("change", () => {
    if (currentRange === "custom") listenPedidos();
  });
const filterEstado = document.getElementById("filterEstado");
if (filterEstado) filterEstado.addEventListener("change", renderAll);
const searchBox = document.getElementById("searchBox");
if (searchBox) searchBox.addEventListener("input", renderAll);
const btnResetFilters = document.getElementById("btnResetFilters");
if (btnResetFilters) {
  btnResetFilters.addEventListener("click", () => {
    document.getElementById("filterEstado").value = "todos";
    document.getElementById("searchBox").value = "";
    document.querySelectorAll("#dateChips .chip").forEach((c) => c.classList.remove("active"));
    document.querySelector('[data-range="hoy"]').classList.add("active");
    currentRange = "hoy";
    const customRangeBox = document.getElementById("customRangeBox");
    if (customRangeBox) customRangeBox.classList.add("hidden");
    renderAll();
  });
}

/* ---------------- Tooltip del botón de comparación ----------------
   Desktop: se abre/cierra con hover (mouseenter/mouseleave).
   Móvil/táctil: no hay hover, así que un tap alterna el tooltip y un
   tap fuera lo cierra. */
const comparativaInfoBtn = document.getElementById("comparativaInfoBtn");
const comparativaTooltip = document.getElementById("comparativaTooltip");
if (comparativaInfoBtn && comparativaTooltip) {
  const showTip = () => comparativaTooltip.classList.remove("hidden");
  const hideTip = () => comparativaTooltip.classList.add("hidden");
  comparativaInfoBtn.addEventListener("mouseenter", showTip);
  comparativaInfoBtn.addEventListener("mouseleave", hideTip);
  comparativaInfoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    comparativaTooltip.classList.toggle("hidden");
  });
  document.addEventListener("click", hideTip);
  comparativaTooltip.addEventListener("click", (e) => e.stopPropagation());
}

function renderAll() {
  const list = getFilteredOrders();
  renderMetrics(list);
  renderList(list);
  const labels = { hoy: "Hoy", ayer: "Ayer", semana: "Esta semana", mes: "Este mes", custom: "Rango personalizado" };
  const rangeLabelEcho = document.getElementById("rangeLabelEcho");
  if (rangeLabelEcho) rangeLabelEcho.textContent = labels[currentRange] || "";
}

function tickClock() {
  const clockNow = document.getElementById("clockNow");
  if (clockNow)
    clockNow.textContent = new Date().toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}
tickClock();
setInterval(tickClock, 30000);

window.openModal = openModal;
window.closeModal = closeModal;
window.reimprimirTicket = reimprimirTicket;
window.exportarTicketWhatsApp = exportarTicketWhatsApp;

if (tiendaId && localidad) {
  listenPedidos();
}
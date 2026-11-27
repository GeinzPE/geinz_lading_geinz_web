import {
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";
import {
  prepararCfgComprobante,
  imprimirComprobante,
  registrarComprobante,
} from "./comprobantes.js";

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

/* ---------------- Utilidades básicas (se usan en todo el archivo) ---------------- */
function escHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const $id = (id) => document.getElementById(id);

/* ---------------- Permisos según el rol (sesión creada en inicio.js) ---------------- */
function leerEsAdmin() {
  try {
    const raw =
      sessionStorage.getItem("rolActivo") ||
      localStorage.getItem("rolActivo_pwa");
    return !!(raw && JSON.parse(raw).esAdmin);
  } catch (e) {
    return false; // si no se puede leer el rol, se muestra la vista limitada
  }
}
const esAdmin = leerEsAdmin();
function leerSesion() {
  try {
    const raw =
      sessionStorage.getItem("rolActivo") ||
      localStorage.getItem("rolActivo_pwa");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const sesionRol = leerSesion();
const tienePermiso = (k) =>
  !!sesionRol && (sesionRol.esAdmin || (sesionRol.permisos || []).includes(k));
const verTodas = tienePermiso("ventas_ver_todas");
const esMia = (p) => verTodas || p.vendedor?.id === sesionRol?.roleId;
const puedeTocar = (p, permiso) =>
  !p.esMesa &&
  p.cliente?.tipo_entrega === "Venta directa" &&
  (p.estado || "").toLowerCase() === "entregado" &&
  esMia(p) &&
  tienePermiso(permiso);

// Si NO es admin, deja solo lo necesario para cuadrar la caja
function vistaCajero() {
  if (esAdmin) return;
  const ocultar = (el) =>
    el && el.style.setProperty("display", "none", "important");

  ["btnCostConfig", "exportDropdownWrap"].forEach((id) => ocultar($id(id)));
  ["kpiTicket", "kpiItems", "kpiVentaNeta", "kpiTicketNeto"].forEach((id) =>
    ocultar($id(id)?.parentElement),
  );
  ["origenTopLabel", "topProductoNombre", "kpiIngresos"].forEach((id) =>
    ocultar($id(id)?.closest("section")),
  );
  ["btnCostConfig", "exportDropdownWrap", "btnVista"].forEach((id) =>
    ocultar($id(id)),
  );
  ["filterOrigen", "filterComprobante"].forEach((id) =>
    ocultar($id(id)?.parentElement),
  );
  ["semana", "mes", "custom"].forEach((r) =>
    ocultar(document.querySelector(`[data-range="${r}"]`)),
  );
  const gridTop = $id("kpiTotal")?.parentElement.parentElement;
  if (gridTop) gridTop.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  const gridDeli = $id("kpiDeliveryTotal")?.parentElement.parentElement;
  if (gridDeli) gridDeli.style.gridTemplateColumns = "1fr";
}
vistaCajero();

// Si cambian de usuario (cerrar rol / entrar otro), se recarga con sus permisos
window.addEventListener("storage", () => {
  if (leerEsAdmin() !== esAdmin) location.reload();
});

/* ---------------- Librerías de exportación (carga bajo demanda) ---------------- */
const XLSX_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const JSPDF_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const AUTOTABLE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";

const _scriptsCargados = {};
function cargarScript(src) {
  if (_scriptsCargados[src]) return _scriptsCargados[src];
  _scriptsCargados[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => {
      delete _scriptsCargados[src]; // permite reintentar
      reject(new Error("No se pudo cargar " + src));
    };
    document.head.appendChild(s);
  });
  return _scriptsCargados[src];
}
async function cargarLibExcel() {
  if (window.XLSX) return;
  await cargarScript(XLSX_URL);
}
async function cargarLibPDF() {
  if (!window.jspdf) await cargarScript(JSPDF_URL);
  if (!(window.jspdf && window.jspdf.jsPDF.API.autoTable))
    await cargarScript(AUTOTABLE_URL);
}

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
let esRestaurante =
  normalizarCategoria(categoriaTienda) === "comida y restaurantes";

const TEXTOS_RESTAURANTE = {
  itemsVendidosLabel: "Productos vendidos",
  topProductoLabel: "🏆 Producto más vendido",
  gananciaProductoLabel: "Ganancia por producto",
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
    const el = $id(id);
    if (el) el.textContent = value;
  };
  setText("labelItemsVendidos", t.itemsVendidosLabel);
  setText("labelTopProducto", t.topProductoLabel);
  setText("labelGananciaProducto", t.gananciaProductoLabel);
  setText("emptyStateIcon", t.emptyStateIcon);
}
aplicarTextosPorCategoria();

/* Red de seguridad: si no llegan los datos de la tienda, el skeleton no se queda pegado */
const LOADER_TIMEOUT_MS = 15000;
setTimeout(() => {
  const ls = $id("loadingScreen");
  if (ls && ls.style.display !== "none") {
    ocultarLoader();
    if (!tiendaId || !localidad) {
      setConnStatus("⚠️ No se recibieron los datos de la tienda", false);
    }
  }
}, LOADER_TIMEOUT_MS);

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
    if (e.data.categoriaTienda) {
      categoriaTienda = e.data.categoriaTienda;
      esRestaurante =
        normalizarCategoria(categoriaTienda) === "comida y restaurantes";
    }
    if (e.data.nombreTienda) nombreTienda = e.data.nombreTienda;
    aplicarTextosPorCategoria();
    listenPedidos();
  });
}

let pedidosRaw = [];
let currentRange = "hoy";
let currentOrder = null;

function setConnStatus(text, ok) {
  const el = $id("connStatus");
  const dot = $id("connDot");
  if (el && el.lastChild) el.lastChild.textContent = " " + text;
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
let reqId = 0; // descarta respuestas viejas si el usuario cambia de rango rápido

function ocultarLoader() {
  const loadingScreen = $id("loadingScreen");
  if (!loadingScreen || loadingScreen.dataset.cerrado === "1") return;
  loadingScreen.dataset.cerrado = "1";
  loadingScreen.style.transition = "opacity 0.3s ease";
  loadingScreen.style.opacity = "0";
  loadingScreen.style.pointerEvents = "none";
  setTimeout(() => {
    loadingScreen.style.display = "none";
  }, 300);
}

function mostrarCargaRango() {
  $id("rangeLoadingBar")?.classList.remove("hidden");
  $id("metricsSections")?.classList.add("opacity-40", "pointer-events-none");
  mostrarSkeletonLista();
}
function ocultarCargaRango() {
  $id("rangeLoadingBar")?.classList.add("hidden");
  $id("metricsSections")?.classList.remove("opacity-40", "pointer-events-none");
}

function mostrarSkeletonLista() {
  const tbody = $id("tableBody");
  const cards = $id("cardsBody");
  $id("emptyState")?.classList.add("hidden");
  $id("loadMoreWrap")?.classList.add("hidden");
  const resultCount = $id("resultCount");
  if (resultCount) resultCount.textContent = "";

  if (tbody) {
    tbody.innerHTML = Array.from({ length: 6 })
      .map(
        () => `
      <tr>
        <td class="px-4 py-3" colspan="9"><div class="skeleton-element" style="height:16px;width:100%;border-radius:4px"></div></td>
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
            <div class="skeleton-element" style="height:12px;width:80px;border-radius:4px"></div>
            <div class="skeleton-element" style="height:16px;width:128px;border-radius:4px"></div>
          </div>
          <div class="skeleton-element" style="height:20px;width:64px;border-radius:999px"></div>
        </div>
        <div class="flex justify-between items-center">
          <div class="skeleton-element" style="height:12px;width:64px;border-radius:4px"></div>
          <div class="skeleton-element" style="height:16px;width:56px;border-radius:4px"></div>
        </div>
      </div>`,
      )
      .join("");
  }
}

/* ---------------- Turnos (los configura el admin en Caja y Gastos) ---------------- */
const TURNO_MARGEN_MS = 7 * 24 * 60 * 60 * 1000; // cajas abiertas antes del rango
let cfgCaja = null;
let turnos = [];
let turnosEstado = "cargando"; // "cargando" | "ok" | "error"
let turnoSel = "todos"; // "todos" | "fuera" | "t:<nombre>"
let unsubCfgCaja = null;
let unsubTurnos = null;

function usaTurnos() {
  if (cfgCaja) {
    return !!(
      cfgCaja.usaTurnos &&
      Array.isArray(cfgCaja.turnos) &&
      cfgCaja.turnos.length
    );
  }
  return turnos.length > 0;
}
function repintarSiListo() {
  const bar = $id("rangeLoadingBar");
  if (!bar || bar.classList.contains("hidden")) renderAll();
}

function escucharConfigCaja() {
  if (unsubCfgCaja) return;
  unsubCfgCaja = onSnapshot(
    tiendaSubDoc(localidad, "tiendas", tiendaId, "config", "caja"),
    (d) => {
      cfgCaja = d.exists() ? d.data() : null;
      pintarChipsTurno();
      repintarSiListo();
    },
    (e) => {
      console.warn("No se pudo leer la configuración de turnos", e);
      cfgCaja = null;
      pintarChipsTurno();
      repintarSiListo();
    },
  );
}

function escucharTurnos(from, to) {
  if (unsubTurnos) unsubTurnos();
  turnos = [];
  turnosEstado = "cargando";
  const col = tiendaSubCol(localidad, "tiendas", tiendaId, "turnos");
  unsubTurnos = onSnapshot(
    query(
      col,
      where("abiertoMs", ">=", from.getTime() - TURNO_MARGEN_MS),
      where("abiertoMs", "<=", to.getTime()),
    ),
    (snap) => {
      turnos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      turnosEstado = "ok";
      pintarChipsTurno();
      repintarSiListo();
    },
    (e) => {
      console.warn("No se pudieron leer los turnos", e);
      turnosEstado = "error";
      pintarChipsTurno();
      showToast("No se pudieron leer los turnos.");
      repintarSiListo();
    },
  );
}

const finDeTurno = (t) =>
  t.estado === "abierto" ? Infinity : Number(t.cerradoMs) || 0;

function turnoDePedido(p) {
  const ms = fechaEfectiva(p)?.getTime();
  if (!ms) return null;
  return turnos.find((t) => ms >= t.abiertoMs && ms <= finDeTurno(t)) || null;
}

function pasaFiltroTurno(p) {
  if (turnoSel === "todos") return true;
  if (turnosEstado !== "ok") return false;
  const t = turnoDePedido(p);
  if (turnoSel === "fuera") return !t;
  return !!t && "t:" + t.nombre === turnoSel;
}

function textoTurnoSel() {
  if (turnoSel === "todos") return "";
  return turnoSel === "fuera" ? "Fuera de turno" : "Turno " + turnoSel.slice(2);
}

function turnosElegidos() {
  const [from, to] = getRangeBounds();
  return turnos
    .filter(
      (t) =>
        "t:" + t.nombre === turnoSel &&
        t.abiertoMs <= to.getTime() &&
        (t.estado === "abierto" || finDeTurno(t) >= from.getTime()),
    )
    .sort((a, b) => a.abiertoMs - b.abiertoMs);
}

function pintarChipsTurno() {
  const box = $id("turnoFiltro");
  const chips = $id("turnoChips");
  if (!box || !chips) return;
  if (!usaTurnos()) {
    turnoSel = "todos";
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");

  const nombres = [
    ...new Set(
      [...(Array.isArray(cfgCaja?.turnos) ? cfgCaja.turnos : []), ...turnos]
        .map((t) => (typeof t === "string" ? t : t.nombre))
        .filter(Boolean),
    ),
  ];
  const opciones = [
    ["todos", "Todos"],
    ...nombres.map((n) => ["t:" + n, n]),
    ["fuera", "Fuera de turno"],
  ];
  if (turnosEstado === "ok" && !opciones.some(([v]) => v === turnoSel))
    turnoSel = "todos";

  chips.innerHTML = opciones
    .map(
      ([v, label]) =>
        `<button type="button" data-turno="${escHtml(v)}" class="chip ${v === turnoSel ? "active" : ""} px-3 py-1.5 rounded-full text-sm font-medium">${escHtml(label)}</button>`,
    )
    .join("");
  pintarInfoTurno();
  pintarAvisoTurnos();
}

const fmtHoraMs = (ms) =>
  new Date(ms).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

function pintarInfoTurno() {
  const el = $id("turnoInfo");
  if (!el) return;
  const dia = (ms) =>
    new Date(ms).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  let txt = "";
  if (turnoSel !== "todos") {
    if (turnosEstado === "cargando") txt = "Cargando turnos…";
    else if (turnosEstado === "error") txt = "No se pudieron leer los turnos.";
    else if (turnoSel === "fuera") txt = "Pedidos hechos con la caja cerrada.";
    else {
      const lista = turnosElegidos();
      if (!lista.length) txt = "Ese turno no se abrió en este rango.";
      else if (lista.length === 1) {
        const t = lista[0];
        txt = `${dia(t.abiertoMs)} · ${fmtHoraMs(t.abiertoMs)} – ${t.estado === "abierto" ? "sigue abierto" : fmtHoraMs(t.cerradoMs)}${t.abiertoPor ? " · abrió " + t.abiertoPor : ""}`;
      } else txt = `${lista.length} cajas de este turno en el rango.`;
    }
  }
  el.textContent = txt;
}

function turnoBadge(p) {
  if (!usaTurnos() || turnosEstado !== "ok") return "";
  const t = turnoDePedido(p);
  return t
    ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-primary/15 border border-primary/40 text-white">⏱ ${escHtml(t.nombre)}</span>`
    : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-panel2 border border-line text-inkdim">Fuera de turno</span>`;
}

function pintarAvisoTurnos() {
  const actual = $id("turnoActualBox");
  const fueraEl = $id("avisoFuera");
  const visible = usaTurnos() && turnosEstado === "ok";
  const caja =
    "display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 16px;border-radius:16px;font-size:13px;color:#fff;";

  if (actual) {
    if (!visible) actual.classList.add("hidden");
    else {
      const t = turnos
        .filter((x) => x.estado === "abierto")
        .sort((a, b) => b.abiertoMs - a.abiertoMs)[0];
      actual.classList.remove("hidden");
      actual.setAttribute(
        "style",
        caja +
          (t
            ? "background:linear-gradient(135deg,rgba(136,85,255,.18),rgba(136,85,255,.06));border:1px solid rgba(136,85,255,.35);"
            : "background:#15151b;border:1px solid rgba(255,255,255,.07);"),
      );
      actual.innerHTML = t
        ? `<span style="width:9px;height:9px;border-radius:50%;background:#8855ff;box-shadow:0 0 0 4px rgba(136,85,255,.25);flex-shrink:0"></span>
           <span><b>Caja abierta</b> · ${escHtml(t.nombre)} <span style="color:#a1a1aa">desde las ${fmtHoraMs(t.abiertoMs)}</span></span>`
        : `<span style="width:9px;height:9px;border-radius:50%;background:#71717a;flex-shrink:0"></span>
           <span><b>Caja cerrada</b> <span style="color:#a1a1aa">· las ventas quedarán como «Fuera de turno»</span></span>`;
    }
  }

  if (fueraEl) {
    if (!visible) {
      fueraEl.classList.add("hidden");
      return;
    }
    const [from, to] = getRangeBounds();
    const fuera = pedidosRaw.filter((p) => {
      const d = fechaEfectiva(p);
      return (
        d &&
        d >= from &&
        d <= to &&
        (p.estado || "").toLowerCase() === "entregado" &&
        !turnoDePedido(p)
      );
    });
    if (!fuera.length) {
      fueraEl.classList.add("hidden");
      return;
    }
    const monto = fuera.reduce((s, p) => s + (Number(p.total) || 0), 0);
    fueraEl.setAttribute(
      "style",
      caja +
        "background:#15151b;border:1px solid rgba(255,255,255,.07);color:#a1a1aa;font-size:12px;",
    );
    fueraEl.innerHTML = `<span>ℹ️</span><span><b style="color:#fff">${fuera.length} venta(s) · ${fmtMoney(monto)}</b> se hicieron con la caja cerrada y no pertenecen a ningún turno.</span>`;
    fueraEl.classList.remove("hidden");
  }
}

$id("turnoChips")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-turno]");
  if (!b) return;
  turnoSel = b.dataset.turno;
  pintarChipsTurno();
  renderAll();
});

/* ---------------- Carga de pedidos ---------------- */
// Trae SOLO los pedidos dentro del rango de fecha seleccionado
function listenPedidos() {
  if (!tiendaId || !localidad) return;
  if (unsubscribePedidos) {
    unsubscribePedidos();
    unsubscribePedidos = null;
  }
  const myReq = ++reqId;
  mostrarCargaRango();

  const [from, to] = getRangeBounds();

  // El período anterior se pide recién cuando llegan los pedidos del rango actual.
  prevTotalState = null;
  let prevProgramado = false;
  const programarPeriodoAnterior = () => {
    if (!esAdmin || prevProgramado) return;
    prevProgramado = true;
    const run = () => {
      if (myReq !== reqId) return;
      cargarTotalPeriodoAnterior(from, to)
        .then((t) => {
          if (myReq !== reqId) return;
          prevTotalState = t;
          renderAll();
        })
        .catch(() => {
          if (myReq !== reqId) return;
          prevTotalState = 0;
          renderAll();
        });
    };
    if (window.requestIdleCallback)
      window.requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 150);
  };

  if (esAdmin) escucharGastosOperativos(from, to);
  escucharConfigCaja();
  escucharTurnos(from, to);
  const col = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const q = query(
    col,
    where("timestamp", ">=", Timestamp.fromDate(from)),
    where("timestamp", "<=", Timestamp.fromDate(to)),
    orderBy("timestamp", "desc"),
    limit(2000),
  );

  const alLlegar = (snap, etiqueta) => {
    if (myReq !== reqId) return;
    pedidosRaw = snap.docs.map((d) => normalizarPedido(d.id, d.data()));
    setConnStatus(`conectado · ${pedidosRaw.length} pedidos ${etiqueta}`, true);
    renderAllNow();
    ocultarLoader();
    ocultarCargaRango();
    programarPeriodoAnterior();
  };
  const alFallar = (err) => {
    console.error(err);
    if (myReq !== reqId) return;
    setConnStatus("⚠️ Error de conexión / permisos en Firestore", false);
    ocultarLoader();
    ocultarCargaRango();
  };

  // "Hoy" se queda en vivo. Otros rangos: una sola lectura.
  if (currentRange === "hoy") {
    unsubscribePedidos = onSnapshot(
      q,
      (snap) => alLlegar(snap, "hoy"),
      alFallar,
    );
  } else {
    setConnStatus("cargando…", null);
    getDocs(q)
      .then((snap) => alLlegar(snap, "en el rango"))
      .catch(alFallar);
  }
}

// Los pedidos de mesa guardan los datos reales dentro de `pedido`; esto los deja con la misma forma.
function normalizarPedido(id, raw) {
  if (raw && raw.pedido) {
    return {
      id,
      ...raw.pedido,
      comprobante: raw.comprobante,
      vendedor: raw.vendedor || raw.pedido.vendedor,
      esMesa: true,
    };
  }
  return { id, ...raw, esMesa: false };
}
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function entradasDeOpcion(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v).filter(([, c]) => (Number(c) || 0) > 0);
  }
  if (Array.isArray(v)) return v.map((n) => [n, 1]);
  return v ? [[v, 1]] : [];
}

function opcionesDetalleTexto(pr) {
  if (!pr.opciones || !Object.keys(pr.opciones).length) return "";
  const lineas = [];
  Object.entries(pr.opciones).forEach(([condNombre, v]) => {
    entradasDeOpcion(v).forEach(([nombreOp, cant]) => {
      const cantTxt = cant > 1 ? ` x${cant}` : "";
      lineas.push(`${condNombre}: ${nombreOp}${cantTxt}`);
    });
  });
  return lineas.join(" · ");
}

function deliveryDePedido(p) {
  const d = p.delivery;
  if (!d || d.gratis) return 0;
  return Number(d.costo) || 0;
}
function totalSinDelivery(p) {
  if (typeof p.venta_neta === "number") return p.venta_neta;
  return Math.max(0, (Number(p.total) || 0) - deliveryDePedido(p));
}
function tieneDelivery(p) {
  return deliveryDePedido(p) > 0;
}

const METODOS_INFO = {
  efectivo: ["💵", "Efectivo"],
  yape: ["📱", "Yape"],
  plin: ["📱", "Plin"],
  yape_plin: ["📱", "Yape / Plin"],
  visa_mastercard: ["💳", "Visa / Mastercard"],
  agora: ["🏦", "Agora"],
  otros: ["❔", "Sin especificar"],
};
/* Logos de los métodos de pago (si una imagen no carga, se muestra el emoji) */
const ICONOS_METODO = {
  efectivo: ["../../img/efectivo_logo.webp"],
  yape: ["../../img/yape_logo.webp"],
  plin: ["../../img/logo_plin.webp"],
  yape_plin: ["../../img/yape_logo.webp", "../../img/logo_plin.webp"],
  visa_mastercard: ["../../img/visa_logo.webp"],
};
function icoMetodo(clave) {
  const emoji = (METODOS_INFO[clave] || ["💳"])[0];
  const srcs = ICONOS_METODO[clave];
  if (!srcs) return emoji;
  return srcs
    .map(
      (s) =>
        `<img class="mi" src="${escHtml(s)}" alt="" data-fb="${escHtml(emoji)}" onerror="this.outerHTML=this.dataset.fb">`,
    )
    .join("");
}
function metodoPagoDe(p) {
  if (p.pago_metodo?.label) return p.pago_metodo.label;
  const pago = p.pago;
  if (typeof pago === "string" && pago !== "pendiente") return pago;
  if (pago && typeof pago === "object") {
    const m = pago.metodo || pago.método || pago.tipo || pago.label;
    if (m) return m;
  }
  return p.metodo_pago || p.metodoPago || "Sin especificar";
}
function claveMetodo(p) {
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
function cuadrePorMetodo(list) {
  const m = {};
  list.forEach((p) => {
    const k = claveMetodo(p);
    m[k] ||= { clave: k, cant: 0, monto: 0 };
    m[k].cant++;
    m[k].monto += Number(p.total) || 0; // lo que realmente entró (incluye delivery)
  });
  return Object.values(m).sort((a, b) => b.monto - a.monto);
}
function renderCuadrePago(entregados) {
  let el = $id("cuadrePagoList");
  if (!el) {
    const ref = $id("barPago");
    if (!ref) return;
    el = document.createElement("div");
    el.id = "cuadrePagoList";
    el.className = "mt-4 pt-4 border-t border-line space-y-2";
    ref.after(el);
  }
  const filas = cuadrePorMetodo(entregados);
  const total = filas.reduce((s, f) => s + f.monto, 0);
  el.innerHTML =
    `<p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold">💰 Cuadre por método de pago</p>` +
    (filas.length
      ? filas
          .map((f) => {
      const [, label] = METODOS_INFO[f.clave] || ["", f.clave];
return `<div class="flex justify-between items-center bg-panel2 border border-line rounded-xl px-3 py-2">
  <span class="text-sm text-white">${icoMetodo(f.clave)} ${escHtml(label)} <span class="text-[11px] text-inkfaint">· ${f.cant} pedido(s)</span></span>
  <span class="font-mono text-sm font-bold text-white">${fmtMoney(f.monto)}</span></div>`;
          })
          .join("") +
        `<div class="flex justify-between px-3 pt-1 text-sm font-bold text-white"><span>Total</span><span class="font-mono">${fmtMoney(total)}</span></div>`
      : `<p class="text-sm text-inkfaint">Sin ventas en el rango</p>`);
}

/* ---------------- Vendedor y anulaciones ---------------- */
function nombreVendedor(p) {
  return p.vendedor?.nombre || "";
}
const claveVendedor = (p) => p.vendedor?.id || nombreVendedor(p);

// Una venta anulada se detecta por el flag, o por el estado "anulado"
const estaAnulado = (p) =>
  !!p.anulada || (p.estado || "").toLowerCase() === "anulado";
const estadoDe = (p) =>
  estaAnulado(p) ? "anulado" : (p.estado || "").toLowerCase();
function anuladoPor(p) {
  if (p.anulada_por?.nombre) return p.anulada_por.nombre;
  const l = Array.isArray(p.historial_cambios) ? p.historial_cambios : [];
  const r = [...l].reverse().find((c) => c.tipo === "anulacion");
  return r?.por?.nombre || "";
}

function vendedorHtml(p) {
  const n = nombreVendedor(p);
  let h = n
    ? `<p class="text-[11px] text-primary mt-0.5">👤 Vendido por: ${escHtml(n)}</p>`
    : "";
  if (estaAnulado(p))
    h += `<p class="text-[11px] text-inkdim mt-0.5">🚫 Anulado por: ${escHtml(anuladoPor(p) || "—")}</p>`;
  return h;
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

const ORIGENES_INFO = {
  delivery: { label: "Delivery / WhatsApp", icon: "🛵", color: "bg-primary" },
  recojo: { label: "Recojo en local", icon: "🏬", color: "bg-primary/70" },
  mesa: { label: "Mesa", icon: "🍽️", color: "bg-primary/45" },
  directo: { label: "Venta directa", icon: "🧾", color: "bg-primary/25" },
};

function esPedidoDeMesa(p) {
  const tipoEntrega = (p.cliente && p.cliente.tipo_entrega) || "";
  const metodo = String(metodoPagoDe(p)).toLowerCase();
  return (
    p.esMesa === true ||
    tipoEntrega === "En mesa" ||
    metodo === "en mesa" ||
    (p.mesa && p.mesa.numero != null) ||
    (p.mesaId && p.mesaNumero != null) ||
    (Array.isArray(p.mesas) && p.mesas.length > 0) ||
    (Array.isArray(p.mesasGrupo) && p.mesasGrupo.length > 0)
  );
}

function getOrigenInfo(p) {
  const tipoEntrega = (p.cliente && p.cliente.tipo_entrega) || "";
  let key = "delivery";
  if (esPedidoDeMesa(p)) key = "mesa";
  else if (tipoEntrega === "Venta directa") key = "directo";
  else if (tipoEntrega === "Recojo en local") key = "recojo";
  return { key, ...ORIGENES_INFO[key] };
}

function getTipoCuponPedido(p) {
  const c = p?.cupon;
  if (!c) return null;
  const esFid = c.origen === "fidelizacion";
  const hayCanje = (p.productos || []).some((it) => it.esCanje);
  if (esFid && hayCanje) return "canje_puntos";
  if (esFid) return "descuento_fidelizacion";
  return "cupon_descuento";
}

function detalleCuponModalHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const c = p.cupon || {};
  const prodCanjeado = (p.productos || []).find((it) => it.esCanje);
  const descuento = Number(p.descuentoCupon) || 0;
  const subtotal = Number(p.subtotal) || Number(p.total) + descuento;
  const map = {
    canje_puntos: {
      titulo: "🎁 Canje de puntos",
      col: "#fbbf24",
      bg: "rgba(251,191,36,.08)",
      bd: "rgba(251,191,36,.3)",
    },
    descuento_fidelizacion: {
      titulo: "⭐ Descuento por fidelización",
      col: "#8855FF",
      bg: "rgba(136,85,255,.08)",
      bd: "rgba(136,85,255,.3)",
    },
    cupon_descuento: {
      titulo: "🎟️ Cupón de descuento",
      col: "#4ade80",
      bg: "rgba(34,197,94,.08)",
      bd: "rgba(34,197,94,.3)",
    },
  };
  const cfg = map[tipo];
  let filas = "";
  if (c.codigo)
    filas += `<div class="flex justify-between text-xs text-inkdim py-1"><span>Código</span><span class="font-mono">${escHtml(c.codigo)}</span></div>`;
  if (tipo === "canje_puntos" && prodCanjeado) {
    filas += `<div class="flex justify-between text-xs text-inkdim py-1"><span>Producto canjeado</span><span>${escHtml(prodCanjeado.nombre)}</span></div>`;
    filas += `<div class="flex justify-between text-xs py-1"><span class="text-inkdim">Puntos usados</span><span style="color:#fbbf24;font-weight:800;">-${Number(c.costoPuntos) || 0} pts</span></div>`;
  } else {
    if (subtotal)
      filas += `<div class="flex justify-between text-xs text-inkdim py-1"><span>Subtotal sin descuento</span><span>${fmtMoney(subtotal)}</span></div>`;
    if (descuento)
      filas += `<div class="flex justify-between text-xs py-1"><span class="text-inkdim">Descuento aplicado</span><span style="color:#4ade80;font-weight:800;">-${fmtMoney(descuento)}</span></div>`;
  }
  return `
    <div class="mb-5 rounded-xl px-3.5 py-3" style="background:${cfg.bg};border:1px solid ${cfg.bd};">
      <p style="color:${cfg.col};" class="font-bold text-xs mb-2">${cfg.titulo}</p>
      ${filas}
    </div>`;
}
function cuponBadge(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return '<span class="text-inkfaint text-xs">—</span>';
  const map = {
    canje_puntos: { ico: "🎁", label: "Canje puntos", col: "text-amber-400" },
    descuento_fidelizacion: {
      ico: "⭐",
      label: "Fidelización",
      col: "text-primary",
    },
    cupon_descuento: { ico: "🎟️", label: "Cupón", col: "text-green-400" },
  };
  const cfg = map[tipo];
  const desc = Number(p.descuentoCupon) || 0;
  return `<span class="text-xs font-semibold ${cfg.col}">${cfg.ico} ${cfg.label}${desc ? ` · -${fmtMoney(desc)}` : ""}</span>`;
}
function origenBadge(p) {
  const info = getOrigenInfo(p);
  return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-panel2 border border-line text-inkdim">${info.icon} ${info.label}</span>`;
}

function renderOrigenMetrics(list) {
  const entregados = list.filter(
    (p) => (p.estado || "").toLowerCase() === "entregado",
  );
  const counts = {};
  const montos = {};
  Object.keys(ORIGENES_INFO).forEach((k) => {
    counts[k] = 0;
    montos[k] = 0;
  });
  list.forEach((p) => {
    counts[getOrigenInfo(p).key]++;
  });
  entregados.forEach((p) => {
    montos[getOrigenInfo(p).key] += totalSinDelivery(p);
  });

  const totalCount = list.length;
  const el = $id("origenBarList");
  if (el) {
    el.innerHTML = Object.entries(ORIGENES_INFO)
      .map(([key, info]) => {
        const c = counts[key];
        const pct = totalCount ? Math.round((c / totalCount) * 100) : 0;
        return `
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="font-medium text-white">${info.icon} ${info.label}</span>
            <span class="font-mono text-inkfaint">${c} · ${fmtMoney(montos[key])} · ${pct}%</span>
          </div>
          <div class="h-2 rounded-full bg-panel2 overflow-hidden border border-line">
            <div class="${info.color} h-full rounded-full transition-all" style="width:${pct}%"></div>
          </div>
        </div>`;
      })
      .join("");
  }

  let top = null;
  Object.entries(counts).forEach(([key, c]) => {
    if (!top || c > top.c) top = { key, c };
  });
  const topEl = $id("origenTopLabel");
  if (topEl)
    topEl.textContent =
      top && top.c > 0
        ? `${ORIGENES_INFO[top.key].icon} ${ORIGENES_INFO[top.key].label}`
        : "Sin datos";
  const topCantEl = $id("origenTopCant");
  if (topCantEl) topCantEl.textContent = top ? top.c : 0;
}
function estadoBadge(p) {
  const e = estadoDe(p);
  const map = {
    pendiente: { key: "pendiente", label: "Pendiente" },
    "en proceso": { key: "en_proceso", label: "En proceso" },
    entregado: { key: "entregado", label: "Completado" },
    rechazado: { key: "rechazado", label: "Rechazado" },
    anulado: { key: "anulado", label: "Anulado" },
  };
  const info = map[e] || { key: "pendiente", label: p.estado || "—" };
  return `<span data-est="${info.key}" class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">${escHtml(info.label)}</span>`;
}

function esBilleteraDigital(metodo) {
  const m = String(metodo || "").toLowerCase();
  return m.includes("yape") || m.includes("plin");
}
function codigoPedido(p) {
  return "#" + (p.id || "").slice(-6).toUpperCase();
}
function telefonoCliente(p) {
  return String(
    (p.cliente &&
      (p.cliente.telefono ||
        p.cliente.phone ||
        p.cliente.whatsapp ||
        p.cliente.celular)) ||
      "",
  );
}
function waLink(tel, msg) {
  const clean = (tel || "").replace(/\D/g, "");
  const pref = clean.startsWith("51") ? clean : "51" + clean;
  return `https://wa.me/${pref}?text=${encodeURIComponent(msg || "")}`;
}
function showToast(msg) {
  const t = $id("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function getRangeBounds() {
  const now = new Date();
  const startOf = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOf = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

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
    const from = $id("customFrom")?.value;
    const to = $id("customTo")?.value;
    const f = from ? startOf(new Date(from + "T00:00:00")) : new Date(0);
    const t = to ? endOf(new Date(to + "T00:00:00")) : endOf(now);
    return [f, t];
  }
  return [new Date(0), endOf(now)];
}

// Fecha efectiva: timestamp o, si no existe, "actualizado". Se usa para filtrar, ordenar y agrupar.
function fechaEfectiva(p) {
  return toDate(p.timestamp) || toDate(p.actualizado);
}

function getFilteredOrders() {
  const [from, to] = getRangeBounds();
  const estadoF = $id("filterEstado").value;
  const origenF = $id("filterOrigen").value;
  const deliF = $id("filterDelivery")?.value || "todos";
  const compF = $id("filterComprobante")?.value || "todos";
  const vendF = $id("filterVendedor")?.value || "todos";
  const q = $id("searchBox").value.trim().toLowerCase();

  return pedidosRaw
    .filter((p) => {
      const d = fechaEfectiva(p);
      if (!d || d < from || d > to) return false;
      if (!pasaFiltroTurno(p)) return false;
      if (!esMia(p)) return false;
      if (estadoF !== "todos" && estadoDe(p) !== estadoF) return false;
      if (vendF !== "todos" && claveVendedor(p) !== vendF) return false;
      if (deliF === "con" && !tieneDelivery(p)) return false;
      if (deliF === "sin" && tieneDelivery(p)) return false;
      if (origenF !== "todos" && getOrigenInfo(p).key !== origenF) return false;
      if (compF === "con" && !p.comprobante?.numero) return false;
      if (q) {
        const nombre = ((p.cliente && p.cliente.nombre) || "").toLowerCase();
        const tel = telefonoCliente(p).toLowerCase();
        const cod = codigoPedido(p).toLowerCase();
        const vend = nombreVendedor(p).toLowerCase();
        if (
          !nombre.includes(q) &&
          !tel.includes(q) &&
          !cod.includes(q) &&
          !vend.includes(q)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => (fechaEfectiva(b) || 0) - (fechaEfectiva(a) || 0));
}

function renderMetrics(list) {
  const entregados = list.filter(
    (p) => (p.estado || "").toLowerCase() === "entregado",
  );
  const otros = list.length - entregados.length;

  const total = entregados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const count = entregados.length;
  const ticket = count ? total / count : 0;
  const items = entregados.reduce(
    (s, p) =>
      s +
      (Number(p.total_items) ||
        (p.productos || []).reduce(
          (x, pr) => x + (Number(pr.cantidad) || 0),
          0,
        )),
    0,
  );

  const setK = (id, v) => {
    const el = $id(id);
    if (el) el.textContent = v;
  };
  setK("kpiTotal", fmtMoney(total));
  setK("kpiCount", count);
  setK("kpiOtros", otros);
  setK("kpiTicket", fmtMoney(ticket));
  setK("kpiItems", items);

  const deliveryTotal = entregados.reduce((s, p) => s + deliveryDePedido(p), 0);
  const conDelivery = entregados.filter(tieneDelivery).length;
  const ventaNeta = total - deliveryTotal;
  setK("kpiVentaNeta", fmtMoney(ventaNeta));
  setK("kpiDeliveryTotal", fmtMoney(deliveryTotal));
  setK("kpiDeliveryCount", conDelivery);
  setK("kpiTicketNeto", fmtMoney(count ? ventaNeta / count : 0));

  const digitalCount = entregados.filter((p) =>
    esBilleteraDigital(metodoPagoDe(p)),
  ).length;
  const efectivoCount = count - digitalCount;
renderBarPair(
  "barPago",
  { label: `${icoMetodo("yape")}${icoMetodo("plin")} Yape / Plin`, value: digitalCount, color: "bg-primary" },
  {
    label: `${icoMetodo("efectivo")}${icoMetodo("visa_mastercard")} Efectivo / Tarjeta`,
    value: efectivoCount,
    color: "bg-primary/40",
  },
  count,
);

  const [from, to] = getRangeBounds();
  if (esAdmin) {
    renderInteligente(entregados, from, to);
    renderRentabilidad(entregados);
    renderOrigenMetrics(list);
  }
  renderCuadrePago(entregados);
}

// item.fmt (opcional) da formato al valor mostrado (por ejemplo, dinero)
function renderBarPair(containerId, a, b, total) {
  const el = $id(containerId);
  if (!el) return;
  const pct = (v) =>
    total ? Math.min(100, Math.max(0, Math.round((v / total) * 100))) : 0;
  el.innerHTML = [a, b]
    .map((item) => {
      const valor = item.fmt ? item.fmt(item.value) : item.value;
      return `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-white">${item.label}</span>
        <span class="font-mono text-inkfaint">${valor} · ${pct(item.value)}%</span>
      </div>
      <div class="h-2 rounded-full bg-panel2 overflow-hidden border border-line">
        <div class="${item.color} h-full rounded-full transition-all" style="width:${pct(item.value)}%"></div>
      </div>
    </div>`;
    })
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
    const d = fechaEfectiva(p);
    if (d) franjas[d.getHours()]++;
  });
  let maxIdx = 0;
  franjas.forEach((v, i) => {
    if (v > franjas[maxIdx]) maxIdx = i;
  });
  return { franjas, horaTop: maxIdx, cantTop: franjas[maxIdx] };
}

/* ---------------- Gastos operativos ---------------- */
let gastosOpDocs = [];

function gastosOperativos() {
  let lista = gastosOpDocs;
  if (turnoSel === "fuera") lista = lista.filter((g) => !g.turnoId);
  else if (turnoSel !== "todos") {
    const ids = new Set(turnosElegidos().map((t) => t.id));
    lista = lista.filter((g) => ids.has(g.turnoId));
  }
  return lista.reduce((s, g) => s + (Number(g.monto) || 0), 0);
}

let unsubGastos = null;
function escucharGastosOperativos(from, to) {
  if (unsubGastos) unsubGastos();
  gastosOpDocs = [];
  const col = tiendaSubCol(localidad, "tiendas", tiendaId, "gastos_insumos");
  unsubGastos = onSnapshot(
    query(
      col,
      where("fechaMs", ">=", from.getTime()),
      where("fechaMs", "<=", to.getTime()),
    ),
    (snap) => {
      gastosOpDocs = snap.docs
        .map((d) => d.data())
        .filter((g) => g.tipo === "gasto_general");
      renderAll();
    },
    (e) => console.warn("No se pudieron leer los gastos", e),
  );
}

/* ---------------- Período anterior ---------------- */
let prevTotalState = null; // null = calculando; número = total del período anterior
const prevCache = new Map();

async function cargarTotalPeriodoAnterior(from, to) {
  const [pf, pt] = getPreviousRangeBounds(from, to);
  const key = pf.getTime() + "_" + pt.getTime();
  if (prevCache.has(key)) return prevCache.get(key);
  const col = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const snap = await getDocs(
    query(
      col,
      where("timestamp", ">=", Timestamp.fromDate(pf)),
      where("timestamp", "<=", Timestamp.fromDate(pt)),
      orderBy("timestamp", "desc"),
      limit(2000),
    ),
  );
  let total = 0;
  snap.docs.forEach((d) => {
    const p = normalizarPedido(d.id, d.data());
    if ((p.estado || "").toLowerCase() === "entregado")
      total += Number(p.total) || 0;
  });
  prevCache.set(key, total);
  return total;
}

function renderInteligente(entregados, from, to) {
  const top = computeTopProducto(entregados);
  $id("topProductoNombre").textContent = top ? top.nombre : "Sin datos";
  $id("topProductoCant").textContent = top ? top.cant : 0;

  const { franjas, horaTop, cantTop } = computeHoraPico(entregados);
  const labelHora = (h) =>
    `${String(h).padStart(2, "0")}:00 – ${String((h + 1) % 24).padStart(2, "0")}:00`;
  $id("horaPicoLabel").textContent =
    cantTop > 0 ? labelHora(horaTop) : "Sin datos";
  $id("horaPicoCant").textContent = cantTop;

  const maxFranja = Math.max(...franjas, 1);
  const horaChart = $id("horaChart");
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

  const totalActual = entregados.reduce(
    (s, p) => s + (Number(p.total) || 0),
    0,
  );
  const prevTotal = prevTotalState;
  const comparativaLabel = $id("comparativaLabel");
  const comparativaSub = $id("comparativaSub");
  const claseNeutra = "font-display font-extrabold text-lg text-white";
  if (turnoSel !== "todos") {
    comparativaLabel.textContent = "—";
    comparativaLabel.className = claseNeutra;
    comparativaSub.textContent = "no disponible al filtrar por turno";
  } else if (prevTotal === null) {
    comparativaLabel.textContent = "…";
    comparativaLabel.className = claseNeutra;
    comparativaSub.textContent = "calculando período anterior…";
  } else if (prevTotal > 0) {
    const cambio = ((totalActual - prevTotal) / prevTotal) * 100;
    const signo = cambio >= 0 ? "+" : "";
    comparativaLabel.textContent = `${signo}${cambio.toFixed(1)}%`;
    comparativaLabel.className = `font-display font-extrabold text-lg ${cambio >= 0 ? "text-primary" : "text-red-400"}`;
    comparativaSub.textContent = `${fmtMoney(totalActual)} vs ${fmtMoney(prevTotal)} anterior`;
  } else {
    comparativaLabel.textContent = totalActual > 0 ? "Nuevo" : "—";
    comparativaLabel.className = claseNeutra;
    comparativaSub.textContent =
      "sin ventas en el período anterior para comparar";
  }
}

/* ---------------- Costos y rentabilidad ---------------- */
const COST_STORAGE_KEY = "apr_costos_config_v1";

function loadCostosConfig() {
  try {
    const raw = localStorage.getItem(COST_STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      return {
        porcentaje: Number(c.porcentaje) || 0,
        overrides:
          c.overrides && typeof c.overrides === "object" ? c.overrides : {},
      };
    }
  } catch (e) {
    console.warn("No se pudo leer config de costos", e);
  }
  return { porcentaje: 35, overrides: {} };
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
  if (override !== undefined && override !== null && override !== "")
    return Number(override) || 0;
  const pct = Number(costosConfig.porcentaje) || 0;
  return (Number(precioUnitario) || 0) * (pct / 100);
}
function precioUnitarioDe(pr) {
  return (
    pr.precio_unitario ??
    (pr.subtotal && pr.cantidad ? pr.subtotal / pr.cantidad : 0)
  );
}

function computeFinanzas(entregados) {
  let ingresos = 0,
    costos = 0;
  entregados.forEach((p) => {
    ingresos += totalSinDelivery(p);
    (p.productos || []).forEach((pr) => {
      const costoUnit = getCostoUnitario(pr.nombre, precioUnitarioDe(pr));
      costos += costoUnit * (Number(pr.cantidad) || 0);
    });
  });
  const margenBruto = ingresos - costos;
  const gastosOp = gastosOperativos();
  const utilidadNeta = margenBruto - gastosOp;
  return { ingresos, costos, margenBruto, utilidadNeta, gastosOp };
}

function computeGananciaPorProducto(entregados) {
  const map = {};
  entregados.forEach((p) => {
    (p.productos || []).forEach((pr) => {
      const nombre = pr.nombre || "Sin nombre";
      const cantidad = Number(pr.cantidad) || 0;
      const precioUnit = precioUnitarioDe(pr);
      const costoUnit = getCostoUnitario(nombre, precioUnit);
      if (!map[nombre])
        map[nombre] = { nombre, cantidad: 0, ingreso: 0, costo: 0 };
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
  const { ingresos, costos, margenBruto, utilidadNeta, gastosOp } =
    computeFinanzas(entregados);
  const setK = (id, v) => {
    const el = $id(id);
    if (el) el.textContent = v;
  };
  setK("kpiGastosOpTxt", `margen bruto − gastos (${fmtMoney(gastosOp)})`);
  setK("kpiIngresos", fmtMoney(ingresos));
  setK("kpiGastosOp", fmtMoney(gastosOp));
  setK("kpiCostos", fmtMoney(costos));
  setK("kpiMargenBruto", fmtMoney(margenBruto));
  setK(
    "kpiMargenPct",
    `${ingresos ? ((margenBruto / ingresos) * 100).toFixed(1) : "0.0"}% sobre ingresos`,
  );

  const kpiUtilidad = $id("kpiUtilidadNeta");
  if (kpiUtilidad) {
    kpiUtilidad.textContent = fmtMoney(utilidadNeta);
    kpiUtilidad.className = `font-display font-extrabold text-2xl ${utilidadNeta >= 0 ? "text-white" : "text-red-400"}`;
  }

  // Los ingresos son el 100% y los costos se miden contra ellos
  renderBarPair(
    "barIngresoCosto",
    {
      label: "💰 Ingresos",
      value: ingresos,
      color: "bg-primary",
      fmt: fmtMoney,
    },
    {
      label: "📦 Costos",
      value: costos,
      color: "bg-primary/40",
      fmt: fmtMoney,
    },
    ingresos || costos,
  );

  const ganancias = computeGananciaPorProducto(entregados).slice(0, 8);
  const listEl = $id("gananciaProductoList");
  if (listEl) {
    listEl.innerHTML = ganancias.length
      ? ganancias
          .map(
            (g) => `
      <div class="flex items-center justify-between gap-2 bg-panel2 border border-line rounded-xl px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-white truncate">${escHtml(g.nombre)}</p>
          <p class="text-[11px] text-inkfaint">${g.cantidad} unid · margen ${g.margenPct.toFixed(0)}%</p>
        </div>
        <span class="font-mono text-sm font-bold shrink-0 ${g.ganancia >= 0 ? "text-primary" : "text-red-400"}">${fmtMoney(g.ganancia)}</span>
      </div>`,
          )
          .join("")
      : '<p class="text-sm text-inkfaint py-3">Sin datos en el rango</p>';
  }
}

function poblarCostoProductosList() {
  const nombres = new Set();
  pedidosRaw.forEach((p) =>
    (p.productos || []).forEach((pr) => nombres.add(pr.nombre || "Sin nombre")),
  );
  const el = $id("costoProductosList");
  if (!el) return;
  el.innerHTML = [...nombres]
    .sort()
    .map((nombre) => {
      const val =
        costosConfig.overrides && costosConfig.overrides[nombre] !== undefined
          ? costosConfig.overrides[nombre]
          : "";
      return `
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm text-inkdim truncate">${escHtml(nombre)}</span>
      <input type="number" min="0" step="0.1" placeholder="auto"
        class="w-24 text-sm border border-line rounded-lg px-2 py-1 bg-panel2 text-white focus:border-primary outline-none costo-override-input"
        data-nombre="${escHtml(nombre)}"
        value="${escHtml(val)}">
    </div>`;
    })
    .join("");
}

function openCostModal() {
  $id("inputCostoPct").value = costosConfig.porcentaje ?? 35;
  poblarCostoProductosList();
  $id("costModalOverlay")?.classList.remove("hidden");
}
function closeCostModal() {
  $id("costModalOverlay")?.classList.add("hidden");
}
window.closeCostModal = closeCostModal;

$id("costModalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "costModalOverlay") closeCostModal();
});
$id("btnCostConfig")?.addEventListener("click", openCostModal);

$id("btnGuardarCostos")?.addEventListener("click", () => {
  const overrides = {};
  document.querySelectorAll(".costo-override-input").forEach((input) => {
    if (input.value !== "")
      overrides[input.dataset.nombre] = Number(input.value);
  });
  const pct = Math.min(
    100,
    Math.max(0, Number($id("inputCostoPct").value) || 0),
  );
  costosConfig = { porcentaje: pct, overrides };
  saveCostosConfig(costosConfig);
  closeCostModal();
  renderAll();
  showToast("Configuración de costos guardada");
});

/* ---------------- Lista de pedidos con paginación ---------------- */
const PAGE_SIZE = 100;
let visibleCount = PAGE_SIZE;

function renderList(list) {
  const tbody = $id("tableBody");
  const cards = $id("cardsBody");
  const empty = $id("emptyState");
  const resultCount = $id("resultCount");
  const loadMoreWrap = $id("loadMoreWrap");
  const btnLoadMore = $id("btnLoadMore");
  if (resultCount) resultCount.textContent = `(${list.length})`;

  if (!list.length) {
    tbody.innerHTML = "";
    cards.innerHTML = "";
    loadMoreWrap?.classList.add("hidden");
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const visibles = list.slice(0, visibleCount);
  const restantes = list.length - visibles.length;
  loadMoreWrap?.classList.toggle("hidden", restantes <= 0);
  if (btnLoadMore && restantes > 0)
    btnLoadMore.textContent = `Mostrar más pedidos (${restantes} restantes)`;

  const nombreDe = (p) =>
    escHtml((p.cliente && p.cliente.nombre) || "Sin nombre");

  tbody.innerHTML = visibles
    .map(
      (p) => `
    <tr class="row-hover cursor-pointer" onclick="window.openModal('${escHtml(p.id)}')">
      <td class="px-4 py-3 font-mono text-xs font-semibold text-primary">${codigoPedido(p)}${p.comprobante?.numero ? `<p class="text-[10px] text-inkfaint font-normal">🧾 ${escHtml(p.comprobante.numero)}</p>` : ""}</td>
      <td class="px-4 py-3 text-inkdim">${fmtFechaHora(p)}</td>
      <td class="px-4 py-3">
        <p class="font-medium text-white">${nombreDe(p)}</p>
        ${vendedorHtml(p)}
      </td>
      <td class="px-4 py-3 text-right font-mono font-semibold text-white">
        ${fmtMoney(p.total)}
        ${tieneDelivery(p) ? `<p class="text-[10px] text-inkfaint font-normal">🛵 incl. ${fmtMoney(deliveryDePedido(p))}</p>` : ""}
      </td>
<td class="px-4 py-3 text-inkdim"><span class="inline-flex items-center gap-1">${claveMetodo(p) !== "otros" ? icoMetodo(claveMetodo(p)) : ""}${escHtml(metodoPagoDe(p))}</span></td>
      <td class="px-4 py-3">${cuponBadge(p)}</td>
      <td class="px-4 py-3"><div class="flex flex-col items-start gap-1">${origenBadge(p)}${turnoBadge(p)}</div></td>
      <td class="px-4 py-3">${estadoBadge(p)}</td>
      <td class="px-4 py-3 text-primary">›</td>
    </tr>`,
    )
    .join("");

  cards.innerHTML = visibles
    .map(
      (p) => `
    <div class="bg-panel border border-line rounded-2xl p-4 active:scale-[.98] transition hover:border-primary/50" onclick="window.openModal('${escHtml(p.id)}')">
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="font-mono text-xs font-semibold text-primary">${codigoPedido(p)}${p.comprobante?.numero ? ` · 🧾 ${escHtml(p.comprobante.numero)}` : ""}</p>
          <p class="font-medium text-white">${nombreDe(p)}</p>
        </div>
        ${estadoBadge(p)}
      </div>
      <div class="flex items-center justify-between text-sm mb-2">
        <span class="text-inkfaint text-xs">${fmtFechaHora(p)}</span>
        <span class="font-mono font-bold text-white text-right">
          ${fmtMoney(p.total)}
          ${tieneDelivery(p) ? `<span class="block text-[10px] text-inkfaint font-normal">🛵 incl. ${fmtMoney(deliveryDePedido(p))}</span>` : ""}
        </span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${origenBadge(p)}
        ${turnoBadge(p)}
        ${cuponBadge(p)}
      </div>
      ${vendedorHtml(p)}
    </div>`,
    )
    .join("");
}

$id("btnLoadMore")?.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderAllNow();
});

/* ---------------- Detalle del pedido ---------------- */
function openModal(id) {
  const p = pedidosRaw.find((x) => x.id === id);
  if (!p) return;
  currentOrder = p;

  const productosHtml = (p.productos || [])
    .map((pr) => {
      const extra = pr.variaciones || pr.adicionales || pr.comentario || "";
      const opcionesTxt = opcionesDetalleTexto(pr);
      return `
      <div class="flex justify-between items-start py-2 border-b border-line last:border-0">
        <div class="pr-3">
          <p class="text-sm font-medium text-white">${Number(pr.cantidad) || 0}x ${escHtml(pr.nombre)}</p>
          ${opcionesTxt ? `<p class="text-xs text-primary mt-0.5">${escHtml(opcionesTxt)}</p>` : ""}
          ${extra ? `<p class="text-xs text-inkfaint mt-0.5">${escHtml(extra)}</p>` : ""}
          ${pr.esCanje ? `<p class="text-xs text-amber-400 mt-0.5">🎁 Canjeado con puntos</p>` : ""}
        </div>
        <span class="font-mono text-sm shrink-0 text-white">${fmtMoney(pr.subtotal ?? pr.cantidad * pr.precio_unitario)}</span>
      </div>`;
    })
    .join("");

  const tel = telefonoCliente(p);
  const nombreCli = (p.cliente && p.cliente.nombre) || "";
  const waMsg = `Hola ${nombreCli}, te contactamos por tu pedido ${codigoPedido(p)}.`;
  const metodo = escHtml(metodoPagoDe(p));
  const vuelto = p.pago && p.pago.vuelto ? Number(p.pago.vuelto) : 0;

  const modalContent = $id("modalContent");
  if (modalContent) {
    modalContent.innerHTML = `
      <div class="flex justify-between items-start mb-5">
        <div>
          <p class="font-mono text-xs text-primary font-semibold mb-0.5">${codigoPedido(p)}</p>
          <h3 class="font-display font-bold text-xl text-white">${escHtml(nombreCli || "Sin nombre")}</h3>
          <p class="text-xs text-inkfaint mt-1">${fmtFechaHora(p)}</p>
          ${vendedorHtml(p)}
        </div>
        <button onclick="window.closeModal()" aria-label="Cerrar" class="w-8 h-8 rounded-full bg-panel2 hover:bg-line flex items-center justify-center text-lg text-white">✕</button>
      </div>

      <div class="flex flex-wrap gap-2 mb-5">
        ${estadoBadge(p)}
        ${origenBadge(p)}
        ${turnoBadge(p)}
        <span class="px-2.5 py-1 rounded-lg bg-panel2 border border-line text-white text-xs font-medium inline-flex items-center gap-1">${claveMetodo(p) !== "otros" ? icoMetodo(claveMetodo(p)) : ""}${metodo}</span>
      </div>

      ${
        tel
          ? `
      <a href="${escHtml(waLink(tel, waMsg))}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl mb-5 hover:brightness-110 active:scale-95 transition shadow-lg shadow-primary/20">
        💬 Escribir por WhatsApp · ${escHtml(tel)}
      </a>`
          : `
      <div class="text-xs text-inkfaint bg-panel2 border border-line rounded-xl px-3 py-2.5 mb-5">Este pedido no tiene teléfono registrado.</div>`
      }

      ${
        p.cliente && p.cliente.direccion
          ? `
      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Dirección</p>
        <p class="text-sm bg-panel2 border border-line rounded-xl px-3 py-2.5 text-white">${escHtml(p.cliente.direccion)}</p>
      </div>`
          : ""
      }

      ${
        p.nota
          ? `
      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Nota del cliente</p>
        <p class="text-sm bg-primary/10 border border-primary/30 rounded-xl px-3 py-2.5 text-white">📝 ${escHtml(p.nota)}</p>
      </div>`
          : ""
      }

      ${detalleCuponModalHtml(p)}

      ${
        p.pago_voucher?.url
          ? `<div class="mb-5"><p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Voucher de pago${p.pago_voucher.por ? ` · ${escHtml(p.pago_voucher.por)}` : ""}</p><img src="${escHtml(p.pago_voucher.url)}" alt="Voucher de pago" loading="lazy" class="max-h-60 rounded-xl border border-line"></div>`
          : ""
      }

      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Productos</p>
        <div class="bg-panel2 border border-line rounded-xl px-3">${productosHtml || '<p class="text-sm text-inkfaint py-3">Sin productos</p>'}</div>
      </div>

      <div class="bg-panel2 border border-line rounded-xl px-4 py-3 mb-5">
        ${
          tieneDelivery(p)
            ? `
          <div class="flex justify-between text-xs text-inkdim py-0.5"><span>Productos</span><span class="font-mono">${fmtMoney(totalSinDelivery(p))}</span></div>
          <div class="flex justify-between text-xs text-inkdim py-0.5"><span>🛵 Delivery${p.delivery.zona ? ` · ${escHtml(p.delivery.zona)}` : ""}</span><span class="font-mono">${fmtMoney(deliveryDePedido(p))}</span></div>`
            : p.delivery?.gratis
              ? `
          <div class="flex justify-between text-xs text-inkdim py-0.5"><span>🛵 Delivery</span><span class="font-mono text-green-400">Gratis (promo)</span></div>`
              : ""
        }
        <div class="flex justify-between items-center ${p.delivery ? "pt-2 mt-1 border-t border-line" : ""}">
          <div>
            <p class="text-xs text-inkfaint">${p.total_items ? escHtml(p.total_items) + " ítem(s) · " : ""}${metodo}</p>
            ${vuelto ? `<p class="text-xs text-inkfaint">Vuelto: ${fmtMoney(vuelto)}</p>` : ""}
          </div>
          <p class="font-display font-extrabold text-xl text-white">${fmtMoney(p.total)}</p>
        </div>
      </div>
      ${botonesEdicion(p)}
      <div class="flex gap-2">
        <button onclick="window.reimprimirTicket()" class="flex-1 bg-panel2 border border-line font-semibold text-sm py-2.5 rounded-xl hover:bg-line transition text-white">${p.comprobante?.numero ? "🖨️ Reimprimir boleta" : "🧾 Sacar boleta"}</button>
        <button onclick="window.exportarTicketWhatsApp()" class="flex-1 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:brightness-110 transition shadow-lg shadow-primary/20">📤 Enviar comprobante</button>
      </div>
    `;
  }

  $id("modalOverlay")?.classList.remove("hidden");
}

function closeModal() {
  $id("modalOverlay")?.classList.add("hidden");
  currentOrder = null;
  editando = null;
}
$id("modalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
// Escape cierra cualquier panel abierto
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeModal();
  closeCostModal();
});

function ticketTextoPlano(p) {
  const lineas = (p.productos || [])
    .map((pr) => {
      const base = `${pr.cantidad}x ${pr.nombre} — ${fmtMoney(pr.subtotal ?? pr.cantidad * pr.precio_unitario)}`;
      const opcionesTxt = opcionesDetalleTexto(pr);
      return opcionesTxt ? `${base}\n   (${opcionesTxt})` : base;
    })
    .join("\n");
  return `${codigoPedido(p)}  ·  ${fmtFechaHora(p)}\nCliente: ${(p.cliente && p.cliente.nombre) || ""}\n${p.cliente && p.cliente.direccion ? "Dirección: " + p.cliente.direccion + "\n" : ""}------------------------------\n${lineas}\n------------------------------\n${tieneDelivery(p) ? `Productos: ${fmtMoney(totalSinDelivery(p))}\nDelivery: ${fmtMoney(deliveryDePedido(p))}\n` : ""}TOTAL: ${fmtMoney(p.total)}\nPago: ${metodoPagoDe(p)}\n${p.nota ? "Nota: " + p.nota : ""}`;
}

async function reimprimirTicket() {
  if (!currentOrder) return;
  const p = currentOrder;
  try {
    const cfg = await prepararCfgComprobante(tiendaId, localidad, p, {
      nombre: nombreTienda || "",
    });
    // Solo escribe en la DB la primera vez; las reimpresiones no gastan nada.
    const numero = await registrarComprobante(tiendaId, localidad, p, cfg);
    if (numero && !p.comprobante?.numero) {
      p.comprobante = { ...(p.comprobante || {}), numero };
      renderAll();
    }
    await imprimirComprobante(p, cfg, { numero });
  } catch (e) {
    console.error(e);
    showToast("No se pudo imprimir la boleta");
  }
}

async function exportarTicketWhatsApp() {
  if (!currentOrder) return;
  const tel = telefonoCliente(currentOrder);
  const msg = ticketTextoPlano(currentOrder);
  if (tel) {
    window.open(waLink(tel, msg), "_blank", "noopener");
    return;
  }
  try {
    await navigator.clipboard.writeText(msg);
    showToast("Sin teléfono registrado. Comprobante copiado al portapapeles.");
  } catch (e) {
    console.warn(e);
    showToast("No se pudo copiar el comprobante.");
  }
}

/* ---------------- Editar / anular ventas ---------------- */
let editando = null;
const refPedido = (id) =>
  tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id);
const quien = () => ({
  id: sesionRol?.roleId || null,
  nombre: sesionRol?.nombre || "",
  usuario: sesionRol?.usuario || "",
});

function botonesEdicion(p) {
  const ed = puedeTocar(p, "ventas_editar");
  const an = puedeTocar(p, "ventas_anular");
  const hist = cambiosHtml(p);
  if (!ed && !an) return hist;
  return `${hist}
    <div class="flex gap-2 mb-3">
      ${ed ? `<button onclick="window.abrirEditor('${escHtml(p.id)}')" class="flex-1 text-sm font-semibold py-2.5 rounded-xl">✏️ Editar venta</button>` : ""}
      ${an ? `<button onclick="window.anularVenta('${escHtml(p.id)}')" class="flex-1 text-sm font-semibold py-2.5 rounded-xl text-red-400">🗑️ Anular venta</button>` : ""}
    </div>`;
}

function cambiosHtml(p) {
  const l = Array.isArray(p.historial_cambios) ? p.historial_cambios : [];
  if (!l.length) return "";
  return `<div class="mb-5">
    <p class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold mb-1.5">Historial de cambios</p>
    <div class="space-y-2">${l
      .map(
        (c) => `
      <div class="bg-panel2 border border-line rounded-xl px-3 py-2 text-xs">
        <p class="text-white font-semibold">${c.tipo === "anulacion" ? "🗑️ Anulada" : "✏️ Editada"} por ${escHtml(c.por?.nombre || "—")}
          · ${new Date(c.en).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</p>
        <p class="text-inkdim">Motivo: ${escHtml(c.motivo || "—")}</p>
        <p class="text-inkfaint">Total: ${fmtMoney(c.total_antes)} → ${fmtMoney(c.total_despues)}</p>
      </div>`,
      )
      .join("")}</div></div>`;
}

const totalEditado = () =>
  editando.items.reduce(
    (s, it) =>
      s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    0,
  );

function abrirEditor(id) {
  const p = pedidosRaw.find((x) => x.id === id);
  if (!p || !puedeTocar(p, "ventas_editar"))
    return showToast("No tienes permiso para editar esta venta");
  editando = { id, p, items: (p.productos || []).map((it) => ({ ...it })) };
  pintarEditor();
}

function pintarEditor() {
  const { p, items } = editando;
  $id("modalContent").innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <div><p class="font-mono text-xs text-primary font-semibold">${codigoPedido(p)}</p>
      <h3 class="font-display font-bold text-xl text-white">Editar venta</h3></div>
      <button onclick="window.openModal('${escHtml(p.id)}')" class="w-8 h-8 rounded-full bg-panel2 text-white">✕</button>
    </div>
    <div class="space-y-2 mb-4">
      ${items
        .map(
          (it, i) => `
        <div class="bg-panel2 border border-line rounded-xl p-3 ${Number(it.cantidad) > 0 ? "" : "opacity-40"}">
          <p class="text-sm text-white font-medium mb-2">${escHtml(it.nombre)}${opcionesDetalleTexto(it) ? ` <span class="text-xs text-primary">· ${escHtml(opcionesDetalleTexto(it))}</span>` : ""}</p>
          <div class="flex items-center gap-2">
            <label class="text-[11px] text-inkfaint">Cant.</label>
            <input type="number" min="0" step="1" value="${Number(it.cantidad) || 0}" data-i="${i}" data-f="cantidad" class="w-20 text-sm">
            <label class="text-[11px] text-inkfaint">Precio S/</label>
            <input type="number" min="0" step="0.1" value="${Number(it.precio_unitario) || 0}" data-i="${i}" data-f="precio_unitario" class="w-24 text-sm">
            <button type="button" data-quitar="${i}" class="ml-auto text-red-400 text-sm" style="min-height:0;background:none;border:0">Quitar</button>
          </div>
        </div>`,
        )
        .join("")}
    </div>
    <div class="flex justify-between items-center bg-panel2 border border-line rounded-xl px-4 py-3 mb-4">
      <span class="text-sm text-inkdim">Nuevo total (antes ${fmtMoney(p.total)})</span>
      <b id="edTotal" class="font-display text-xl text-white">${fmtMoney(totalEditado())}</b>
    </div>
    <label class="text-[11px] uppercase tracking-wider text-inkfaint font-semibold block mb-1.5">Motivo del cambio (obligatorio)</label>
    <input id="edMotivo" type="text" maxlength="120" placeholder="Ej: me equivoqué de precio" class="w-full text-sm mb-3">
    <label class="flex items-center gap-2 text-sm text-inkdim mb-4">
      <input type="checkbox" id="edStock" checked style="min-height:0"> Devolver al stock lo que se reduzca o quite
    </label>
    <button onclick="window.guardarEdicion()" class="w-full bg-primary text-white font-semibold text-sm py-2.5 rounded-xl">💾 Guardar cambios</button>`;
}

$id("modalContent")?.addEventListener("input", (e) => {
  const t = e.target;
  if (!editando || t.dataset.i === undefined) return;
  editando.items[t.dataset.i][t.dataset.f] =
    t.value === "" ? 0 : Number(t.value);
  $id("edTotal").textContent = fmtMoney(totalEditado());
});
$id("modalContent")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-quitar]");
  if (!b || !editando) return;
  editando.items[b.dataset.quitar].cantidad = 0;
  pintarEditor();
});

// delta > 0 devuelve stock; delta < 0 lo descuenta
async function ajustarStock(lineas) {
  for (const { it, delta } of lineas) {
    if (!delta || !it.id || !it.categoria || it.esPromo || it.esAdicional)
      continue;
    const ref = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "productos",
      it.categoria,
      it.categoria,
      it.id,
    );
    try {
      await runTransaction(ref.firestore, async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists()) return;
        const d = s.data();
        const up = {};
        if (typeof d.stock === "number") {
          up.stock = Math.max(0, d.stock + delta);
          if (d.autoDesactivar && up.stock > 0) up.disponible = true;
        }
        if (it.opciones && Array.isArray(d.condiciones)) {
          up.condiciones = d.condiciones.map((c) => ({
            ...c,
            opciones: (c.opciones || []).map((o) => {
              const hit = entradasDeOpcion(it.opciones[c.nombre]).find(
                ([n]) => n === o.nombre,
              );
              if (!hit || typeof o.stock !== "number") return o;
              const st = Math.max(0, o.stock + hit[1] * delta);
              return { ...o, stock: st, activo: st > 0 ? true : o.activo };
            }),
          }));
        }
        if (Object.keys(up).length) tx.update(ref, up);
      });
    } catch (err) {
      console.warn("No se pudo ajustar el stock de", it.nombre, err);
    }
  }
}

async function guardarEdicion() {
  if (!editando) return;
  const { id, p, items } = editando;
  const motivo = $id("edMotivo").value.trim();
  if (!motivo) return showToast("Escribe el motivo del cambio");

  const nuevos = items
    .filter((it) => Number(it.cantidad) > 0)
    .map((it) => {
      const cantidad = Math.round(Number(it.cantidad));
      const precio = +Number(it.precio_unitario || 0).toFixed(2);
      return {
        ...it,
        cantidad,
        precio_unitario: precio,
        subtotal: +(cantidad * precio).toFixed(2),
      };
    });
  if (!nuevos.length)
    return showToast("No queda ningún producto: usa «Anular venta»");

  const total = +nuevos.reduce((s, it) => s + it.subtotal, 0).toFixed(2);
  const totalItems = nuevos.reduce((s, it) => s + it.cantidad, 0);
  const registro = {
    tipo: "edicion",
    por: quien(),
    en: Date.now(),
    motivo,
    total_antes: Number(p.total) || 0,
    total_despues: total,
    productos_antes: p.productos || [],
  };
  try {
    await updateDoc(refPedido(id), {
      productos: nuevos,
      total,
      total_items: totalItems,
      editado: true,
      historial_cambios: arrayUnion(registro),
      actualizado: serverTimestamp(),
    });
    if ($id("edStock").checked) {
      const originales = p.productos || [];
      await ajustarStock(
        items.map((it, i) => ({
          it: originales[i] || it,
          delta:
            (Number(originales[i]?.cantidad) || 0) -
            (Math.round(Number(it.cantidad)) || 0),
        })),
      );
    }
    Object.assign(p, {
      productos: nuevos,
      total,
      total_items: totalItems,
      editado: true,
      historial_cambios: [...(p.historial_cambios || []), registro],
    });
    editando = null;
    renderAll();
    openModal(id);
    showToast("Venta actualizada");
  } catch (e) {
    console.error(e);
    showToast("No se pudo guardar el cambio");
  }
}

async function anularVenta(id) {
  const p = pedidosRaw.find((x) => x.id === id);
  if (!p || !puedeTocar(p, "ventas_anular"))
    return showToast("No tienes permiso para anular esta venta");
  const motivo = (
    window.prompt(
      "Motivo de la anulación (ej: el cliente devolvió el producto):",
    ) || ""
  ).trim();
  if (!motivo) return;
  const devolver = window.confirm("¿Devolver los productos al stock?");
  const registro = {
    tipo: "anulacion",
    por: quien(),
    en: Date.now(),
    motivo,
    total_antes: Number(p.total) || 0,
    total_despues: 0,
    productos_antes: p.productos || [],
  };
  try {
    await updateDoc(refPedido(id), {
      estado: "anulado",
      anulada: true,
      anulada_motivo: motivo,
      anulada_por: quien(),
      anulada_en: Date.now(),
      historial_cambios: arrayUnion(registro),
      actualizado: serverTimestamp(),
    });
    if (devolver)
      await ajustarStock(
        (p.productos || []).map((it) => ({
          it,
          delta: Number(it.cantidad) || 0,
        })),
      );
    Object.assign(p, {
      estado: "anulado",
      anulada: true,
      anulada_por: quien(),
      historial_cambios: [...(p.historial_cambios || []), registro],
    });
    renderAll();
    openModal(id);
    showToast("Venta anulada");
  } catch (e) {
    console.error(e);
    showToast("No se pudo anular la venta");
  }
}
window.abrirEditor = abrirEditor;
window.guardarEdicion = guardarEdicion;
window.anularVenta = anularVenta;

/* ---------------- Exportaciones ---------------- */
const TIPO_DESC_LARGO = {
  canje_puntos: "Canje de puntos",
  descuento_fidelizacion: "Descuento fidelización",
  cupon_descuento: "Cupón negocio",
};
const ESTADO_TXT = {
  pendiente: "Pendiente",
  "en proceso": "En proceso",
  entregado: "Entregado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};
const estadoTexto = (p) => ESTADO_TXT[estadoDe(p)] || p.estado || "";

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
    "Origen",
    "Productos",
    "Metodo de pago",
    "Estado",
    "Total (S/)",
    "Tipo descuento",
    "Codigo cupon",
    "Monto descuento (S/)",
    "Puntos usados",
    "Venta neta (S/)",
    "Delivery (S/)",
    "Vendido por",
    "Anulado por",
  ];
  const rows = list.map((p) => {
    const productos = (p.productos || [])
      .map((pr) => `${pr.cantidad}x ${pr.nombre}`)
      .join(" | ");
    const tipoLabel = TIPO_DESC_LARGO[getTipoCuponPedido(p)] || "";
    return [
      codigoPedido(p),
      p.fecha || "",
      p.hora || "",
      (p.cliente && p.cliente.nombre) || "",
      telefonoCliente(p),
      getOrigenInfo(p).label,
      productos,
      metodoPagoDe(p),
      estadoTexto(p),
      (Number(p.total) || 0).toFixed(2),
      tipoLabel,
      (p.cupon && p.cupon.codigo) || "",
      (Number(p.descuentoCupon) || 0).toFixed(2),
      (p.cupon && p.cupon.costoPuntos) || "",
      totalSinDelivery(p).toFixed(2),
      deliveryDePedido(p).toFixed(2),
      nombreVendedor(p),
      estaAnulado(p) ? anuladoPor(p) : "",
    ];
  });
  const entregados = list.filter(
    (p) => (p.estado || "").toLowerCase() === "entregado",
  );
  const finanzas = computeFinanzas(entregados);

  // Neutraliza fórmulas (=, +, -, @) que Excel ejecutaría al abrir el CSV
  const csvEscape = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const tablaCsv = [headers, ...rows].map((r) => r.map(csvEscape).join(","));

  const resumenCsv = [
    [],
    ["RESUMEN PARA CONTABILIDAD"],
    ["Turno", textoTurnoSel() || "Todos"],
    ["Pedidos entregados", entregados.length],
    ["Ingresos sin delivery (S/)", finanzas.ingresos.toFixed(2)],
    ["Costos estimados (S/)", finanzas.costos.toFixed(2)],
    ["Margen bruto (S/)", finanzas.margenBruto.toFixed(2)],
    ["Gastos operativos (S/)", finanzas.gastosOp.toFixed(2)],
    ["Utilidad neta (S/)", finanzas.utilidadNeta.toFixed(2)],
    [
      "Delivery cobrado (S/)",
      entregados.reduce((s, p) => s + deliveryDePedido(p), 0).toFixed(2),
    ],
  ].map((r) => r.map(csvEscape).join(","));

  const csv = [...tablaCsv, ...resumenCsv].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const [from, to] = getRangeBounds();
  a.href = url;
  a.download = `pedidos_${fechaArchivo(from)}_a_${fechaArchivo(to)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exportados ${list.length} pedidos a CSV`);
}

// Fecha local (YYYY-MM-DD); toISOString usaba UTC y podía mostrar el día siguiente
function fechaArchivo(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

async function exportarExcel() {
  const list = getFilteredOrders();
  if (!list.length) {
    showToast("No hay pedidos para exportar con estos filtros.");
    return;
  }

  try {
    if (!window.XLSX) showToast("Preparando exportación a Excel…");
    await cargarLibExcel();
  } catch (e) {
    console.error(e);
    showToast("No se pudo cargar la librería de Excel. Revisa tu conexión.");
    return;
  }

  const rows = list.map((p) => {
    const productos = (p.productos || [])
      .map((pr) => `${pr.cantidad}x ${pr.nombre}`)
      .join(" | ");
    return {
      Código: codigoPedido(p),
      Fecha: p.fecha || "",
      Hora: p.hora || "",
      Cliente: (p.cliente && p.cliente.nombre) || "",
      Teléfono: telefonoCliente(p),
      Origen: getOrigenInfo(p).label,
      Productos: productos,
      "Método de pago": metodoPagoDe(p),
      Estado: estadoTexto(p),
      "Total (S/)": Number(p.total) || 0,
      "Tipo descuento": TIPO_DESC_LARGO[getTipoCuponPedido(p)] || "",
      "Código cupón": (p.cupon && p.cupon.codigo) || "",
      "Monto descuento (S/)": Number(p.descuentoCupon) || 0,
      "Puntos usados": (p.cupon && p.cupon.costoPuntos) || "",
      "Venta neta (S/)": totalSinDelivery(p),
      "Delivery (S/)": deliveryDePedido(p),
      "Vendido por": nombreVendedor(p),
      "Anulado por": estaAnulado(p) ? anuladoPor(p) : "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 40 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
  const [from, to] = getRangeBounds();
  const entregados = list.filter(
    (p) => (p.estado || "").toLowerCase() === "entregado",
  );
  const finanzas = computeFinanzas(entregados);
  const totalCobrado = entregados.reduce(
    (s, p) => s + (Number(p.total) || 0),
    0,
  );
  const deliveryCobrado = entregados.reduce(
    (s, p) => s + deliveryDePedido(p),
    0,
  );
  const digitales = entregados.filter((p) =>
    esBilleteraDigital(metodoPagoDe(p)),
  );
  const digitalCount = digitales.length;
  const efectivoCount = entregados.length - digitalCount;
  const digitalMonto = digitales.reduce(
    (s, p) => s + (Number(p.total) || 0),
    0,
  );
  const efectivoMonto = totalCobrado - digitalMonto;

  const resumen = [
    { Métrica: "Turno", Valor: textoTurnoSel() || "Todos" },
    {
      Métrica: "Rango",
      Valor: `${from.toLocaleDateString("es-PE")} - ${to.toLocaleDateString("es-PE")}`,
    },
    { Métrica: "Pedidos entregados", Valor: entregados.length },
    { Métrica: "Total cobrado (S/)", Valor: totalCobrado.toFixed(2) },
    {
      Métrica: "Ingresos sin delivery (S/)",
      Valor: finanzas.ingresos.toFixed(2),
    },
    { Métrica: "Delivery cobrado (S/)", Valor: deliveryCobrado.toFixed(2) },
    { Métrica: "Costos estimados (S/)", Valor: finanzas.costos.toFixed(2) },
    { Métrica: "Margen bruto (S/)", Valor: finanzas.margenBruto.toFixed(2) },
    { Métrica: "Gastos operativos (S/)", Valor: finanzas.gastosOp.toFixed(2) },
    { Métrica: "Utilidad neta (S/)", Valor: finanzas.utilidadNeta.toFixed(2) },
    {
      Métrica: "Ticket promedio (S/)",
      Valor: entregados.length
        ? (totalCobrado / entregados.length).toFixed(2)
        : "0.00",
    },
    {
      Métrica: "Ventas en efectivo/tarjeta (S/)",
      Valor: efectivoMonto.toFixed(2),
    },
    { Métrica: "Cantidad efectivo/tarjeta", Valor: efectivoCount },
    { Métrica: "Ventas por Yape/Plin (S/)", Valor: digitalMonto.toFixed(2) },
    { Métrica: "Cantidad Yape/Plin", Valor: digitalCount },
  ];
  cuadrePorMetodo(entregados).forEach((f) => {
    resumen.push({
      Métrica: `Cuadre ${(METODOS_INFO[f.clave] || ["", f.clave])[1]} (S/)`,
      Valor: `${f.monto.toFixed(2)} (${f.cant} pedidos)`,
    });
  });
  resumen.push({
    Métrica: "Nota",
    Valor:
      "Costos estimados según % configurado en el sistema; no reemplaza comprobantes de compra.",
  });

  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 32 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  XLSX.writeFile(
    wb,
    `pedidos_${fechaArchivo(from)}_a_${fechaArchivo(to)}.xlsx`,
  );
  showToast(`Exportados ${list.length} pedidos a Excel`);
}

async function exportarPDF() {
  const list = getFilteredOrders();
  if (!list.length) {
    showToast("No hay pedidos para exportar con estos filtros.");
    return;
  }

  try {
    if (!window.jspdf) showToast("Preparando exportación a PDF…");
    await cargarLibPDF();
  } catch (e) {
    console.error(e);
    showToast("No se pudo cargar la librería de PDF. Revisa tu conexión.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  const [from, to] = getRangeBounds();
  const entregados = list.filter(
    (p) => (p.estado || "").toLowerCase() === "entregado",
  );
  const totalVendido = entregados.reduce(
    (s, p) => s + (Number(p.total) || 0),
    0,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(
    nombreTienda
      ? `${nombreTienda} · Historial de Pedidos`
      : "Historial de Pedidos",
    40,
    40,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Rango: ${from.toLocaleDateString("es-PE")} - ${to.toLocaleDateString("es-PE")}${textoTurnoSel() ? "   ·   " + textoTurnoSel() : ""}`,
    40,
    58,
  );
  const finanzas = computeFinanzas(entregados);

  doc.text(
    `Pedidos entregados: ${entregados.length}   ·   Total vendido: ${fmtMoney(totalVendido)}`,
    40,
    72,
  );
  doc.text(
    `Ingresos (sin delivery): ${fmtMoney(finanzas.ingresos)}   ·   Costos estimados: ${fmtMoney(finanzas.costos)}   ·   Utilidad neta: ${fmtMoney(finanzas.utilidadNeta)}`,
    40,
    86,
  );
  const headers = [
    [
      "Código",
      "Fecha/Hora",
      "Cliente",
      "Teléfono",
      "Origen",
      "Productos",
      "Pago",
      "Estado",
      "Total",
      "Delivery",
      "Descuento",
      "Vendedor",
    ],
  ];
  const body = list.map((p) => {
    const tipo = getTipoCuponPedido(p);
    const tipoLabel =
      {
        canje_puntos: "Canje puntos",
        descuento_fidelizacion: "Fidelización",
        cupon_descuento: "Cupón",
      }[tipo] || "—";
    const descuentoTxt = Number(p.descuentoCupon)
      ? `${tipoLabel} -${fmtMoney(p.descuentoCupon)}`
      : tipoLabel;
    return [
      codigoPedido(p),
      fmtFechaHora(p),
      (p.cliente && p.cliente.nombre) || "",
      telefonoCliente(p),
      getOrigenInfo(p).label,
      (p.productos || []).map((pr) => `${pr.cantidad}x ${pr.nombre}`).join(", "),
      metodoPagoDe(p),
      estaAnulado(p)
        ? `Anulado${anuladoPor(p) ? " por " + anuladoPor(p) : ""}`
        : estadoTexto(p),
      fmtMoney(p.total),
      deliveryDePedido(p) ? fmtMoney(deliveryDePedido(p)) : "—",
      descuentoTxt,
      nombreVendedor(p),
    ];
  });

  doc.autoTable({
    head: headers,
    body: body,
    startY: 104,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 5,
      textColor: [30, 30, 30],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [136, 85, 255],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [245, 242, 255] },
    columnStyles: {
      5: { cellWidth: 130 },
      8: { halign: "right", cellWidth: 55 },
      9: { halign: "right", cellWidth: 50 },
      10: { cellWidth: 80 },
    },
    margin: { left: 40, right: 40 },
  });
  doc.save(`pedidos_${fechaArchivo(from)}_a_${fechaArchivo(to)}.pdf`);
  showToast(`Exportados ${list.length} pedidos a PDF`);
}

/* ---------------- Menú de exportación ---------------- */
const btnExport = $id("btnExport");
const exportMenu = $id("exportMenu");
if (btnExport && exportMenu) {
  btnExport.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => exportMenu.classList.add("hidden"));
  exportMenu.addEventListener("click", (e) => e.stopPropagation());
}
[
  ["btnExportCSV", exportarCSV],
  ["btnExportExcel", exportarExcel],
  ["btnExportPDF", exportarPDF],
].forEach(([id, fn]) =>
  $id(id)?.addEventListener("click", () => {
    fn();
    exportMenu?.classList.add("hidden");
  }),
);

/* ---------------- Filtros ---------------- */
$id("dateChips")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  document
    .querySelectorAll("#dateChips .chip")
    .forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  currentRange = btn.dataset.range;
  $id("customRangeBox")?.classList.toggle("hidden", currentRange !== "custom");
  if (currentRange !== "custom") listenPedidos(); // custom espera a que se llenen las fechas
});

["customFrom", "customTo"].forEach((id) =>
  $id(id)?.addEventListener("change", () => {
    if (currentRange === "custom") listenPedidos();
  }),
);
[
  "filterComprobante",
  "filterEstado",
  "filterOrigen",
  "filterDelivery",
  "filterVendedor",
].forEach((id) => $id(id)?.addEventListener("change", renderAll));

// Búsqueda con pequeño debounce
const searchBox = $id("searchBox");
let searchTimer = null;
searchBox?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderAll, 150);
});

$id("btnResetFilters")?.addEventListener("click", () => {
  [
    "filterEstado",
    "filterOrigen",
    "filterDelivery",
    "filterComprobante",
    "filterVendedor",
  ].forEach((id) => {
    const el = $id(id);
    if (el) el.value = "todos";
  });
  $id("searchBox").value = "";
  turnoSel = "todos";
  pintarChipsTurno();
  document
    .querySelectorAll("#dateChips .chip")
    .forEach((c) => c.classList.remove("active"));
  document.querySelector('[data-range="hoy"]')?.classList.add("active");
  const cambioRango = currentRange !== "hoy";
  currentRange = "hoy";
  $id("customRangeBox")?.classList.add("hidden");
  if (cambioRango) listenPedidos();
  else renderAll();
});

/* ---------------- Tooltip del botón de comparación ---------------- */
const comparativaInfoBtn = $id("comparativaInfoBtn");
const comparativaTooltip = $id("comparativaTooltip");
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

/* ---------------- Filtro de trabajador ---------------- */
function pintarFiltroVendedor() {
  const sel = $id("filterVendedor");
  const wrap = $id("wrapFiltroVendedor");
  if (!sel) return;
  if (wrap) wrap.style.display = verTodas ? "" : "none"; // quien solo ve lo suyo no lo necesita
  if (!verTodas) return;
  const mapa = new Map();
  pedidosRaw.forEach((p) => {
    if (p.vendedor?.id || p.vendedor?.nombre)
      mapa.set(claveVendedor(p), nombreVendedor(p) || "Sin nombre");
  });
  const opts = [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const firma = opts.map(([k, n]) => k + n).join("|");
  if (sel.dataset.firma === firma) return;
  sel.dataset.firma = firma;
  const actual = sel.value;
  sel.innerHTML =
    `<option value="todos">Todos</option>` +
    opts
      .map(([k, n]) => `<option value="${escHtml(k)}">${escHtml(n)}</option>`)
      .join("");
  sel.value = mapa.has(actual) ? actual : "todos";
}

/* ---------------- Render ----------------
   renderAll() agrupa varias llamadas en UN solo pintado por frame.
   renderAllNow() pinta de inmediato. */
let renderPendiente = false;
let lastFilterKey = "";

function renderAll() {
  if (renderPendiente) return;
  renderPendiente = true;
  requestAnimationFrame(() => {
    renderPendiente = false;
    renderAllNow();
  });
}

function filtroKey() {
  const v = (id) => $id(id)?.value || "";
  return [
    currentRange,
    turnoSel,
    v("filterEstado"),
    v("filterOrigen"),
    v("filterDelivery"),
    v("filterComprobante"),
    v("filterVendedor"),
    v("searchBox"),
    v("customFrom"),
    v("customTo"),
  ].join("|");
}

function renderAllNow() {
  pintarFiltroVendedor();
  const key = filtroKey();
  if (key !== lastFilterKey) {
    lastFilterKey = key;
    visibleCount = PAGE_SIZE; // si cambió un filtro, vuelve a la primera página
  }

  const list = getFilteredOrders();
  renderMetrics(list);
  renderList(list);
  pintarInfoTurno();
  pintarAvisoTurnos();
  const labels = {
    hoy: "Hoy",
    ayer: "Ayer",
    semana: "Esta semana",
    mes: "Este mes",
    custom: "Rango personalizado",
  };
  const rangeLabelEcho = $id("rangeLabelEcho");
  if (rangeLabelEcho)
    rangeLabelEcho.textContent = [labels[currentRange], textoTurnoSel()]
      .filter(Boolean)
      .join(" · ");
}

function tickClock() {
  const clockNow = $id("clockNow");
  if (clockNow)
    clockNow.textContent = new Date().toLocaleString("es-PE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
}
tickClock();
setInterval(tickClock, 30000);

// Libera los listeners de Firestore al salir de la página
window.addEventListener("pagehide", () => {
  [unsubscribePedidos, unsubGastos, unsubTurnos, unsubCfgCaja].forEach(
    (u) => u && u(),
  );
});

window.openModal = openModal;
window.closeModal = closeModal;
window.reimprimirTicket = reimprimirTicket;
window.exportarTicketWhatsApp = exportarTicketWhatsApp;

/* ---------------- Personalizar vista (se guarda en este dispositivo) ---------------- */
const VISTA_KEY = "historial_vista_v1";
const VISTA_OPCIONES = [
  { grupo: "Resumen", k: "resumen", label: "Totales (vendido, pedidos, ticket)", admin: false },
  { grupo: "Resumen", k: "desglose", label: "Venta neta, delivery y pagos", admin: false },
  { grupo: "Origen de las ventas", k: "canal", label: "Canal principal", admin: true },
  { grupo: "Origen de las ventas", k: "distribucion", label: "Distribución por canal", admin: true },
  { grupo: "Dashboard inteligente", k: "top_producto", label: "Producto más vendido", admin: true },
  { grupo: "Dashboard inteligente", k: "hora_pico", label: "Hora pico", admin: true },
  { grupo: "Dashboard inteligente", k: "comparativa", label: "Vs. período anterior", admin: true },
  { grupo: "Dashboard inteligente", k: "horas", label: "Gráfico por franja horaria", admin: true },
  { grupo: "Rentabilidad", k: "rent_kpis", label: "Ingresos, costos, margen y utilidad", admin: true },
  { grupo: "Rentabilidad", k: "rent_barras", label: "Ingresos vs. costos", admin: true },
  { grupo: "Rentabilidad", k: "rent_productos", label: "Ganancia por producto", admin: true },
];

let vistaCfg = (() => {
  try {
    return JSON.parse(localStorage.getItem(VISTA_KEY)) || {};
  } catch (e) {
    return {};
  }
})();
const vistaVisible = (k) => vistaCfg[k] !== false;

function guardarVista() {
  try {
    localStorage.setItem(VISTA_KEY, JSON.stringify(vistaCfg));
  } catch (e) {}
}

function aplicarVista() {
  document
    .querySelectorAll("[data-vista]")
    .forEach((el) =>
      el.classList.toggle("vista-oculta", !vistaVisible(el.dataset.vista)),
    );
  // Si a una sección no le queda nada visible, se oculta entera (con su título)
  document.querySelectorAll("#metricsSections > section").forEach((sec) => {
    const partes = [...sec.querySelectorAll("[data-vista]")];
    if (!partes.length) return;
    const alguna = partes.some(
      (el) =>
        !el.classList.contains("vista-oculta") && el.style.display !== "none",
    );
    sec.classList.toggle("vista-oculta", !alguna);
  });
}

function pintarOpcionesVista() {
  const box = $id("vistaOpciones");
  if (!box) return;
  let grupoActual = "";
  box.innerHTML = VISTA_OPCIONES.filter((o) => esAdmin || !o.admin)
    .map((o) => {
      const titulo =
        o.grupo !== grupoActual
          ? `<p class="vista-grupo">${escHtml(o.grupo)}</p>`
          : "";
      grupoActual = o.grupo;
      return `${titulo}
        <label class="vista-opt">
          <span>${escHtml(o.label)}</span>
          <input type="checkbox" data-k="${o.k}" ${vistaVisible(o.k) ? "checked" : ""}>
        </label>`;
    })
    .join("");
}

$id("vistaOpciones")?.addEventListener("change", (e) => {
  const k = e.target?.dataset?.k;
  if (!k) return;
  vistaCfg[k] = e.target.checked;
  guardarVista();
  aplicarVista();
});

const abrirVista = () => {
  pintarOpcionesVista();
  $id("vistaModalOverlay")?.classList.remove("hidden");
};
const cerrarVista = () => $id("vistaModalOverlay")?.classList.add("hidden");

$id("btnVista")?.addEventListener("click", abrirVista);
$id("btnCerrarVista")?.addEventListener("click", cerrarVista);
$id("vistaModalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "vistaModalOverlay") cerrarVista();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarVista());

$id("btnVistaTodo")?.addEventListener("click", () => {
  vistaCfg = {};
  guardarVista();
  aplicarVista();
  pintarOpcionesVista();
});

if (esAdmin) aplicarVista();

// Se inicia al final, cuando todo lo anterior ya está definido
if (tiendaId && localidad) {
  listenPedidos();
}
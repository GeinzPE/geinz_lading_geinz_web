import {
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";
import {
  num,
  r2,
  money,
  suma,
  esReal,
  METODOS_INFO,
  claveMetodo,
  cuadreVentas,
  cuadreGastos,
  cuadreCaja,
} from "./cuadre.js";
import { exportarCaja } from "./exportar_caja.js";

/* ═══════════════════════════════════════════════════════════════════
   CAJA Y GASTOS

   .../tiendas/<id>/gastos_insumos/<id>  ← gastos, retiros y saldo inicial
   .../tiendas/<id>/pedidos              ← solo lectura (ventas)
   .../tiendas/<id>/config/caja          ← OPCIONAL. Si no existe: no hay turnos.
   .../tiendas/<id>/turnos/<id>          ← cada apertura y cierre de caja

   Tipos en gastos_insumos (campo "tipo"):
   - compra_insumo / gasto_general → gastos reales
   - retiro        → el dueño saca plata de la caja (no es gasto)
   - saldo_inicial → plata con la que empezó la caja (solo sin turnos)

   Los números (ventas por método, gastos, efectivo) se calculan con
   ./cuadre.js, el MISMO archivo que usa Historial de ventas.

   config/caja → turnos: [{ nombre, montoFijo, inicio:"HH:MM", fin:"HH:MM" }]
   (inicio y fin son opcionales: sirven para identificar el turno)
   ═══════════════════════════════════════════════════════════════════ */
const GASTOS_COL = "gastos_insumos";
const TURNOS_COL = "turnos";
const CFG_COL = "config";
const CFG_DOC = "caja";

/* ---------------- Utilidades ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TZ = "America/Lima";
const ymdLima = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const limaHoy = () => ymdLima(Date.now());
const limaMes = () => limaHoy().slice(0, 7);
const msIniDia = (ymd) => Date.parse(ymd + "T00:00:00-05:00");
const msFinDia = (ymd) => Date.parse(ymd + "T23:59:59.999-05:00");
const finDeMes = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const horaLima = (ms) =>
  new Date(ms).toLocaleTimeString("es-PE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesLabel = (ym) => {
  const [y, m] = ym.split("-");
  return `${MESES[+m - 1]} ${y}`;
};
const fmtDia = (ms) => {
  const [, m, d] = ymdLima(ms).split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]}`;
};
const sumarDias = (ymd, n) => {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaLargo = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]} ${y}`;
};
const diaCorto = (ymd) =>
  new Date(ymd + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
/* Si el gasto es de hoy se guarda con la hora real (sirve para el turno); si es de otro día, al mediodía */
const fechaMsDe = (f) => (f === limaHoy() ? Date.now() : Date.parse(f + "T12:00:00-05:00"));
const msDeGasto = (g) => (g.fechaMs ? g.fechaMs : g.mes ? msIniDia(g.mes + "-01") : NaN);
const diaG = (g) => {
  const ms = msDeGasto(g);
  return isFinite(ms) ? ymdLima(ms) : "";
};
const sumaT = (arr) => arr.reduce((s, p) => s + p.total, 0);

/* "14:00" → "2:00 PM" */
const hora12 = (hhmm) => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${suf}`;
};
/* { inicio:"07:00", fin:"15:00" } → "7:00 AM – 3:00 PM" (vacío si no hay horario) */
const horarioTurno = (t) => (t && t.inicio && t.fin ? `${hora12(t.inicio)} – ${hora12(t.fin)}` : "");

let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}
const openMd = (id) => $(id).classList.add("show");
const closeMd = (id) => $(id).classList.remove("show");
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeMd(b.dataset.close)));
document.querySelectorAll(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) closeMd(o.id);
  }),
);

/* ---------------- Ayuda: botón "?" que explica para qué sirve cada cosa ---------------- */
const ayuda = (txt) =>
  `<button type="button" class="qm" data-ayuda="${esc(txt)}" aria-label="¿Para qué sirve?">?</button>`;
const popAyuda = document.createElement("div");
popAyuda.className = "ayuda-pop";
popAyuda.hidden = true;
popAyuda.setAttribute("role", "tooltip");
document.body.appendChild(popAyuda);
let popBtn = null;
function cerrarAyuda() {
  popAyuda.hidden = true;
  popBtn = null;
}
function abrirAyuda(btn) {
  popBtn = btn;
  popAyuda.textContent = btn.dataset.ayuda;
  popAyuda.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = popAyuda.offsetWidth;
  const h = popAyuda.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  popAyuda.style.left = left + "px";
  popAyuda.style.top = top + "px";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest ? e.target.closest("[data-ayuda]") : null;
  if (b) {
    e.preventDefault();
    if (popBtn === b) cerrarAyuda();
    else abrirAyuda(b);
    return;
  }
  if (!e.target.closest(".ayuda-pop")) cerrarAyuda();
});
window.addEventListener("scroll", cerrarAyuda, true);
window.addEventListener("resize", cerrarAyuda);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarAyuda();
});

/* ---------------- Rol (mismo origen que Historial de ventas) ---------------- */
function leerRol() {
  try {
    const raw = sessionStorage.getItem("rolActivo") || localStorage.getItem("rolActivo_pwa");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
const rol = leerRol();
const esAdmin = !!rol?.esAdmin;
const quienSoy = () => rol?.nombre || rol?.usuario || rol?.rol || (esAdmin ? "Administrador" : "Cajero");
window.addEventListener("storage", () => {
  if (!!leerRol()?.esAdmin !== esAdmin) location.reload();
});
$("btnCfgCaja").hidden = !esAdmin;

/* ---------------- Pedidos: misma lectura que Historial de ventas ---------------- */
function toMs(ts) {
  if (ts == null) return NaN;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return Date.parse(ts);
}
/* Los pedidos de mesa guardan sus datos dentro de "pedido" */
function leerPedido(raw) {
  const p = raw.pedido ? raw.pedido : raw;
  let ms = toMs(p.timestamp);
  if (!isFinite(ms)) ms = toMs(p.actualizado);
  if (!isFinite(ms)) ms = toMs(raw.timestamp);
  const clave = claveMetodo(p);
  return {
    ms,
    entregado: (p.estado || "").toLowerCase() === "entregado",
    total: Number(p.total) || 0,
    clave,
    efectivo: clave === "efectivo",
  };
}

/* ---------------- Contexto de la tienda ---------------- */
let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");
let started = false;

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  if (!d || (d.type !== "DATOS_TIENDA" && d.tipo !== "DATOS_TIENDA")) return;
  const id = d.id || d.tiendaId || d.payload?.id_tienda;
  const loc = d.localidad || d.payload?.localidad;
  if (id) {
    tiendaId = id;
    sessionStorage.setItem("tiendaId", id);
  }
  if (loc) {
    localidad = loc;
    sessionStorage.setItem("localidad", loc);
  }
  if (d.nombreTienda) sessionStorage.setItem("nombreTienda", d.nombreTienda);
  start();
});
window.parent?.postMessage({ type: "PEDIR_DATOS_TIENDA" }, window.location.origin);

const col = (n) => tiendaSubCol(localidad, "tiendas", tiendaId, n);
const docRef = (n, id) => tiendaSubDoc(localidad, "tiendas", tiendaId, n, id);

/* ---------------- Estado ---------------- */
let gastosAll = [];
let pedidosPeriodo = []; // pedidos entregados del día/mes que se está viendo
let ventasEstado = "cargando"; // "cargando" | "ok" | "error"
let vista = "dia"; // "dia" | "mes"
let diaSel = limaHoy();
let mesSel = limaMes();
let fTipo = "todos";
let chartsOpen = false;
let editId = null;

let cfgCaja = null; // null = el negocio no usa turnos
let turnoAbierto = null;
let pedidosTurno = [];
let pedidosTurnoOk = false;
let turnosPeriodo = [];

const usaTurnos = () => !!(cfgCaja?.usaTurnos && Array.isArray(cfgCaja.turnos) && cfgCaja.turnos.length);

/* Horario programado de un turno guardado (usa lo que se guardó al abrir; si no hay, lo busca en la configuración) */
function horarioDeTurno(t) {
  if (!t) return "";
  if (t.horaInicio && t.horaFin) return horarioTurno({ inicio: t.horaInicio, fin: t.horaFin });
  const c = cfgCaja?.turnos?.find((x) => x.nombre === t.nombre);
  return horarioTurno(c);
}

function limitesPeriodo() {
  if (vista === "dia") return [msIniDia(diaSel), msFinDia(diaSel)];
  return [msIniDia(mesSel + "-01"), msFinDia(finDeMes(mesSel))];
}
function enPeriodo(g) {
  const ms = msDeGasto(g);
  const [a, b] = limitesPeriodo();
  return ms >= a && ms <= b;
}
const cuando = () => {
  if (vista === "mes") return mesSel === limaMes() ? "este mes" : "en " + mesLabel(mesSel);
  const hoy = limaHoy();
  return diaSel === hoy ? "hoy" : diaSel === sumarDias(hoy, -1) ? "ayer" : "el " + diaLargo(diaSel);
};
const fechaDefault = () => (vista === "dia" ? diaSel : mesSel === limaMes() ? limaHoy() : mesSel + "-01");
const nombreTurno = (id) => {
  if (!id) return "";
  if (turnoAbierto?.id === id) return turnoAbierto.nombre;
  return turnosPeriodo.find((t) => t.id === id)?.nombre || "";
};

/* Un solo pintado por frame aunque lleguen varios datos juntos */
let renderPendiente = false;
function renderTodo() {
  if (renderPendiente) return;
  renderPendiente = true;
  requestAnimationFrame(() => {
    renderPendiente = false;
    renderCaja();
    renderTurno();
    renderGastos();
  });
}

/* ══════════ CONTROLES: Por día / Por mes ══════════ */
function sincronizarControles() {
  document.querySelectorAll("#vistaSel button").forEach((b) => b.classList.toggle("on", b.dataset.v === vista));
  $("navDia").hidden = vista !== "dia";
  $("mesSel").hidden = vista !== "mes";
  $("diaSel").value = diaSel;
  $("diaSel").max = limaHoy();
  $("mesSel").value = mesSel;
  $("diaNext").disabled = diaSel >= limaHoy();
}
function refrescar() {
  sincronizarControles();
  if (started) {
    escucharVentas();
    escucharTurnosPeriodo();
  }
  renderTodo();
}
function irADia(d) {
  if (!d) return;
  vista = "dia";
  diaSel = d > limaHoy() ? limaHoy() : d;
  mesSel = diaSel.slice(0, 7);
  refrescar();
}
$("vistaSel").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b || b.dataset.v === vista) return;
  vista = b.dataset.v;
  if (vista === "mes") mesSel = diaSel.slice(0, 7);
  else if (diaSel.slice(0, 7) !== mesSel) diaSel = mesSel === limaMes() ? limaHoy() : mesSel + "-01";
  refrescar();
});
$("diaPrev").addEventListener("click", () => irADia(sumarDias(diaSel, -1)));
$("diaNext").addEventListener("click", () => irADia(sumarDias(diaSel, 1)));
$("diaHoy").addEventListener("click", () => irADia(limaHoy()));
$("diaSel").addEventListener("change", (e) => irADia(e.target.value));
$("mesSel").addEventListener("change", (e) => {
  if (!e.target.value) return;
  mesSel = e.target.value;
  refrescar();
});

/* ══════════ VENTAS DEL PERIODO (en vivo) ══════════ */
let unsubVentas = null;
let ventasKey = "";
function escucharVentas() {
  const [a, b] = limitesPeriodo();
  const key = a + "_" + b;
  if (key === ventasKey) return;
  ventasKey = key;
  if (unsubVentas) unsubVentas();
  ventasEstado = "cargando";
  pedidosPeriodo = [];
  renderTodo();
  const q = query(
    col("pedidos"),
    where("timestamp", ">=", Timestamp.fromMillis(a)),
    where("timestamp", "<=", Timestamp.fromMillis(b)),
    orderBy("timestamp", "desc"),
    limit(5000),
  );
  unsubVentas = onSnapshot(
    q,
    (snap) => {
      if (key !== ventasKey) return;
      pedidosPeriodo = snap.docs
        .map((d) => leerPedido(d.data()))
        .filter((p) => p.entregado && p.ms >= a && p.ms <= b);
      ventasEstado = "ok";
      renderTodo();
    },
    (err) => {
      console.error(err);
      if (key !== ventasKey) return;
      ventasEstado = "error";
      toast("No se pudieron leer las ventas.");
      renderTodo();
    },
  );
}

/* ══════════ TURNOS ══════════ */
let unsubTurnoAb = null;
function escucharTurnoAbierto() {
  if (unsubTurnoAb) return;
  unsubTurnoAb = onSnapshot(
    query(col(TURNOS_COL), where("estado", "==", "abierto")),
    (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.abiertoMs || 0) - (x.abiertoMs || 0));
      turnoAbierto = arr[0] || null;
      escucharPedidosTurno();
      renderTodo();
    },
    (e) => {
      console.warn("No se pudo leer el turno", e);
      turnoAbierto = null;
      renderTodo();
    },
  );
}

/* Ventas desde que se abrió la caja, en vivo */
let unsubPedTurno = null;
let pedTurnoKey = "";
function escucharPedidosTurno() {
  const key = turnoAbierto ? turnoAbierto.id : "";
  if (key === pedTurnoKey) return;
  pedTurnoKey = key;
  if (unsubPedTurno) {
    unsubPedTurno();
    unsubPedTurno = null;
  }
  pedidosTurno = [];
  pedidosTurnoOk = false;
  if (!turnoAbierto) return;
  const desde = turnoAbierto.abiertoMs;
  unsubPedTurno = onSnapshot(
    query(col("pedidos"), where("timestamp", ">=", Timestamp.fromMillis(desde))),
    (snap) => {
      if (key !== pedTurnoKey) return;
      pedidosTurno = snap.docs.map((d) => leerPedido(d.data())).filter((p) => p.entregado && p.ms >= desde);
      pedidosTurnoOk = true;
      renderTodo();
    },
    (e) => {
      console.warn("No se pudieron leer las ventas del turno", e);
      toast("No se pudieron leer las ventas del turno.");
    },
  );
}

/* Cierres de caja del día/mes que se está viendo */
let unsubTurnosP = null;
let turnosKey = "";
function escucharTurnosPeriodo() {
  if (!cfgCaja) {
    if (unsubTurnosP) unsubTurnosP();
    unsubTurnosP = null;
    turnosKey = "";
    turnosPeriodo = [];
    return;
  }
  const [a, b] = limitesPeriodo();
  const key = a + "_" + b;
  if (key === turnosKey) return;
  turnosKey = key;
  if (unsubTurnosP) unsubTurnosP();
  turnosPeriodo = [];
  unsubTurnosP = onSnapshot(
    query(col(TURNOS_COL), where("abiertoMs", ">=", a), where("abiertoMs", "<=", b)),
    (snap) => {
      if (key !== turnosKey) return;
      turnosPeriodo = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.abiertoMs || 0) - (x.abiertoMs || 0));
      renderTodo();
    },
    (e) => console.warn("No se pudieron leer los turnos", e),
  );
}

/* Cuánto debe haber en el cajón de un turno abierto */
function cuentaTurno(t) {
  const ventasEf = sumaT(pedidosTurno.filter((p) => p.efectivo));
  const ventasTot = sumaT(pedidosTurno);
  const gastos = suma(gastosAll.filter((g) => g.turnoId === t.id && esReal(g) && g.descuenta_caja));
  const retiros = suma(gastosAll.filter((g) => g.turnoId === t.id && g.tipo === "retiro"));
  const apertura = num(t.montoApertura);
  return {
    apertura,
    ventasEf,
    otrosMedios: ventasTot - ventasEf,
    gastos,
    retiros,
    esperado: r2(apertura + ventasEf - gastos - retiros),
  };
}
function filasTurnoHtml(k) {
  return `<div class="tc-rows">
    <div class="tc-r"><span>Empezó con</span><b>${money(k.apertura)}</b></div>
    <div class="tc-r"><span>+ Ventas en efectivo</span><b>${money(k.ventasEf)}</b></div>
    <div class="tc-r"><span>− Gastos pagados con la caja</span><b>${money(k.gastos)}</b></div>
    ${k.retiros ? `<div class="tc-r"><span>− Retiros</span><b>${money(k.retiros)}</b></div>` : ""}
    <div class="tc-r tot"><span>Debe haber en el cajón</span><b${k.esperado < 0 ? ' style="color:var(--bad)"' : ""}>${money(k.esperado)}</b></div>
  </div>
  ${k.otrosMedios > 0 ? `<p class="tc-note">Yape, Plin y tarjeta (${money(k.otrosMedios)}) no se cuentan: esa plata no está en el cajón.</p>` : ""}`;
}
function resultadoHtml(d, grande) {
  if (Math.abs(d) < 0.005) return grande ? `<div class="res ok">✓ Cuadra exacto</div>` : `<span class="t-ok">✓ Cuadró</span>`;
  if (d < 0) return grande ? `<div class="res bad">Falta ${money(-d)}</div>` : `<span class="t-bad">Faltó ${money(-d)}</span>`;
  return grande ? `<div class="res sob">Sobra ${money(d)}</div>` : `<span class="t-sob">Sobró ${money(d)}</span>`;
}

function renderTurno() {
  const box = $("turnoBox");
  renderTurnosHist();
  if (!usaTurnos() && !turnoAbierto) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.classList.toggle("abierta", !!turnoAbierto);
  if (!turnoAbierto) {
    box.innerHTML = `<div class="tc-head">
      <div><b><span class="tc-dot"></span>Caja cerrada${ayuda("La caja está cerrada: nadie la está usando ahora. Toca “Abrir caja” cuando empiece tu turno y escribe con cuánta plata empiezas.")}</b><small>Ábrela cuando empiece el turno.</small></div>
      <button class="btn go tc-btn" data-accion="abrir">Abrir caja</button>
    </div>`;
    return;
  }

  const t = turnoAbierto;
  const desdeOtroDia = ymdLima(t.abiertoMs) !== limaHoy();
  const horario = horarioDeTurno(t);
  const head = `<div class="tc-head">
      <div><b><span class="tc-dot on"></span>Caja abierta · Turno ${esc(t.nombre)}${ayuda("Hay un turno trabajando. Aquí ves cuánta plata debe haber en el cajón y lo que vendiste desde que se abrió la caja. Al terminar, toca “Cerrar caja” y cuenta la plata.")}</b>
      <small>${horario ? "Horario " + esc(horario) + " · " : ""}Desde ${desdeOtroDia ? fmtDia(t.abiertoMs) + ", " : ""}${horaLima(t.abiertoMs)}${t.abiertoPor ? " · abrió " + esc(t.abiertoPor) : ""}</small></div>
      <button class="btn go tc-btn" data-accion="cerrar">Cerrar caja</button>
    </div>`;
  const aviso = desdeOtroDia
    ? `<p class="tc-note" style="color:#fbbf24">Esta caja se abrió otro día y no se cerró. Ciérrala para empezar bien el turno.</p>`
    : "";

  if (!pedidosTurnoOk) {
    box.innerHTML = head + `<p class="tc-note">Cargando ventas del turno…</p>` + aviso;
    return;
  }

  const k = cuentaTurno(t); // cajón: empezó + ventas efectivo − gastos − retiros
  const v = cuadreVentas(pedidosTurno); // ventas del turno por método
  const quedo = r2(v.total - k.gastos); // lo que ganó el turno: vendido − gastos del negocio
  const digitales = v.porMetodo.filter((m) => m.clave !== "efectivo");
  const todo = r2(k.esperado + v.otros); // cajón + billeteras/tarjeta

  const digitalFilas = digitales.length
    ? digitales
        .map((m) => {
          const [ico, lab] = METODOS_INFO[m.clave] || ["💳", m.clave];
          return `<div class="mini"><span>${ico} ${esc(lab)} · ${m.cant}</span><b>${money(m.monto)}</b></div>`;
        })
        .join("")
    : `<em>No hubo pagos por Yape, Plin ni tarjeta.</em>`;

  const tiles = `<div class="tc-tiles">
      <div class="tc-tile main">
        <small>💵 En el cajón debe haber${ayuda("Es el efectivo que debes tener en la mano ahora: lo que empezó la caja + las ventas en efectivo − los gastos pagados con la caja − los retiros. Esto es lo que cuentas al cerrar.")}</small>
        <b${k.esperado < 0 ? ' style="color:var(--bad)"' : ""}>${money(k.esperado)}</b>
        <em>Efectivo. Es lo que cuentas al cerrar.</em>
      </div>
      <div class="tc-tile">
        <small>📱 Yape, Plin y tarjeta${ayuda("Lo que te pagaron sin efectivo. Esa plata no está en el cajón (llega a tu cuenta o billetera), por eso no se cuenta al cerrar la caja.")}</small>
        <b>${money(v.otros)}</b>
        ${digitalFilas}
      </div>
      <div class="tc-tile">
        <small>🧾 Vendiste en el turno${ayuda("El total de pedidos entregados desde que se abrió la caja, sin importar si pagaron en efectivo, Yape, Plin o tarjeta.")}</small>
        <b>${money(v.total)}</b>
        <em>${v.cant} pedido${v.cant === 1 ? "" : "s"} entregado${v.cant === 1 ? "" : "s"}</em>
      </div>
      <div class="tc-tile${quedo < 0 ? " neg" : ""}">
        <small>✅ Te quedó en el turno${ayuda("Lo que ganó el turno: todo lo vendido menos los gastos que pagó el negocio. No es la plata del cajón, es la ganancia del turno.")}</small>
        <b>${money(quedo)}</b>
        <em>Vendido − gastos del negocio</em>
      </div>
    </div>
    <div class="tc-total">
      <span>Para que todo cuadre: cajón ${money(k.esperado)} + digital ${money(v.otros)}${ayuda("Suma del efectivo del cajón más lo cobrado por Yape, Plin y tarjeta. Sirve para comprobar que cuadra con lo que vendiste menos lo que gastaste.")}</span>
      <b>${money(todo)}</b>
    </div>`;

  /* El trabajador ve solo lo esencial; el administrador, además, el detalle */
  const detalle = esAdmin
    ? `<details class="tc-det" open><summary>Ver el detalle del cajón${ayuda("Muestra paso a paso cómo se calcula la plata que debe haber en el cajón.")}</summary>${filasTurnoHtml(k)}</details>`
    : "";

  box.innerHTML = head + tiles + detalle + aviso;
}
$("turnoBox").addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  if (b.dataset.accion === "abrir") abrirModalAbrir();
  else abrirModalCerrar();
});

function renderTurnosHist() {
  const box = $("turnosHist");
  const cerrados = turnosPeriodo.filter((t) => t.estado === "cerrado");
  if (!cerrados.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h2>Cierres de caja <span class="mut">(${cerrados.length})</span>${ayuda("Aquí queda guardado cada turno que ya cerró: cuánta plata debía haber, cuánta contaron, si cuadró y cuánto se entregó al dueño o encargado.")}</h2>
    <div class="wrap"><table>
      <thead><tr><th>Turno</th><th class="hide-sm">Horario</th><th class="r">Debía haber</th><th class="r">Contaron</th><th>Resultado</th><th class="r hide-sm">Entregado</th></tr></thead>
      <tbody>${cerrados
        .map((t) => {
          const prog = horarioDeTurno(t);
          return `<tr>
        <td><div class="nm">${esc(t.nombre)}<small>${prog ? esc(prog) + " · " : ""}${vista === "mes" ? fmtDia(t.abiertoMs) + " · " : ""}${esc(t.cerradoPor || t.abiertoPor || "")}${t.nota ? " · " + esc(t.nota) : ""}</small></div></td>
        <td class="hide-sm">${horaLima(t.abiertoMs)} – ${t.cerradoMs ? horaLima(t.cerradoMs) : "—"}</td>
        <td class="r">${money(t.esperado)}</td>
        <td class="r">${money(t.contado)}</td>
        <td>${resultadoHtml(Number(t.diferencia) || 0, false)}</td>
        <td class="r hide-sm">${money(t.entregado)}</td>
      </tr>`;
        })
        .join("")}</tbody>
    </table></div>`;
}

/* ---------- Abrir caja ---------- */
let aTurnoSel = 0;
let ultimoCerrado = null;
async function abrirModalAbrir() {
  if (!usaTurnos()) return;
  if (turnoAbierto) return toast("Ya hay una caja abierta.");
  ultimoCerrado = null;
  try {
    const s = await getDocs(query(col(TURNOS_COL), orderBy("cerradoMs", "desc"), limit(1)));
    if (!s.empty) ultimoCerrado = { id: s.docs[0].id, ...s.docs[0].data() };
  } catch (e) {
    console.warn(e);
  }
  // Sugiere el turno que sigue al último que se cerró hoy
  const lista = cfgCaja.turnos;
  aTurnoSel = 0;
  if (ultimoCerrado && ymdLima(ultimoCerrado.abiertoMs) === limaHoy()) {
    const i = lista.findIndex((t) => t.nombre === ultimoCerrado.nombre);
    if (i >= 0 && i < lista.length - 1) aTurnoSel = i + 1;
  }
  pintarAbrir();
  openMd("mdAbrir");
  if (!$("aMonto").readOnly) setTimeout(() => $("aMonto").focus(), 200);
}
function pintarAbrir() {
  const lista = cfgCaja.turnos;
  $("aTurnosWrap").hidden = lista.length < 2;
  $("aTurnos").innerHTML = lista
    .map((t, i) => {
      const h = horarioTurno(t);
      return `<button type="button" data-i="${i}" class="${i === aTurnoSel ? "on" : ""}"><span>${esc(t.nombre)}</span>${h ? `<small>${esc(h)}</small>` : ""}</button>`;
    })
    .join("");
  const t = lista[aTurnoSel];
  const inp = $("aMonto");
  const fijo = t.montoFijo !== null && t.montoFijo !== undefined && t.montoFijo !== "";
  if (fijo) {
    inp.value = num(t.montoFijo).toFixed(2);
    inp.readOnly = true;
    $("aHint").textContent = `El turno ${t.nombre} siempre empieza con ${money(num(t.montoFijo))}.`;
  } else {
    inp.readOnly = false;
    const quedo = num(ultimoCerrado?.quedoEnCaja);
    inp.value = quedo > 0 ? quedo.toFixed(2) : "";
    $("aHint").textContent =
      quedo > 0
        ? `El turno anterior dejó ${money(quedo)} en el cajón. Cuéntalo y corrige si es distinto.`
        : "Cuenta la plata del cajón y escríbela (pon 0 si está vacío).";
  }
}
$("aTurnos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (!b) return;
  aTurnoSel = +b.dataset.i;
  pintarAbrir();
});
$("btnConfirmAbrir").addEventListener("click", async () => {
  const t = cfgCaja?.turnos?.[aTurnoSel];
  if (!t) return;
  if ($("aMonto").value === "") return toast("Escribe con cuánta plata empieza (0 si no hay).");
  const monto = r2(num($("aMonto").value));
  const btn = $("btnConfirmAbrir");
  btn.disabled = true;
  try {
    const s = await getDocs(query(col(TURNOS_COL), where("estado", "==", "abierto")));
    if (!s.empty) {
      closeMd("mdAbrir");
      return toast("Ya hay una caja abierta.");
    }
    await addDoc(col(TURNOS_COL), {
      nombre: t.nombre,
      horaInicio: t.inicio || "",
      horaFin: t.fin || "",
      estado: "abierto",
      abiertoMs: Date.now(),
      abiertoPor: quienSoy(),
      montoApertura: monto,
      creado: serverTimestamp(),
    });
    closeMd("mdAbrir");
    if (vista !== "dia" || diaSel !== limaHoy()) irADia(limaHoy());
    toast("✓ Caja abierta");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo abrir la caja.");
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Cerrar caja ---------- */
let entregaTocada = false;
function abrirModalCerrar() {
  if (!turnoAbierto) return;
  if (!pedidosTurnoOk) return toast("Espera un momento, cargando las ventas del turno…");
  entregaTocada = false;
  const hor = horarioDeTurno(turnoAbierto);
  $("cTitulo").textContent = `Cerrar caja · Turno ${turnoAbierto.nombre}${hor ? " (" + hor + ")" : ""}`;
  $("cContado").value = "";
  $("cEntrega").value = "";
  $("cNota").value = "";
  pintarCierre();
  openMd("mdCerrar");
  setTimeout(() => $("cContado").focus(), 200);
}
function pintarCierre() {
  if (!turnoAbierto) return;
  const k = cuentaTurno(turnoAbierto);
  $("cResumen").innerHTML = filasTurnoHtml(k);
  const c = $("cContado").value;
  $("cResultado").innerHTML = c === "" ? "" : resultadoHtml(r2(num(c) - k.esperado), true);
  if (!entregaTocada) $("cEntrega").value = c;
}
$("cContado").addEventListener("input", pintarCierre);
$("cEntrega").addEventListener("input", () => (entregaTocada = true));
$("btnConfirmCerrar").addEventListener("click", async () => {
  const t = turnoAbierto;
  if (!t) return closeMd("mdCerrar");
  if ($("cContado").value === "") return toast("Escribe cuánta plata contaste.");
  const contado = r2(num($("cContado").value));
  const entrega = r2(num($("cEntrega").value));
  if (entrega > contado) return toast("No se puede entregar más de lo que hay en el cajón.");
  const k = cuentaTurno(t);
  const dif = r2(contado - k.esperado);
  if (Math.abs(dif) >= 0.005 && !confirm(`${dif < 0 ? "Falta" : "Sobra"} ${money(Math.abs(dif))}.\n¿Cerrar la caja igual?`)) return;
  const btn = $("btnConfirmCerrar");
  btn.disabled = true;
  try {
    await updateDoc(docRef(TURNOS_COL, t.id), {
      estado: "cerrado",
      cerradoMs: Date.now(),
      cerradoPor: quienSoy(),
      ventasEfectivo: r2(k.ventasEf),
      ventasOtros: r2(k.otrosMedios),
      gastos: r2(k.gastos),
      retiros: r2(k.retiros),
      esperado: k.esperado,
      contado,
      diferencia: dif,
      entregado: entrega,
      quedoEnCaja: r2(contado - entrega),
      nota: $("cNota").value.trim(),
    });
    closeMd("mdCerrar");
    toast(Math.abs(dif) < 0.005 ? "✓ Caja cerrada. ¡Cuadró exacto!" : "✓ Caja cerrada");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo cerrar la caja.");
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Configurar turnos (solo admin) ---------- */
let cfgFilas = [];
const CFG_DEFAULT_HORAS = [
  ["07:00", "15:00"],
  ["15:00", "23:00"],
  ["23:00", "07:00"],
];
function abrirCfg() {
  const base = cfgCaja?.turnos?.length
    ? cfgCaja.turnos
    : [
        { nombre: "Mañana", montoFijo: null, inicio: "07:00", fin: "15:00" },
        { nombre: "Tarde", montoFijo: null, inicio: "15:00", fin: "23:00" },
      ];
  cfgFilas = base.map((t) => ({
    nombre: t.nombre || "",
    inicio: t.inicio || "",
    fin: t.fin || "",
    monto: t.montoFijo === null || t.montoFijo === undefined || t.montoFijo === "" ? "" : String(t.montoFijo),
  }));
  $("cfgUsa").checked = !!cfgCaja?.usaTurnos;
  pintarCfg();
  openMd("mdCfg");
}
function pintarCfg() {
  $("cfgBox").hidden = !$("cfgUsa").checked;
  $("cfgLista").innerHTML = cfgFilas
    .map(
      (f, i) => `<div class="cfg-row" data-i="${i}">
      <label class="cf n">Nombre del turno
        <input data-k="nombre" value="${esc(f.nombre)}" placeholder="Ej: Mañana" autocomplete="off"></label>
      <button class="x" type="button" data-quitar title="Quitar">✕</button>
      <label class="cf">Empieza a las
        <input data-k="inicio" type="time" value="${esc(f.inicio)}"></label>
      <label class="cf">Termina a las
        <input data-k="fin" type="time" value="${esc(f.fin)}"></label>
      <label class="cf">Caja inicial (S/)
        <input data-k="monto" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.monto)}" placeholder="Lo escribe"></label>
    </div>`,
    )
    .join("");
}
$("btnCfgCaja").addEventListener("click", abrirCfg);
$("cfgUsa").addEventListener("change", pintarCfg);
$("cfgLista").addEventListener("input", (e) => {
  const row = e.target.closest("[data-i]");
  if (row && e.target.dataset.k) cfgFilas[+row.dataset.i][e.target.dataset.k] = e.target.value;
});
$("cfgLista").addEventListener("click", (e) => {
  if (!e.target.closest("[data-quitar]")) return;
  cfgFilas.splice(+e.target.closest("[data-i]").dataset.i, 1);
  pintarCfg();
});
$("cfgAdd").addEventListener("click", () => {
  if (cfgFilas.length >= 6) return toast("Máximo 6 turnos.");
  const [ini, fin] = CFG_DEFAULT_HORAS[cfgFilas.length] || ["", ""];
  cfgFilas.push({ nombre: ["Mañana", "Tarde", "Noche"][cfgFilas.length] || "", inicio: ini, fin, monto: "" });
  pintarCfg();
});
$("cfgGuardar").addEventListener("click", async () => {
  const usa = $("cfgUsa").checked;
  const turnos = cfgFilas
    .map((f) => ({
      nombre: f.nombre.trim(),
      montoFijo: f.monto === "" ? null : r2(num(f.monto)),
      inicio: f.inicio || "",
      fin: f.fin || "",
    }))
    .filter((f) => f.nombre);
  if (usa && !turnos.length) return toast("Agrega al menos un turno.");
  if (usa && turnos.some((t) => !!t.inicio !== !!t.fin)) return toast("Pon la hora en que empieza y en que termina el turno (o deja las dos vacías).");
  const nombres = turnos.map((t) => t.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) return toast("Hay dos turnos con el mismo nombre.");
  if (!usa && turnoAbierto && !confirm("Hay una caja abierta. Podrás cerrarla igual, pero no se abrirán más turnos. ¿Continuar?")) return;
  const btn = $("cfgGuardar");
  btn.disabled = true;
  try {
    await setDoc(
      docRef(CFG_COL, CFG_DOC),
      { usaTurnos: usa, turnos: usa ? turnos : cfgCaja?.turnos || [], actualizado: serverTimestamp() },
      { merge: true },
    );
    closeMd("mdCfg");
    toast(usa ? "✓ Turnos guardados" : "✓ Turnos desactivados");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
  }
});

/* ══════════ CUADRE DEL DÍA / MES (tarjeta de arriba) ══════════
   Se lee de arriba hacia abajo:
   1) Cuánto vendiste y con qué te pagaron
   2) Cuánto salió (gastos del negocio, retiros)
   3) Cuánto debe haber en efectivo en el cajón                      */
const fila = (label, valor, cls = "") => `<div class="tc-r ${cls}"><span>${label}</span><b>${valor}</b></div>`;

function datosCuadre() {
  const delPeriodo = gastosAll.filter(enPeriodo);
  const v = cuadreVentas(pedidosPeriodo);
  const g = cuadreGastos(delPeriodo);
  const inicio = usaTurnos() ? 0 : g.saldoInicial;
  return { delPeriodo, v, g, inicio, c: cuadreCaja(v, g, inicio) };
}

function renderCaja() {
  const cu = cuando();
  const { v, g, inicio, c } = datosCuadre();
  const ok = ventasEstado === "ok";
  const sinDato = ventasEstado === "cargando" ? "…" : "—";
  const viendoHoy = vista === "dia" && diaSel === limaHoy();

  /* Número grande */
  $("kLblQueda").textContent = `Te quedó ${cu}`;
  const q = $("kMesQueda");
  q.textContent = ok ? money(c.queda) : sinDato;
  q.style.color = ok && c.queda < 0 ? "var(--bad)" : "";
  $("kSubQueda").textContent = ok
    ? `Vendiste ${money(v.total)} − gastó el negocio ${money(g.negocio)}`
    : "lo que vendiste menos lo que gastó el negocio";

  /* 1) Ventas */
  const ventasRows = ok
    ? v.porMetodo.length
      ? v.porMetodo
          .map((m) => {
            const [ico, lab] = METODOS_INFO[m.clave] || ["💳", m.clave];
            return fila(`${ico} ${esc(lab)} <small>· ${m.cant}</small>`, money(m.monto), "sub");
          })
          .join("")
      : `<p class="tc-note">Todavía no hay ventas entregadas.</p>`
    : `<p class="tc-note">Cargando ventas…</p>`;
  const cVentas = `<div class="cd-c"><h4>① Vendiste ${esc(cu)}${ayuda("Todo lo que vendiste (pedidos entregados), separado por la forma de pago: efectivo, Yape, Plin o tarjeta. El número pequeño al lado es la cantidad de pedidos.")}</h4><div class="tc-rows">
      ${ventasRows}
      ${fila("Total vendido", ok ? money(v.total) : sinDato, "tot")}
    </div></div>`;

  /* 2) Gastos */
  const cGastos = `<div class="cd-c"><h4>② Salió ${esc(cu)}${ayuda("La plata que salió del negocio: gastos pagados con la caja y retiros del dueño. Lo que pagaste tú con tu propia plata se muestra aparte y no baja la caja.")}</h4><div class="tc-rows">
      ${fila("Gastos pagados por el negocio", money(g.negocio))}
      ${g.retiros ? fila("Retiros del dueño", money(g.retiros)) : ""}
      ${g.bolsillo ? fila("Pagado por ti con tu plata <small>(no baja la caja)</small>", money(g.bolsillo), "sub") : ""}
      ${fila("Gastó el negocio", money(g.negocio), "tot")}
    </div></div>`;

  /* 3) Efectivo */
  let efRows = "";
  if (inicio) efRows += fila("Empezó la caja con", money(inicio));
  efRows += fila("+ Ventas en efectivo", ok ? money(v.efectivo) : sinDato);
  efRows += fila("− Gastos del negocio", money(g.negocio));
  if (g.retiros) efRows += fila("− Retiros", money(g.retiros));
  efRows += fila(viendoHoy && turnoAbierto ? "Efectivo del día" : "Efectivo", ok ? money(c.efectivoNeto) : sinDato, "tot");
  let extra = "";
  if (viendoHoy && turnoAbierto && pedidosTurnoOk) {
    const k = cuentaTurno(turnoAbierto);
    extra = fila(`En el cajón ahora · Turno ${esc(turnoAbierto.nombre)}`, money(k.esperado), "tot cajon");
  }
  const nota = ok && v.otros > 0 ? `<p class="tc-note">Yape, Plin y tarjeta (${money(v.otros)}) no están en el cajón.</p>` : "";
  const cEfectivo = `<div class="cd-c"><h4>③ Efectivo en el cajón${ayuda("Cuánta plata en efectivo debería haber físicamente: lo que empezó la caja + ventas en efectivo − gastos del negocio − retiros. Yape, Plin y tarjeta no entran aquí.")}</h4><div class="tc-rows">${efRows}${extra}</div>${nota}</div>`;

  $("cdGrid").innerHTML = cVentas + cGastos + cEfectivo;
  $("subMes").textContent = vista === "dia" ? `Día: ${diaLargo(diaSel)}` : `Mostrando ${mesLabel(mesSel)}`;
}

/* ══════════ HISTORIAL ══════════ */
const tipoLabel = (g) => {
  if (g.tipo === "retiro") return "Retiro del dueño";
  if (g.tipo === "saldo_inicial") return "Empezó la caja con";
  return g.tipo === "compra_insumo" ? "Insumos" : g.categoria || "Gasto";
};
function gastosFiltrados() {
  const q = $("qGas").value.trim().toLowerCase();
  const or = $("fOrigen").value;
  return gastosAll
    .filter(enPeriodo)
    .filter((g) => {
      if (fTipo === "todos") return true;
      if (fTipo === "caja") return g.tipo === "retiro" || g.tipo === "saldo_inicial";
      return g.tipo === fTipo;
    })
    .filter((g) => or === "todos" || !esReal(g) || g.origen === or)
    .filter((g) => !q || (g.nombre || "").toLowerCase().includes(q) || tipoLabel(g).toLowerCase().includes(q))
    .sort((a, b) => (msDeGasto(b) || 0) - (msDeGasto(a) || 0));
}

/* Cuadre de cada día (solo en la vista "Por mes") */
function cuadrePorDia() {
  const dias = {};
  pedidosPeriodo.forEach((p) => {
    const d = ymdLima(p.ms);
    (dias[d] ??= { v: 0, g: 0 }).v += p.total;
  });
  gastosAll
    .filter((g) => enPeriodo(g) && esReal(g) && g.descuenta_caja)
    .forEach((g) => {
      const d = diaG(g);
      if (d) (dias[d] ??= { v: 0, g: 0 }).g += num(g.monto);
    });
  return { dias, ks: Object.keys(dias).sort().reverse() };
}
function renderCuadreDias() {
  const box = $("cuadreBox");
  if (vista !== "mes") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const { dias, ks } = cuadrePorDia();
  const sinVentas = ventasEstado !== "ok";
  const tv = ks.reduce((s, k) => s + dias[k].v, 0);
  const tg = ks.reduce((s, k) => s + dias[k].g, 0);
  const rojo = (n) => (n < 0 ? ' style="color:var(--bad)"' : "");
  box.innerHTML = `<h2>Cuadre por día <span class="mut">(toca un día para verlo)</span>${ayuda("Resumen de cada día del mes: cuánto vendiste, cuánto gastó el negocio y cuánto te quedó. Toca un día para ver su detalle completo.")}</h2>
    <div class="wrap"><table>
      <thead><tr><th>Día</th><th class="r">Vendiste</th><th class="r">Gastó el negocio</th><th class="r">Te quedó</th></tr></thead>
      <tbody>${
        ks.length
          ? ks
              .map((k) => {
                const x = dias[k],
                  q = x.v - x.g;
                return `<tr data-dia="${k}"><td>${esc(diaCorto(k))}</td><td class="r">${sinVentas ? "—" : money(x.v)}</td><td class="r">${money(x.g)}</td><td class="r"><span class="money"${rojo(q)}>${sinVentas ? "—" : money(q)}</span></td></tr>`;
              })
              .join("")
          : `<tr><td colspan="4"><div class="empty">Aún no hay movimiento en este mes.</div></td></tr>`
      }</tbody>
      ${ks.length ? `<tfoot><tr><td>Total del mes</td><td class="r">${sinVentas ? "—" : money(tv)}</td><td class="r">${money(tg)}</td><td class="r"><span class="money"${rojo(tv - tg)}>${sinVentas ? "—" : money(tv - tg)}</span></td></tr></tfoot>` : ""}
    </table></div>`;
  box.hidden = false;
}
$("cuadreBox").addEventListener("click", (e) => {
  const tr = e.target.closest("[data-dia]");
  if (tr) irADia(tr.dataset.dia);
});

function renderGastos() {
  const cu = cuando();
  renderCuadreDias();

  $("guide").hidden = gastosAll.length > 0;
  const lista = gastosFiltrados();
  $("gastoMesTitulo").textContent = vista === "dia" ? (cu.startsWith("el ") ? cu.slice(3) : cu) : mesLabel(mesSel);
  $("gastoCount").textContent = `(${lista.length})`;
  $("listGastos").innerHTML = lista.length
    ? lista
        .map((g) => {
          const det = g.cantidad ? `${g.cantidad} ${g.unidad === "unid" ? "unid" : g.unidad || ""}` : "";
          const turno = nombreTurno(g.turnoId);
          const badge =
            g.tipo === "retiro"
              ? `<span class="badge dueno">Sacó el dueño</span>`
              : g.tipo === "saldo_inicial"
                ? `<span class="badge neg">Entró a caja</span>`
                : `<span class="badge ${g.es_inversion ? "dueno" : "neg"}">${g.es_inversion ? "Lo pagué yo" : "Negocio"}</span>`;
          const ms = msDeGasto(g);
          return `<tr data-gid="${g.id}">
        <td>${isFinite(ms) ? fmtDia(ms) : "—"}</td>
        <td><div class="nm">${esc(g.nombre)}<small>${det || esc(tipoLabel(g))}${turno ? " · Turno " + esc(turno) : ""}${g.insumoId ? " · desde Insumos" : ""}</small></div></td>
        <td class="hide-sm">${esc(tipoLabel(g))}</td>
        <td class="hide-sm">${badge}</td>
        <td class="r"><span class="money ${g.tipo === "saldo_inicial" ? "plus" : ""}">${g.tipo === "saldo_inicial" ? "+ " : ""}${money(num(g.monto))}</span></td>
        <td class="r"><button class="x" data-edit title="Editar">✎</button><button class="x" data-del title="Eliminar">✕</button></td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">No hay nada con estos filtros. Toca “+ Anotar gasto”.</div></td></tr>`;
  if (chartsOpen) renderCharts();
}

$("fTipo").addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  fTipo = b.dataset.f;
  document.querySelectorAll("#fTipo button").forEach((x) => x.classList.toggle("on", x === b));
  renderGastos();
});
$("fOrigen").addEventListener("change", renderGastos);
$("qGas").addEventListener("input", renderGastos);

$("listGastos").addEventListener("click", async (e) => {
  const tr = e.target.closest("[data-gid]");
  if (!tr) return;
  const g = gastosAll.find((x) => x.id === tr.dataset.gid);
  if (!g) return;
  if (e.target.closest("[data-edit]")) return abrirGasto(g);
  if (e.target.closest("[data-del]")) {
    if (!confirm(`¿Eliminar “${g.nombre}” (${money(num(g.monto))})?`)) return;
    try {
      await deleteDoc(docRef(GASTOS_COL, g.id));
      // Si vino de Insumos, el botón "Pasar a gastos" vuelve a aparecer en el insumo
      if (g.insumoId) {
        try {
          await updateDoc(docRef("insumos", g.insumoId), { gastoId: null });
        } catch (err) {
          console.warn("No se pudo desvincular el insumo", err);
        }
      }
      toast("Eliminado.");
    } catch (err) {
      console.error(err);
      toast("No se pudo eliminar.");
    }
  }
});

/* ══════════ EXPORTAR (CSV · Excel · PDF) ══════════ */
function contextoExport() {
  const { delPeriodo, v, g, inicio, c } = datosCuadre();
  const origenTxt = (x) =>
    x.tipo === "retiro" ? "Retiro del dueño (sale de la caja)" : x.tipo === "saldo_inicial" ? "Entró a la caja" : x.es_inversion ? "El dueño, con su plata" : "El negocio (sale de la caja)";
  const gastos = [...delPeriodo]
    .sort((a, b) => (msDeGasto(a) || 0) - (msDeGasto(b) || 0))
    .map((x) => {
      const ms = msDeGasto(x);
      return {
        fecha: isFinite(ms) ? diaLargo(ymdLima(ms)) : "",
        hora: isFinite(ms) && x.fechaMs ? horaLima(ms) : "",
        nombre: x.nombre || "",
        tipo: tipoLabel(x),
        quien: origenTxt(x),
        turno: nombreTurno(x.turnoId),
        monto: num(x.monto),
        por: x.anotadoPor || "",
      };
    });
  const turnos = turnosPeriodo
    .filter((t) => t.estado === "cerrado")
    .map((t) => ({
      fecha: diaLargo(ymdLima(t.abiertoMs)),
      turno: t.nombre,
      horario: `${horaLima(t.abiertoMs)} – ${t.cerradoMs ? horaLima(t.cerradoMs) : ""}`,
      esperado: t.esperado,
      contado: t.contado,
      diferencia: t.diferencia,
      entregado: t.entregado,
      por: t.cerradoPor || t.abiertoPor || "",
      nota: t.nota || "",
    }));
  let dias = [];
  if (vista === "mes") {
    const r = cuadrePorDia();
    dias = r.ks
      .slice()
      .reverse()
      .map((k) => ({ dia: diaLargo(k), vendiste: r.dias[k].v, gasto: r.dias[k].g, quedo: r2(r.dias[k].v - r.dias[k].g) }));
  }
  return {
    tienda: sessionStorage.getItem("nombreTienda") || "",
    periodo: vista === "dia" ? diaLargo(diaSel) : mesLabel(mesSel),
    archivo: vista === "dia" ? diaSel : mesSel,
    vista,
    ventas: v,
    gastosRes: g,
    cuadre: c,
    inicio,
    gastos,
    turnos,
    dias,
  };
}
const btnExport = $("btnExport");
const exportMenu = $("exportMenu");
btnExport.addEventListener("click", (e) => {
  e.stopPropagation();
  exportMenu.hidden = !exportMenu.hidden;
});
document.addEventListener("click", () => (exportMenu.hidden = true));
exportMenu.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-fmt]");
  if (!b) return;
  exportMenu.hidden = true;
  if (ventasEstado !== "ok") return toast("Espera a que carguen las ventas para exportar.");
  try {
    toast("Preparando exportación…");
    await exportarCaja(b.dataset.fmt, contextoExport());
    toast("✓ Exportado");
  } catch (err) {
    console.error(err);
    toast("No se pudo exportar. Revisa tu conexión.");
  }
});

/* ══════════ GRÁFICOS (solo se dibujan al pulsar el botón) ══════════ */
function barsH(items, cls = "") {
  const max = Math.max(...items.map((i) => i.v), 1);
  return items
    .map(
      (i) => `<div class="hb"><span title="${esc(i.l)}">${esc(i.l)}</span>
      <div class="bar"><i class="${i.cls ?? cls}" style="width:${(Math.max(i.v, 0) / max) * 100}%"></i></div><b>${money(i.v)}</b></div>`,
    )
    .join("");
}
function renderCharts() {
  const box = $("chartsBox");
  const delPeriodo = gastosAll.filter((g) => enPeriodo(g) && esReal(g));
  if (!delPeriodo.length) {
    box.innerHTML = `<div class="chart"><h4>Sin datos</h4><div class="empty">Aún no hay gastos ${esc(cuando())} para graficar.</div></div>`;
    return;
  }
  const porTipo = {};
  delPeriodo.forEach((g) => (porTipo[tipoLabel(g)] = (porTipo[tipoLabel(g)] || 0) + num(g.monto)));
  const tipos = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([l, v]) => ({ l, v }));

  let porDiaHtml = "";
  if (vista === "mes") {
    const [y, m] = mesSel.split("-").map(Number);
    const dias = new Date(y, m, 0).getDate();
    const porDia = Array(dias).fill(0);
    delPeriodo.forEach((g) => {
      const d = diaG(g);
      if (d) porDia[+d.slice(8, 10) - 1] += num(g.monto);
    });
    const maxD = Math.max(...porDia, 1);
    porDiaHtml = `<div class="chart"><h4>Gasto por día${ayuda("Cada barra es un día del mes. Mientras más alta, más plata se gastó ese día. Pasa el dedo o el mouse sobre una barra para ver el monto.")}</h4>
      <div class="vb">${porDia.map((v, i) => `<div title="Día ${i + 1}: ${money(v)}" style="height:${(v / maxD) * 100}%"></div>`).join("")}</div>
      <div class="vlabels"><span>1</span><span>${Math.ceil(dias / 2)}</span><span>${dias}</span></div></div>`;
  }

  const vP = ventasEstado === "ok" ? sumaT(pedidosPeriodo) : undefined;
  const negP = suma(delPeriodo.filter((g) => g.descuenta_caja));
  const cuadre =
    vP === undefined
      ? ""
      : `<div class="chart"><h4>Ventas vs. gastos del negocio${ayuda("Compara lo que vendiste con lo que gastó el negocio. La última barra es la diferencia: lo que te quedó (o lo que te faltó si gastaste más de lo que vendiste).")}</h4>${barsH([
          { l: "Vendiste", v: vP, cls: "alt" },
          { l: "Gastó el negocio", v: negP },
          { l: vP - negP >= 0 ? "Te quedó" : "Te faltó", v: Math.abs(vP - negP), cls: vP - negP >= 0 ? "alt" : "bad" },
        ])}</div>`;
  const top = [...delPeriodo]
    .sort((a, b) => num(b.monto) - num(a.monto))
    .slice(0, 5)
    .map((g) => ({ l: g.nombre, v: num(g.monto) }));

  box.innerHTML = `
    ${cuadre}
    <div class="chart"><h4>¿En qué se va la plata?${ayuda("Muestra tus gastos agrupados por tipo (insumos, servicios, transporte…) del más grande al más pequeño, para que veas dónde se te va más plata.")}</h4>${barsH(tipos)}</div>
    ${porDiaHtml}
    <div class="chart"><h4>${vista === "dia" ? "Los gastos más grandes" : "Los 5 gastos más grandes"}${ayuda("Los gastos individuales de mayor monto del período. Sirve para detectar rápido qué compras pesan más.")}</h4>${barsH(top)}</div>`;
}
$("btnCharts").addEventListener("click", () => {
  chartsOpen = !chartsOpen;
  $("chartsBox").hidden = !chartsOpen;
  $("btnCharts").textContent = chartsOpen ? "✕ Ocultar gráficos" : "📊 Ver gráficos";
  if (chartsOpen) renderCharts();
  else $("chartsBox").innerHTML = "";
});

/* ══════════ ANOTAR / EDITAR GASTO ══════════ */
const esEspecial = () => ["__retiro", "__saldo"].includes($("gCat").value);
const origenSel = () => document.querySelector('input[name="origenG"]:checked').value;
/* ¿A qué turno pertenece un gasto nuevo de esta fecha? */
const turnoParaFecha = (fecha) =>
  turnoAbierto && fecha === limaHoy() && fecha >= ymdLima(turnoAbierto.abiertoMs) ? turnoAbierto.id : null;

function actualizarFormGasto() {
  const esp = esEspecial();
  $("gOrigenBox").hidden = esp;
  const av = $("gAviso");
  av.hidden = true;
  // Aviso solo si hay caja abierta y el gasto sale del cajón de este turno
  const previo = editId ? gastosAll.find((x) => x.id === editId) : null;
  const turnoId = previo ? previo.turnoId : turnoParaFecha($("gFecha").value);
  if (!turnoAbierto || turnoId !== turnoAbierto.id || !pedidosTurnoOk) return;
  const baja = $("gCat").value !== "__saldo" && (esp || origenSel() === "negocio");
  if (!baja) return;
  const monto = num($("gMonto").value);
  const yaContado = previo && previo.turnoId === turnoAbierto.id && (previo.descuenta_caja || previo.tipo === "retiro") ? num(previo.monto) : 0;
  const disponible = cuentaTurno(turnoAbierto).esperado + yaContado;
  if (monto > disponible) {
    av.hidden = false;
    av.textContent = `En el cajón debería haber ${money(disponible)} y esto es de ${money(monto)}. Si lo pagaste tú, elige “Lo pagué yo, con mi plata”.`;
  }
}
$("gMonto").addEventListener("input", actualizarFormGasto);
$("gFecha").addEventListener("change", actualizarFormGasto);
$("gCat").addEventListener("change", actualizarFormGasto);
document.querySelectorAll('input[name="origenG"]').forEach((r) => r.addEventListener("change", actualizarFormGasto));

function abrirGasto(g = null) {
  editId = g?.id || null;
  $("gTitulo").textContent = g ? "Editar" : "Anotar gasto";
  $("gNombre").value = g?.nombre || "";
  $("gMonto").value = g ? g.monto : "";
  const ms = g ? msDeGasto(g) : NaN;
  $("gFecha").value = isFinite(ms) ? ymdLima(ms) : fechaDefault();
  $("gFecha").max = limaHoy();
  let cat = "Insumos";
  if (g?.tipo === "retiro") cat = "__retiro";
  else if (g?.tipo === "saldo_inicial") cat = "__saldo";
  else if (g?.tipo === "gasto_general") cat = g.categoria || "Otro";
  const sel = $("gCat");
  // Con turnos, la plata inicial se anota al abrir caja, no aquí
  const optSaldo = sel.querySelector('option[value="__saldo"]');
  const verSaldo = !usaTurnos() || g?.tipo === "saldo_inicial";
  optSaldo.hidden = !verSaldo;
  optSaldo.disabled = !verSaldo;
  if (![...sel.options].some((o) => o.value === cat)) sel.add(new Option(cat, cat));
  sel.value = cat;
  document.querySelector(`input[name="origenG"][value="${g?.es_inversion ? "bolsillo" : "negocio"}"]`).checked = true;
  actualizarFormGasto();
  openMd("mdGasto");
  setTimeout(() => $("gNombre").focus(), 200);
}
$("btnNuevoGasto").addEventListener("click", () => abrirGasto(null));

$("btnGuardarGasto").addEventListener("click", async () => {
  const nombre = $("gNombre").value.trim();
  const monto = r2(num($("gMonto").value));
  const fecha = $("gFecha").value;
  const cat = $("gCat").value;
  if (!nombre) return toast("Escribe qué fue.");
  if (!monto) return toast("Escribe el monto.");
  if (!fecha) return toast("Elige la fecha.");
  if (fecha > limaHoy()) return toast("La fecha no puede ser futura.");

  let datos;
  if (cat === "__retiro")
    datos = { tipo: "retiro", categoria: "Retiro del dueño", origen: "negocio", descuenta_caja: true, es_inversion: false };
  else if (cat === "__saldo")
    datos = { tipo: "saldo_inicial", categoria: "Saldo inicial", origen: "negocio", descuenta_caja: false, es_inversion: false };
  else {
    const origen = origenSel();
    datos = {
      tipo: cat === "Insumos" ? "compra_insumo" : "gasto_general",
      categoria: cat,
      origen,
      descuenta_caja: origen === "negocio",
      es_inversion: origen === "bolsillo",
    };
  }
  const previo = editId ? gastosAll.find((x) => x.id === editId) : null;
  const turnoId = previo ? previo.turnoId || null : turnoParaFecha(fecha);

  if (!$("gAviso").hidden && !confirm(`${$("gAviso").textContent}\n\n¿Anotarlo igual?`)) return;

  // Si se edita sin cambiar el día, se conserva la hora original
  const msPrevio = previo ? msDeGasto(previo) : NaN;
  const fechaMs = isFinite(msPrevio) && ymdLima(msPrevio) === fecha ? msPrevio : fechaMsDe(fecha);

  const btn = $("btnGuardarGasto");
  btn.disabled = true;
  try {
    const cuerpo = { ...datos, nombre, monto, mes: fecha.slice(0, 7), fechaMs, turnoId };
    if (editId) {
      await updateDoc(docRef(GASTOS_COL, editId), cuerpo);
      // Si vino de Insumos, se actualiza también el monto y la fecha del insumo
      if (previo?.insumoId) {
        try {
          await updateDoc(docRef("insumos", previo.insumoId), {
            precio: monto,
            precioEn: Timestamp.fromMillis(fechaMs),
          });
        } catch (e) {
          console.warn("No se pudo sincronizar el insumo", e);
        }
      }
    } else await addDoc(col(GASTOS_COL), { ...cuerpo, fecha: serverTimestamp(), anotadoPor: quienSoy() });
    closeMd("mdGasto");
    // Lleva la vista al día/mes del gasto para que se vea lo que se anotó
    if (vista === "dia") diaSel = fecha;
    else mesSel = fecha.slice(0, 7);
    toast(editId ? "✓ Cambios guardados" : "✓ Anotado");
    refrescar();
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
  }
});

/* ══════════ ARRANQUE ══════════ */
function start() {
  if (started || !tiendaId || !localidad) return;
  started = true;

  onSnapshot(
    col(GASTOS_COL),
    (snap) => {
      gastosAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTodo();
    },
    (e) => {
      console.error(e);
      toast("Error leyendo los gastos.");
    },
  );

  // Turnos: solo si existe config/caja. Si no existe, la página funciona sin turnos.
  onSnapshot(
    docRef(CFG_COL, CFG_DOC),
    (d) => {
      cfgCaja = d.exists() ? d.data() : null;
      if (cfgCaja) escucharTurnoAbierto();
      turnosKey = "";
      escucharTurnosPeriodo();
      renderTodo();
    },
    (e) => {
      console.warn("Sin configuración de caja (se trabaja sin turnos)", e);
      cfgCaja = null;
      renderTodo();
    },
  );

  escucharVentas();
}

sincronizarControles();
renderTodo();
start();
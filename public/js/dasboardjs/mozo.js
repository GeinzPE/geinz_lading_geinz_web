import { db } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc, tiendaSubCol } from "../rutas/rutas.js";
import {
  abrirModalComprobante,
  armarSolicitud,
  htmlEstadoCliente,
  esc as escCm,
} from "../dasboardjs/comprobante_mesa.js";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  arrayUnion,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { elegirFotoMozo } from "./mozo_camara.js";
/* ══════════════ Helpers de DOM (nunca revientan si falta un id) ══════════════ */
const $ = (id) => document.getElementById(id);
function on(id, ev, fn) {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
  else console.warn(`[mozo] falta #${id} en el HTML`);
}
function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

/* ══════════════ Identificación del negocio ══════════════ */
let tiendaId = null;
let localidad = null;
// true cuando el panel está embebido dentro del dashboard del dueño
const esAdmin =
  window.parent !== window && !!sessionStorage.getItem("tiendaId");

const mesasColRef = () => tiendaSubCol(localidad, "tiendas", tiendaId, "mesas");
const gruposColRef = () =>
  tiendaSubCol(localidad, "tiendas", tiendaId, "grupos_mesas");
const pedidosColRef = () =>
  tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
const llamadosColRef = () =>
  tiendaSubCol(localidad, "tiendas", tiendaId, "llamados_mesa");
const mozosColRef = () => tiendaSubCol(localidad, "tiendas", tiendaId, "mozos");
const productosColRef = () =>
  tiendaSubCol(localidad, "tiendas", tiendaId, "productos");

/* ══════════════ Utilidades ══════════════ */
function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function fmtMoney(n) {
  return "S/ " + Number(n || 0).toFixed(2);
}
function estItem(it, ped) {
  return (
    it.estadoItem ||
    (["en_preparacion", "entregado"].includes(ped?.estadoMesa)
      ? ped.estadoMesa
      : "aceptado")
  );
}
function derivarEstadoMesa(productos, fb) {
  const e = (productos || []).map((i) => i.estadoItem).filter(Boolean);
  if (!e.length) return fb || null;
  if (e.includes("aceptado")) return "aceptado";
  if (e.includes("en_preparacion")) return "en_preparacion";
  return "entregado";
}
function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}
function timeAgoCorto(date) {
  if (!date) return "—";
  const min = Math.floor((Date.now() - date.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restMin = min % 60;
  return `${h}h ${restMin}m`;
}
function toast(msg, type = "") {
  const wrap = $("toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "mz-toast" + (type === "error" ? " err" : "");
  el.style.transition = "opacity .2s, transform .2s";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 220);
  }, 3200);
}
function openOverlay(id) {
  $(id)?.classList.add("show");
}
function closeOverlay(id) {
  $(id)?.classList.remove("show");
}
const detalleAbierto = () => $("overlay-detalle")?.classList.contains("show");

document
  .querySelectorAll("[data-close]")
  .forEach((btn) =>
    btn.addEventListener("click", () => closeOverlay(btn.dataset.close)),
  );
document.querySelectorAll(".overlay").forEach((ov) =>
  ov.addEventListener("click", (e) => {
    // el login no se puede cerrar tocando afuera
    if (e.target === ov && ov.id !== "mozoSelectOverlay") closeOverlay(ov.id);
  }),
);

let confirmCallback = null;
function askConfirm(title, body, onConfirm, confirmLabel = "Sí, continuar") {
  setText("confirm-title", title);
  setText("confirm-body", body);
  setText("btn-confirm-action-label", confirmLabel);
  confirmCallback = onConfirm;
  openOverlay("overlay-confirm");
}
on("btn-confirm-action", "click", async () => {
  const btn = $("btn-confirm-action");
  const label = $("btn-confirm-action-label");
  const original = label.textContent;
  btn.disabled = true;
  label.innerHTML = '<span class="spinner"></span>';
  try {
    if (confirmCallback) await confirmCallback();
    closeOverlay("overlay-confirm");
  } catch (err) {
    console.error(err);
    toast("Ocurrió un error, intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    label.textContent = original;
    confirmCallback = null;
  }
});

/* ══════════════ Tema claro / oscuro ══════════════ */
function paintTema() {
  const t = document.documentElement.getAttribute("data-theme");
  setText("btnTema", t === "light" ? "☀️" : "🌙");
}
paintTema();
on("btnTema", "click", () => {
  const actual = document.documentElement.getAttribute("data-theme");
  const nuevo = actual === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", nuevo);
  try {
    localStorage.setItem("mozo_tema", nuevo);
  } catch {}
  paintTema();
});

/* ══════════════ Sonido ══════════════ */
let soundEnabled = localStorage.getItem("mozo_sound") !== "0";
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
document.addEventListener("click", () => ensureAudio(), {
  once: true,
  capture: true,
});
function playTone(freqs, type = "sine") {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.52);
  });
}
const soundPedidoNuevo = () => playTone([660, 880], "square");
const soundLlamado = () => playTone([740, 622, 740], "triangle");
const soundListo = () => playTone([880, 1108, 1318], "sine");
function paintSonido() {
  setText("btnSonido", soundEnabled ? "🔔" : "🔕");
}
paintSonido();
on("btnSonido", "click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("mozo_sound", soundEnabled ? "1" : "0");
  paintSonido();
  if (soundEnabled) {
    ensureAudio();
    playTone([880], "sine");
  }
  toast(soundEnabled ? "🔔 Sonido activado" : "🔕 Sonido desactivado");
});
function bellRing() {
  const b = $("btnSonido");
  if (!b) return;
  b.classList.remove("ring-anim");
  void b.offsetWidth;
  b.classList.add("ring-anim");
}

/* ══════════════ Estado en memoria ══════════════ */
const mesasMap = new Map();
const gruposMap = new Map();
const llamadosMap = new Map();
const mozosMap = new Map();
let mesasCfg = {};
let metodosPago = {};
const METODOS_LABEL = {
  efectivo: ["💵", "Efectivo"],
  yape: ["📱", "Yape"],
  plin: ["📱", "Plin"],
  visa_mastercard: ["💳", "Visa / Mastercard"],
  agora: ["🏦", "Agora"],
};
const metodosActivos = () =>
  Object.entries(metodosPago)
    .filter(([, v]) => v?.enable === true)
    .map(([clave]) => {
      const [ico, label] = METODOS_LABEL[clave] || ["💳", clave];
      return { clave, ico, label };
    });
let edicionSucia = false; // evita que un snapshot borre lo que el mozo está armando
let hayPendienteCliente = false;
const puedeGestionar = () => esAdmin || mesasCfg.mozoPermisos === true;
function iniciarListenerConfig() {
  onSnapshot(tiendaDoc(localidad, "tiendas", tiendaId), (s) => {
    const data = s.data() || {};
    mesasCfg = data.mesas_config || {};
    metodosPago = data.metodos_pago || {};
    if (mesaAbiertaId && !edicionSucia && detalleAbierto())
      pintarDetalleMesa(mesaAbiertaId);
  });
}
let catalogo = [];
let catalogoListo = false;
let mozoActivo = null; // {id, nombre}
let mesaAbiertaId = null;
let grupoAbiertoId = null;
let pedidoEnEdicion = null;
let firstMesasSnapshot = true;
let firstLlamadosSnapshot = true;
const mesaPedidoFirma = new Map();
let filtroActual = "todas";

/* ══════════════ Login de trabajadores (usuario + PIN) ══════════════ */
const sesKey = () => `mozo_sess_${tiendaId}`;

async function hashPin(pin, usuario) {
  const b = new TextEncoder().encode(`${tiendaId}:${usuario}:${pin}`);
  const h = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(h)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

async function resolverTienda() {
  // 1) Embebido en el dashboard del dueño
  if (esAdmin) {
    tiendaId = sessionStorage.getItem("tiendaId");
    localidad = sessionStorage.getItem("localidad");
    return !!(tiendaId && localidad);
  }
  // 2) Pruebas locales: ?id=...&localidad=...
  const q = new URLSearchParams(location.search);
  if (q.get("id") && q.get("localidad")) {
    tiendaId = q.get("id");
    localidad = q.get("localidad").trim().toLowerCase();
    return true;
  }
  // 3) Dominio propio del negocio
  const h = location.hostname;
  if (
    h !== "geinztech.com" &&
    h !== "www.geinztech.com" &&
    !h.startsWith("127.") &&
    h !== "localhost"
  ) {
    try {
      const s = await getDoc(doc(db, "dominio_web_tiendas", h));
      if (s.exists() && s.data().id) {
        tiendaId = s.data().id;
        localidad = String(s.data().localidad).trim().toLowerCase();
        return true;
      }
    } catch (e) {
      console.warn("No se pudo resolver el dominio:", e);
    }
  }
  // 4) geinztech.com/perfil/{alias}/trabajadores
  const m = location.pathname.match(/^\/perfil\/([^/]+)\/trabajadores/);
  if (m) {
    try {
      const s = await getDoc(
        doc(db, "alias_tiendas", decodeURIComponent(m[1])),
      );
      if (s.exists() && s.data().id) {
        tiendaId = s.data().id;
        localidad = String(s.data().localidad).trim().toLowerCase();
        return true;
      }
    } catch (e) {
      console.warn("No se pudo resolver el alias:", e);
    }
  }
  return false;
}

// Un mozo ve las mesas sin asignar y las asignadas a él. El admin ve todo.
function visibleParaMozo(m) {
  if (esAdmin || !mozoActivo) return true;
  return !m.mozoAsignado || m.mozoAsignado.id === mozoActivo.id;
}

function seleccionarMozo(id, nombre) {
  mozoActivo = { id, nombre };
  setText("mozoActivoNombre", nombre);
  closeOverlay("mozoSelectOverlay");
  $("app")?.classList.remove("hidden");
  renderMesaGrid();
}

async function loginMozo() {
  const err = $("mzError");
  err.classList.add("hidden");
  const usuario = $("mzUser").value.trim().toLowerCase();
  const pin = $("mzPin").value.trim();
  const fallo = (t) => {
    err.textContent = t;
    err.classList.remove("hidden");
  };
  if (!usuario || !pin) return fallo("Escribe usuario y PIN");
  try {
    const snap = await getDocs(
      query(mozosColRef(), where("usuario", "==", usuario)),
    );
    const d = snap.docs[0];
    const data = d?.data();
    if (
      !d ||
      data.activo === false ||
      (await hashPin(pin, usuario)) !== data.pinHash
    )
      return fallo("Usuario o PIN incorrecto");
    localStorage.setItem(
      sesKey(),
      JSON.stringify({ id: d.id, pinHash: data.pinHash }),
    );
    seleccionarMozo(d.id, data.nombre);
  } catch (e) {
    console.error(e);
    fallo("No se pudo iniciar sesión");
  }
}
on("mzLoginBtn", "click", loginMozo);
on("mzPin", "keydown", (e) => e.key === "Enter" && loginMozo());

async function restaurarSesion() {
  try {
    const s = JSON.parse(localStorage.getItem(sesKey()) || "null");
    if (!s) return false;
    const d = await getDoc(doc(mozosColRef(), s.id));
    // si cambiaron el PIN o lo desactivaron, la sesión deja de valer
    if (
      !d.exists() ||
      d.data().activo === false ||
      d.data().pinHash !== s.pinHash
    )
      return false;
    seleccionarMozo(d.id, d.data().nombre);
    return true;
  } catch {
    return false;
  }
}

on("btnCambiarMozo", "click", () => {
  localStorage.removeItem(sesKey());
  location.reload();
});

function iniciarListenerMozos() {
  onSnapshot(
    mozosColRef(),
    (snap) => {
      mozosMap.clear();
      snap.forEach((d) => mozosMap.set(d.id, d.data()));
    },
    (err) => console.error("Error escuchando mozos:", err),
  );
}

/* ══════════════ Catálogo ══════════════ */
async function cargarCatalogo() {
  try {
    const catSnap = await getDocs(productosColRef());
    const porCategoria = await Promise.all(
      catSnap.docs.map(async (catDoc) => {
        const categoria = catDoc.id;
        const subSnap = await getDocs(
          tiendaSubCol(
            localidad,
            "tiendas",
            tiendaId,
            "productos",
            categoria,
            categoria,
          ),
        );
        const arr = [];
        subSnap.forEach((pDoc) => {
          const d = pDoc.data();
          if (d.disponible === false) return;
          const condiciones = (d.condiciones || [])
            .map((c) => ({
              nombre: c.nombre,
              opciones: (c.opciones || [])
                .filter(
                  (o) =>
                    o.activo && (typeof o.stock !== "number" || o.stock > 0),
                )
                .map((o) => ({
                  nombre: o.nombre,
                  costoAdicional: Number(o.costoAdicional) || 0,
                  stock: typeof o.stock === "number" ? o.stock : null,
                })),
            }))
            .filter((c) => c.nombre && c.opciones.length > 0);

          arr.push({
            id: pDoc.id,
            categoria,
            nombre: d.nombre || "Producto",
            precio: Number(d.precio) || 0,
            imagen: d.imagenes?.[0]?.url || "",
            stock: typeof d.stock === "number" ? d.stock : null,
            condiciones,
            variantesObligatoria: d.variantesObligatoria !== false,
            variantesMultiples: d.variantesMultiples === true,
            variantesConCantidad:
              d.variantesMultiples === true && d.variantesConCantidad === true,
            descuento: d.descuento || null,
          });
        });
        return arr;
      }),
    );
    catalogo = porCategoria.flat();
    catalogoListo = true;
  } catch (err) {
    console.error("Error cargando catálogo:", err);
  }
}

/* ══════════════ Pedido activo por mesa (individual o agrupada) ══════════════ */
function getPedidoDeMesa(mesaDocId) {
  const m = mesasMap.get(mesaDocId);
  if (!m) return null;
  if (m.grupoId) {
    const grupo = gruposMap.get(m.grupoId);
    if (
      !grupo ||
      !["activo", "pedido_pendiente"].includes(grupo.estado) ||
      !grupo.pedido
    )
      return null;
    return {
      pedido: grupo.pedido,
      pedidoDocId: grupo.pedidoGrupoDocId || null,
      esGrupo: true,
      grupoId: m.grupoId,
      grupoRef: doc(gruposColRef(), m.grupoId),
    };
  }
  if (!["ocupado", "pedido_pendiente"].includes(m.estado) || !m.pedido)
    return null;
  return {
    pedido: m.pedido,
    pedidoDocId: m.pedidoMesaDocId || null,
    esGrupo: false,
  };
}

function numsDeMesa(m) {
  if (!m) return [];
  if (!m.grupoId) return [m.numero_mesa];
  return [...mesasMap.values()]
    .filter((x) => x.grupoId === m.grupoId)
    .map((x) => x.numero_mesa);
}

function getLlamadoActivo(nums) {
  const lista = (Array.isArray(nums) ? nums : [nums]).map(Number);
  const l = [...llamadosMap.values()].filter(
    (x) => lista.includes(Number(x.mesaNumero)) && x.estado === "pendiente",
  );
  return l.find((x) => x.motivo === "cuenta") || l[0] || null;
}

function computeEstadoVisual(mesaDocId) {
  const m = mesasMap.get(mesaDocId);
  if (!m) return "libre";
  const info = getPedidoDeMesa(mesaDocId);
  const llamado = getLlamadoActivo(numsDeMesa(m));

  if (llamado && llamado.motivo === "cuenta") return "cuenta";
  if (llamado && llamado.motivo === "ayuda") return "ayuda";
  if (m.estado === "reservada") return "reservada";
  if (!info) return m.estado === "ocupado" ? "ocupada" : "libre";

  const pedido = info.pedido;
  if (pedido.estadoMozo !== "confirmado" || pedido.pendienteMozo?.length)
    return "pendiente";
  if (pedido.estado === "listo") return "listo";
  return "preparacion";
}

/* ══════════════ Estado visual de una mesa ══════════════ */
const MOTIVO_LABEL = {
  confirmar_pedido: "Confirmar pedido",
  agregar_productos: "Agregar productos",
  cuenta: "Solicita la cuenta",
  ayuda: "Necesita ayuda",
};

const ESTADO_META = {
  libre: { label: "Libre", ico: "🪑", cls: "st-libre" },
  pendiente: { label: "Por confirmar", ico: "⏳", cls: "st-pendiente" },
  preparacion: { label: "En preparación", ico: "🔥", cls: "st-preparacion" },
  listo: { label: "Listo", ico: "✅", cls: "st-listo" },
  cuenta: { label: "Pide la cuenta", ico: "💳", cls: "st-cuenta" },
  reservada: { label: "Reservada", ico: "📅", cls: "st-reservada" },
  ayuda: { label: "Llama al mozo", ico: "🙋", cls: "st-ayuda" },
  ocupada: { label: "Ocupada", ico: "🍽️", cls: "st-ocupada" },
};

/* ══════════════ Filtros del tablero ══════════════ */
function pasaFiltro(estado) {
  switch (filtroActual) {
    case "atender":
      return ["pendiente", "cuenta", "ayuda", "listo"].includes(estado);
    case "ocupadas":
      return !["libre", "reservada"].includes(estado);
    case "libres":
      return estado === "libre";
    default:
      return true;
  }
}
$("mzFiltros")
  ?.querySelectorAll("[data-f]")
  .forEach((b) =>
    b.addEventListener("click", () => {
      filtroActual = b.dataset.f;
      $("mzFiltros")
        .querySelectorAll("[data-f]")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderMesaGrid();
    }),
  );

/* ══════════════ Tablero de mesas ══════════════ */
function renderMesaGrid() {
  const grid = $("mesaGrid");
  const empty = $("emptyMesas");
  if (!grid || !empty) return;
  const todas = [...mesasMap.entries()]
    .filter(([, m]) => visibleParaMozo(m))
    .sort((a, b) => (a[1].numero_mesa || 0) - (b[1].numero_mesa || 0));

  const yaRenderizadas = new Set();
  const bloques = [];
  todas.forEach(([mesaDocId, m]) => {
    if (yaRenderizadas.has(m.numero_mesa)) return;
    if (m.grupoId) {
      const delMismoGrupo = todas.filter(([, mm]) => mm.grupoId === m.grupoId);
      delMismoGrupo.forEach(([, mm]) => yaRenderizadas.add(mm.numero_mesa));
      bloques.push({
        tipo: "grupo",
        grupoId: m.grupoId,
        integrantes: delMismoGrupo,
      });
    } else {
      yaRenderizadas.add(m.numero_mesa);
      bloques.push({ tipo: "single", mesaDocId, m });
    }
  });

  // aplicar filtro por estado visual
  const visibles = bloques.filter((b) => {
    const id = b.tipo === "single" ? b.mesaDocId : b.integrantes[0][0];
    return pasaFiltro(computeEstadoVisual(id));
  });

  grid.innerHTML = "";
  if (!visibles.length) {
    empty.classList.remove("hidden");
    empty.classList.add("flex");
    actualizarIndicadores();
    return;
  }
  empty.classList.add("hidden");
  empty.classList.remove("flex");

  visibles.forEach((bloque) => {
    const card = document.createElement("button");
    card.type = "button";
    if (bloque.tipo === "single") {
      const { mesaDocId, m } = bloque;
      const estado = computeEstadoVisual(mesaDocId);
      const meta = ESTADO_META[estado];
      const info = getPedidoDeMesa(mesaDocId);
      const total = info ? Number(info.pedido.total || 0) : 0;
      const tsMs = info ? toDate(info.pedido.timestamp)?.getTime() : null;
      const mozoNombre = m.mozoAsignado?.nombre || null;

      card.className = `mz-mesa ${meta.cls}`;
      card.innerHTML = `
        <div class="mz-mesa-top">
          <span class="mz-mesa-name">${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</span>
          <span class="mz-mesa-ico">${meta.ico}</span>
        </div>
        <span class="mz-mesa-state">${meta.label}</span>
        ${tsMs ? `<span class="mz-mesa-meta">⏱ ${timeAgoCorto(new Date(tsMs))}</span>` : ""}
        ${mozoNombre ? `<span class="mz-mesa-meta">👤 ${escapeHtml(mozoNombre)}</span>` : ""}
        ${info ? `<span class="mz-mesa-total mono">${fmtMoney(total)}</span>` : `<span class="mz-mesa-meta" style="margin-top:auto;">Sin pedido</span>`}
      `;
      card.addEventListener("click", () => clickMesa(mesaDocId));
    } else {
      const grupo = gruposMap.get(bloque.grupoId);
      const nombres = bloque.integrantes
        .map(([, mm]) => mm.nombre_alias || `Mesa ${mm.numero_mesa}`)
        .join(" + ");
      const estado = computeEstadoVisual(bloque.integrantes[0][0]);
      const meta = ESTADO_META[estado];
      const total = grupo?.pedido ? Number(grupo.pedido.total || 0) : 0;
      const tsMs = grupo?.pedido
        ? toDate(grupo.pedido.timestamp)?.getTime()
        : null;

      card.className = `mz-mesa ${meta.cls}`;
      card.style.gridColumn = `span ${Math.min(bloque.integrantes.length, 2)}`;
      card.innerHTML = `
        <div class="mz-mesa-top">
          <span class="mz-mesa-name">${escapeHtml(nombres)}</span>
          <span class="mz-mesa-ico">${meta.ico}</span>
        </div>
        <span class="mz-mesa-state">${meta.label} · Grupo</span>
        ${tsMs ? `<span class="mz-mesa-meta">⏱ ${timeAgoCorto(new Date(tsMs))}</span>` : ""}
        ${grupo?.pedido ? `<span class="mz-mesa-total mono">${fmtMoney(total)}</span>` : `<span class="mz-mesa-meta" style="margin-top:auto;">Sin pedido</span>`}
      `;
      card.addEventListener("click", () => clickMesa(bloque.integrantes[0][0]));
    }
    const idsCard =
      bloque.tipo === "single"
        ? [bloque.mesaDocId]
        : bloque.integrantes.map((x) => x[0]);
    if (modoUnir && idsCard.every((i) => selUnir.has(i)))
      card.classList.add("sel");
    grid.appendChild(card);
  });

  actualizarIndicadores();
  if (mesaAbiertaId && !edicionSucia && detalleAbierto()) {
    pintarDetalleMesa(mesaAbiertaId);
  }
}

function actualizarIndicadores() {
  let ocupadas = 0,
    pendientes = 0,
    listos = 0;
  const idsVistos = new Set();
  mesasMap.forEach((m, mesaDocId) => {
    if (!visibleParaMozo(m)) return;
    if (m.grupoId) {
      if (idsVistos.has(m.grupoId)) return;
      idsVistos.add(m.grupoId);
    }
    const info = getPedidoDeMesa(mesaDocId);
    if (!info) return;
    ocupadas++;
    if (
      info.pedido.estadoMozo !== "confirmado" ||
      info.pedido.pendienteMozo?.length
    )
      pendientes++;
    if (info.pedido.estado === "listo") listos++;
  });
  const llamadosPendientes = [...llamadosMap.values()].filter(
    (l) => l.estado === "pendiente",
  );
  const cuentaPendientes = llamadosPendientes.filter(
    (l) => l.motivo === "cuenta",
  ).length;
  const ayudaPendientes = llamadosPendientes.filter(
    (l) => l.motivo === "ayuda",
  ).length;

  setText("ind-ocupadas", ocupadas);
  setText("ind-pendientes", pendientes);
  setText("ind-llamados", ayudaPendientes);
  setText("ind-listos", listos);
  setText("ind-cuenta", cuentaPendientes);
}

/* ══════════════ Detalle de mesa ══════════════ */
function abrirDetalleMesa(mesaDocId) {
  mesaAbiertaId = mesaDocId;
  const m = mesasMap.get(mesaDocId);
  grupoAbiertoId = m?.grupoId || null;
  edicionSucia = false;
  pintarDetalleMesa(mesaDocId);
  openOverlay("overlay-detalle");
}

function pintarPersonas() {
  const v = $("det-personas").value;
  setText("det-pers-val", v === "" ? "—" : v);
}
function cambiarPersonas(delta) {
  const inp = $("det-personas");
  const actual = parseInt(inp.value, 10);
  inp.value = Math.max(0, (isNaN(actual) ? 0 : actual) + delta);
  edicionSucia = true;
  pintarPersonas();
}
on("det-pers-menos", "click", () => cambiarPersonas(-1));
on("det-pers-mas", "click", () => cambiarPersonas(+1));

function pintarDetalleMesa(mesaDocId) {
  const m = mesasMap.get(mesaDocId);
  if (!m) {
    closeOverlay("overlay-detalle");
    return;
  }
  const info = getPedidoDeMesa(mesaDocId);
  const estado = computeEstadoVisual(mesaDocId);
  const meta = ESTADO_META[estado];
  const llamado = getLlamadoActivo(numsDeMesa(m));

  $("det-head").className = `mz-sheet-head ${meta.cls}`;
  setText("det-titulo", m.nombre_alias || `Mesa ${m.numero_mesa}`);
  setText(
    "det-subtitulo",
    info ? `Pedido a las ${info.pedido.hora || "—"}` : "Mesa sin pedido activo",
  );
  setText("det-chip-estado", `${meta.ico} ${meta.label}`);
  const tsMs = info ? toDate(info.pedido.timestamp)?.getTime() : null;
  setText(
    "det-chip-tiempo",
    tsMs ? `⏱ ${timeAgoCorto(new Date(tsMs))} ocupada` : "⏱ —",
  );

  $("det-personas").value = m.personas ?? "";
  pintarPersonas();

  const banner = $("det-llamado-banner");
  if (llamado) {
    banner.classList.remove("hidden");
    setText(
      "det-llamado-motivo",
      MOTIVO_LABEL[llamado.motivo] || llamado.motivo,
    );
    $("det-llamado-atender").onclick = () => marcarLlamadoAtendido(llamado);
  } else {
    banner.classList.add("hidden");
  }

  pedidoEnEdicion = info
    ? JSON.parse(JSON.stringify(info.pedido))
    : {
        cliente: { nombre: "", tipo_entrega: "Mesa" },
        pago: { metodo: "En mesa" },
        estado: "pendiente",
        estadoMozo: "pendiente_revision",
        productos: [],
        nota: "",
        notaInterna: "",
        total: 0,
        total_items: 0,
        fecha: new Date().toLocaleDateString("es-PE"),
        hora: new Date().toLocaleTimeString("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
  if (!pedidoEnEdicion.productos) pedidoEnEdicion.productos = [];
  {
    const baseEst = ["en_preparacion", "entregado"].includes(
      pedidoEnEdicion.estadoMesa,
    )
      ? pedidoEnEdicion.estadoMesa
      : "aceptado";
    pedidoEnEdicion.productos.forEach((i) => {
      if (!i.estadoItem) i.estadoItem = baseEst;
    });
  }
  const pend = pedidoEnEdicion.pendienteMozo || [];
  hayPendienteCliente = pend.length > 0;
  if (hayPendienteCliente) {
    pend.forEach((b) =>
      (b.items || []).forEach((it) => {
        const ex = pedidoEnEdicion.productos.find(
          (x) =>
            x.id === it.id &&
            claveSel(x.opciones) === claveSel(it.opciones) &&
            x.estadoItem === "aceptado",
        );
        if (ex) {
          ex.cantidad += it.cantidad;
          ex.subtotal = +(ex.cantidad * ex.precio_unitario).toFixed(2);
        } else
          pedidoEnEdicion.productos.push({
            ...it,
            estadoItem: "aceptado",
            observacion: it.observacion || "",
          });
      }),
    );
    recalcularTotales();
    pedidoEnEdicion.estadoMozo = "pendiente_revision";
  }
  setText(
    "det-nota-cliente",
    (hayPendienteCliente
      ? "🆕 El cliente agregó productos: revísalos y confirma. "
      : "") + (pedidoEnEdicion.nota || "Sin especificaciones"),
  );
  $("det-nota-interna").value = pedidoEnEdicion.notaInterna || "";

  pintarProductosEdicion();

  const yaConfirmado = pedidoEnEdicion.estadoMozo === "confirmado";
  const btnConfirmar = $("det-btn-confirmar");
  setText(
    "det-btn-confirmar-label",
    yaConfirmado ? "Ya enviado a cocina ✓" : "Confirmar y enviar a cocina",
  );
  btnConfirmar.disabled =
    yaConfirmado || pedidoEnEdicion.productos.length === 0;

  const gestion = puedeGestionar();
  const confirmado = !!info && pedidoEnEdicion.estadoMozo === "confirmado";
  $("det-btn-cancelar-pedido").style.display = info && gestion ? "" : "none";
  $("det-btn-liberar").style.display = info && gestion ? "" : "none";
  $("det-btn-prep").style.display = confirmado && gestion ? "" : "none";
  $("det-btn-entregado").style.display = confirmado && gestion ? "" : "none";
  pintarCobroMozo(info);
  edicionSucia = false;
}

/* ── Comprobante + voucher (el mozo solo envía; el dashboard decide) ── */
async function escribirCampoPedido(info, campos) {
  const pref = {};
  Object.entries(campos).forEach(([k, v]) => (pref["pedido." + k] = v));
  const tareas = [
    updateDoc(
      info.esGrupo ? info.grupoRef : doc(mesasColRef(), mesaAbiertaId),
      pref,
    ),
  ];
  if (info.pedidoDocId)
    tareas.push(updateDoc(doc(pedidosColRef(), info.pedidoDocId), campos));
  await Promise.all(tareas);
}
// Convierte la foto ya comprimida en texto (data URL) para guardarla en el pedido.
// Solución temporal: funciona ya, sin servicio de subida.
function subirImagen(blob) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ko(new Error("No se pudo leer la foto"));
    r.readAsDataURL(blob);
  });
}
function pintarCobroMozo(info) {
  const box = $("det-cobro");
  if (!box) return;
  if (!info || mesasCfg.compMozo === false) {
    box.innerHTML = "";
    return;
  }
  const comp = info.pedido.comprobante;
  const vou = info.pedido.pago_voucher;
  const foto = info.pedido.comprobante_foto;
  const mp = info.pedido.pago_metodo;
  const metodos = metodosActivos();
  const metodosHtml = metodos.length
    ? `<span class="mz-label" style="margin:8px 0 4px;">¿Cómo pagó? ${mp ? "✔ " + escapeHtml(mp.label) : "(sin elegir)"}</span>
     <div class="mz-optbox">
       ${metodos.map((m) => `<button type="button" class="toggle-opt${mp?.clave === m.clave ? " active" : ""}" data-mp="${m.clave}">${m.ico} ${escapeHtml(m.label)}</button>`).join("")}
     </div>
     ${mp && mp.clave !== "efectivo" && !vou ? `<p style="margin:0;font-size:12px;color:var(--faint);">📸 Sube la foto del voucher para que el negocio lo valide.</p>` : ""}`
    : "";
  box.innerHTML = `
    <div class="mz-card mz-cobro">
      <span class="mz-label" style="margin:0;">Cobro</span>
      ${comp ? htmlEstadoCliente(comp) : ""}
      ${metodosHtml}
      <div class="mz-row">
        <button type="button" id="det-btn-comp" class="mz-btn mz-btn-soft">🧾 ${comp ? "Cambiar comprobante" : "Boleta / Factura"}</button>
        <button type="button" id="det-btn-voucher" class="mz-btn mz-btn-soft">💸 ${vou ? "Cambiar voucher" : "Subir voucher de pago"}</button>
      </div>
      <button type="button" id="det-btn-compfoto" class="mz-btn mz-btn-soft">📎 ${foto ? "Cambiar foto del comprobante" : "Adjuntar foto del comprobante / datos"}</button>
      ${foto ? `<img src="${escCm(foto.url)}" alt="adjunto">` : ""}
      ${
        vou
          ? `<img src="${escCm(vou.url)}" alt="voucher">
      <p style="margin:0;font-size:12px;color:var(--faint);">Enviado al negocio, ellos confirman el pago.</p>`
          : ""
      }
    </div>`;
  $("det-btn-comp").onclick = async () => {
    await abrirModalComprobante({
      titulo: "🧾 Comprobante de la mesa",
      total: info.pedido.total || 0,
      previo: comp || null,
      onSubmit: async (r) => {
        await escribirCampoPedido(info, {
          comprobante: armarSolicitud(r, "mozo", mozoActivo?.nombre || "Mozo"),
        });
        toast("📄 Enviado al negocio");
      },
    });
  };
  box.querySelectorAll("[data-mp]").forEach((b) => {
    b.onclick = async () => {
      const m = metodos.find((x) => x.clave === b.dataset.mp);
      if (!m) return;
      try {
        await escribirCampoPedido(info, {
          pago_metodo: {
            clave: m.clave,
            label: m.label,
            por: mozoActivo?.nombre || "Mozo",
            ts: Date.now(),
          },
        });
        toast(`${m.ico} Pago con ${m.label}`);
      } catch (e) {
        console.error(e);
        toast("No se pudo guardar el método", "error");
      }
    };
  });
  $("det-btn-compfoto").onclick = async () => {
    const url = await elegirFotoMozo(subirImagen, "Foto del comprobante");
    if (!url) return;
    try {
      await escribirCampoPedido(info, {
        comprobante_foto: {
          url,
          por: mozoActivo?.nombre || "Mozo",
          ts: Date.now(),
        },
      });
      toast("📎 Foto enviada al negocio");
    } catch (e) {
      console.error(e);
      toast("No se pudo subir la foto", "error");
    }
  };
  $("det-btn-voucher").onclick = async () => {
    const url = await elegirFotoMozo(subirImagen, "Voucher de pago");
    if (!url) return;
    try {
      await escribirCampoPedido(info, {
        pago_voucher: {
          url,
          por: mozoActivo?.nombre || "Mozo",
          ts: Date.now(),
        },
      });
      toast("💸 Voucher enviado al negocio");
    } catch (e) {
      console.error(e);
      toast("No se pudo subir el voucher", "error");
    }
  };
}

function recalcularTotales() {
  const items = pedidoEnEdicion.productos;
  pedidoEnEdicion.total = +items
    .reduce((s, it) => s + Number(it.subtotal || 0), 0)
    .toFixed(2);
  pedidoEnEdicion.total_items = items.reduce(
    (s, it) => s + Number(it.cantidad || 0),
    0,
  );
}

// Convierte opciones (string, array u objeto {opcion: cantidad}) en texto
function opcionesATexto(opciones) {
  if (!opciones) return "";
  return Object.entries(opciones)
    .map(([k, v]) => {
      let txt;
      if (Array.isArray(v)) txt = v.join(", ");
      else if (v && typeof v === "object")
        txt = Object.entries(v)
          .map(([n, c]) => (c > 1 ? `${n} x${c}` : n))
          .join(", ");
      else txt = v;
      return txt ? `${k}: ${txt}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

/* ── Productos del pedido, agrupados por estado ── */
function grupoDeItem(it) {
  const est = it.estadoItem || "aceptado";
  if (est === "entregado")
    return { key: "ent", cls: "g-ent", titulo: "✅ Entregado", sub: "" };
  if (est === "en_preparacion")
    return { key: "prep", cls: "g-prep", titulo: "🔥 En preparación", sub: "" };
  if (pedidoEnEdicion.estadoMozo !== "confirmado")
    return {
      key: "nuevo",
      cls: "g-nuevo",
      titulo: "🆕 Por confirmar",
      sub: "aún no va a cocina",
    };
  return {
    key: "conf",
    cls: "g-conf",
    titulo: "📋 Enviado a cocina",
    sub: "en cola",
  };
}

function pintarProductosEdicion() {
  const wrap = $("det-productos");
  const sinProductos = $("det-sin-productos");
  wrap.innerHTML = "";
  const items = pedidoEnEdicion.productos;
  sinProductos.classList.toggle("hidden", items.length > 0);

  const orden = ["nuevo", "conf", "prep", "ent"];
  const grupos = new Map();
  items.forEach((it, idx) => {
    const g = grupoDeItem(it);
    if (!grupos.has(g.key)) grupos.set(g.key, { ...g, items: [] });
    grupos.get(g.key).items.push([it, idx]);
  });

  orden.forEach((key) => {
    const g = grupos.get(key);
    if (!g) return;
    const box = document.createElement("div");
    box.className = `mz-grp ${g.cls}`;
    box.innerHTML = `<div class="mz-grp-h"><span>${g.titulo} (${g.items.length})</span><small>${g.sub}</small></div>`;

    g.items.forEach(([it, idx]) => {
      const row = document.createElement("div");
      row.className = "mz-item";
      const opcionesTxt = opcionesATexto(it.opciones);
      const tieneVar = !!catalogo.find((c) => c.id === it.id)?.condiciones
        ?.length;
      row.innerHTML = `
        <div class="mz-item-top">
          <div class="mz-item-main">
            <div class="mz-item-name">${escapeHtml(it.nombre)}</div>
            ${opcionesTxt ? `<div class="mz-item-opts">${escapeHtml(opcionesTxt)}</div>` : ""}
            <div class="mz-item-opts mono">${fmtMoney(it.precio_unitario)} c/u</div>
          </div>
          <div class="mz-item-price mono">${fmtMoney(it.subtotal)}</div>
        </div>
        <div class="mz-item-ctrl">
          <div class="mz-qty">
            <button type="button" data-minus="${idx}" class="mz-qbtn">−</button>
            <b>${it.cantidad}</b>
            <button type="button" data-plus="${idx}" class="mz-qbtn">+</button>
          </div>
          <span class="mz-grow"></span>
          ${tieneVar ? `<button type="button" data-edit="${idx}" class="mz-mini">✎ Variantes</button>` : ""}
          <button type="button" data-remove="${idx}" class="mz-mini red">Quitar</button>
        </div>
        <input data-obs="${idx}" type="text" placeholder="Observación (ej. sin cebolla)" value="${escapeHtml(it.observacion || "")}" class="field-input">
      `;
      box.appendChild(row);
    });
    wrap.appendChild(box);
  });

  wrap
    .querySelectorAll("[data-plus]")
    .forEach((b) =>
      b.addEventListener("click", () => cambiarCantidad(+b.dataset.plus, +1)),
    );
  wrap
    .querySelectorAll("[data-minus]")
    .forEach((b) =>
      b.addEventListener("click", () => cambiarCantidad(+b.dataset.minus, -1)),
    );
  wrap
    .querySelectorAll("[data-remove]")
    .forEach((b) =>
      b.addEventListener("click", () => quitarProducto(+b.dataset.remove)),
    );
  wrap.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      const it = pedidoEnEdicion.productos[+b.dataset.edit];
      const p = catalogo.find((c) => c.id === it.id);
      if (p) abrirOpcionesProducto(p, it.opciones, +b.dataset.edit);
    }),
  );
  wrap.querySelectorAll("[data-obs]").forEach((inp) =>
    inp.addEventListener("input", () => {
      edicionSucia = true;
      pedidoEnEdicion.productos[+inp.dataset.obs].observacion = inp.value;
    }),
  );

  setText("det-total", fmtMoney(pedidoEnEdicion.total));
}

function cambiarCantidad(idx, delta) {
  const it = pedidoEnEdicion.productos[idx];
  if (!it) return;
  edicionSucia = true;
  it.cantidad = Math.max(1, (it.cantidad || 1) + delta);
  it.subtotal = +(it.cantidad * it.precio_unitario).toFixed(2);
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
}
function quitarProducto(idx) {
  edicionSucia = true;
  pedidoEnEdicion.productos.splice(idx, 1);
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
}

function refrescarBotonConfirmar() {
  const btn = $("det-btn-confirmar");
  const yaConfirmado = pedidoEnEdicion.estadoMozo === "confirmado";
  btn.disabled = yaConfirmado || pedidoEnEdicion.productos.length === 0;
}

/* ══════════════ Agregar producto desde catálogo ══════════════ */
let pickerFiltroCategoria = "Todos";

on("btn-agregar-producto", "click", async () => {
  if (!catalogoListo) {
    toast("Cargando catálogo, un momento…");
    await cargarCatalogo();
  }
  $("picker-search").value = "";
  pickerFiltroCategoria = "Todos";
  pintarCategoriasPicker();
  pintarPicker(catalogo);
  openOverlay("overlay-picker");
});
on("picker-search", "input", aplicarFiltroPicker);

function pintarCategoriasPicker() {
  const categorias = [...new Set(catalogo.map((p) => p.categoria))];
  const wrap = $("picker-categorias");
  wrap.innerHTML = "";
  const makeChip = (label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className =
      "cat-chip" + (label === pickerFiltroCategoria ? " active" : "");
    b.addEventListener("click", () => {
      pickerFiltroCategoria = label;
      pintarCategoriasPicker();
      aplicarFiltroPicker();
    });
    wrap.appendChild(b);
  };
  makeChip("Todos");
  categorias.forEach(makeChip);
}
function aplicarFiltroPicker() {
  const q = $("picker-search").value.trim().toLowerCase();
  let resultado = catalogo;
  if (pickerFiltroCategoria !== "Todos")
    resultado = resultado.filter((p) => p.categoria === pickerFiltroCategoria);
  if (q)
    resultado = resultado.filter((p) => p.nombre.toLowerCase().includes(q));
  pintarPicker(resultado);
}

function stockBadgeHtml(stock) {
  if (typeof stock !== "number") return "";
  const cls =
    stock <= 0 ? "stock-agotado" : stock < 5 ? "stock-bajo" : "stock-ok";
  const txt = stock <= 0 ? "Agotado" : `Stock: ${stock}`;
  return `<span class="stock-badge ${cls}">${txt}</span>`;
}

function pintarPicker(lista) {
  const wrap = $("picker-lista");
  wrap.innerHTML = "";
  if (!lista.length) {
    wrap.innerHTML = `<p class="mz-note" style="text-align:center;">Sin resultados</p>`;
    return;
  }
  lista.forEach((p) => {
    const agotado = typeof p.stock === "number" && p.stock <= 0;
    const condTxt = (p.condiciones || []).map((c) => c.nombre).join(" · ");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "mz-pick" + (agotado ? " off" : "");
    row.innerHTML = `
      <div class="mz-pick-img">${p.imagen ? `<img src="${escapeHtml(p.imagen)}" alt="">` : ""}</div>
      <div class="mz-pick-info">
        <b>${escapeHtml(p.nombre)}</b>
        <span>${escapeHtml(p.categoria)}${condTxt ? " · Opciones: " + escapeHtml(condTxt) : ""}</span>
        <div>${stockBadgeHtml(p.stock)}</div>
      </div>
      <div class="mz-pick-price mono">${fmtMoney(calcPrecioFinal(p, null))}</div>
    `;
    row.addEventListener("click", () => {
      if (agotado) {
        toast("Este producto está agotado", "error");
        return;
      }
      if (p.condiciones && p.condiciones.length) {
        abrirOpcionesProducto(p);
      } else {
        agregarProductoAlPedido(p);
        closeOverlay("overlay-picker");
      }
    });
    wrap.appendChild(row);
  });
}

/* ══════════════ Variantes / precio / stock (igual que el carrito) ══════════════ */
function entradasDe(v) {
  if (v && typeof v === "object" && !Array.isArray(v))
    return Object.entries(v).filter(([, c]) => (Number(c) || 0) > 0);
  if (Array.isArray(v)) return v.map((n) => [n, 1]);
  return v ? [[v, 1]] : [];
}

function claveSel(sel) {
  return Object.keys(sel || {})
    .filter((k) => entradasDe(sel[k]).length)
    .sort()
    .map(
      (k) =>
        `${k}:${entradasDe(sel[k])
          .map(([n, c]) => `${n}*${c}`)
          .sort()
          .join("+")}`,
    )
    .join("|");
}

function descuentoVigente(d, ahora = new Date()) {
  if (!d || !d.activo) return null;
  const pct = Number(d.porcentaje) || 0;
  if (pct <= 0) return null;
  const dias = {
    sunday: "domingo",
    monday: "lunes",
    tuesday: "martes",
    wednesday: "miercoles",
    thursday: "jueves",
    friday: "viernes",
    saturday: "sabado",
  };
  const hoy =
    dias[
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Lima",
        weekday: "long",
      })
        .format(ahora)
        .toLowerCase()
    ];
  if (d.modo === "dias_semana")
    return (d.dias || []).includes(hoy) ? { porcentaje: pct } : null;
  if (d.modo === "duracion")
    return Number(d.expiraEn) > ahora.getTime() ? { porcentaje: pct } : null;
  if (d.modo === "fecha") {
    const ms = (f, h) => {
      const [y, mo, dd] = (f || "").split("-").map(Number);
      if (!y) return null;
      const [hh, mm] = (h || "23:59").split(":").map(Number);
      return Date.UTC(y, mo - 1, dd, hh || 0, mm || 0) + 5 * 3600 * 1000;
    };
    const fin = ms(d.fechaFin, d.horaFin);
    const ini = d.fechaInicio ? ms(d.fechaInicio, "00:00") : null;
    if (!fin || ahora.getTime() >= fin || (ini && ahora.getTime() < ini))
      return null;
    return { porcentaje: pct };
  }
  return null;
}

function calcPrecioFinal(p, sel) {
  const d = descuentoVigente(p.descuento);
  let precio = Number(p.precio) || 0;
  if (d) precio = +(precio * (1 - d.porcentaje / 100)).toFixed(2);
  (p.condiciones || []).forEach((cond) =>
    entradasDe(sel?.[cond.nombre]).forEach(([n, c]) => {
      const op = cond.opciones.find((o) => o.nombre === n);
      if (op?.costoAdicional) precio += op.costoAdicional * c;
    }),
  );
  return +precio.toFixed(2);
}

function stockMax(p, sel) {
  if (sel && p.condiciones?.length) {
    let min = null;
    p.condiciones.forEach((cond) =>
      entradasDe(sel[cond.nombre]).forEach(([n, c]) => {
        const op = cond.opciones.find((o) => o.nombre === n);
        if (op && typeof op.stock === "number") {
          const l = Math.floor(op.stock / (c || 1));
          min = min === null ? l : Math.min(min, l);
        }
      }),
    );
    return min;
  }
  return typeof p.stock === "number" ? p.stock : null;
}

/* ══════════════ Popup de variantes (nuevo / editar línea) ══════════════ */
let productoParaOpciones = null;
let seleccionOpcionesActual = {};
let opcionesEditIdx = null;

function refrescarBtnOpciones() {
  const p = productoParaOpciones;
  const btn = $("opciones-btn-agregar");
  const falta =
    p.variantesObligatoria !== false &&
    p.condiciones.some(
      (c) => !entradasDe(seleccionOpcionesActual[c.nombre]).length,
    );
  btn.disabled = falta;
  btn.textContent = `${opcionesEditIdx != null ? "Guardar cambios" : "Agregar"} · ${fmtMoney(calcPrecioFinal(p, seleccionOpcionesActual))}`;
}

function abrirOpcionesProducto(p, selEx = null, editIdx = null) {
  productoParaOpciones = p;
  opcionesEditIdx = editIdx;
  const multi = p.variantesMultiples === true;
  const conCant = multi && p.variantesConCantidad === true;
  const oblig = p.variantesObligatoria !== false;

  seleccionOpcionesActual = {};
  Object.entries(selEx || {}).forEach(([k, v]) => {
    if (conCant) {
      const o = {};
      entradasDe(v).forEach(([n, c]) => (o[n] = c));
      seleccionOpcionesActual[k] = o;
    } else if (multi)
      seleccionOpcionesActual[k] = entradasDe(v).map(([n]) => n);
    else seleccionOpcionesActual[k] = entradasDe(v)[0]?.[0];
  });
  if (!multi && oblig)
    p.condiciones.forEach((c) => {
      if (!seleccionOpcionesActual[c.nombre] && c.opciones.length)
        seleccionOpcionesActual[c.nombre] = c.opciones[0].nombre;
    });

  setText("opciones-prod-nombre", p.nombre);
  const body = $("opciones-body");

  const pintar = () => {
    body.innerHTML = "";
    p.condiciones.forEach((cond) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<span class="mz-label">${escapeHtml(cond.nombre)}${multi ? " (varias)" : ""}</span>`;
      const box = document.createElement("div");
      box.className = "mz-optbox";

      cond.opciones.forEach((op) => {
        const extra = op.costoAdicional
          ? ` (+S/ ${op.costoAdicional.toFixed(2)})`
          : "";

        if (conCant) {
          const sel = (seleccionOpcionesActual[cond.nombre] ||= {});
          const c = sel[op.nombre] || 0;
          const row = document.createElement("div");
          row.className = "mz-optrow";
          row.innerHTML = `<span>${escapeHtml(op.nombre)}${extra}</span>
            <div class="mz-qty"><button type="button" class="mz-qbtn" data-m>−</button>
            <b>${c}</b>
            <button type="button" class="mz-qbtn" data-p>+</button></div>`;
          row.querySelector("[data-m]").onclick = () => {
            if (c <= 1) delete sel[op.nombre];
            else sel[op.nombre] = c - 1;
            pintar();
          };
          row.querySelector("[data-p]").onclick = () => {
            if (typeof op.stock === "number" && c + 1 > op.stock)
              return toast(
                `Solo quedan ${op.stock} de "${op.nombre}"`,
                "error",
              );
            sel[op.nombre] = c + 1;
            pintar();
          };
          box.appendChild(row);
          return;
        }

        const activa = entradasDe(seleccionOpcionesActual[cond.nombre]).some(
          ([n]) => n === op.nombre,
        );
        const b = document.createElement("button");
        b.type = "button";
        b.className = "toggle-opt" + (activa ? " active" : "");
        b.textContent = op.nombre + extra;
        b.onclick = () => {
          if (multi) {
            const arr = entradasDe(seleccionOpcionesActual[cond.nombre]).map(
              ([n]) => n,
            );
            const i = arr.indexOf(op.nombre);
            if (i >= 0) arr.splice(i, 1);
            else arr.push(op.nombre);
            if (arr.length) seleccionOpcionesActual[cond.nombre] = arr;
            else delete seleccionOpcionesActual[cond.nombre];
          } else if (activa && !oblig)
            delete seleccionOpcionesActual[cond.nombre];
          else seleccionOpcionesActual[cond.nombre] = op.nombre;
          pintar();
        };
        box.appendChild(b);
      });
      wrap.appendChild(box);
      body.appendChild(wrap);
    });
    refrescarBtnOpciones();
  };
  pintar();
  openOverlay("overlay-picker-opciones");
}

on("opciones-btn-agregar", "click", () => {
  if (!productoParaOpciones) return;
  const sel = JSON.parse(JSON.stringify(seleccionOpcionesActual));
  Object.keys(sel).forEach((k) => {
    if (!entradasDe(sel[k]).length) delete sel[k];
  });
  const seleccion = Object.keys(sel).length ? sel : null;
  if (opcionesEditIdx != null)
    reemplazarLinea(opcionesEditIdx, productoParaOpciones, seleccion);
  else agregarProductoAlPedido(productoParaOpciones, seleccion);
  closeOverlay("overlay-picker-opciones");
  closeOverlay("overlay-picker");
});

function reemplazarLinea(idx, p, seleccion) {
  const it = pedidoEnEdicion.productos[idx];
  if (!it) return;
  edicionSucia = true;
  const precio = calcPrecioFinal(p, seleccion);
  it.opciones = seleccion;
  it.precio_unitario = precio;
  it.subtotal = +(precio * it.cantidad).toFixed(2);
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
  toast("Variantes actualizadas");
}

function agregarProductoAlPedido(p, seleccion = null) {
  edicionSucia = true;
  const key = claveSel(seleccion);
  const items = pedidoEnEdicion.productos;
  const existente = items.find(
    (it) =>
      it.id === p.id &&
      claveSel(it.opciones) === key &&
      (it.estadoItem || "aceptado") === "aceptado",
  );
  const max = stockMax(p, seleccion);
  const enPedido =
    seleccion && p.condiciones?.length
      ? existente?.cantidad || 0
      : items
          .filter((it) => it.id === p.id)
          .reduce((s, i) => s + i.cantidad, 0);
  if (max !== null && enPedido + 1 > max)
    return toast(
      max <= 0 ? "Sin stock" : `Solo quedan ${max} disponible(s)`,
      "error",
    );

  if (existente) {
    existente.cantidad += 1;
    existente.subtotal = +(
      existente.cantidad * existente.precio_unitario
    ).toFixed(2);
  } else {
    const precio = calcPrecioFinal(p, seleccion);
    items.push({
      id: p.id,
      cartKey: p.id + "_" + Date.now() + Math.random().toString(36).slice(2, 6),
      nombre: p.nombre,
      categoria: p.categoria,
      precio_unitario: precio,
      cantidad: 1,
      subtotal: precio,
      imagen: p.imagen || "",
      opciones: seleccion,
      estadoItem: "aceptado",
      observacion: "",
    });
  }
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
  toast(`${p.nombre} agregado`);
}

/* ══════════════ Guardar cambios ══════════════ */
async function persistirPedido({ marcarConfirmado = false } = {}) {
  const m = mesasMap.get(mesaAbiertaId);
  if (!m) throw new Error("Mesa no encontrada");

  pedidoEnEdicion.notaInterna = $("det-nota-interna").value.trim();
  const personasVal = $("det-personas").value;
  recalcularTotales();
  delete pedidoEnEdicion.timestamp; // no pisar la hora original del pedido
  // comprobante y voucher se escriben aparte: no pisar lo que haya cambiado el dashboard
  delete pedidoEnEdicion.comprobante;
  delete pedidoEnEdicion.pago_voucher;
  delete pedidoEnEdicion.comprobante_foto;
  delete pedidoEnEdicion.pago_metodo;
  if (getPedidoDeMesa(mesaAbiertaId)) pedidoEnEdicion.editadoPorMozo = true;
  if (marcarConfirmado) {
    pedidoEnEdicion.productos.forEach((i) => {
      if (!i.estadoItem) i.estadoItem = "aceptado";
    });
    pedidoEnEdicion.estadoMesa = derivarEstadoMesa(
      pedidoEnEdicion.productos,
      "aceptado",
    );
    pedidoEnEdicion.estadoMozo = "confirmado";
    pedidoEnEdicion.mozoConfirmo = mozoActivo;
    pedidoEnEdicion.pendienteMozo = [];
    pedidoEnEdicion.historial = arrayUnion({
      accion: "confirmado",
      quien: mozoActivo?.nombre || "Mozo",
      cuando: new Date().toISOString(),
    });
    pedidoEnEdicion.caja = {
      notificado: true,
      notificadoEn: new Date().toISOString(),
    };
  }

  // Ya no hay select de mozo en el detalle: se conserva la asignación actual.
  // Si nadie la tiene y un mozo (no admin) confirma el pedido, la mesa queda a su nombre.
  let mozoAsignadoObj = m.mozoAsignado || null;
  if (!mozoAsignadoObj && marcarConfirmado && !esAdmin && mozoActivo)
    mozoAsignadoObj = { id: mozoActivo.id, nombre: mozoActivo.nombre };

  const personas =
    personasVal === "" ? null : Math.max(0, parseInt(personasVal, 10) || 0);

  const batch = writeBatch(db);
  const info = getPedidoDeMesa(mesaAbiertaId);
  const grupoSinPedido =
    !info && m.grupoId && gruposMap.get(m.grupoId)?.estado === "activo"
      ? gruposMap.get(m.grupoId)
      : null;

  if (info && info.esGrupo) {
    batch.set(
      info.grupoRef,
      {
        pedido: pedidoEnEdicion,
        ...(marcarConfirmado ? { estado: "activo" } : {}),
      },
      { merge: true },
    );
    if (info.pedidoDocId) {
      batch.set(
        doc(pedidosColRef(), info.pedidoDocId),
        { ...pedidoEnEdicion, mozoAsignado: mozoAsignadoObj },
        { merge: true },
      );
    }
    const grupo = gruposMap.get(grupoAbiertoId);
    (grupo?.mesas || []).forEach((mm) => {
      batch.set(
        doc(mesasColRef(), mm.id),
        {
          mozoAsignado: mozoAsignadoObj,
          personas,
          ...(marcarConfirmado ? { estado: "ocupado" } : {}),
        },
        { merge: true },
      );
    });
  } else if (info) {
    batch.set(
      doc(mesasColRef(), mesaAbiertaId),
      {
        pedido: pedidoEnEdicion,
        mozoAsignado: mozoAsignadoObj,
        personas,
        ...(marcarConfirmado ? { estado: "ocupado" } : {}),
      },
      { merge: true },
    );
    if (info.pedidoDocId) {
      batch.set(
        doc(pedidosColRef(), info.pedidoDocId),
        { ...pedidoEnEdicion, mozoAsignado: mozoAsignadoObj },
        { merge: true },
      );
    }
  } else if (!pedidoEnEdicion.productos.length) {
    batch.set(
      doc(mesasColRef(), mesaAbiertaId),
      { mozoAsignado: mozoAsignadoObj, personas },
      { merge: true },
    );
  } else if (grupoSinPedido) {
    // mesas unidas que todavía no tenían pedido
    const nuevoRef = doc(pedidosColRef());
    const pedidoFinal = {
      ...pedidoEnEdicion,
      mesas: grupoSinPedido.mesas || [],
      negocio: { id: tiendaId, nombre: "", localidad },
      mozoAsignado: mozoAsignadoObj,
      timestamp: serverTimestamp(),
    };
    batch.set(
      doc(gruposColRef(), m.grupoId),
      { pedido: pedidoFinal, pedidoGrupoDocId: nuevoRef.id, estado: "activo" },
      { merge: true },
    );
    (grupoSinPedido.mesas || []).forEach((mm) =>
      batch.set(
        doc(mesasColRef(), mm.id),
        {
          estado: "ocupado",
          pago: "pendiente",
          pedidoMesaDocId: nuevoRef.id,
          mozoAsignado: mozoAsignadoObj,
          personas,
        },
        { merge: true },
      ),
    );
    batch.set(nuevoRef, { ...pedidoFinal, grupoId: m.grupoId });
  } else {
    const nuevoPedidoRef = doc(pedidosColRef());
    const pedidoFinal = {
      ...pedidoEnEdicion,
      mesa: {
        id: mesaAbiertaId,
        nombre: m.nombre_alias || null,
        numero: m.numero_mesa,
      },
      negocio: { id: tiendaId, nombre: "", localidad },
      mozoAsignado: mozoAsignadoObj,
      timestamp: serverTimestamp(),
    };
    batch.set(
      doc(mesasColRef(), mesaAbiertaId),
      {
        estado: "ocupado",
        pago: "pendiente",
        pedido: pedidoFinal,
        pedidoMesaDocId: nuevoPedidoRef.id,
        mozoAsignado: mozoAsignadoObj,
        personas,
      },
      { merge: true },
    );
    batch.set(nuevoPedidoRef, { ...pedidoFinal, mesaId: mesaAbiertaId });
  }

  await batch.commit();
  edicionSucia = false;
}

/* ══════════════ Descuento de inventario (disponible, no se llama automáticamente) ══════════════ */
async function descontarInventario(productos) {
  for (const it of productos) {
    if (!it.id || !it.categoria) continue;
    try {
      const prodRef = tiendaSubDoc(
        localidad,
        "tiendas",
        tiendaId,
        "productos",
        it.categoria,
        it.categoria,
        it.id,
      );
      const snap = await getDoc(prodRef);
      if (!snap.exists()) continue;
      const data = snap.data();
      if (typeof data.stock !== "number") continue;
      const nuevoStock = Math.max(0, data.stock - Number(it.cantidad || 0));
      const patch = { stock: nuevoStock };
      if (data.autoDesactivar && nuevoStock === 0) patch.disponible = false;
      await updateDoc(prodRef, patch);
    } catch (err) {
      console.warn("No se pudo descontar stock de", it.nombre, err);
    }
  }
}
void descontarInventario;

/* ══════════════ Botones del modal ══════════════ */
on("det-btn-guardar", "click", async () => {
  if (hayPendienteCliente)
    return toast(
      "Confirma (o quita) los productos nuevos del cliente primero",
      "error",
    );
  const btn = $("det-btn-guardar");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Guardando…";
  try {
    await persistirPedido({ marcarConfirmado: false });
    toast("Cambios guardados");
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

on("det-btn-confirmar", "click", () => {
  if (!pedidoEnEdicion.productos.length) return;
  askConfirm(
    "¿Confirmar y enviar a cocina?",
    "El pedido pasará a cocina y no podrás editarlo desde aquí después.",
    async () => {
      await persistirPedido({ marcarConfirmado: true });
      toast("✅ Pedido enviado a cocina");
      closeOverlay("overlay-detalle");
    },
    "Confirmar y enviar",
  );
});

on("det-btn-cancelar-pedido", "click", () => {
  askConfirm(
    "¿Cancelar pedido completo?",
    "Se eliminará el pedido de esta mesa. Esta acción no se puede deshacer.",
    async () => {
      const info = getPedidoDeMesa(mesaAbiertaId);
      const batch = writeBatch(db);
      if (info?.esGrupo) {
        batch.set(
          info.grupoRef,
          { pedido: null, estado: "cerrado" },
          { merge: true },
        );
        const grupo = gruposMap.get(grupoAbiertoId);
        (grupo?.mesas || []).forEach((mm) =>
          batch.set(
            doc(mesasColRef(), mm.id),
            { estado: "cancelado", grupoId: null, pago: "pendiente" },
            { merge: true },
          ),
        );
        if (info.pedidoDocId)
          batch.set(
            doc(pedidosColRef(), info.pedidoDocId),
            { estado: "cancelado" },
            { merge: true },
          );
      } else {
        batch.set(
          doc(mesasColRef(), mesaAbiertaId),
          { estado: "cancelado", pago: "pendiente", pedido: null },
          { merge: true },
        );
        if (info?.pedidoDocId)
          batch.set(
            doc(pedidosColRef(), info.pedidoDocId),
            { estado: "cancelado" },
            { merge: true },
          );
      }
      await batch.commit();
      toast("Pedido cancelado");
      closeOverlay("overlay-detalle");
    },
  );
});

on("det-btn-liberar", "click", () => {
  askConfirm(
    "¿Liberar mesa?",
    "Se marcará como pagada y quedará libre para el siguiente cliente.",
    async () => {
      const info = getPedidoDeMesa(mesaAbiertaId);
      const batch = writeBatch(db);
      if (info?.esGrupo) {
        const grupo = gruposMap.get(grupoAbiertoId);
        batch.set(info.grupoRef, { estado: "cerrado" }, { merge: true });
        (grupo?.mesas || []).forEach((mm) =>
          batch.set(
            doc(mesasColRef(), mm.id),
            {
              estado: "libre",
              grupoId: null,
              pago: "pagado",
              pedido: null,
              mozoAsignado: null,
              personas: null,
            },
            { merge: true },
          ),
        );
        if (info.pedidoDocId)
          batch.set(
            doc(pedidosColRef(), info.pedidoDocId),
            { estado: "entregado" },
            { merge: true },
          );
      } else {
        batch.set(
          doc(mesasColRef(), mesaAbiertaId),
          {
            estado: "libre",
            pago: "pagado",
            pedido: null,
            mozoAsignado: null,
            personas: null,
          },
          { merge: true },
        );
        if (info?.pedidoDocId)
          batch.set(
            doc(pedidosColRef(), info.pedidoDocId),
            { estado: "entregado" },
            { merge: true },
          );
      }
      await batch.commit();
      toast("🍽️ Mesa liberada");
      closeOverlay("overlay-detalle");
    },
  );
});

/* ══════════════ Llamados del cliente ══════════════ */
async function marcarLlamadoAtendido(llamado) {
  try {
    await updateDoc(doc(llamadosColRef(), llamado.id), {
      estado: "atendido",
      atendidoPor: mozoActivo?.nombre || null,
      atendidoEn: serverTimestamp(),
    });
    toast("Solicitud marcada como atendida");
  } catch (err) {
    console.error(err);
    toast("No se pudo actualizar el llamado.", "error");
  }
}
function iniciarListenerLlamados() {
  onSnapshot(
    llamadosColRef(),
    (snap) => {
      const nuevos = [];
      snap.docChanges().forEach((change) => {
        const data = { id: change.doc.id, ...change.doc.data() };
        if (change.type === "removed") {
          llamadosMap.delete(change.doc.id);
          return;
        }
        if (
          change.type === "added" &&
          !firstLlamadosSnapshot &&
          data.estado === "pendiente"
        )
          nuevos.push(data);
        llamadosMap.set(change.doc.id, data);
      });
      firstLlamadosSnapshot = false;
      renderMesaGrid();
      if (nuevos.length) {
        soundLlamado();
        bellRing();
        nuevos.forEach((l) =>
          toast(
            `🔔 Mesa ${l.mesaNumero}: ${MOTIVO_LABEL[l.motivo] || l.motivo}`,
          ),
        );
      }
    },
    (err) => console.error("Error escuchando llamados:", err),
  );
}

/* ══════════════ Listeners de mesas y grupos ══════════════ */
function iniciarListenerMesas() {
  onSnapshot(
    mesasColRef(),
    (snap) => {
      const nuevosPedidos = [];
      const listosNuevos = [];
      snap.forEach((d) => {
        const data = d.data();
        const anterior = mesasMap.get(d.id);
        if (
          ["ocupado", "pedido_pendiente"].includes(data.estado) &&
          data.pedido
        ) {
          const firma = `${data.pedido.hora || ""}|${data.pedido.total_items || 0}|${data.pedido.pendienteMozo?.length || 0}`;
          const firmaAnterior = mesaPedidoFirma.get(d.id);
          if (
            !firstMesasSnapshot &&
            firma !== firmaAnterior &&
            (data.pedido.estadoMozo !== "confirmado" ||
              data.pedido.pendienteMozo?.length) &&
            visibleParaMozo(data)
          )
            nuevosPedidos.push(data);
          if (
            anterior?.pedido?.estado !== "listo" &&
            data.pedido.estado === "listo" &&
            visibleParaMozo(data)
          )
            listosNuevos.push(data);
          mesaPedidoFirma.set(d.id, firma);
        } else {
          mesaPedidoFirma.delete(d.id);
        }
        mesasMap.set(d.id, data);
      });
      // limpiar mesas eliminadas
      const idsActuales = new Set();
      snap.forEach((d) => idsActuales.add(d.id));
      [...mesasMap.keys()].forEach((id) => {
        if (!idsActuales.has(id)) mesasMap.delete(id);
      });

      firstMesasSnapshot = false;
      renderMesaGrid();
      hideLoader();

      if (nuevosPedidos.length) {
        soundPedidoNuevo();
        bellRing();
        nuevosPedidos.forEach((p) =>
          toast(
            `🍽️ Pedido nuevo en ${p.pedido?.mesa?.nombre || p.nombre_alias || "Mesa " + (p.numero_mesa ?? "")}`,
          ),
        );
      }
      if (listosNuevos.length) {
        soundListo();
        bellRing();
        listosNuevos.forEach((p) =>
          toast(
            `✅ Pedido listo en ${p.pedido?.mesa?.nombre || p.nombre_alias || "una mesa"}`,
          ),
        );
      }
    },
    (err) => {
      console.error(err);
      toast("Conexión interrumpida, reintentando…", "error");
      hideLoader();
    },
  );
}
const grupoFirma = new Map();
let primerGrupos = true;
function iniciarListenerGrupos() {
  onSnapshot(
    gruposColRef(),
    (snap) => {
      gruposMap.clear();
      snap.forEach((d) => {
        const g = { id: d.id, ...d.data() };
        gruposMap.set(d.id, g);
        const p = g.pedido;
        if (p && ["activo", "pedido_pendiente"].includes(g.estado)) {
          const f = `${p.total_items || 0}|${p.pendienteMozo?.length || 0}|${p.estadoMozo}`;
          const necesita =
            p.estadoMozo !== "confirmado" || p.pendienteMozo?.length;
          const visible =
            !g.mozoAsignado || esAdmin || g.mozoAsignado?.id === mozoActivo?.id;
          if (
            !primerGrupos &&
            grupoFirma.get(d.id) !== f &&
            necesita &&
            visible
          ) {
            soundPedidoNuevo();
            bellRing();
            toast(
              `🍽️ Pedido nuevo en ${(g.mesas || []).map((m) => m.nombre).join(" + ")}`,
            );
          }
          grupoFirma.set(d.id, f);
        }
      });
      primerGrupos = false;
      renderMesaGrid();
    },
    (err) => console.error("Error escuchando grupos:", err),
  );
}
function hideLoader() {
  const loader = $("pageLoader");
  if (loader) loader.remove();
}

async function setEstadoMesa(nuevo) {
  const info = getPedidoDeMesa(mesaAbiertaId);
  if (!info) return;
  const productos = (info.pedido.productos || []).map((it) => {
    const cur = estItem(it, info.pedido);
    return cur === "entregado" || cur === nuevo
      ? { ...it, estadoItem: cur }
      : { ...it, estadoItem: nuevo };
  });
  const p = {
    ...info.pedido,
    productos,
    estadoMesa: derivarEstadoMesa(productos, nuevo),
  };
  const batch = writeBatch(db);
  if (info.esGrupo) batch.set(info.grupoRef, { pedido: p }, { merge: true });
  else
    batch.set(
      doc(mesasColRef(), mesaAbiertaId),
      { pedido: p },
      { merge: true },
    );
  if (info.pedidoDocId)
    batch.set(
      doc(pedidosColRef(), info.pedidoDocId),
      { estadoMesa: p.estadoMesa, productos },
      { merge: true },
    );
  try {
    await batch.commit();
    toast(
      nuevo === "entregado" ? "🍽️ Marcado como entregado" : "🔥 En preparación",
    );
  } catch (e) {
    console.error(e);
    toast("No se pudo actualizar.", "error");
  }
}
on("det-btn-prep", "click", () => setEstadoMesa("en_preparacion"));
on("det-btn-entregado", "click", () => setEstadoMesa("entregado"));

/* Si el mozo toca notas/personas, no se le repinta encima */
["det-nota-interna", "det-personas"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => (edicionSucia = true));
  el.addEventListener("change", () => (edicionSucia = true));
});

/* ══════════════ Unir / separar mesas ══════════════ */
let modoUnir = false;
const selUnir = new Set();

document.body.insertAdjacentHTML(
  "beforeend",
  `
<button id="unirToggle" type="button" class="mz-fab">🔗 Unir mesas</button>
<div id="unirBar" class="mz-unirbar">
  <span id="unirTxt"></span>
  <button id="unirOk" type="button" style="background:var(--ok);color:#fff;">Unir</button>
  <button id="unirSep" type="button" style="background:#f59e0b;color:#1c1200;">Separar</button>
  <button id="unirX" type="button" style="background:var(--surface2);border:1px solid var(--line);">✕</button>
</div>`,
);

function pintarUnirBar() {
  $("unirBar").style.display = modoUnir ? "flex" : "none";
  $("unirToggle").style.display = modoUnir ? "none" : "";
  setText("unirTxt", `${selUnir.size} mesa(s) seleccionada(s)`);
}
function salirModoUnir() {
  modoUnir = false;
  selUnir.clear();
  pintarUnirBar();
  renderMesaGrid();
}
$("unirToggle").onclick = () => {
  modoUnir = true;
  pintarUnirBar();
  renderMesaGrid();
};
$("unirX").onclick = salirModoUnir;

function clickMesa(mesaDocId) {
  if (!modoUnir) return abrirDetalleMesa(mesaDocId);
  const m = mesasMap.get(mesaDocId);
  const ids = m?.grupoId
    ? [...mesasMap.entries()]
        .filter(([, x]) => x.grupoId === m.grupoId)
        .map(([id]) => id)
    : [mesaDocId];
  const todas = ids.every((i) => selUnir.has(i));
  ids.forEach((i) => (todas ? selUnir.delete(i) : selUnir.add(i)));
  pintarUnirBar();
  renderMesaGrid();
}

$("unirOk").onclick = async () => {
  const mesas = [...selUnir].map((id) => ({ id, ...mesasMap.get(id) }));
  if (mesas.length < 2) return toast("Selecciona al menos 2 mesas", "error");
  const gids = [...new Set(mesas.map((m) => m.grupoId).filter(Boolean))];
  if (gids.length > 1)
    return toast("Hay más de un grupo en la selección", "error");
  const sueltasConPedido = mesas.filter(
    (m) => !m.grupoId && getPedidoDeMesa(m.id),
  );
  if (sueltasConPedido.length > 1 || (gids.length && sueltasConPedido.length))
    return toast("Solo una de las mesas puede tener pedido", "error");

  const base = gids[0] ? gruposMap.get(gids[0]) : null;
  const grupoId = gids[0] || doc(gruposColRef()).id;
  const lista = base ? [...(base.mesas || [])] : [];
  mesas.forEach((m) => {
    if (!lista.some((x) => x.id === m.id))
      lista.push({
        id: m.id,
        nombre: m.nombre_alias || `Mesa ${m.numero_mesa}`,
        numero: m.numero_mesa,
      });
  });
  const suelto = sueltasConPedido[0]
    ? getPedidoDeMesa(sueltasConPedido[0].id)
    : null;
  const pedDocId = suelto?.pedidoDocId || base?.pedidoGrupoDocId || null;

  const batch = writeBatch(db);
  const g = { estado: "activo", mesas: lista };
  if (!base) {
    g.creado_en = serverTimestamp();
    g.pedido = null;
    g.pedidoGrupoDocId = null;
  }
  if (suelto) {
    g.pedido = { ...suelto.pedido, mesas: lista };
    g.pedidoGrupoDocId = suelto.pedidoDocId;
  }
  batch.set(doc(gruposColRef(), grupoId), g, { merge: true });

  mesas.forEach((m) => {
    const patch = {
      estado: "ocupado",
      grupoId,
      grupo_color: "#f59e0b",
      reservado_en: null,
      hora_reservada: null,
    };
    if (pedDocId) patch.pedidoMesaDocId = pedDocId;
    if (suelto && m.id === sueltasConPedido[0].id) patch.pedido = null;
    batch.set(doc(mesasColRef(), m.id), patch, { merge: true });
  });
  if (suelto?.pedidoDocId)
    batch.set(
      doc(pedidosColRef(), suelto.pedidoDocId),
      { mesas: lista, grupoId },
      { merge: true },
    );

  try {
    await batch.commit();
    toast("🔗 Mesas unidas");
    salirModoUnir();
  } catch (e) {
    console.error(e);
    toast("No se pudo unir", "error");
  }
};

$("unirSep").onclick = async () => {
  const gids = [
    ...new Set(
      [...selUnir].map((id) => mesasMap.get(id)?.grupoId).filter(Boolean),
    ),
  ];
  if (!gids.length)
    return toast("No hay mesas unidas en la selección", "error");
  if (gids.some((g) => gruposMap.get(g)?.pedido))
    return toast("Ese grupo tiene pedido: libéralo o cóbralo primero", "error");
  const batch = writeBatch(db);
  gids.forEach((gid) => {
    (gruposMap.get(gid)?.mesas || []).forEach((mm) =>
      batch.set(
        doc(mesasColRef(), mm.id),
        {
          estado: "libre",
          grupoId: null,
          grupo_color: null,
          pedidoMesaDocId: null,
        },
        { merge: true },
      ),
    );
    batch.set(doc(gruposColRef(), gid), { estado: "cerrado" }, { merge: true });
  });
  try {
    await batch.commit();
    toast("⇱ Mesas separadas");
    salirModoUnir();
  } catch (e) {
    console.error(e);
    toast("No se pudo separar", "error");
  }
};
pintarUnirBar();

/* ══════════════ Arranque ══════════════ */
async function arrancar() {
  const ok = await resolverTienda();
  if (!ok) {
    hideLoader();
    toast("No se pudo identificar el negocio.", "error");
    return;
  }
  iniciarListenerConfig();
  iniciarListenerMozos();
  iniciarListenerMesas();
  iniciarListenerGrupos();
  iniciarListenerLlamados();
  cargarCatalogo();

  if (esAdmin) {
    mozoActivo = { id: "admin", nombre: "Administrador" };
    setText("mozoActivoNombre", "Administrador");
    $("btnCambiarMozo")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
  } else if (!(await restaurarSesion())) {
    hideLoader();
    openOverlay("mozoSelectOverlay");
  }
}
arrancar();

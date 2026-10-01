import { db } from "../db/db.js";
import { tiendaSubDoc, tiendaSubCol } from "../rutas/rutas.js";
import {
  doc,
  setDoc,
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
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  const isError = type === "error";
  el.className = `toast-in w-full sm:w-auto sm:min-w-[240px] rounded-2xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-md ${
    isError
      ? "bg-red-950/90 border-red-500/40 text-red-200"
      : "bg-[#0d0a17]/95 border-violet-500/40 text-violet-100"
  }`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 200);
  }, 3200);
}
function openOverlay(id) {
  document.getElementById(id).classList.add("show");
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove("show");
}
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
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").textContent = body;
  document.getElementById("btn-confirm-action-label").textContent =
    confirmLabel;
  confirmCallback = onConfirm;
  openOverlay("overlay-confirm");
}
document
  .getElementById("btn-confirm-action")
  .addEventListener("click", async () => {
    const btn = document.getElementById("btn-confirm-action");
    const label = document.getElementById("btn-confirm-action-label");
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
const btnSonido = document.getElementById("btnSonido");
function paintSonido() {
  btnSonido.textContent = soundEnabled ? "🔔" : "🔕";
}
paintSonido();
btnSonido.addEventListener("click", () => {
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
  btnSonido.classList.remove("ring-anim");
  void btnSonido.offsetWidth;
  btnSonido.classList.add("ring-anim");
}

/* ══════════════ Estado en memoria ══════════════ */
const mesasMap = new Map();
const gruposMap = new Map();
const llamadosMap = new Map();
const mozosMap = new Map();
let catalogo = [];
let catalogoListo = false;
let mozoActivo = null; // {id, nombre}
let mesaAbiertaId = null;
let grupoAbiertoId = null;
let pedidoEnEdicion = null;
let firstMesasSnapshot = true;
let firstLlamadosSnapshot = true;
const mesaPedidoFirma = new Map();

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
  document.getElementById("mozoActivoNombre").textContent = nombre;
  closeOverlay("mozoSelectOverlay");
  document.getElementById("app").classList.remove("hidden");
  poblarSelectMozoEnDetalle();
  renderMesaGrid();
}

async function loginMozo() {
  const err = document.getElementById("mzError");
  err.classList.add("hidden");
  const usuario = document.getElementById("mzUser").value.trim().toLowerCase();
  const pin = document.getElementById("mzPin").value.trim();
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
document.getElementById("mzLoginBtn").addEventListener("click", loginMozo);
document
  .getElementById("mzPin")
  .addEventListener("keydown", (e) => e.key === "Enter" && loginMozo());

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

document.getElementById("btnCambiarMozo").addEventListener("click", () => {
  localStorage.removeItem(sesKey());
  location.reload();
});

function iniciarListenerMozos() {
  onSnapshot(
    mozosColRef(),
    (snap) => {
      mozosMap.clear();
      snap.forEach((d) => mozosMap.set(d.id, d.data()));
      poblarSelectMozoEnDetalle();
    },
    (err) => console.error("Error escuchando mozos:", err),
  );
}
function poblarSelectMozoEnDetalle() {
  const sel = document.getElementById("det-mozo-select");
  const actual = sel.value;
  sel.innerHTML = `<option value="">Sin asignar</option>`;
  [...mozosMap.entries()]
    .filter(([, m]) => m.activo !== false)
    .forEach(([id, m]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = m.nombre;
      sel.appendChild(opt);
    });
  if (actual) sel.value = actual;
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
                .filter((o) => o.activo)
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

function getLlamadoActivo(mesaNumero) {
  return (
    [...llamadosMap.values()].find(
      (l) =>
        Number(l.mesaNumero) === Number(mesaNumero) && l.estado === "pendiente",
    ) || null
  );
}

/* ══════════════ Estado visual de una mesa ══════════════ */
const MOTIVO_LABEL = {
  confirmar_pedido: "Confirmar pedido",
  agregar_productos: "Agregar productos",
  cuenta: "Solicita la cuenta",
  ayuda: "Necesita ayuda",
};

function computeEstadoVisual(mesaDocId) {
  const m = mesasMap.get(mesaDocId);
  const info = getPedidoDeMesa(mesaDocId);
  const llamado = getLlamadoActivo(m.numero_mesa);

  if (llamado && llamado.motivo === "cuenta") return "cuenta";
  if (m.estado === "reservada") return "reservada";
  if (!info) return "libre";

  const pedido = info.pedido;
  if (pedido.estado === "listo") return "listo";
  if (pedido.estadoMozo !== "confirmado") return "pendiente";
  return "preparacion";
}

const ESTADO_META = {
  libre: { label: "Libre", dot: "🟢", cls: "st-libre" },
  pendiente: { label: "Por confirmar", dot: "🟠", cls: "st-pendiente" },
  preparacion: { label: "En preparación", dot: "🔵", cls: "st-preparacion" },
  listo: { label: "Listo", dot: "🟣", cls: "st-listo" },
  cuenta: { label: "Pide la cuenta", dot: "🔴", cls: "st-cuenta" },
  reservada: { label: "Reservada", dot: "🟣", cls: "st-reservada" },
};

/* ══════════════ Tablero de mesas ══════════════ */
function renderMesaGrid() {
  const grid = document.getElementById("mesaGrid");
  const empty = document.getElementById("emptyMesas");
  const todas = [...mesasMap.entries()]
    .filter(([, m]) => visibleParaMozo(m))
    .sort((a, b) => (a[1].numero_mesa || 0) - (b[1].numero_mesa || 0));

  if (!todas.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    empty.classList.add("flex");
    actualizarIndicadores();
    return;
  }
  empty.classList.add("hidden");
  empty.classList.remove("flex");

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

  grid.innerHTML = "";
  bloques.forEach((bloque) => {
    const card = document.createElement("div");
    if (bloque.tipo === "single") {
      const { mesaDocId, m } = bloque;
      const estado = computeEstadoVisual(mesaDocId);
      const meta = ESTADO_META[estado];
      const info = getPedidoDeMesa(mesaDocId);
      const total = info ? Number(info.pedido.total || 0) : 0;
      const tsMs = info ? toDate(info.pedido.timestamp)?.getTime() : null;
      const mozoNombre = m.mozoAsignado?.nombre || null;

      card.className = `mesa-card animate-fadeIn ${meta.cls}`;
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-[15px]">${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</span>
          <span class="text-base">${meta.dot}</span>
        </div>
        <span class="chip w-fit" style="background:var(--surface-2); color:var(--ink-dim);">${meta.label}</span>
        ${tsMs ? `<span class="text-[11px] text-[var(--ink-faint)]">⏱ ${timeAgoCorto(new Date(tsMs))}</span>` : ""}
        <div class="flex-1"></div>
        ${info ? `<span class="font-bold text-[15px] mono">${fmtMoney(total)}</span>` : `<span class="text-[11px] text-[var(--ink-faint)]">Sin pedido</span>`}
        ${mozoNombre ? `<span class="text-[10.5px] text-[var(--ink-faint)] truncate">👤 ${escapeHtml(mozoNombre)}</span>` : ""}
      `;
      card.addEventListener("click", () => abrirDetalleMesa(mesaDocId));
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

      card.className = `mesa-card animate-fadeIn ${meta.cls}`;
      card.style.gridColumn = `span ${Math.min(bloque.integrantes.length, 2)}`;
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-[14px] truncate">${escapeHtml(nombres)}</span>
          <span class="text-base flex-shrink-0">${meta.dot}</span>
        </div>
        <span class="chip w-fit" style="background:var(--surface-2); color:var(--ink-dim);">${meta.label} · Grupo</span>
        ${tsMs ? `<span class="text-[11px] text-[var(--ink-faint)]">⏱ ${timeAgoCorto(new Date(tsMs))}</span>` : ""}
        <div class="flex-1"></div>
        <span class="font-bold text-[15px] mono">${fmtMoney(total)}</span>
      `;
      card.addEventListener("click", () =>
        abrirDetalleMesa(bloque.integrantes[0][0]),
      );
    }
    grid.appendChild(card);
  });

  actualizarIndicadores();

  if (
    mesaAbiertaId &&
    document.getElementById("overlay-detalle").classList.contains("show")
  ) {
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
    if (info.pedido.estadoMozo !== "confirmado") pendientes++;
    if (info.pedido.estado === "listo") listos++;
  });
  const llamadosPendientes = [...llamadosMap.values()].filter(
    (l) => l.estado === "pendiente",
  );
  const cuentaPendientes = llamadosPendientes.filter(
    (l) => l.motivo === "cuenta",
  ).length;

  document.getElementById("ind-ocupadas").textContent = ocupadas;
  document.getElementById("ind-pendientes").textContent = pendientes;

  document.getElementById("ind-cuenta").textContent = cuentaPendientes;
}

/* ══════════════ Detalle de mesa ══════════════ */
function abrirDetalleMesa(mesaDocId) {
  mesaAbiertaId = mesaDocId;
  const m = mesasMap.get(mesaDocId);
  grupoAbiertoId = m?.grupoId || null;
  pintarDetalleMesa(mesaDocId);
  openOverlay("overlay-detalle");
}

function pintarDetalleMesa(mesaDocId) {
  const m = mesasMap.get(mesaDocId);
  if (!m) {
    closeOverlay("overlay-detalle");
    return;
  }
  const info = getPedidoDeMesa(mesaDocId);
  const estado = computeEstadoVisual(mesaDocId);
  const meta = ESTADO_META[estado];
  const llamado = getLlamadoActivo(m.numero_mesa);

  document.getElementById("det-titulo").textContent =
    m.nombre_alias || `Mesa ${m.numero_mesa}`;
  document.getElementById("det-subtitulo").textContent = info
    ? `Pedido a las ${info.pedido.hora || "—"}`
    : "Mesa sin pedido activo";
  document.getElementById("det-chip-estado").textContent =
    `${meta.dot} ${meta.label}`;
  const tsMs = info ? toDate(info.pedido.timestamp)?.getTime() : null;
  document.getElementById("det-chip-tiempo").textContent = tsMs
    ? `⏱ ${timeAgoCorto(new Date(tsMs))} ocupada`
    : "⏱ —";

  poblarSelectMozoEnDetalle();
  document.getElementById("det-mozo-select").value = m.mozoAsignado?.id || "";
  document.getElementById("det-personas").value = m.personas ?? "";

  const banner = document.getElementById("det-llamado-banner");
  if (llamado) {
    banner.classList.remove("hidden");
    document.getElementById("det-llamado-motivo").textContent =
      MOTIVO_LABEL[llamado.motivo] || llamado.motivo;
    document.getElementById("det-llamado-atender").onclick = () =>
      marcarLlamadoAtendido(llamado);
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

  document.getElementById("det-nota-cliente").textContent =
    pedidoEnEdicion.nota || "Sin especificaciones";
  document.getElementById("det-nota-interna").value =
    pedidoEnEdicion.notaInterna || "";

  pintarProductosEdicion();

  const yaConfirmado = pedidoEnEdicion.estadoMozo === "confirmado";
  const btnConfirmar = document.getElementById("det-btn-confirmar");
  document.getElementById("det-btn-confirmar-label").textContent = yaConfirmado
    ? "Ya enviado a cocina ✓"
    : "Confirmar y enviar a cocina";
  btnConfirmar.disabled =
    yaConfirmado || pedidoEnEdicion.productos.length === 0;
  btnConfirmar.style.opacity = btnConfirmar.disabled ? ".5" : "1";

  document.getElementById("det-btn-cancelar-pedido").style.display = info
    ? ""
    : "none";
  document.getElementById("det-btn-liberar").style.display = info ? "" : "none";
  const confirmado = !!info && pedidoEnEdicion.estadoMozo === "confirmado";
  document.getElementById("det-btn-prep").style.display = confirmado
    ? ""
    : "none";
  document.getElementById("det-btn-entregado").style.display = confirmado
    ? ""
    : "none";
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

function pintarProductosEdicion() {
  const wrap = document.getElementById("det-productos");
  const sinProductos = document.getElementById("det-sin-productos");
  wrap.innerHTML = "";
  const items = pedidoEnEdicion.productos;
  sinProductos.classList.toggle("hidden", items.length > 0);

  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "surface-2 rounded-2xl p-3 flex flex-col gap-2";
    const opcionesTxt = opcionesATexto(it.opciones);
    row.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-bold text-[13.5px] truncate">${escapeHtml(it.nombre)}</p>
          ${opcionesTxt ? `<p class="text-[10.5px] text-[var(--ink-faint)] truncate">${escapeHtml(opcionesTxt)}</p>` : ""}
          <p class="text-[11px] text-[var(--ink-dim)] mono">S/ ${Number(it.precio_unitario || 0).toFixed(2)} c/u</p>
        </div>
        <button data-remove="${idx}" class="text-red-400/70 hover:text-red-400 text-xs font-bold flex-shrink-0">Quitar</button>
      </div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button data-minus="${idx}" class="qty-btn">−</button>
          <span class="w-6 text-center font-bold text-sm">${it.cantidad}</span>
          <button data-plus="${idx}" class="qty-btn">+</button>
        </div>
        <span class="font-bold text-sm mono">${fmtMoney(it.subtotal)}</span>
      </div>
      <input data-obs="${idx}" type="text" placeholder="Observación (ej. sin cebolla)" value="${escapeHtml(it.observacion || "")}"
        class="field-input text-[12px] py-1.5">
    `;
    wrap.appendChild(row);
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
  wrap.querySelectorAll("[data-obs]").forEach((inp) =>
    inp.addEventListener("input", () => {
      pedidoEnEdicion.productos[+inp.dataset.obs].observacion = inp.value;
    }),
  );

  document.getElementById("det-total").textContent = fmtMoney(
    pedidoEnEdicion.total,
  );
}

function cambiarCantidad(idx, delta) {
  const it = pedidoEnEdicion.productos[idx];
  if (!it) return;
  it.cantidad = Math.max(1, (it.cantidad || 1) + delta);
  it.subtotal = +(it.cantidad * it.precio_unitario).toFixed(2);
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
}
function quitarProducto(idx) {
  pedidoEnEdicion.productos.splice(idx, 1);
  recalcularTotales();
  pintarProductosEdicion();
  refrescarBotonConfirmar();
}
function refrescarBotonConfirmar() {
  const btn = document.getElementById("det-btn-confirmar");
  const yaConfirmado = pedidoEnEdicion.estadoMozo === "confirmado";
  btn.disabled = yaConfirmado || pedidoEnEdicion.productos.length === 0;
  btn.style.opacity = btn.disabled ? ".5" : "1";
}

/* ══════════════ Agregar producto desde catálogo ══════════════ */
let pickerFiltroCategoria = "Todos";

document
  .getElementById("btn-agregar-producto")
  .addEventListener("click", async () => {
    if (!catalogoListo) {
      toast("Cargando catálogo, un momento…");
      await cargarCatalogo();
    }
    document.getElementById("picker-search").value = "";
    pickerFiltroCategoria = "Todos";
    pintarCategoriasPicker();
    pintarPicker(catalogo);
    openOverlay("overlay-picker");
  });
document
  .getElementById("picker-search")
  .addEventListener("input", aplicarFiltroPicker);

function pintarCategoriasPicker() {
  const categorias = [...new Set(catalogo.map((p) => p.categoria))];
  const wrap = document.getElementById("picker-categorias");
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
  const q = document.getElementById("picker-search").value.trim().toLowerCase();
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
  const wrap = document.getElementById("picker-lista");
  wrap.innerHTML = "";
  if (!lista.length) {
    wrap.innerHTML = `<p class="text-xs text-[var(--ink-faint)] text-center py-8">Sin resultados</p>`;
    return;
  }
  lista.forEach((p) => {
    const agotado = typeof p.stock === "number" && p.stock <= 0;
    const condTxt = (p.condiciones || []).map((c) => c.nombre).join(" · ");
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "flex items-center gap-3 surface-2 rounded-2xl p-2.5 text-left hover:border-violet-600 border border-transparent transition-all" +
      (agotado ? " opacity-50" : "");
    row.innerHTML = `
      <div class="w-11 h-11 rounded-xl bg-black/30 flex-shrink-0 overflow-hidden">${p.imagen ? `<img src="${p.imagen}" class="w-full h-full object-cover">` : ""}</div>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-[13px] truncate">${escapeHtml(p.nombre)}</p>
        <p class="text-[11px] text-[var(--ink-dim)]">${escapeHtml(p.categoria)} · <span class="mono">S/ ${p.precio.toFixed(2)}</span></p>
        ${condTxt ? `<p class="text-[10px] text-[var(--ink-faint)] mt-0.5 truncate">Opciones: ${escapeHtml(condTxt)}</p>` : ""}
      </div>
      <div class="flex-shrink-0">${stockBadgeHtml(p.stock)}</div>
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

/* ══════════════ Opciones/condiciones del producto ══════════════ */
let productoParaOpciones = null;
let seleccionOpcionesActual = {};

function abrirOpcionesProducto(p) {
  productoParaOpciones = p;
  seleccionOpcionesActual = {};
  document.getElementById("opciones-prod-nombre").textContent = p.nombre;
  const body = document.getElementById("opciones-body");
  body.innerHTML = "";

  p.condiciones.forEach((cond) => {
    const wrap = document.createElement("div");
    const label = document.createElement("p");
    label.className =
      "text-[10px] uppercase tracking-wider font-bold text-[var(--ink-faint)] mb-2";
    label.textContent = cond.nombre;
    wrap.appendChild(label);

    const optsWrap = document.createElement("div");
    optsWrap.className = "flex flex-wrap gap-2";
    const primeraDisponible = cond.opciones.find(
      (o) => !(typeof o.stock === "number" && o.stock <= 0),
    );
    cond.opciones.forEach((op) => {
      const agotada = typeof op.stock === "number" && op.stock <= 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "toggle-opt" +
        (op === primeraDisponible ? " active" : "") +
        (agotada ? " agotado" : "");
      btn.textContent = op.costoAdicional
        ? `${op.nombre} (+S/ ${op.costoAdicional.toFixed(2)})`
        : op.nombre;
      if (agotada) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          optsWrap
            .querySelectorAll(".toggle-opt")
            .forEach((o) => o.classList.remove("active"));
          btn.classList.add("active");
          seleccionOpcionesActual[cond.nombre] = op.nombre;
        });
      }
      optsWrap.appendChild(btn);
    });
    wrap.appendChild(optsWrap);
    body.appendChild(wrap);
    if (primeraDisponible)
      seleccionOpcionesActual[cond.nombre] = primeraDisponible.nombre;
  });

  openOverlay("overlay-picker-opciones");
}
document
  .getElementById("opciones-btn-agregar")
  .addEventListener("click", () => {
    if (!productoParaOpciones) return;
    agregarProductoAlPedido(productoParaOpciones, {
      ...seleccionOpcionesActual,
    });
    closeOverlay("overlay-picker-opciones");
    closeOverlay("overlay-picker");
  });

function calcPrecioFinal(p, seleccion) {
  let precio = Number(p.precio) || 0;
  if (!seleccion) return precio;
  (p.condiciones || []).forEach((cond) => {
    const elegido = seleccion[cond.nombre];
    if (!elegido) return;
    const op = cond.opciones.find((o) => o.nombre === elegido);
    if (op && op.costoAdicional) precio += op.costoAdicional;
  });
  return +precio.toFixed(2);
}

function agregarProductoAlPedido(p, seleccion = null) {
  const precioFinal = calcPrecioFinal(p, seleccion);
  const clavesSeleccion = seleccion
    ? Object.keys(seleccion)
        .sort()
        .map((k) => `${k}:${seleccion[k]}`)
        .join("|")
    : "";
  const existente = pedidoEnEdicion.productos.find((it) => {
    const itClaves = it.opciones
      ? Object.keys(it.opciones)
          .sort()
          .map((k) => `${k}:${it.opciones[k]}`)
          .join("|")
      : "";
    return it.id === p.id && itClaves === clavesSeleccion;
  });
  if (existente) {
    existente.cantidad += 1;
    existente.subtotal = +(
      existente.cantidad * existente.precio_unitario
    ).toFixed(2);
  } else {
    pedidoEnEdicion.productos.push({
      id: p.id,
      cartKey: p.id + "_" + Date.now(),
      nombre: p.nombre,
      categoria: p.categoria,
      precio_unitario: precioFinal,
      cantidad: 1,
      subtotal: precioFinal,
      imagen: p.imagen || "",
      opciones: seleccion || null,
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

  pedidoEnEdicion.notaInterna = document
    .getElementById("det-nota-interna")
    .value.trim();
  const personasVal = document.getElementById("det-personas").value;
  const mozoSelId = document.getElementById("det-mozo-select").value;
  const mozoSelNombre = mozoSelId ? mozosMap.get(mozoSelId)?.nombre : null;
  recalcularTotales();
  if (getPedidoDeMesa(mesaAbiertaId)) pedidoEnEdicion.editadoPorMozo = true;
  if (marcarConfirmado) {
        pedidoEnEdicion.estadoMesa = "aceptado";
    pedidoEnEdicion.estadoMozo = "confirmado";
    pedidoEnEdicion.mozoConfirmo = mozoActivo;
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

  const mozoAsignadoObj = mozoSelId
    ? { id: mozoSelId, nombre: mozoSelNombre }
    : null;
  const personas =
    personasVal === "" ? null : Math.max(0, parseInt(personasVal, 10) || 0);

  const batch = writeBatch(db);
  const info = getPedidoDeMesa(mesaAbiertaId);

  if (info && info.esGrupo) {
    batch.set(
      info.grupoRef,
      { pedido: pedidoEnEdicion, ...(marcarConfirmado ? { estado: "activo" } : {}) },
      { merge: true },
    );    if (info.pedidoDocId) {
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
               { mozoAsignado: mozoAsignadoObj, personas, ...(marcarConfirmado ? { estado: "ocupado" } : {}) },
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
  } else {
    // Mesa sin pedido activo: el mozo toma el pedido manualmente
    if (!pedidoEnEdicion.productos.length) {
      batch.set(
        doc(mesasColRef(), mesaAbiertaId),
        { mozoAsignado: mozoAsignadoObj, personas },
        { merge: true },
      );
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
  }

  await batch.commit();
}

/* ══════════════ Descuento de inventario al confirmar ══════════════ */
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

/* ══════════════ Botones del modal ══════════════ */
document
  .getElementById("det-btn-guardar")
  .addEventListener("click", async () => {
    const btn = document.getElementById("det-btn-guardar");
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

document.getElementById("det-btn-confirmar").addEventListener("click", () => {
  if (!pedidoEnEdicion.productos.length) return;
  askConfirm(
    "¿Confirmar y enviar a cocina?",
    "El pedido pasará a cocina, se descontará el inventario y no podrás editarlo desde aquí después.",
    async () => {
      await persistirPedido({ marcarConfirmado: true });
  
      toast("✅ Pedido enviado a cocina");
      closeOverlay("overlay-detalle");
    },
    "Confirmar y enviar",
  );
});

document
  .getElementById("det-btn-cancelar-pedido")
  .addEventListener("click", () => {
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

document.getElementById("det-btn-liberar").addEventListener("click", () => {
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
          const firma = `${data.pedido.hora || ""}|${data.pedido.total_items || 0}`;
          const firmaAnterior = mesaPedidoFirma.get(d.id);
          if (
            !firstMesasSnapshot &&
            firma !== firmaAnterior &&
            data.pedido.estadoMozo !== "confirmado" &&
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
            `🍽️ Pedido nuevo en ${p.mesa?.nombre || p.pedido?.mesa?.nombre || "una mesa"}`,
          ),
        );
      }
      if (listosNuevos.length) {
        soundListo();
        bellRing();
        listosNuevos.forEach((p) =>
          toast(`🟣 Pedido listo en ${p.pedido?.mesa?.nombre || "una mesa"}`),
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
function iniciarListenerGrupos() {
  onSnapshot(
    gruposColRef(),
    (snap) => {
      gruposMap.clear();
      snap.forEach((d) => gruposMap.set(d.id, { id: d.id, ...d.data() }));
      renderMesaGrid();
    },
    (err) => console.error("Error escuchando grupos:", err),
  );
}

function hideLoader() {
  const loader = document.getElementById("pageLoader");
  if (loader) loader.remove();
}

async function setEstadoMesa(nuevo) {
  const info = getPedidoDeMesa(mesaAbiertaId);
  if (!info) return;
  const p = { ...info.pedido, estadoMesa: nuevo };
  const batch = writeBatch(db);
  if (info.esGrupo) batch.set(info.grupoRef, { pedido: p }, { merge: true });
  else batch.set(doc(mesasColRef(), mesaAbiertaId), { pedido: p }, { merge: true });
  if (info.pedidoDocId)
    batch.set(doc(pedidosColRef(), info.pedidoDocId), { estadoMesa: nuevo }, { merge: true });
  try {
    await batch.commit();
    toast(nuevo === "entregado" ? "🍽️ Marcado como entregado" : "🔥 En preparación");
  } catch (e) {
    console.error(e);
    toast("No se pudo actualizar.", "error");
  }
}
document.getElementById("det-btn-prep").addEventListener("click", () => setEstadoMesa("en_preparacion"));
document.getElementById("det-btn-entregado").addEventListener("click", () => setEstadoMesa("entregado"));
/* ══════════════ Arranque ══════════════ */
async function arrancar() {
  const ok = await resolverTienda();
  if (!ok) {
    hideLoader();
    toast("No se pudo identificar el negocio.", "error");
    return;
  }
  iniciarListenerMozos();
  iniciarListenerMesas();
  iniciarListenerGrupos();
  iniciarListenerLlamados();
  cargarCatalogo();

  if (esAdmin) {
    mozoActivo = { id: "admin", nombre: "Administrador" };
    document.getElementById("mozoActivoNombre").textContent = "Administrador";
    document.getElementById("app").classList.remove("hidden");
  } else if (!(await restaurarSesion())) {
    hideLoader();
    openOverlay("mozoSelectOverlay");
  }
}
arrancar();

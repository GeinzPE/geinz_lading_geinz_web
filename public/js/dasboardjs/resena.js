import {
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  tiendaReviewsCol,
  tiendaReviewDoc,
  tiendaSubCol,
  tiendaSubDoc,
  registradoDoc,
} from "../rutas/rutas.js";

// Cache de verificaciones "es cliente/seguidor"
const cacheEsCliente = new Map();

async function esCliente(uid) {
  if (!uid) return false;
  if (cacheEsCliente.has(uid)) return cacheEsCliente.get(uid);
  try {
    const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "clientes", uid);
    const snap = await getDoc(ref);
    const existe = snap.exists();
    cacheEsCliente.set(uid, existe);
    return existe;
  } catch (err) {
    console.error("Error verificando cliente/seguidor:", err);
    return false;
  }
}

// ── CAMPOS REALES de la reseña ──
// calificacion, descripcion, id_user, lista_img_url, nombre_usuario, timestamp,
// respuesta_tienda{texto,fecha}, telefono, puntos_bonus, bonus_estado
//
// Colecciones (dentro de Tiendas/{localidad}/tiendas/{tiendaId}/):
//  - review/{uid}            → reseñas de usuarios registrados (y las anónimas ya publicadas)
//  - review_pendientes/{rid} → reseñas anónimas por revisar (estado: "pendiente")
//  - registrados/{uid}       → gustos, momentos, teléfono (vía registradoDoc)
//  - clientes/{uid}          → puntos

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA" && e.data?.type !== "DATOS_TIENDA") return;
    const payload = e.data.payload || e.data;
    tiendaId = payload.id_tienda || payload.tiendaId;
    localidad = payload.localidad;
    sessionStorage.setItem("tiendaId", tiendaId);
    sessionStorage.setItem("localidad", localidad);
    init();
  });
}

const PAGE_SIZE = 10;

let filtroEstrellas = "todas";
let lastDoc = null;
let hayMas = true;
let cargando = false;
let todasLasReviewsCache = [];

const el = (id) => document.getElementById(id);

/* ---------------- Query builder ---------------- */
function construirQuery(cursor) {
  const col = tiendaReviewsCol(localidad, tiendaId);
  const condiciones = [orderBy("timestamp", "desc")];
  if (filtroEstrellas !== "todas") {
    condiciones.unshift(where("calificacion", "==", Number(filtroEstrellas)));
  }
  condiciones.push(limit(PAGE_SIZE));
  if (cursor) condiciones.push(startAfter(cursor));
  return query(col, ...condiciones);
}

/* ---------------- Carga progresiva ---------------- */
async function cargarPagina(reset = false) {
  if (cargando) return;
  cargando = true;

  const btnMas = el("btn-cargar-mas");
  if (!btnMas) { cargando = false; return; }
  btnMas.disabled = true;
  btnMas.textContent = "Cargando...";

  if (reset) {
    lastDoc = null;
    hayMas = true;
    el("reviews-list").innerHTML = "";
    el("reviews-skeleton")?.classList.remove("hidden");
  }

  try {
    const snap = await getDocs(construirQuery(lastDoc));
    if (reset) el("reviews-skeleton")?.classList.add("hidden");

    if (snap.empty && reset) {
      el("empty-state")?.classList.remove("hidden");
      hayMas = false;
      btnMas.classList.add("hidden");
      cargando = false;
      return;
    }
    el("empty-state")?.classList.add("hidden");

    snap.docs.forEach((d) => renderReviewCard({ id: d.id, ...d.data() }));

    lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
    hayMas = snap.docs.length === PAGE_SIZE;

    btnMas.classList.toggle("hidden", !hayMas);
    btnMas.disabled = false;
    btnMas.textContent = "Cargar más reseñas";
  } catch (err) {
    console.error("Error cargando reseñas:", err);
    btnMas.disabled = false;
    btnMas.textContent = "Reintentar";
  }
  cargando = false;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const fmtFecha = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "";

const tel9 = (t) => String(t || "").replace(/\D/g, "").slice(-9);
const fmtTel = (t) => {
  const d = tel9(t);
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : "";
};

/* ---------------- Render de una card ---------------- */
function renderReviewCard(review) {
  const nombre = escapeHtml(review.nombre_usuario || "Usuario");
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  const estrellas = Number(review.calificacion) || 0;
  const comentario = escapeHtml(review.descripcion || "");
  const fechaStr = fmtFecha(review.timestamp);
  const yaRespondida = !!review.respuesta_tienda?.texto;
  const imgs = Array.isArray(review.lista_img_url) ? review.lista_img_url : [];
  const registrado = !!review.id_user;
  const telTxt = fmtTel(review.telefono);

  const card = document.createElement("div");
  card.className = "glass-card review-card card-enter rounded-2xl p-4";
  card.dataset.reviewId = review.id;

  card.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="avatar-fallback">${inicial}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <p class="text-sm font-bold text-white truncate flex items-center gap-1.5">
            ${nombre}
            ${
              registrado
                ? `<span class="text-[9px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">Registrado</span>`
                : `<span class="text-[9px] font-bold text-zinc-300 bg-zinc-500/15 border border-zinc-500/30 rounded-full px-2 py-0.5">Anónimo</span>`
            }
            <span data-badge-cliente class="hidden text-[9px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded-full px-2 py-0.5 tracking-wide">✓ Cliente</span>
            ${review.puntos_bonus ? `<span class="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">+${review.puntos_bonus} pts</span>` : ""}
          </p>
          <span class="text-[10px] font-mono text-zinc-500">${fechaStr}</span>
        </div>
        <div class="stars mt-0.5">${renderEstrellas(estrellas)}</div>
        ${telTxt ? `<p class="text-[11px] text-zinc-400 mt-1">📞 ${telTxt}</p>` : ""}
        <p class="text-xs text-zinc-300 mt-2 leading-relaxed">${comentario || "<span class='text-zinc-600'>Sin comentario</span>"}</p>

        ${imgs.length ? `
        <div class="flex gap-2 mt-3 overflow-x-auto">
          ${imgs.map((url) => `
            <div class="relative w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden skeleton-line" data-img-wrap>
              <img
                src="${escapeHtml(url)}"
                class="w-16 h-16 rounded-lg object-cover absolute inset-0 opacity-0 transition-opacity duration-300"
                loading="lazy"
                onload="this.classList.remove('opacity-0'); this.parentElement.classList.remove('skeleton-line');"
                onerror="this.parentElement.innerHTML='<div class=\\'w-16 h-16 flex items-center justify-center text-zinc-600 text-lg\\'>⚠️</div>';"
              />
            </div>`).join("")}
        </div>` : ""}

        <div class="respuesta-wrap mt-3">
          ${yaRespondida ? renderRespuestaGuardada(review.respuesta_tienda) : renderFormRespuesta()}
        </div>
      </div>
    </div>
  `;

  card.dataset.yaRespondida = yaRespondida ? "true" : "false";
  attachRespuestaListeners(card, review.id);
  el("reviews-list")?.appendChild(card);

  if (review.id_user) {
    esCliente(review.id_user).then((ok) => {
      if (ok) card.querySelector("[data-badge-cliente]")?.classList.remove("hidden");
    });
  }
}

function renderEstrellas(n) {
  let out = "";
  for (let i = 1; i <= 5; i++) out += i <= n ? "★" : `<span class="off">★</span>`;
  return out;
}

function renderFormRespuesta(textoPrevio = "") {
  return `
<textarea class="reply-input" placeholder="Responder a este cliente..." data-textarea-respuesta>${escapeHtml(textoPrevio)}</textarea>
    <div class="flex justify-end mt-2">
      <button class="btn-primary" data-btn-responder>${textoPrevio ? "Guardar cambios" : "Responder"}</button>
    </div>
  `;
}
function attachRespuestaListeners(card, reviewId) {
  const btn = card.querySelector("[data-btn-responder]");
  const textarea = card.querySelector("[data-textarea-respuesta]");
  btn?.addEventListener("click", () => enviarRespuesta(reviewId, textarea, card));

  const btnEditar = card.querySelector("[data-btn-editar-respuesta]");
  btnEditar?.addEventListener("click", () => {
    const textoActual = card.querySelector("[data-texto-respuesta]")?.textContent || "";
    const wrap = card.querySelector(".respuesta-wrap");
    wrap.innerHTML = renderFormRespuesta(textoActual);
    attachRespuestaListeners(card, reviewId);
    wrap.querySelector("[data-textarea-respuesta]")?.focus();
  });
}
function renderRespuestaGuardada(respuesta) {
  const fechaStr = fmtFecha(respuesta.fecha);
  return `
    <div class="respuesta-box p-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-[10px] font-bold text-purple-300 uppercase tracking-wide mb-1">Tu respuesta · ${fechaStr}</p>
        <button type="button" class="text-[10px] font-semibold text-zinc-400 hover:text-white transition-colors" data-btn-editar-respuesta>Editar</button>
      </div>
<p class="text-xs text-zinc-200 leading-relaxed" data-texto-respuesta>${escapeHtml(respuesta.texto)}</p>
    </div>
  `;
}

/* ---------------- Guardar respuesta ---------------- */
async function enviarRespuesta(reviewId, textarea, card) {
  const texto = textarea.value.trim();
  if (!texto) { textarea.focus(); return; }

  const esPrimeraRespuesta = card.dataset.yaRespondida !== "true";
  const btn = card.querySelector("[data-btn-responder]");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const ref = tiendaReviewDoc(localidad, tiendaId, reviewId);
    await updateDoc(ref, {
      respuesta_tienda: { texto, fecha: serverTimestamp() },
    });

    const wrap = card.querySelector(".respuesta-wrap");
    wrap.innerHTML = renderRespuestaGuardada({ texto, fecha: { toDate: () => new Date() } });
    card.dataset.yaRespondida = "true";
    attachRespuestaListeners(card, reviewId);

    if (esPrimeraRespuesta) actualizarContadorSinResponder();
  } catch (err) {
    console.error("Error respondiendo reseña:", err);
    btn.disabled = false;
    btn.textContent = "Reintentar";
  }
}

/* ---------------- Aviso de nuevas reseñas (publicadas y pendientes) ---------------- */
let watcherResenasIniciado = false;

function vigilarColeccion(col) {
  const qTop = query(col, orderBy("timestamp", "desc"), limit(1));
  let primera = true;
  let ultimoId = null;
  onSnapshot(
    qTop,
    (snap) => {
      if (snap.empty) { primera = false; return; }
      const top = snap.docs[0];
      if (primera) { ultimoId = top.id; primera = false; return; }
      if (top.id !== ultimoId) {
        ultimoId = top.id;
        window.parent.postMessage({ type: "NUEVA_RESENA" }, window.location.origin);
      }
    },
    (err) => console.error("Error watcher reseñas:", err),
  );
}

function iniciarWatcherNuevasResenas() {
  if (watcherResenasIniciado) return;
  watcherResenasIniciado = true;
  vigilarColeccion(tiendaReviewsCol(localidad, tiendaId));
  vigilarColeccion(tiendaSubCol(localidad, "tiendas", tiendaId, "review_pendientes"));
}

/* ---------------- Resumen ---------------- */
async function cargarResumen() {
  try {
    const col = tiendaReviewsCol(localidad, tiendaId);
    const snap = await getDocs(query(col, orderBy("timestamp", "desc"), limit(200)));
    todasLasReviewsCache = snap.docs.map((d) => d.data());

    const total = todasLasReviewsCache.length;
    const suma = todasLasReviewsCache.reduce((acc, r) => acc + (Number(r.calificacion) || 0), 0);
    const promedio = total ? suma / total : 0;
    const sinResponder = todasLasReviewsCache.filter((r) => !r.respuesta_tienda?.texto).length;

    if (el("stat-promedio")) el("stat-promedio").textContent = promedio.toFixed(1);
    if (el("stat-promedio-stars")) el("stat-promedio-stars").innerHTML = renderEstrellas(Math.round(promedio));
    if (el("stat-total-reviews")) el("stat-total-reviews").textContent = `${total} reseña${total === 1 ? "" : "s"}`;
    if (el("stat-sin-responder")) el("stat-sin-responder").textContent = sinResponder;
  } catch (err) {
    console.error("Error cargando resumen de reseñas:", err);
  }
}

function actualizarContadorSinResponder() {
  const statEl = el("stat-sin-responder");
  if (!statEl) return;
  const actual = parseInt(statEl.textContent || "0", 10);
  if (actual > 0) statEl.textContent = actual - 1;
}

/* ---------------- Filtros ---------------- */
document.querySelectorAll("[data-estrellas]").forEach((btn) => {
  btn.addEventListener("click", () => {
    filtroEstrellas = btn.dataset.estrellas;
    document.querySelectorAll("[data-estrellas]").forEach((b) => (b.dataset.active = "false"));
    btn.dataset.active = "true";
    cargarPagina(true);
  });
});

el("btn-cargar-mas")?.addEventListener("click", () => cargarPagina(false));

/* ═══════════════════════════════════════════════════════════════
   CAPTURADOR DE DATOS
   Se inyecta solo (no hay que tocar resena.html): pestañas
   "Reseñas" | "Capturador de datos".
   ═══════════════════════════════════════════════════════════════ */
const DEF_GUSTOS = [
  { id: "dias_especiales", ico: "🎉", txt: "Días especiales" },
  { id: "combos_familiares", ico: "👨‍👩‍👧", txt: "Combos familiares" },
  { id: "menus_individuales", ico: "🙋", txt: "Para mí solo" },
  { id: "combos_pareja", ico: "💑", txt: "En pareja" },
  { id: "promos_ofertas", ico: "🔥", txt: "Promos y ofertas" },
  { id: "saludable", ico: "🥗", txt: "Saludable" },
];
const DEF_MOMENTOS = [
  { id: "desayuno", ico: "🌅", txt: "Desayuno" },
  { id: "almuerzo", ico: "🍽️", txt: "Almuerzo" },
  { id: "cena", ico: "🌙", txt: "Cena" },
  { id: "fin_de_semana", ico: "🛋️", txt: "Finde" },
];
// Opciones editables: se guardan en UN solo documento
// Tiendas/{localidad}/tiendas/{id}/captura_datos/opciones  → { gustos:[...], momentos:[...] }
let capOpc = { gustos: DEF_GUSTOS, momentos: DEF_MOMENTOS };
const refOpciones = () =>
  tiendaSubDoc(localidad, "tiendas", tiendaId, "captura_datos", "opciones");
const MAX_OPC = 12;
const slug = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "opcion";

// id -> "🎉 Texto"; conserva conteos de opciones ya eliminadas
function mapaEtiquetas(lista, conteo) {
  const m = {};
  lista.forEach((o) => (m[o.id] = `${o.ico} ${o.txt}`.trim()));
  Object.keys(conteo).forEach((k) => { if (!m[k]) m[k] = `${k} (eliminada)`; });
  return m;
}

let capFiltro = "todos";
let capFilas = [];
let capCargado = false;
let tabsMontadas = false;

function montarTabs() {
  if (tabsMontadas) return;
  const main = document.querySelector("main");
  if (!main) return;
  tabsMontadas = true;

  if (!document.getElementById("cap-style")) {
    const st = document.createElement("style");
    st.id = "cap-style";
    st.textContent = `
      .cap-input{background:#101018;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;color:#fff;font-size:13px;min-width:0;font-family:inherit}
      .cap-input:focus{outline:none;border-color:#a855f7}
      .cap-input::placeholder{color:#71717a}
      @keyframes capSpin{to{transform:rotate(360deg)}}
      .cap-spin{display:inline-block;animation:capSpin .8s linear infinite}`;
    document.head.appendChild(st);
  }
  const tabs = document.createElement("div");
  tabs.id = "cap-tabs";
  tabs.className = "flex gap-2 mb-6";
  tabs.innerHTML = `
    <button type="button" data-tab="resenas" data-active="true" class="filter-pill rounded-xl px-4 py-2 text-xs">⭐ Reseñas</button>
    <button type="button" data-tab="capturador" data-active="false" class="filter-pill rounded-xl px-4 py-2 text-xs">📋 Capturador de datos</button>`;

  const panel = document.createElement("div");
  panel.id = "cap-panel";
  panel.style.display = "none";

  main.prepend(tabs);
  main.appendChild(panel);

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    const cap = b.dataset.tab === "capturador";
    tabs.querySelectorAll("[data-tab]").forEach((x) => (x.dataset.active = x === b ? "true" : "false"));
    [...main.children].forEach((c) => {
      if (c === tabs || c === panel) return;
      c.style.display = cap ? "none" : "";
    });
    panel.style.display = cap ? "" : "none";
    if (cap && !capCargado) cargarCapturador();
  });

  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cap]");
    if (!b) return;
    const act = b.dataset.cap;
    if (act === "filtro") {
      capFiltro = b.dataset.f;
      pintarCapturador();
    } else if (act === "recargar") {
      b.disabled = true;
      b.innerHTML = '<span class="cap-spin">↻</span> Actualizando…';
      cargarCapturador();
    } else if (act === "opc-add" || act === "opc-del") {
      b.disabled = true;
      await cambiarOpcion(act, b.dataset.t, b.dataset.id);
    } else if (act === "publicar" || act === "descartar") {
      await moderarPendiente(act, b.dataset.id, b);
    }
  });
}

async function cargarCapturador() {
  const panel = el("cap-panel");
  if (!panel) return;
  panel.innerHTML = `<div class="glass-card rounded-2xl p-4 h-24 skeleton-line"></div>`;

  try {
    const colRegistrados = registradoDoc(localidad, tiendaId, "_").parent;
    const [revSnap, pendSnap, regSnap, opcSnap] = await Promise.all([
      getDocs(query(tiendaReviewsCol(localidad, tiendaId), orderBy("timestamp", "desc"), limit(200))),
      getDocs(
        query(
          tiendaSubCol(localidad, "tiendas", tiendaId, "review_pendientes"),
          orderBy("timestamp", "desc"),
          limit(200),
        ),
      ),
      getDocs(query(colRegistrados, limit(500))),
      getDoc(refOpciones()),
    ]);
    if (opcSnap.exists()) {
      const o = opcSnap.data();
      capOpc = {
        gustos: Array.isArray(o.gustos) ? o.gustos : DEF_GUSTOS,
        momentos: Array.isArray(o.momentos) ? o.momentos : DEF_MOMENTOS,
      };
    } else {
      capOpc = { gustos: DEF_GUSTOS, momentos: DEF_MOMENTOS };
    }

    const registrados = new Map();
    regSnap.forEach((d) => registrados.set(d.id, d.data()));

    const filas = [];
    revSnap.forEach((d) => {
      const r = d.data();
      const reg = r.id_user ? registrados.get(r.id_user) : null;
      filas.push({
        id: d.id,
        origen: "review",
        registrado: !!r.id_user,
        publicada: true,
        nombre: r.nombre_usuario || "Anónimo",
        telefono: tel9(r.telefono || reg?.telefono),
        calificacion: Number(r.calificacion) || 0,
        descripcion: r.descripcion || "",
        puntos: r.bonus_estado === "pagado" ? Number(r.puntos_bonus) || 0 : 0,
        timestamp: r.timestamp,
      });
    });
    pendSnap.forEach((d) => {
      const r = d.data();
      filas.push({
        id: d.id,
        origen: "pendiente",
        registrado: false,
        publicada: false,
        nombre: r.nombre_usuario || "Anónimo",
        telefono: tel9(r.telefono),
        calificacion: Number(r.calificacion) || 0,
        descripcion: r.descripcion || "",
        puntos: 0,
        timestamp: r.timestamp,
        raw: r,
      });
    });
    filas.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
    capFilas = filas;

    // gustos / momentos (solo de usuarios registrados)
    const gustos = {};
    const momentos = {};
    registrados.forEach((r) => {
      (r.gustos || []).forEach((g) => (gustos[g] = (gustos[g] || 0) + 1));
      (r.momentos || []).forEach((m) => (momentos[m] = (momentos[m] || 0) + 1));
    });
    capCargado = true;
    capStats = { gustos, momentos, totalRegistrados: registrados.size };
    pintarCapturador();
  } catch (err) {
    console.error("Capturador:", err);
    panel.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-xs text-zinc-400">No se pudo cargar el capturador. <button class="btn-ghost ml-2" data-cap="recargar">Reintentar</button></div>`;
  }
}
let capStats = { gustos: {}, momentos: {}, totalRegistrados: 0 };

function barrasHTML(titulo, labels, conteo) {
  const filas = Object.entries(labels)
    .map(([k, l]) => [l, conteo[k] || 0])
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...filas.map((f) => f[1]));
  return `<div class="glass-card rounded-2xl p-4">
    <p class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">${titulo}</p>
    ${filas
      .map(
        ([l, n]) => `<div class="flex items-center gap-2 mb-2 text-xs">
        <span class="w-36 text-zinc-300 truncate">${l}</span>
        <div class="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div class="h-full bg-purple-500" style="width:${(n / max) * 100}%"></div></div>
        <span class="font-mono text-zinc-400 w-6 text-right">${n}</span>
      </div>`,
      )
      .join("")}
  </div>`;
}

function editorOpcionesHTML(tipo, titulo) {
  const lista = capOpc[tipo];
  return `<div class="glass-card rounded-2xl p-4">
    <p class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">${titulo}</p>
    <div class="flex flex-wrap gap-2 mb-3">
      ${lista.map((o) => `<span class="inline-flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-full pl-3 pr-1.5 py-1">${escapeHtml(o.ico)} ${escapeHtml(o.txt)}<button type="button" data-cap="opc-del" data-t="${tipo}" data-id="${escapeHtml(o.id)}" class="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/40 text-[10px]" aria-label="Eliminar">✕</button></span>`).join("") || `<span class="text-xs text-zinc-600">Sin opciones: esta sección se oculta en el diálogo.</span>`}
    </div>
    <div class="flex gap-2">
      <input id="opc-ico-${tipo}" maxlength="8" placeholder="🙂" class="cap-input" style="width:56px;text-align:center">
      <input id="opc-txt-${tipo}" maxlength="28" placeholder="Nueva opción" class="cap-input" style="flex:1">
      <button type="button" class="btn-primary" data-cap="opc-add" data-t="${tipo}">Agregar</button>
    </div>
  </div>`;
}

async function guardarOpciones() {
  await setDoc(
    refOpciones(),
    { gustos: capOpc.gustos, momentos: capOpc.momentos, actualizado_en: serverTimestamp() },
    { merge: true },
  );
}

async function cambiarOpcion(act, tipo, id) {
  const lista = [...capOpc[tipo]];
  if (act === "opc-del") {
    capOpc[tipo] = lista.filter((o) => o.id !== id);
  } else {
    const txt = (el(`opc-txt-${tipo}`)?.value || "").trim();
    const ico = (el(`opc-ico-${tipo}`)?.value || "").trim() || "•";
    if (!txt) return el(`opc-txt-${tipo}`)?.focus();
    if (lista.length >= MAX_OPC) return alert(`Máximo ${MAX_OPC} opciones`);
    let nid = slug(txt);
    while (lista.some((o) => o.id === nid)) nid += "_2";
    capOpc[tipo] = [...lista, { id: nid, ico, txt }];
  }
  try {
    await guardarOpciones();
  } catch (err) {
    console.error("Guardar opciones:", err);
    capOpc[tipo] = lista; // revierte
    alert("No se pudo guardar, intenta de nuevo");
  }
  pintarCapturador();
}

function filaCapHTML(f) {
  const badgeTipo = f.registrado
    ? `<span class="text-[9px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">Registrado</span>`
    : `<span class="text-[9px] font-bold text-zinc-300 bg-zinc-500/15 border border-zinc-500/30 rounded-full px-2 py-0.5">Anónimo</span>`;
  const badgeEstado = f.publicada
    ? `<span class="text-[9px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded-full px-2 py-0.5">Publicada</span>`
    : `<span class="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">Pendiente</span>`;
  const tel = f.telefono
    ? `<a class="text-[11px] text-emerald-400 hover:underline" target="_blank" rel="noopener" href="https://wa.me/51${f.telefono}">📞 ${fmtTel(f.telefono)}</a>`
    : `<span class="text-[11px] text-zinc-600">Sin número</span>`;
  const acciones = !f.publicada
    ? `<div class="flex gap-2 mt-3">
        <button class="btn-primary" data-cap="publicar" data-id="${f.id}">Publicar</button>
        <button class="btn-ghost" data-cap="descartar" data-id="${f.id}">Descartar</button>
      </div>`
    : "";
  return `<div class="glass-card rounded-2xl p-4" data-fila="${f.id}">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <p class="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">${escapeHtml(f.nombre)} ${badgeTipo} ${badgeEstado}
        ${f.puntos ? `<span class="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">+${f.puntos} pts</span>` : ""}
      </p>
      <span class="text-[10px] font-mono text-zinc-500">${fmtFecha(f.timestamp)}</span>
    </div>
    <div class="stars mt-0.5">${renderEstrellas(f.calificacion)}</div>
    <div class="mt-1">${tel}</div>
    ${f.descripcion ? `<p class="text-xs text-zinc-300 mt-2 leading-relaxed">${escapeHtml(f.descripcion)}</p>` : ""}
    ${acciones}
  </div>`;
}

function pintarCapturador() {
  const panel = el("cap-panel");
  if (!panel) return;

  const total = capFilas.length;
  const nReg = capFilas.filter((f) => f.registrado).length;
  const nAnon = total - nReg;
  const nPend = capFilas.filter((f) => !f.publicada).length;
  const pts = capFilas.reduce((s, f) => s + f.puntos, 0);

  const filtros = [
    ["todos", "Todos"],
    ["registrado", "Registrados"],
    ["anonimo", "Anónimos"],
    ["pendiente", "Pendientes"],
  ];
  const lista = capFilas.filter((f) =>
    capFiltro === "registrado" ? f.registrado
    : capFiltro === "anonimo" ? !f.registrado
    : capFiltro === "pendiente" ? !f.publicada
    : true,
  );

  const tile = (t, v, c = "text-white") =>
    `<div class="glass-card rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">${t}</p><p class="text-2xl font-black font-mono ${c}">${v}</p></div>`;

  panel.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-5">
      <p class="text-xs text-zinc-500">Datos capturados en tu enlace de registro</p>
      <button type="button" data-cap="recargar" class="btn-primary">↻ Actualizar datos</button>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      ${tile("Capturas", total)}
      ${tile("Registrados", nReg, "text-emerald-400")}
      ${tile("Anónimos", nAnon)}
      ${tile("Pendientes", nPend, "text-amber-400")}
    </div>
    <div class="grid sm:grid-cols-2 gap-3 mb-6">
      ${barrasHTML(`Gustos más marcados (${capStats.totalRegistrados} registrados)`, mapaEtiquetas(capOpc.gustos, capStats.gustos), capStats.gustos)}
      ${barrasHTML("Cuándo suelen pedir", mapaEtiquetas(capOpc.momentos, capStats.momentos), capStats.momentos)}
    </div>
    <div class="grid sm:grid-cols-2 gap-3 mb-6">
      ${editorOpcionesHTML("gustos", "Opciones de «Me interesa»")}
      ${editorOpcionesHTML("momentos", "Opciones de «Suelo pedir en»")}
    </div>
    <p class="text-[11px] text-zinc-500 mb-3">Puntos entregados por reseñas: <b class="text-amber-300">${pts}</b></p>
    <div class="mb-4 flex items-center gap-2 flex-wrap bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/80">
      ${filtros
        .map(
          ([k, l]) =>
            `<button type="button" data-cap="filtro" data-f="${k}" data-active="${capFiltro === k}" class="filter-pill rounded-xl px-4 py-2 text-xs">${l}</button>`,
        )
        .join("")}
    </div>
    <div class="flex flex-col gap-3">
      ${lista.length ? lista.map(filaCapHTML).join("") : `<div class="text-center text-xs text-zinc-500 py-10">Sin datos en este filtro.</div>`}
    </div>`;
}

async function moderarPendiente(act, id, btn) {
  const f = capFilas.find((x) => x.id === id && x.origen === "pendiente");
  if (!f) return;
  btn.disabled = true;
  try {
    const refPend = tiendaSubDoc(localidad, "tiendas", tiendaId, "review_pendientes", id);
    if (act === "publicar") {
      const r = f.raw;
      await setDoc(tiendaReviewDoc(localidad, tiendaId, id), {
        calificacion: Number(r.calificacion) || 0,
        descripcion: r.descripcion || "",
        nombre_usuario: r.nombre_usuario || "Anónimo",
        telefono: r.telefono || "",
        lista_img_url: r.lista_img_url || [],
        timestamp: r.timestamp || serverTimestamp(),
        estado: "publicada",
      });
    }
    await deleteDoc(refPend);
    cargarCapturador();
    if (act === "publicar") {
      cargarResumen();
      cargarPagina(true);
    }
  } catch (err) {
    console.error("Moderar reseña:", err);
    btn.disabled = false;
  }
}

/* ---------------- Init ---------------- */
function init() {
  montarTabs();
  cargarResumen();
  cargarPagina(true);
  iniciarWatcherNuevasResenas();
}

if (tiendaId && localidad) init();
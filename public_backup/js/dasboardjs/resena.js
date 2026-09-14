import {
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
    onSnapshot,   
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaReviewsCol, tiendaReviewDoc } from "../rutas/rutas.js";

// Cache de verificaciones "es cliente/seguidor" para no repetir lecturas
// del mismo uid en distintas reseñas.
const cacheEsCliente = new Map();

/**
 * Verifica si el usuario que dejó la reseña (id_user) tiene un doc en
 * .../tiendas/{tiendaId}/clientes/{uid}. Si existe => es cliente/seguidor
 * registrado de la tienda.
 *
 * NOTA: asume que la ruta es Tiendas/{localidad}/tiendas/{tiendaId}/clientes/{uid},
 * usando el mismo "localidad" que ya usa tiendaReviewsCol. Si tu rutas.js arma
 * la ruta distinto, avisame para ajustar esto (ideal: agregar un
 * tiendaClienteDoc(localidad, tiendaId, uid) en rutas.js y usarlo acá en vez
 * de construir el path a mano).
 */
async function esCliente(uid) {
  if (!uid) return false;
  if (cacheEsCliente.has(uid)) return cacheEsCliente.get(uid);

  try {
    const db = tiendaReviewsCol(localidad, tiendaId).firestore;
    const ref = doc(db, `Tiendas/${localidad}/tiendas/${tiendaId}/clientes/${uid}`);
    const snap = await getDoc(ref);
    const existe = snap.exists();
    cacheEsCliente.set(uid, existe);
    return existe;
  } catch (err) {
    console.error("Error verificando cliente/seguidor:", err);
    return false;
  }
}

// ── NOMBRES DE CAMPOS REALES (confirmados en Firestore) ──
// {
//   calificacion: 4,                 // number
//   descripcion: "buen servicio",    // string  (antes se asumía "comentario")
//   id_user: "5o3Moz...",            // string  (antes se asumía "usuario_uid")
//   lista_img_url: [...],            // array de strings (URLs de fotos)
//   nombre_usuario: "Benjamin",      // string  (antes se asumía "usuario_nombre")
//   timestamp: Timestamp,            // Timestamp (antes se asumía "fecha")
//   respuesta_tienda: {              // opcional, no existe hasta que el dueño responde
//     texto: "...",
//     fecha: Timestamp
//   }
// }

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
let lastDoc = null;      // cursor de paginación
let hayMas = true;
let cargando = false;
let todasLasReviewsCache = []; // para calcular promedio/sin responder (liviano, solo metadatos)

const el = (id) => document.getElementById(id);

/* ---------------- Query builder ---------------- */
function construirQuery(cursor) {
  const col = tiendaReviewsCol(localidad, tiendaId);
  const condiciones = [orderBy("timestamp", "desc")]; // CAMPO: timestamp

  if (filtroEstrellas !== "todas") {
    condiciones.unshift(where("calificacion", "==", Number(filtroEstrellas))); // CAMPO: calificacion
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
  if (!btnMas) { cargando = false; return; } // DOM no listo todavía
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

    snap.docs.forEach((d) => {
      renderReviewCard({ id: d.id, ...d.data() });
    });

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
/* ---------------- Render de una card ---------------- */
function renderReviewCard(review) {
  const nombre = escapeHtml(review.nombre_usuario || "Usuario"); // CAMPO: nombre_usuario
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  const estrellas = Number(review.calificacion) || 0; // CAMPO: calificacion
  const comentario = escapeHtml(review.descripcion || ""); // CAMPO: descripcion
  const fecha = review.timestamp?.toDate ? review.timestamp.toDate() : null; // CAMPO: timestamp
  const fechaStr = fecha
    ? fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const yaRespondida = !!review.respuesta_tienda?.texto; // CAMPO: respuesta_tienda.texto
  const imgs = Array.isArray(review.lista_img_url) ? review.lista_img_url : []; // CAMPO: lista_img_url

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
            <span data-badge-cliente class="hidden text-[9px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded-full px-2 py-0.5 tracking-wide">✓ Cliente</span>
          </p>
          <span class="text-[10px] font-mono text-zinc-500">${fechaStr}</span>
        </div>
        <div class="stars mt-0.5">${renderEstrellas(estrellas)}</div>
        <p class="text-xs text-zinc-300 mt-2 leading-relaxed">${comentario || "<span class='text-zinc-600'>Sin comentario</span>"}</p>

        ${imgs.length ? `
        <div class="flex gap-2 mt-3 overflow-x-auto">
          ${imgs.map(url => `
            <div class="relative w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden skeleton-line" data-img-wrap>
              <img
                src="${url}"
                class="w-16 h-16 rounded-lg object-cover absolute inset-0 opacity-0 transition-opacity duration-300"
                loading="lazy"
                onload="this.classList.remove('opacity-0'); this.parentElement.classList.remove('skeleton-line');"
                onerror="this.parentElement.innerHTML='<div class=\\'w-16 h-16 flex items-center justify-center text-zinc-600 text-lg\\'>⚠️</div>';"
              />
            </div>
          `).join("")}
        </div>` : ""}

        <div class="respuesta-wrap mt-3">
          ${yaRespondida ? renderRespuestaGuardada(review.respuesta_tienda) : renderFormRespuesta()}
        </div>
      </div>
    </div>
  `;

  // Eventos del form de respuesta (si no está respondida aún)
  card.dataset.yaRespondida = yaRespondida ? "true" : "false";
  attachRespuestaListeners(card, review.id);

  el("reviews-list")?.appendChild(card);

  // Verificación async de cliente/seguidor (no bloquea el render de la card)
  const uidAutor = review.id_user; // CAMPO: id_user
  if (uidAutor) {
    esCliente(uidAutor).then((esVerificado) => {
      if (!esVerificado) return;
      const badge = card.querySelector("[data-badge-cliente]");
      badge?.classList.remove("hidden");
    });
  }
}

function renderEstrellas(n) {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += i <= n ? "★" : `<span class="off">★</span>`;
  }
  return out;
}

function renderFormRespuesta(textoPrevio = "") {
  return `
<textarea class="reply-input" placeholder="Responder a este cliente..." data-textarea-respuesta>${escapeHtml(textoPrevio)}</textarea>    <div class="flex justify-end mt-2">
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
  const fecha = respuesta.fecha?.toDate ? respuesta.fecha.toDate() : null;
  const fechaStr = fecha
    ? fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  return `
    <div class="respuesta-box p-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-[10px] font-bold text-purple-300 uppercase tracking-wide mb-1">Tu respuesta · ${fechaStr}</p>
        <button type="button" class="text-[10px] font-semibold text-zinc-400 hover:text-white transition-colors" data-btn-editar-respuesta>Editar</button>
      </div>
<p class="text-xs text-zinc-200 leading-relaxed" data-texto-respuesta>${escapeHtml(respuesta.texto)}</p>    </div>
  `;
}

/* ---------------- Guardar respuesta directo en el doc de la review ---------------- */
async function enviarRespuesta(reviewId, textarea, card) {
  const texto = textarea.value.trim();
  if (!texto) {
    textarea.focus();
    return;
  }

  const esPrimeraRespuesta = card.dataset.yaRespondida !== "true";

  const btn = card.querySelector("[data-btn-responder]");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const ref = tiendaReviewDoc(localidad, tiendaId, reviewId);
    await updateDoc(ref, {
      respuesta_tienda: {          // CAMPO: respuesta_tienda
        texto,
        fecha: serverTimestamp(),
      },
    });

    // Actualizamos la card en pantalla sin recargar todo
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

let ultimoReviewIdConocido = null;
let watcherResenasIniciado = false;

function iniciarWatcherNuevasResenas() {
  if (watcherResenasIniciado) return;
  watcherResenasIniciado = true;

  const col = tiendaReviewsCol(localidad, tiendaId);
  const qTop = query(col, orderBy("timestamp", "desc"), limit(1)); // 👈 solo 1 doc

  let primeraCarga = true;

  onSnapshot(
    qTop,
    (snap) => {
      if (snap.empty) { primeraCarga = false; return; }

      const docTop = snap.docs[0];

      if (primeraCarga) {
        // solo guardamos referencia, no sonamos en la carga inicial
        ultimoReviewIdConocido = docTop.id;
        primeraCarga = false;
        return;
      }

      if (docTop.id !== ultimoReviewIdConocido) {
        ultimoReviewIdConocido = docTop.id;
        // avisamos al panel padre, igual que fidelización
        window.parent.postMessage({ type: "NUEVA_RESENA" }, window.location.origin);
      }
    },
    (err) => console.error("Error watcher reseñas:", err),
  );
}
/* ---------------- Resumen (promedio + sin responder) ---------------- */
async function cargarResumen() {
  try {
    const col = tiendaReviewsCol(localidad, tiendaId);
    const snap = await getDocs(query(col, orderBy("timestamp", "desc"), limit(200))); // CAMPO: timestamp
    // Nota: si esperás MUCHAS reseñas (miles), este resumen conviene calcularlo
    // aparte con una Cloud Function que mantenga contadores agregados en el doc
    // de la tienda, en vez de leer todo acá. Por ahora, con hasta ~200 alcanza.

    todasLasReviewsCache = snap.docs.map((d) => d.data());

    const total = todasLasReviewsCache.length;
    const suma = todasLasReviewsCache.reduce((acc, r) => acc + (Number(r.calificacion) || 0), 0);
    const promedio = total ? (suma / total) : 0;
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

/* ---------------- Botón cargar más ---------------- */
el("btn-cargar-mas")?.addEventListener("click", () => cargarPagina(false));

/* ---------------- Init ---------------- */
function init() {
  cargarResumen();
  cargarPagina(true);
    iniciarWatcherNuevasResenas(); 
}

if (tiendaId && localidad) init();
import {
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol } from "../rutas/rutas.js";
let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
    iniciarSuscripcion();
  });
}

function promosRef() {
  // 👈 esta es la que faltaba
  return tiendaSubCol(localidad, "tiendas", tiendaId, "promociones_geinz");
}

function registrarVista(promo) {
  const ref = doc(promosRef(), promo.id);
  const hoy = new Date().toISOString().slice(0, 10);
  updateDoc(ref, {
    "estadisticas.vistas": increment(1),
    [`estadisticas.vistas_por_dia.${hoy}`]: increment(1),
  }).catch((err) => console.error("Error registrando vista:", err));
}
let promos = [];
let filtroEstado = "todos";
let filtroCategoria = null;
let unsub = null;
let intervaloTimers = null;

const el = (id) => document.getElementById(id);

/* ---------------- Reloj Perú en vivo ---------------- */
function actualizarRelojPeru() {
  const ahora = new Date();
  const relojEl = el("reloj-peru");
  if (relojEl) {
    relojEl.textContent = ahora.toLocaleTimeString("es-PE", {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}
setInterval(actualizarRelojPeru, 1000);
actualizarRelojPeru();

/* ---------------- Suscripción Firestore ---------------- */
function iniciarSuscripcion() {
  if (unsub) unsub();
  const q = query(promosRef(), orderBy("informacion.id_promocion", "asc"));
  unsub = onSnapshot(
    q,
    (snap) => {
      promos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      render();
    },
    (err) => console.error("Error cargando promociones:", err),
  );
}

/* ---------------- Helpers ---------------- */
function esExpirado(promo) {
  const fin = promo.datos_hora_fecha?.timestamp_fin?.toDate?.();
  if (!fin) return promo.estado !== "activo";
  return fin.getTime() <= Date.now();
}

function tiempoRestante(promo) {
  const fin = promo.datos_hora_fecha?.timestamp_fin?.toDate?.();
  if (!fin) return null;
  const diff = fin.getTime() - Date.now();
  if (diff <= 0) return null;
  const dias = Math.floor(diff / 86400000);
  const horas = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const segs = Math.floor((diff % 60000) / 1000);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${mins}m`;
  if (mins > 0) return `${mins}m ${segs}s`;
  return `${segs}s`;
}

/* ---------------- Filtros ---------------- */
document.querySelectorAll("[data-estado]").forEach((btn) => {
  btn.addEventListener("click", () => {
    filtroEstado = btn.dataset.estado;
    document
      .querySelectorAll("[data-estado]")
      .forEach((b) => (b.dataset.active = "false"));
    btn.dataset.active = "true";
    render();
  });
});

let chartDistribucion = null;
let chartCategorias = null;
let chartSparkline = null;
let chartConversion = null;

function renderChartsGenerales() {
  const activas = promos.filter((p) => !esExpirado(p)).length;
  const expiradas = promos.filter((p) => esExpirado(p)).length;
  const exclusivas = promos.filter((p) => p.exclusivo).length;

  const ctxDist = el("chart-distribucion")?.getContext("2d");
  if (ctxDist) {
    if (chartDistribucion) chartDistribucion.destroy();
    chartDistribucion = new Chart(ctxDist, {
      type: "doughnut",
      data: {
        labels: ["Activas", "Expiradas", "Exclusivas"],
        datasets: [
          {
            data: [activas, expiradas, exclusivas],
            backgroundColor: ["#34d399", "#f43f5e", "#fbbf24"],
            borderColor: "#0e0e14",
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#a1a1aa", font: { size: 11 }, padding: 12 },
          },
        },
        cutout: "70%",
      },
    });
  }

  const categorias = {};
  promos.forEach((p) => {
    const cat = p.informacion?.categoria || "Sin categoría";
    categorias[cat] = (categorias[cat] || 0) + 1;
  });

  const ctxCat = el("chart-categorias")?.getContext("2d");
  if (ctxCat) {
    if (chartCategorias) chartCategorias.destroy();
    const gradient = ctxCat.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "#a855f7");
    gradient.addColorStop(1, "#6d28d9");

    chartCategorias = new Chart(ctxCat, {
      type: "bar",
      data: {
        labels: Object.keys(categorias),
        datasets: [
          {
            data: Object.values(categorias),
            backgroundColor: gradient,
            borderRadius: 8,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#a1a1aa", font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: { color: "#a1a1aa", font: { size: 10 }, precision: 0 },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
        },
      },
    });
  }
}

function renderChartsDetalle(promo) {
  const vistasPorDia = promo.estadisticas?.vistas_por_dia || {};
  const dias = Object.keys(vistasPorDia).sort().slice(-7);
  const valores = dias.map((d) => vistasPorDia[d]);

  const ctxSpark = document.getElementById("chart-sparkline")?.getContext("2d");
  if (ctxSpark) {
    const gradient = ctxSpark.createLinearGradient(0, 0, 0, 80);
    gradient.addColorStop(0, "rgba(168, 85, 247, 0.4)");
    gradient.addColorStop(1, "rgba(168, 85, 247, 0)");

    chartSparkline = new Chart(ctxSpark, {
      type: "line",
      data: {
        labels: dias,
        datasets: [
          {
            data: valores,
            borderColor: "#a855f7",
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  }

  const vistas = promo.estadisticas?.vistas || 0;
  const clics = promo.estadisticas?.clics_contacto || 0;

  const ctxConv = document.getElementById("chart-conversion")?.getContext("2d");
  if (ctxConv) {
    chartConversion = new Chart(ctxConv, {
      type: "doughnut",
      data: {
        labels: ["Vistas", "Clics contacto"],
        datasets: [
          {
            data: [vistas, clics],
            backgroundColor: ["#3f3f46", "#a855f7"],
            borderColor: "#0b0b10",
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#a1a1aa", font: { size: 10 } },
          },
        },
      },
    });
  }
}
/* ---------------- Render Principal ---------------- */
function render() {
  const filtradas = promos.filter((p) => {
    const expirado = esExpirado(p);
    if (filtroEstado === "activo" && expirado) return false;
    if (filtroEstado === "expirado" && !expirado) return false;
    if (filtroEstado === "exclusivo" && !p.exclusivo) return false;
    if (filtroCategoria && p.informacion?.categoria !== filtroCategoria)
      return false;
    return true;
  });

  renderStats();
  renderChartsGenerales(); // 👈 agregar esta línea

  const grid = el("promos-grid");
  // ... resto igual
  const yaTieneContenido = grid.children.length > 0;

  if (!yaTieneContenido) {
    // Primera carga: sin fade-out, directo
    renderGrid(filtradas);
    return;
  }

  // Fade-out del grid actual, luego reconstruimos con fade-in
  grid.classList.add("grid-fading");
  setTimeout(() => {
    renderGrid(filtradas);
    grid.classList.remove("grid-fading");
  }, 150); // debe matchear la duración del transition de #promos-grid
}
function renderStats() {
  el("stat-activas").textContent = promos.filter((p) => !esExpirado(p)).length;
  el("stat-expiradas").textContent = promos.filter((p) => esExpirado(p)).length;
  el("stat-exclusivas").textContent = promos.filter((p) => p.exclusivo).length;
  el("stat-total").textContent = promos.length;
}

function renderGrid(items) {
  const grid = el("promos-grid");
  const empty = el("empty-state");
  grid.innerHTML = "";

  if (intervaloTimers) clearInterval(intervaloTimers);

  if (!items.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  items.forEach((promo) => grid.appendChild(renderCard(promo)));

  intervaloTimers = setInterval(() => {
    document.querySelectorAll("[data-timer-id]").forEach((elTimer) => {
      const promo = promos.find((p) => p.id === elTimer.dataset.timerId);
      if (!promo) return;
      const restante = tiempoRestante(promo);
      if (restante) {
        elTimer.textContent = `⏳ ${restante}`;
        elTimer.classList.remove("expired");
      } else {
        elTimer.textContent = "🔴 Expirado";
        elTimer.classList.add("expired");
      }
    });
  }, 1000);
}

function renderCard(promo) {
  const info = promo.informacion || {};
  const img =
    promo.img_container?.lista_img?.[0] || promo.img_container?.logo_img || "";
  const expirado = esExpirado(promo);
  const restanteInicial = tiempoRestante(promo);

  const card = document.createElement("div");
  card.className =
    "promo-card card-enter glass-card rounded-2xl overflow-hidden cursor-pointer";
  card.addEventListener("click", () => abrirDetalle(promo));

  // 👇 al terminar la animación de entrada, soltamos el transform
  card.addEventListener(
    "animationend",
    () => {
      card.classList.remove("card-enter");
    },
    { once: true },
  );

  card.innerHTML = `
    <div class="promo-img-wrap">
      ${img ? `<div class="img-skeleton"></div>` : ""}
      ${
        img
          ? `<img src="${img}" loading="lazy" class="w-full h-full object-cover">`
          : `<div class="w-full h-full flex items-center justify-center text-3xl opacity-20">🖼️</div>`
      }
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>
      ${promo.exclusivo ? `<span class="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-black shadow-md">👑 Exclusiva</span>` : ""}
      <span data-timer-id="${promo.id}" class="timer-chip ${expirado ? "expired" : ""} absolute bottom-2.5 right-2.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg text-white">
        ${restanteInicial ? `⏳ ${restanteInicial}` : "🔴 Expirado"}
      </span>
    </div>
    <div class="p-3.5">
      <p class="text-xs font-bold text-white truncate">${info.nombre_tienda || "Sin nombre"}</p>
      <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed font-normal">${info.titulo || ""}</p>
    </div>
  `;

  if (img) {
    const imgEl = card.querySelector("img");
    const skeletonEl = card.querySelector(".img-skeleton");
    const finalizarSkeleton = () => {
      skeletonEl?.remove();
      imgEl.classList.add("loaded");
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      finalizarSkeleton();
    } else {
      imgEl.addEventListener("load", finalizarSkeleton, { once: true });
      imgEl.addEventListener("error", finalizarSkeleton, { once: true });
    }
  }

  return card;
}
/* ---------------- Modal de Detalle ---------------- */
function abrirDetalle(promo) {
  registrarVista(promo); // 👈 agregar esta línea al inicio

  const info = promo.informacion || {};
  const dhf = promo.datos_hora_fecha || {};
  const ubic = promo.ubicacion || {};
  const imgs = promo.img_container?.lista_img || [];
  const expirado = esExpirado(promo);

  const galeria = imgs.length
    ? `<div class="flex gap-2 overflow-x-auto p-4 border-b border-zinc-800/80 bg-zinc-950/40">
            ${imgs.map((u) => `<img src="${u}" class="w-20 h-20 rounded-xl object-cover shrink-0 border border-zinc-700/60">`).join("")}
          </div>`
    : "";

  const pagos = (promo.pagos || [])
    .map((p) => `<span class="tag-chip capitalize">${p}</span>`)
    .join(" ");
  const terminos = (promo.terminos_clave || [])
    .map((t) => `<span class="tag-chip">#${t}</span>`)
    .join(" ");
  const comodidades = (promo.comodidades || [])
    .map((c) => `<span class="tag-chip">${c}</span>`)
    .join(" ");

  el("modal-content").innerHTML = `
        <div class="relative animate-modal-in">
          <div class="relative h-56 w-full bg-zinc-950">
            ${
              promo.img_container?.lista_img?.[0]
                ? `<img src="${promo.img_container.lista_img[0]}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center text-4xl opacity-20">🖼️</div>`
            }
            <div class="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-transparent to-black/40"></div>
            <button id="btn-cerrar-modal" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors">✕</button>
            <span class="absolute bottom-3 right-3 timer-chip ${expirado ? "expired" : ""} text-[11px] font-mono font-bold px-3 py-1 rounded-lg text-white">
              ${tiempoRestante(promo) ? `⏳ ${tiempoRestante(promo)}` : "🔴 Expirado"}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-3 p-4 border-b border-zinc-800/80 bg-zinc-950/40">
  <div class="relative h-20">
    <canvas id="chart-sparkline"></canvas>
    <p class="text-[9px] text-zinc-500 mt-1 text-center">Vistas últimos 7 días</p>
  </div>
  <div class="relative h-20">
    <canvas id="chart-conversion"></canvas>
  </div>
</div>
          ${galeria}

          <div class="p-6 space-y-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <h2 class="text-lg font-bold text-white">${info.nombre_tienda || "Sin Nombre"}</h2>
                ${promo.exclusivo ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-black">👑 VIP</span>` : ""}
              </div>
              <p class="text-sm font-semibold text-purple-300 mb-1">${info.titulo || ""}</p>
              <p class="text-xs text-zinc-400 leading-relaxed">${info.descripcion || "Sin descripción proporcionada."}</p>
            </div>

            <div class="space-y-3 pt-2 border-t border-zinc-800/80">
              <div class="flex items-start gap-3">
                <span class="text-base">🏷️</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Categoría</p>
                  <p class="text-xs font-medium text-zinc-200 capitalize">${info.categoria || "—"}</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📅</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Vigencia</p>
                  <p class="text-xs font-mono text-zinc-200">${dhf.fecha_inicio || "?"} → ${dhf.fecha_fin || "?"} · ${dhf.hora_inicio || ""}–${dhf.hora_fin || ""}</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📍</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Ubicación</p>
                  <p class="text-xs font-medium text-zinc-200">${ubic.direccion || "—"}</p>
                  ${ubic.referencia ? `<p class="text-[11px] text-zinc-500 mt-0.5">${ubic.referencia}</p>` : ""}
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📞</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Contacto</p>
                  <p class="text-xs font-mono text-zinc-200">${info.numero || "—"}</p>
                </div>
              </div>

              ${
                pagos
                  ? `
              <div class="flex items-start gap-3">
                <span class="text-base">💳</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Métodos de Pago</p>
                  <div class="flex flex-wrap gap-1.5">${pagos}</div>
                </div>
              </div>`
                  : ""
              }

              ${
                comodidades
                  ? `
              <div class="flex items-start gap-3">
                <span class="text-base">✨</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Comodidades</p>
                  <div class="flex flex-wrap gap-1.5">${comodidades}</div>
                </div>
              </div>`
                  : ""
              }

              ${
                terminos
                  ? `
              <div class="flex items-start gap-3">
                <span class="text-base">🔎</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Etiquetas</p>
                  <div class="flex flex-wrap gap-1.5">${terminos}</div>
                </div>
              </div>`
                  : ""
              }

              <div class="flex items-start gap-3 pt-2">
                <span class="text-base">💰</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Costo de publicación</p>
                  <p class="text-xs font-bold font-mono text-emerald-400">S/ ${info.precio_publicacion || promo.precio_publicacion || "0.00"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

  el("overlay-detalle").classList.add("show");
  renderChartsDetalle(promo);
  el("btn-cerrar-modal").addEventListener("click", cerrarDetalle);
}

function cerrarDetalle() {
  el("overlay-detalle").classList.remove("show");
}

el("overlay-detalle").addEventListener("click", (e) => {
  if (e.target.id === "overlay-detalle") cerrarDetalle();
});

if (tiendaId && localidad) iniciarSuscripcion();

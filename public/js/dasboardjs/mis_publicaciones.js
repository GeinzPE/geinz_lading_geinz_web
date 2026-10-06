import {
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  increment,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol } from "../rutas/rutas.js";
import {
  initExport,
  botonesExportDetalleHtml,
  enlazarExportDetalle,
  panelReactivarHtml,
} from "./exportar_publicaciones.js";
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
  if (promo.estado && promo.estado !== "activo") return true;
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
function fmtLima(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return {
    fecha: `${p.day}/${p.month}/${p.year}`,
    hora: `${p.hour}:${p.minute}`,
  };
}

function duracionOriginalMs(promo) {
  const d = promo.datos_hora_fecha || {};
  const a = d.timestamp_inicio?.toMillis?.();
  const b = d.timestamp_fin?.toMillis?.();
  return a && b && b > a ? b - a : null;
}

function formatDur(ms) {
  const h = Math.round(ms / 3600000);
  return h >= 24 ? `${Math.round(h / 24)} día(s)` : `${h} hora(s)`;
}
const estaDesactivada = (p) => p.desactivada === true;

async function setDesactivada(promo, valor) {
  await updateDoc(doc(promosRef(), promo.id), {
    desactivada: valor,
    desactivada_en: valor ? Timestamp.now() : null,
  });
}

async function reactivarPromo(promo, duracionMs) {
  const ahora = Date.now();
  const fin = ahora + duracionMs;
  const i = fmtLima(ahora),
    f = fmtLima(fin);
  await updateDoc(doc(promosRef(), promo.id), {
    estado: "activo",
    desactivada: false,
    "datos_hora_fecha.activo": true,
    "datos_hora_fecha.timestamp_inicio": Timestamp.fromMillis(ahora),
    "datos_hora_fecha.timestamp_fin": Timestamp.fromMillis(fin),
    "datos_hora_fecha.fecha_inicio": i.fecha,
    "datos_hora_fecha.hora_inicio": i.hora,
    "datos_hora_fecha.fecha_fin": f.fecha,
    "datos_hora_fecha.hora_fin": f.hora,
  });
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

/* ═════════ Helpers de analítica ═════════ */
const charts = {};
const n = (v) => Number(v) || 0;
const interacciones = (e = {}) =>
  n(e.clics_detalle) +
  n(e.clics_comprar) +
  n(e.clics_whatsapp) +
  n(e.clics_compartir);
const ctrDe = (p) => {
  const e = p.estadisticas || {};
  return n(e.vistas) ? interacciones(e) / n(e.vistas) : 0;
};
const ORDENES = {
  vistas: (p) => n(p.estadisticas?.vistas),
  clics: (p) => interacciones(p.estadisticas),
  comprar: (p) => n(p.estadisticas?.clics_comprar),
  whatsapp: (p) => n(p.estadisticas?.clics_whatsapp),
  compartir: (p) => n(p.estadisticas?.clics_compartir),
  pedidos: (p) => n(p.estadisticas?.pedidos),
  ctr: ctrDe,
};
let ordenActual = "recientes";
function ordenar(lista) {
  const c = [...lista];
  if (ordenActual === "recientes") return c.reverse();
  return c.sort((a, b) => ORDENES[ordenActual](b) - ORDENES[ordenActual](a));
}
el("orden-promos")?.addEventListener("change", (e) => {
  ordenActual = e.target.value;
  render();
});

const ejes = {
  x: {
    ticks: { color: "#a1a1aa", font: { size: 10 } },
    grid: { display: false },
  },
  y: {
    beginAtZero: true,
    ticks: { color: "#a1a1aa", font: { size: 10 }, precision: 0 },
    grid: { color: "rgba(255,255,255,0.05)" },
  },
};
const legend = { labels: { color: "#a1a1aa", font: { size: 10 } } };

function mkChart(key, canvasId, cfg) {
  const ctx = el(canvasId)?.getContext("2d");
  if (!ctx) return;
  charts[key]?.destroy();
  charts[key] = new Chart(ctx, cfg);
}
function destruirChartsDetalle() {
  Object.keys(charts)
    .filter((k) => k.startsWith("d_"))
    .forEach((k) => {
      charts[k].destroy();
      delete charts[k];
    });
}
function ultimosDias(k) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
  return Array.from({ length: k }, (_, i) =>
    fmt.format(new Date(Date.now() - (k - 1 - i) * 86400000)),
  );
}

/* ═════════ Gráficos generales ═════════ */
function renderChartsGenerales() {
  const activas = promos.filter(
    (p) => !esExpirado(p) && !estaDesactivada(p),
  ).length;
  const expiradas = promos.filter((p) => esExpirado(p)).length;
  const exclusivas = promos.filter((p) => p.exclusivo).length;

  mkChart("dist", "chart-distribucion", {
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
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#a1a1aa", font: { size: 11 }, padding: 12 },
        },
      },
    },
  });

  const dias = ultimosDias(14);
  const sum = (d, f) =>
    promos.reduce((s, p) => s + f(p.estadisticas?.por_dia?.[d]), 0);
  mkChart("act", "chart-actividad", {
    type: "line",
    data: {
      labels: dias.map((d) => d.slice(5)),
      datasets: [
        {
          label: "Vistas",
          data: dias.map((d) => sum(d, (o) => n(o?.vistas))),
          borderColor: "#71717a",
          tension: 0.35,
          pointRadius: 2,
        },
        {
          label: "Interacciones",
          data: dias.map((d) => sum(d, (o) => interacciones(o))),
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend },
      scales: ejes,
    },
  });
}

/* ═════════ Analítica de una promo (modal) ═════════ */
function segChart(key, id, campo, e) {
  const v = e.seg_vistas?.[campo] || {},
    c = e.seg_clics?.[campo] || {};
  const labels = [...new Set([...Object.keys(v), ...Object.keys(c)])];
  const cont = el(id)?.parentElement;
  if (!cont) return;
  if (!labels.length) {
    cont.innerHTML =
      '<p class="text-[11px] text-zinc-600 text-center pt-10">Sin datos aún</p>';
    return;
  }
  mkChart(key, id, {
    type: "bar",
    data: {
      labels: labels.map((l) => l.replace(/_/g, " ")),
      datasets: [
        {
          label: "Vistas",
          data: labels.map((l) => n(v[l])),
          backgroundColor: "#3f3f46",
          borderRadius: 6,
        },
        {
          label: "Clics",
          data: labels.map((l) => n(c[l])),
          backgroundColor: "#a855f7",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend },
      scales: ejes,
    },
  });
}

function renderAnalyticsDetalle(promo) {
  destruirChartsDetalle();
  const e = promo.estadisticas || {};
  const vistas = n(e.vistas),
    inter = interacciones(e);
  const kpi = (t, v, c = "text-white") =>
    `<div class="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 text-center"><p class="text-base font-black font-mono ${c}">${v}</p><p class="text-[9px] uppercase font-bold text-zinc-500">${t}</p></div>`;
  const bloque = (t, id, h = "h-36") =>
    `<div class="rounded-xl bg-zinc-900/50 border border-zinc-800 p-3"><p class="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">${t}</p><div class="relative ${h}"><canvas id="${id}"></canvas></div></div>`;

  el("detalle-analytics").innerHTML = `
    <div class="grid grid-cols-3 gap-2">
      ${kpi("Vistas", vistas)}
      ${kpi("Abrió detalle", n(e.clics_detalle), "text-purple-300")}
      ${kpi("Comprar", n(e.clics_comprar), "text-emerald-400")}
      ${kpi("WhatsApp", n(e.clics_whatsapp), "text-green-400")}
      ${kpi("Compartir", n(e.clics_compartir), "text-sky-300")}
      ${kpi("Al carrito", n(e.clics_carrito), "text-amber-300")}
      ${kpi("Pedidos", n(e.pedidos), "text-white")}
      ${kpi("Ventas", "S/ " + n(e.ventas_total).toFixed(2), "text-emerald-400")}
      ${kpi("Interacción", vistas ? ((inter / vistas) * 100).toFixed(1) + "%" : "—", "text-purple-300")}
    </div>
    ${bloque("Actividad · 14 días", "d-dia", "h-32")}
    ${bloque("Embudo de conversión", "d-embudo", "h-36")}
    ${bloque("Horas con más movimiento", "d-hora", "h-32")}
    <div class="grid grid-cols-2 gap-3">
      ${bloque("Género", "d-genero")}${bloque("Edad", "d-edad")}
      ${bloque("Localidad", "d-loc")}${bloque("Registrados vs anónimos", "d-acc")}
    </div>`;

  const dias = ultimosDias(14);
  mkChart("d_dia", "d-dia", {
    type: "line",
    data: {
      labels: dias.map((d) => d.slice(5)),
      datasets: [
        {
          label: "Vistas",
          data: dias.map((d) => n(e.por_dia?.[d]?.vistas)),
          borderColor: "#71717a",
          tension: 0.35,
          pointRadius: 0,
        },
        {
          label: "Interacciones",
          data: dias.map((d) => interacciones(e.por_dia?.[d])),
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,.2)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend },
      scales: ejes,
    },
  });

  mkChart("d_embudo", "d-embudo", {
    type: "bar",
    data: {
      labels: [
        "Vistas",
        "Abrió detalle",
        "Clic comprar",
        "Fue al carrito",
        "Pedidos",
      ],
      datasets: [
        {
          data: [
            vistas,
            n(e.clics_detalle),
            n(e.clics_comprar),
            n(e.clics_carrito),
            n(e.pedidos),
          ],
          backgroundColor: [
            "#3f3f46",
            "#7c3aed",
            "#10b981",
            "#f59e0b",
            "#22c55e",
          ],
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: ejes,
    },
  });

  const horas = Array.from({ length: 24 }, (_, i) => i);
  mkChart("d_hora", "d-hora", {
    type: "bar",
    data: {
      labels: horas.map((h) => h + "h"),
      datasets: [
        {
          label: "Vistas",
          data: horas.map((h) => n(e.por_hora?.[h]?.vistas)),
          backgroundColor: "#3f3f46",
        },
        {
          label: "Interacciones",
          data: horas.map((h) => interacciones(e.por_hora?.[h])),
          backgroundColor: "#a855f7",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend },
      scales: ejes,
    },
  });

  segChart("d_genero", "d-genero", "genero", e);
  segChart("d_edad", "d-edad", "edad", e);
  segChart("d_loc", "d-loc", "localidad", e);
  segChart("d_acc", "d-acc", "acceso", e);
}
/* ---------------- Render Principal ---------------- */
function render() {
  const filtradas = ordenar(
    promos.filter((p) => {
      const expirado = esExpirado(p);
      if (filtroEstado === "activo" && (expirado || estaDesactivada(p)))
        return false;
      if (filtroEstado === "desactivado" && (expirado || !estaDesactivada(p)))
        return false;
      if (filtroEstado === "expirado" && !expirado) return false;
      if (filtroEstado === "exclusivo" && !p.exclusivo) return false;
      if (filtroCategoria && p.informacion?.categoria !== filtroCategoria)
        return false;
      return true;
    }),
  );

  renderStats();
  renderChartsGenerales();

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
  el("stat-activas").textContent = promos.filter(
    (p) => !esExpirado(p) && !estaDesactivada(p),
  ).length;
  el("stat-expiradas").textContent = promos.filter((p) => esExpirado(p)).length;
  el("stat-exclusivas").textContent = promos.filter((p) => p.exclusivo).length;
  el("stat-total").textContent = promos.length;
  const tot = (f) => promos.reduce((s, p) => s + f(p.estadisticas || {}), 0);
  el("k-vistas").textContent = tot((e) => n(e.vistas));
  el("k-inter").textContent = tot(interacciones);
  el("k-comprar").textContent = tot((e) => n(e.clics_comprar));
  el("k-wa").textContent = tot((e) => n(e.clics_whatsapp));
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
      if (estaDesactivada(promo) && !esExpirado(promo)) {
        elTimer.textContent = "⏸ Desactivada";
        return;
      }
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
  const desact = !expirado && estaDesactivada(promo);
  if (expirado || desact) card.classList.add("promo-expired");
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
           ${desact ? "⏸ Desactivada" : restanteInicial ? `⏳ ${restanteInicial}` : "🔴 Expirado"}
      </span>
    </div>
    <div class="p-3.5">
      <p class="text-xs font-bold text-white truncate">${info.nombre_tienda || "Sin nombre"}</p>
      <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed font-normal">${info.titulo || ""}</p>
      <div class="flex items-center gap-3 mt-2.5 text-[10px] font-mono text-zinc-500">
  <span title="Vistas">👁 ${n(promo.estadisticas?.vistas)}</span>
  <span title="Interacciones">🖱 ${interacciones(promo.estadisticas)}</span>
  <span title="Comprar">🛒 ${n(promo.estadisticas?.clics_comprar)}</span>
  <span title="WhatsApp">💬 ${n(promo.estadisticas?.clics_whatsapp)}</span>
</div>
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
  const durOrig = duracionOriginalMs(promo);
  const panelReactivar = expirado
    ? panelReactivarHtml(durOrig ? formatDur(durOrig) : null)
    : "";

  const panelOnOff = !expirado
    ? `
  <div class="p-4 border-b border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between gap-3">
    <div>
      <p class="text-xs font-bold text-white">${promo.desactivada ? "Publicación desactivada" : "Publicación activa"}</p>
      <p class="text-[11px] text-zinc-500">${promo.desactivada ? "No se ve en tu perfil ni en el carrito." : "Visible en tu perfil y en el carrito."}</p>
    </div>
    <button id="btn-toggle-activa" type="button"
      class="shrink-0 text-xs font-bold px-4 py-2 rounded-xl ${promo.desactivada ? "bg-emerald-500 text-black" : "bg-rose-500/15 text-rose-300 border border-rose-500/30"}">
      ${promo.desactivada ? "Activar" : "Desactivar"}
    </button>
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
            ${botonesExportDetalleHtml()}

            <span class="absolute bottom-3 right-3 timer-chip ${expirado ? "expired" : ""} text-[11px] font-mono font-bold px-3 py-1 rounded-lg text-white">
              ${tiempoRestante(promo) ? `⏳ ${tiempoRestante(promo)}` : "🔴 Expirado"}
            </span>
          </div>

                                  ${panelReactivar}
                    ${panelOnOff}
          <div id="detalle-analytics" class="p-4 border-b border-zinc-800/80 bg-zinc-950/40 space-y-3"></div>

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
  renderAnalyticsDetalle(promo); // antes decía renderChartsDetalle (no existe)
  el("btn-cerrar-modal").addEventListener("click", cerrarDetalle);
  enlazarExportDetalle(promo);
  el("btn-toggle-activa")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      await setDesactivada(promo, !promo.desactivada);
      cerrarDetalle(); // el onSnapshot repinta solo
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "Error, reintenta";
    }
  });
  if (expirado) {
    const msg = el("react-msg");
    let busy = false;
    const ejecutar = async (ms) => {
      if (busy) return;
      busy = true;
      msg.textContent = "Reactivando…";
      try {
        await reactivarPromo(promo, ms);
        cerrarDetalle(); // el onSnapshot repinta todo solo
      } catch (e) {
        console.error(e);
        msg.textContent = "No se pudo reactivar, intenta de nuevo";
        busy = false;
      }
    };
    el("btn-react-igual")?.addEventListener("click", () => ejecutar(durOrig));
    el("btn-react-custom").addEventListener("click", () => {
      const unidad = el("react-unidad").value;
      const max = unidad === "horas" ? 20 : 365;
      const cant = Math.min(
        Math.max(parseInt(el("react-cant").value, 10) || 1, 1),
        max,
      );
      ejecutar(cant * (unidad === "horas" ? 3600000 : 86400000));
    });
  }
}

function cerrarDetalle() {
  el("overlay-detalle").classList.remove("show");
}

el("overlay-detalle").addEventListener("click", (e) => {
  if (e.target.id === "overlay-detalle") cerrarDetalle();
});

if (tiendaId && localidad) iniciarSuscripcion();
initExport({ getPromos: () => promos, esExpirado });

// js/precios.js — Planes dinámicos desde /costos_geinz_saas/config_planes
import { getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { planesConfigDoc } from "../rutas/rutas.js";

const WA = "https://wa.me/51958120920?text=";
const U = "ilimitado";
const SOLO_RESTAURANTE = new Set(["mesas"]); // límites que solo se muestran a restaurantes/cafeterías

const LIM_ORDER = ["colecciones", "productos_por_coleccion", "trabajadores", "mesas", "repartidores", "cupones", "creditos_ia"];
const LIM = {
  colecciones: [(n) => `${n} colecciones`, "Colecciones ilimitadas"],
  productos_por_coleccion: [(n) => `${n} productos por colección`, "Productos ilimitados por colección"],
  trabajadores: [(n) => `${n} trabajadores`, "Trabajadores ilimitados"],
  mesas: [(n) => `${n} mesas`, "Mesas ilimitadas"],
  repartidores: [(n) => `${n} repartidores`, "Repartidores ilimitados"],
  cupones: [(n) => `${n} cupones activos`, "Cupones ilimitados"],
  creditos_ia: [(n) => `${n} créditos de IA al mes`, "Créditos de IA ilimitados"],
};
const MOD = {
  perfil_negocio: "Perfil de tu negocio", comprobantes: "Comprobantes", mis_trabajadores: "Gestión de trabajadores",
  legal: "Libro de reclamaciones, términos y privacidad", pedidos_en_vivo: "Pedidos en vivo", carrito_compras: "Carrito de compras",
  historial_ventas: "Historial de ventas", clientes: "Clientes y fidelización", cupones_puntos: "Cupones y puntos",
  publicidad_ofertas: "Publicidad y ofertas", "reseñas": "Reseñas", qr_tech: "QR Tech", modo_avanzado_productos: "Productos con variantes",
  multi_sucursal: "Múltiples sucursales", whatsapp_cloud_api: "WhatsApp Cloud API oficial", facturacion_sunat: "Facturación SUNAT",
  white_label: "Marca blanca", soporte_prioritario_24_7: "Soporte prioritario 24/7",
};

// Respaldo: se usa solo si Firestore no responde
const r2 = (n) => Math.round(n * 100) / 100;
const MODS = Object.fromEntries(["perfil_negocio", "comprobantes", "mis_trabajadores", "legal", "pedidos_en_vivo", "carrito_compras", "historial_ventas", "clientes", "cupones_puntos", "publicidad_ofertas", "reseñas", "qr_tech", "modo_avanzado_productos"].map((k) => [k, true]));
const mk = (nombre, descripcion, m, a, badge, pop, l) => {
  const an = r2(m * 12 * 0.8);
  return {
    nombre, descripcion, precio_mensual: m, precio_anterior: a, precio_anual: an, precio_anterior_anual: r2(Math.round(an * 1.4) - 0.1),
    etiqueta_badge: badge, mostrar_badge: true, es_mas_popular: pop, prueba_dias: 7, dominio_personalizado_permitido: true,
    limites: Object.fromEntries(LIM_ORDER.map((k, i) => [k, l[i]])), modulos: { ...MODS },
  };
};
const RESPALDO = {
  basico: mk("Plan Básico", "Todo el poder de GEINZ activado desde el primer día para emprendedores que arrancan con fuerza.", 49.9, 79.9, "Emprendedor", false, [15, 20, 2, 5, 10, 5, 100]),
  pro: mk("Plan Pro", "Para negocios activos con mayor rotación de stock, mesas y equipo de trabajo en expansión.", 89.9, 129.9, "Más Popular 🔥", true, [35, 40, 8, 20, 30, 20, 350]),
  avanzado: mk("Plan Avanzado", "Sin frenos. Capacidad masiva, control total de planilla y alta potencia de IA para marketing.", 149.9, 199.9, "Escala Total", false, [U, U, 24, U, U, U, 1000]),
  enterprise: {
    nombre: "Plan Enterprise", descripcion: "Infraestructura corporativa a medida, multi-sucursales, WhatsApp API oficial y marca blanca.", precio_mensual: 0,
    etiqueta_badge: "Corporativo", mostrar_badge: true, es_mas_popular: false, es_cotizacion: true, prueba_dias: 7, dominio_personalizado_permitido: true,
    limites: Object.fromEntries(LIM_ORDER.map((k) => [k, U])),
    modulos: { multi_sucursal: true, whatsapp_cloud_api: true, facturacion_sunat: true, white_label: true, soporte_prioritario_24_7: true },
  },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => { n = r2(Number(n) || 0); return Number.isInteger(n) ? String(n) : n.toFixed(2); };
const esIlim = (v) => String(v).toLowerCase() === U;

const st = { rubro: "restaurante", periodo: "mensual", lista: [] };
try {
  const q = new URLSearchParams(location.search).get("rubro") || localStorage.getItem("geinz_rubro");
  if (q === "restaurante" || q === "otro") st.rubro = q;
} catch { /* sin storage */ }

// ── Carga (con caché de 10 min para no leer Firestore en cada visita) ──
async function cargarPlanes() {
  try {
    const c = JSON.parse(sessionStorage.getItem("geinz_planes_v1") || "null");
    if (c && Date.now() - c.t < 600000) return c.p;
  } catch { /* ignorar */ }
  try {
    const s = await getDoc(planesConfigDoc());
    const p = s.exists() ? s.data().planes : null;
    if (p && Object.keys(p).length) {
      try { sessionStorage.setItem("geinz_planes_v1", JSON.stringify({ t: Date.now(), p })); } catch { /* ignorar */ }
      return p;
    }
  } catch (e) { console.warn("Planes: usando respaldo.", e.message); }
  return RESPALDO;
}

// Firestore devuelve los mapas ordenados por nombre: aquí se ordenan por precio (cotización al final)
const orden = (p) => p.orden ?? (p.es_cotizacion ? 9999 : Number(p.precio_mensual) || 0);
const ordenar = (planes) => Object.entries(planes).filter(([, p]) => p && p.visible !== false && p.activo !== false).sort((a, b) => orden(a[1]) - orden(b[1]));

// ── Piezas de la tarjeta ──
function limLinea(k, v) {
  const d = LIM[k];
  if (!d) return `${k.replace(/_/g, " ")}: ${esIlim(v) ? "ilimitado" : v}`;
  return esIlim(v) ? d[1] : d[0](v);
}

function precioHTML(p) {
  if (p.es_cotizacion) return `<p class="mt-3"><span class="text-4xl font-extrabold">Cotiza</span></p><p class="text-xs text-gray-500 mt-1 min-h-[2.5rem]">Precio a medida</p>`;
  const m = Number(p.precio_mensual) || 0, anual = st.periodo === "anual";
  const ahora = anual ? (p.precio_anual ?? r2(m * 12)) : m;
  const antes = anual ? p.precio_anterior_anual : p.precio_anterior;
  const oculto = anual ? p.mostrar_precio_anterior_anual === false : p.mostrar_precio_anterior === false;
  const off = !oculto && antes > ahora ? Math.round((1 - ahora / antes) * 100) : 0;
  return `<p class="mt-3"><span class="text-4xl font-extrabold">S/ ${fmt(ahora)}</span> <span class="text-gray-500 text-sm">/ ${anual ? "año" : "mes"}</span></p>
    <p class="text-xs mt-1 min-h-[2.5rem]">${off ? `<s class="text-gray-500">S/ ${fmt(antes)}</s> <span class="pl-off">-${off}%</span>` : ""}
    ${anual ? `<span class="text-gray-400 block mt-1">Equivale a S/ ${fmt(ahora / 12)} al mes</span>` : ""}</p>`;
}

function featuresHTML(p, difieren) {
  const lim = p.limites || {};
  const keys = [...LIM_ORDER.filter((k) => k in lim), ...Object.keys(lim).filter((k) => !LIM_ORDER.includes(k))];
  const out = keys.filter((k) => st.rubro === "restaurante" || !SOLO_RESTAURANTE.has(k)).map((k) => `<li>${esc(limLinea(k, lim[k]))}</li>`);
  (p.es_cotizacion ? Object.keys(p.modulos || {}) : difieren).forEach((k) => {
    const on = !!p.modulos?.[k];
    out.push(`<li class="${on ? "" : "no"}">${esc(MOD[k] || k.replace(/_/g, " "))}</li>`);
  });
  return out.join("");
}

function cardHTML(id, p, difieren) {
  const pop = !!p.es_mas_popular, trial = Number(p.prueba_dias) || 0;
  const href = p.es_cotizacion ? WA + encodeURIComponent(`Hola GEINZ, necesito el ${p.nombre}`) : `registrogeinz.html?plan=${encodeURIComponent(id)}&periodo=${st.periodo}`;
  const txt = p.es_cotizacion ? "Hablar con ventas" : trial ? `Probar ${trial} días gratis` : "Elegir este plan";
  const ext = p.es_cotizacion ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<article class="card plan${pop ? " featured" : ""} p-7 flex flex-col relative">
    ${p.mostrar_badge && p.etiqueta_badge ? `<span class="pl-badge${pop ? " pop" : ""}">${esc(p.etiqueta_badge)}</span>` : ""}
    <h3 class="text-lg font-extrabold">${esc(p.nombre)}</h3>
    <p class="text-gray-400 text-xs mt-2 font-light leading-relaxed min-h-[4.5rem]">${esc(p.descripcion)}</p>
    ${precioHTML(p)}
    <ul class="check list-none p-0 mt-4 flex-1">${featuresHTML(p, difieren)}</ul>
    <a href="${esc(href)}"${ext} class="btn ${pop ? "btn-main" : "btn-ghost"} mt-8">${esc(txt)}</a>
  </article>`;
}

function render() {
  const normales = st.lista.filter(([, p]) => !p.es_cotizacion);
  const keys = [...new Set(normales.flatMap(([, p]) => Object.keys(p.modulos || {})))];
  const comunes = keys.filter((k) => normales.every(([, p]) => p.modulos?.[k]));
  const difieren = keys.filter((k) => !comunes.includes(k));

  $("planesGrid").innerHTML = st.lista.map(([id, p]) => cardHTML(id, p, difieren)).join("");

  const chips = comunes.map((k) => MOD[k] || k.replace(/_/g, " "));
  if (normales.length && normales.every(([, p]) => p.dominio_personalizado_permitido)) chips.push("Dominio personalizado");
  const dias = Math.max(0, ...st.lista.map(([, p]) => Number(p.prueba_dias) || 0));
  if (dias) chips.unshift(`Prueba gratis de ${dias} días`);
  const box = $("planesComunes");
  box.hidden = !chips.length;
  box.innerHTML = chips.length ? `<h3 class="text-sm font-bold text-gray-300">Todos los planes incluyen</h3>
    <div class="flex flex-wrap gap-2 mt-4">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : "";

  const ahorro = Math.max(0, ...normales.map(([, p]) => { const m = Number(p.precio_mensual) || 0; return m > 0 && p.precio_anual ? Math.round((1 - p.precio_anual / (m * 12)) * 100) : 0; }));
  $("plAhorro").textContent = ahorro ? `ahorra ${ahorro}%` : "";

  document.querySelectorAll("[data-rubro]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.rubro === st.rubro));
  document.querySelectorAll("[data-periodo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.periodo === st.periodo));
}

document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-rubro]"), p = e.target.closest("[data-periodo]");
  if (r) { st.rubro = r.dataset.rubro; try { localStorage.setItem("geinz_rubro", st.rubro); } catch { /* ignorar */ } }
  else if (p) st.periodo = p.dataset.periodo;
  else return;
  if (st.lista.length) render();
});

// ── Arranque ──
$("planesGrid").innerHTML = '<div class="card pl-skel"></div>'.repeat(4);
cargarPlanes().then((p) => { st.lista = ordenar(p); render(); });
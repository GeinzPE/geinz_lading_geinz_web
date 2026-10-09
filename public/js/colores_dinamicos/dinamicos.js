// ═══════════════════════════════════════════════════════════════
//  colores_negocio.js
//  Un solo módulo para los colores dinámicos de un negocio Geinz.
//
//  USO RÁPIDO (en cualquier otro JS):
//
//    import { cargarColoresNegocio } from "./colores_negocio.js";
//    await cargarColoresNegocio({ id: "abc123", localidad: "barranca" });
//
//  Después de eso, todo el CSS puede usar:
//    rgba(var(--dr), var(--dg), var(--db), .3)
//    var(--brand-grad)           (solo si el negocio tiene degradado)
//
//  ESTRATEGIA DE VELOCIDAD:
//   1) Si hay caché → pinta los colores AL INSTANTE (síncrono) y
//      revalida en segundo plano (stale-while-revalidate).
//   2) Si no hay caché → 1 sola lectura a Firestore (deduplicada).
//   3) Si el negocio no tiene color_marca → color dominante del logo
//      (cacheado 30 días) → y si falla, color derivado del nombre.
// ═══════════════════════════════════════════════════════════════

import {
  doc,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../db/db.js"; // ← ajusta la ruta según dónde guardes este archivo
import { tiendaDoc } from "../rutas/rutas.js"; // ← idem

// ───────────────────────── Config ─────────────────────────
const TTL_NEGOCIO = 24 * 3600e3; // caché de color_marca / nombre / logo
const TTL_LOGO = 30 * 24 * 3600e3; // caché del color dominante del logo
const COLOR_NEUTRO = { r: 135, g: 135, b: 135 };
const K_NEGOCIO = (id) => `geinz_colores_${id}`;
const K_LOGO = (url) => `geinz_color_${url}`; // misma clave que ya usas en el perfil

// ───────────────────────── Caché (localStorage) ─────────────────────────
const cGet = (k, ttl = TTL_NEGOCIO) => {
  try {
    const o = JSON.parse(localStorage.getItem(k) || "null");
    return o && Date.now() - o.t < ttl ? o.d : null;
  } catch {
    return null;
  }
};
const cSet = (k, d) => {
  try {
    localStorage.setItem(k, JSON.stringify({ t: Date.now(), d }));
  } catch {}
};

// ───────────────────────── Estado interno ─────────────────────────
// ───────────────────────── Opciones globales ─────────────────────────
const _opts = { legible: false };

/** Llamar UNA vez al inicio de la página si necesitas colores legibles sobre fondo oscuro. */
export function configurarColoresNegocio({ legible = false } = {}) {
  _opts.legible = legible;
  _firmaAplicada = null; // fuerza repintar con la nueva config
}

function lum({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Aclara el color hasta que tenga luminancia suficiente (igual que ensureLegible del carrito). */
export function hacerLegible({ r, g, b }, minLum = 0.26) {
  let n = 0;
  while (lum({ r, g, b }) < minLum && n++ < 10) {
    r = Math.min(255, r + 16);
    g = Math.min(255, g + 16);
    b = Math.min(255, b + 16);
  }
  return { r, g, b };
}
const _enVuelo = new Map(); // id -> Promise (evita lecturas duplicadas)
let _firmaAplicada = null; // para no repintar si no cambió nada
let _estiloGradId = "brandGradStyle";

// ═══════════════════════════════════════════════════════════════
//  1) APLICAR COLORES AL DOM (variables CSS + fondos decorativos)
// ═══════════════════════════════════════════════════════════════
function aplicarColorBase({ r, g, b }) {
  const root = document.documentElement;
  root.style.setProperty("--dr", r);
  root.style.setProperty("--dg", g);
  root.style.setProperty("--db", b);

  const blob = document.getElementById("heroBlobBg");
  if (blob) blob.style.background = `rgba(${r},${g},${b},0.2)`;

  const grad = document.getElementById("ctaGradient");
  if (grad)
    grad.style.background = `linear-gradient(135deg, rgba(${r},${g},${b},.55) 0%, #0a0010 60%, #000 100%)`;

  const glow = document.getElementById("ctaGlow");
  if (glow) glow.style.background = `rgba(${r},${g},${b},.3)`;
}

const SELECTORES_GRADIENTE = `
  .btn-primary, .follow-btn.following, .reviews-cta-btn, .mesas-multi-btn,
  .mesa-reserva-submit, .login-prompt-btn-primary, .pcp-btn-go, .up-btn,
  .perfil-cart-float-btn, .mesa-reserva-float-btn,
  .reviews-filter-chip.active, .pv-chip.active, .carta-filter-chip.active,
  .review-avatar, .wl-user-avatar, .share-opt-ico[style*="--dr"],
  .promo-icon-share, .promo-icon-share-circle,
  .promo-card-price, .promo-active-price-badge {
    background: var(--brand-grad) !important;
  }
`;

function aplicarDegradado(c1, c2, ang = 135) {
  const root = document.documentElement;
  let st = document.getElementById(_estiloGradId);

  // Sin segundo color → limpiar degradado
  if (!c2) {
    ["--d2r", "--d2g", "--d2b", "--brand-grad"].forEach((v) =>
      root.style.removeProperty(v),
    );
    st?.remove();
    return;
  }

  root.style.setProperty("--d2r", c2.r);
  root.style.setProperty("--d2g", c2.g);
  root.style.setProperty("--d2b", c2.b);
  root.style.setProperty(
    "--brand-grad",
    `linear-gradient(${ang}deg, rgb(${c1.r},${c1.g},${c1.b}), rgb(${c2.r},${c2.g},${c2.b}))`,
  );

  const blob = document.getElementById("heroBlobBg");
  if (blob)
    blob.style.background = `linear-gradient(${ang}deg, rgba(${c1.r},${c1.g},${c1.b},.28), rgba(${c2.r},${c2.g},${c2.b},.28))`;
  const grad = document.getElementById("ctaGradient");
  if (grad)
    grad.style.background = `linear-gradient(135deg, rgba(${c1.r},${c1.g},${c1.b},.55) 0%, rgba(${c2.r},${c2.g},${c2.b},.4) 55%, #000 100%)`;
  const glow = document.getElementById("ctaGlow");
  if (glow) glow.style.background = `rgba(${c2.r},${c2.g},${c2.b},.3)`;

  if (!st) {
    st = document.createElement("style");
    st.id = _estiloGradId;
    document.head.appendChild(st);
  }
  st.textContent = SELECTORES_GRADIENTE;
}

/**
 * Aplica un resultado de color al documento.
 * @param {{r,g,b, degradado?:{r,g,b,angulo}|null}} color
 */
export function aplicarColoresNegocio(color) {
  if (!color) return;
  const firma = JSON.stringify([
    color.r, color.g, color.b, color.degradado || null, _opts.legible,
  ]);
  if (firma === _firmaAplicada) return false;
  _firmaAplicada = firma;

  const fix = (c) => (_opts.legible ? hacerLegible(c) : c);
  const c1 = fix({ r: color.r, g: color.g, b: color.b });
  const c2 = color.degradado
    ? fix({ r: color.degradado.r, g: color.degradado.g, b: color.degradado.b })
    : null;

  aplicarColorBase(c1);
  aplicarDegradado(c1, c2, color.degradado?.angulo || 135);
  return true;
}

/** Quita el degradado y deja solo el color base actual. */
export function limpiarDegradado() {
  aplicarDegradado(null, null);
  _firmaAplicada = null;
}

// ═══════════════════════════════════════════════════════════════
//  2) CÁLCULO DE COLORES (fallbacks)
// ═══════════════════════════════════════════════════════════════

/** Color derivado del nombre (cuando no hay color_marca ni logo legible). */
export function colorDesdeNombre(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  const s = 0.65,
    l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** Color dominante de una imagen (canvas 100x100, buckets de 16 niveles). */
export function colorDominanteDeImagen(imgEl) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 100;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const extraer = () => {
      try {
        ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const buckets = {};

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2],
            a = data[i + 3];
          if (a < 128) continue;

          const rn = r / 255,
            gn = g / 255,
            bn = b / 255;
          const max = Math.max(rn, gn, bn),
            min = Math.min(rn, gn, bn);
          const l = (max + min) / 2;
          const s =
            max === min
              ? 0
              : l > 0.5
                ? (max - min) / (2 - max - min)
                : (max - min) / (max + min);

          if (l > 0.72 || l < 0.1 || s < 0.28) continue; // blanco/negro/gris

          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          const bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
          bk.n++;
          bk.r += r;
          bk.g += g;
          bk.b += b;
        }

        const top = Object.values(buckets).sort((a, b) => b.n - a.n)[0];
        resolve(
          top
            ? {
                r: Math.round(top.r / top.n),
                g: Math.round(top.g / top.n),
                b: Math.round(top.b / top.n),
              }
            : null,
        );
      } catch (e) {
        console.warn("colorDominanteDeImagen (CORS):", e.message);
        resolve(null);
      }
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) extraer();
    else {
      imgEl.onload = extraer;
      imgEl.onerror = () => resolve(null);
    }
  });
}

/** Color dominante desde una URL de logo, con caché de 30 días. */
async function colorDominanteDeLogo(logoUrl) {
  if (!logoUrl) return null;
  const cached = cGet(K_LOGO(logoUrl), TTL_LOGO);
  if (cached) return cached;

  const color = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => colorDominanteDeImagen(img).then(resolve);
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
  if (color) cSet(K_LOGO(logoUrl), color);
  return color;
}

// ═══════════════════════════════════════════════════════════════
//  3) RESOLVER COLOR A PARTIR DE UN DOC DE NEGOCIO
// ═══════════════════════════════════════════════════════════════
function colorMarcaDeDoc(biz) {
  const cm = biz?.color_marca;
  if (cm?.activo === true && cm.r != null) {
    const g = cm.degradado;
    const tieneGrad = g?.activo === true && g.r != null;
    return {
      r: cm.r,
      g: cm.g,
      b: cm.b,
      degradado: tieneGrad
        ? { r: g.r, g: g.g, b: g.b, angulo: Number(g.angulo) || 135 }
        : null,
      fuente: "color_marca",
    };
  }
  return null;
}

async function resolverColor(biz) {
  const marca = colorMarcaDeDoc(biz);
  if (marca) return marca;

  const nombre = biz?.nombre_tienda || biz?.nombre || "";
  const logo = biz?.img_tienda?.logo_tienda || null;

  const dom = await colorDominanteDeLogo(logo);
  if (dom) return { ...dom, degradado: null, fuente: "logo" };

  const base = logo ? COLOR_NEUTRO : colorDesdeNombre(nombre);
  return { ...base, degradado: null, fuente: logo ? "neutro" : "nombre" };
}

// Lo mínimo que se guarda en caché (no el doc entero)
function snapshotMinimo(biz, color) {
  return {
    color,
    nombre: biz?.nombre_tienda || biz?.nombre || "",
    logo: biz?.img_tienda?.logo_tienda || null,
  };
}

// ═══════════════════════════════════════════════════════════════
//  4) API PRINCIPAL
// ═══════════════════════════════════════════════════════════════

/**
 * Pinta al instante los colores cacheados (síncrono, 0 ms de red).
 * Llámalo lo más temprano posible si ya conoces el id.
 * @returns {object|null} el color cacheado, o null si no había.
 */
export function aplicarColoresDesdeCache(id) {
  const c = cGet(K_NEGOCIO(id));
  if (c?.color) {
    aplicarColoresNegocio(c.color);
    return c.color;
  }
  return null;
}

/**
 * Obtiene (y por defecto APLICA) los colores del negocio.
 *
 * @param {Object}  opts
 * @param {string}  opts.id            ID del negocio (obligatorio)
 * @param {string}  opts.localidad     Localidad (ej. "barranca") (obligatorio)
 * @param {boolean} [opts.aplicar=true]  Aplica las variables CSS al documento
 * @param {boolean} [opts.forzar=false]  Ignora caché y lee Firestore
 * @param {object}  [opts.biz]         Si ya tienes el doc del negocio, pásalo y no se lee Firestore
 * @returns {Promise<{r,g,b,degradado,fuente,nombre,logo}>}
 */
export function cargarColoresNegocio({
  id,
  localidad,
  aplicar = true,
  forzar = false,
  biz = null,
} = {}) {
  if (!id) return Promise.reject(new Error("cargarColoresNegocio: falta id"));
  if (!biz && !localidad)
    return Promise.reject(new Error("cargarColoresNegocio: falta localidad"));

  // 1) Caché → pinta YA, y revalida en segundo plano
  if (!forzar && !biz) {
    const c = cGet(K_NEGOCIO(id));
    if (c?.color) {
      if (aplicar) aplicarColoresNegocio(c.color);
      // revalidación silenciosa (sin bloquear)
      revalidar({ id, localidad, aplicar }).catch(() => {});
      return Promise.resolve({ ...c.color, nombre: c.nombre, logo: c.logo });
    }
  }

  // 2) Sin caché → una sola lectura (deduplicada)
  return revalidar({ id, localidad, aplicar, biz });
}

function revalidar({ id, localidad, aplicar, biz = null }) {
  const llave = `${id}|${localidad}`;
  if (!biz && _enVuelo.has(llave)) return _enVuelo.get(llave);

  const p = (async () => {
    const data =
      biz ||
      (await (async () => {
        const snap = await getDoc(tiendaDoc(localidad, "tiendas", id));
        if (!snap.exists()) throw new Error("Negocio no encontrado");
        return { id: snap.id, ...snap.data() };
      })());

    const color = await resolverColor(data);
    cSet(K_NEGOCIO(id), snapshotMinimo(data, color));
    if (aplicar) aplicarColoresNegocio(color);
    return {
      ...color,
      nombre: data.nombre_tienda || data.nombre || "",
      logo: data.img_tienda?.logo_tienda || null,
    };
  })().finally(() => _enVuelo.delete(llave));

  if (!biz) _enVuelo.set(llave, p);
  return p;
}

/**
 * Igual que cargarColoresNegocio pero resolviendo por ALIAS (/perfil/{alias}).
 * Lee alias_tiendas → obtiene id + localidad → carga colores.
 */
export async function cargarColoresPorAlias(alias, opts = {}) {
  const key = `geinz_alias_${alias}`;
  let a = cGet(key, 6 * 3600e3);
  if (!a) {
    const s = await getDoc(doc(db, "alias_tiendas", alias));
    if (!s.exists()) throw new Error("Perfil no encontrado");
    a = s.data();
    cSet(key, a);
  }
  return cargarColoresNegocio({
    id: a.id,
    localidad: (a.localidad || "").trim().toLowerCase(),
    ...opts,
  });
}

/**
 * Escucha en TIEMPO REAL los cambios de color del negocio
 * (si el dueño cambia el color/degradado, se repinta solo).
 * @returns {Function} unsubscribe
 */
export function escucharColoresNegocio(
  { id, localidad, aplicar = true },
  onCambio,
) {
  let primera = true;
  return onSnapshot(tiendaDoc(localidad, "tiendas", id), async (snap) => {
    if (!snap.exists()) return;
    const biz = { id: snap.id, ...snap.data() };
    const marca = colorMarcaDeDoc(biz);

    // Si el dueño apagó el color de marca, se recalcula el fallback
    const color = marca || (await resolverColor(biz));
    cSet(K_NEGOCIO(id), snapshotMinimo(biz, color));

    const cambio = aplicar ? aplicarColoresNegocio(color) : true;
    if (!primera && cambio && typeof onCambio === "function") onCambio(color);
    primera = false;
  });
}

/** Lee el color actual desde las variables CSS (útil en otros JS). */
export function leerColorActual() {
  const s = document.documentElement.style;
  const r = s.getPropertyValue("--dr").trim();
  const g = s.getPropertyValue("--dg").trim();
  const b = s.getPropertyValue("--db").trim();
  if (!r || !g || !b) return null;
  return { r: +r, g: +g, b: +b };
}

/** Atajo: "rgba(r,g,b,a)" con el color actual (fallback morado Geinz). */
export function rgbaMarca(alpha = 1) {
  const c = leerColorActual() || { r: 139, g: 92, b: 246 };
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}
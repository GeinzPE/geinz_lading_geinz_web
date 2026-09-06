import PhotoSwipeLightbox from "https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.js";
window.PhotoSwipeLightbox = PhotoSwipeLightbox;
import { setFaviconCircular } from "../favicon/favicon.js";
import { registrarTokenWeb } from "../../notificaciones.js";
// ══════════════════════════════════════════
//  PANTALLA: PERFIL NO ENCONTRADO
// ══════════════════════════════════════════
let _currentUid = null; // NUEVO
let _fidelizacionActiva = false;
let _bannerShown = false;
let _fidelizacionMensajeInactivo =
  "Este negocio no tiene el programa de fidelización activo por el momento.";
function showNotFoundScreen(message = "") {
  hideBizLoader();
  document.body.innerHTML = "";
  document.body.style.cssText = `
    margin: 0;
    padding: 0;
    background: radial-gradient(circle at 20% 30%, #0a0418, #000000);
    min-height: 100vh;
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  `;

  // Obtener alias desde la URL
  const aliasAttempted = window.location.pathname.split("/perfil/")[1] || "";
  const cleanAlias = aliasAttempted
    ? decodeURIComponent(aliasAttempted).split(/[?#]/)[0]
    : "";

  // Sanitización básica
  const escapeHtml = (str) => {
    if (!str) return "";
    return str.replace(/[&<>]/g, (m) => {
      if (m === "&") return "&amp;";
      if (m === "<") return "&lt;";
      if (m === ">") return "&gt;";
      return m;
    });
  };

  const escapedAlias = escapeHtml(cleanAlias);
  const escapedMessage = escapeHtml(message);

  const errorDescription = escapedAlias
    ? `El perfil <strong style="color:#c084fc;">/${escapedAlias}</strong> no existe o fue eliminado.`
    : "El negocio o perfil que buscas no existe o fue eliminado.";

  const extraMessage = escapedMessage
    ? `<div style="margin-top: 1rem; font-size: 0.85rem; background: rgba(139, 92, 246, 0.12); backdrop-filter: blur(4px); padding: 0.6rem 1rem; border-radius: 2rem; color: #d9c6ff;">${escapedMessage}</div>`
    : "";

  const html = `
    <div style="max-width: 520px; width: 90%; margin: 1rem; z-index: 2;">
      <!-- Card principal con efecto glass + borde morado -->
      <div style="background: rgba(8, 5, 20, 0.75); backdrop-filter: blur(12px); border-radius: 3rem; border: 1px solid rgba(139, 92, 246, 0.35); box-shadow: 0 25px 45px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(139, 92, 246, 0.1); padding: 2.2rem 1.8rem; text-align: center; transition: transform 0.25s ease;">
        
        <!-- Icono animado sutil -->
                <!-- 404 con gradiente morado -->
        <h1 style="font-size: 4.2rem; font-weight: 800; margin: 0 0 0.2rem 0; background: linear-gradient(135deg, #e9d5ff, #c084fc, #8b5cf6); background-clip: text; -webkit-background-clip: text; color: transparent; letter-spacing: -0.02em;">404</h1>
        
        <p style="font-size: 1.6rem; font-weight: 600; margin: 0 0 0.5rem 0; color: #f3e8ff;">Perfil no encontrado</p>
        
        <div style="font-size: 0.95rem; color: #c4b5fd; line-height: 1.5; margin: 1.2rem 0 0; border-top: 1px solid rgba(139, 92, 246, 0.25); padding-top: 1.2rem;">
          ${errorDescription}
          <div style="font-size: 0.8rem; color: #a78bfa; margin-top: 0.5rem;">🔗 El enlace puede estar desactualizado o el contenido fue removido</div>
        </div>
        
        ${extraMessage}
        
        <!-- Botón único sin "volver" -->
        <div style="margin: 2rem 0 0.8rem;">
          <a href="https://geinztech.com" class="geinz-purple-btn" style="display: inline-block; padding: 0.85rem 2rem; background: linear-gradient(100deg, #8b5cf6, #6d28d9); border-radius: 60px; color: white; font-weight: 600; text-decoration: none; font-size: 0.95rem; letter-spacing: 0.3px; box-shadow: 0 6px 14px -4px rgba(109, 40, 217, 0.5); transition: all 0.2s ease; border: none; cursor: pointer;">Explorar Geinz</a>
        </div>
        
        <p style="font-size: 0.7rem; color: #6b4e9e; margin: 0.8rem 0 0;">✨ ¿Buscas algo específico? Revisa la URL o regresa al inicio</p>
      </div>
    </div>

    <!-- Partículas o decoración de fondo con morado -->
    <div style="position: fixed; bottom: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;">
      <div style="position: absolute; top: 15%; left: -10%; width: 300px; height: 300px; background: #7c3aed; filter: blur(100px); opacity: 0.2; border-radius: 50%;"></div>
      <div style="position: absolute; bottom: 10%; right: -5%; width: 250px; height: 250px; background: #a855f7; filter: blur(90px); opacity: 0.15; border-radius: 50%;"></div>
      <div style="position: absolute; top: 60%; left: 20%; width: 180px; height: 180px; background: #4c1d95; filter: blur(80px); opacity: 0.2; border-radius: 50%;"></div>
    </div>

    <style>
      .geinz-purple-btn:hover {
        transform: scale(1.02);
        background: linear-gradient(100deg, #a67cff, #7c3aed);
        box-shadow: 0 8px 20px -6px #7c3aed;
      }
      @keyframes fadeSlideUp {
        0% { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      body > div:first-child {
        animation: fadeSlideUp 0.5s ease-out;
      }
    </style>
  `;

  document.body.innerHTML = html;
}
function getDominantColor(imgEl) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 100;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    const tryExtract = () => {
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

          if (l > 0.72) continue; // blanco y colores claros (bajado de 0.92)
          if (l < 0.1) continue; // negro
          if (s < 0.28) continue;

          // Cubo más grande = menos fragmentación
          // Naranja y verde caen en cubos distintos
          const br = r >> 4,
            bg = g >> 4,
            bb = b >> 4;
          const key = `${br},${bg},${bb}`;
          if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };

          // Peso por área pura — sin bonus de saturación
          buckets[key].count++;
          buckets[key].r += r;
          buckets[key].g += g;
          buckets[key].b += b;
        }

        const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);
        if (!sorted.length) {
          resolve(null);
          return;
        }

        const top = sorted[0];
        resolve({
          r: Math.round(top.r / top.count),
          g: Math.round(top.g / top.count),
          b: Math.round(top.b / top.count),
        });
      } catch (e) {
        console.warn("getDominantColor CORS:", e.message);
        resolve(null);
      }
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) tryExtract();
    else {
      imgEl.onload = tryExtract;
      imgEl.onerror = () => resolve(null);
    }
  });
}

/**
 * Aplica { r, g, b } a todas las variables CSS --dr, --dg, --db
 * con una transición suave en el body.
 */
function applyDominantColor({ r, g, b }) {
  const root = document.documentElement;
  root.style.setProperty("--dr", r);
  root.style.setProperty("--dg", g);
  root.style.setProperty("--db", b);

  // Actualizar el blob de fondo del hero directamente
  const heroBlobBg = document.getElementById("heroBlobBg");
  if (heroBlobBg) {
    heroBlobBg.style.background = `rgba(${r},${g},${b},0.2)`;
  }

  // CTA gradients
  const ctaGradient = document.getElementById("ctaGradient");
  if (ctaGradient) {
    ctaGradient.style.background = `linear-gradient(135deg, rgba(${r},${g},${b},.55) 0%, #0a0010 60%, #000 100%)`;
  }
  const ctaGlow = document.getElementById("ctaGlow");
  if (ctaGlow) {
    ctaGlow.style.background = `rgba(${r},${g},${b},.3)`;
  }
}

/**
 * Fallback: color derivado del nombre (cuando el logo no carga o
 * no se puede leer por CORS).
 */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  // Convertir HSL → RGB (saturación fija 65%, luminosidad 55%)
  const s = 0.65,
    l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// ══════════════════════════════════════════
//  LOADER
// ══════════════════════════════════════════
const LOADER_CSS = `
    .geinz-loader {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #030303;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 20px 16px 40px;
    }
    /* Contenedor principal del contenido simulado */
    .sk-container {
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
    }
    /* Hero skeleton (logo + texto) */
    .sk-hero {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 48px;
    }
    @media (min-width: 1024px) {
        .sk-hero {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
        }
        .sk-hero-left {
            flex: 1;
        }
        .sk-hero-right {
            flex: 0.9;
        }
    }
    .sk-title {
        height: 68px;
        width: 80%;
        border-radius: 20px;
        background: #121212;
        margin-bottom: 24px;
    }
    .sk-status {
        height: 48px;
        width: 160px;
        border-radius: 40px;
        background: #121212;
        margin-bottom: 28px;
    }
    .sk-tags {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 32px;
    }
    .sk-tag {
        height: 42px;
        width: 100px;
        border-radius: 40px;
        background: #121212;
    }
    .sk-desc {
        height: 100px;
        width: 100%;
        border-radius: 28px;
        background: #121212;
        margin-bottom: 32px;
    }
    .sk-buttons {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
    }
    .sk-btn {
        height: 56px;
        width: 160px;
        border-radius: 28px;
        background: #121212;
    }
    .sk-hero-right .sk-image {
        width: 100%;
        height: 320px;
        border-radius: 32px;
        background: #121212;
    }
    /* Secciones skeleton */
    .sk-section {
        margin-bottom: 48px;
    }
    .sk-section-header {
        height: 32px;
        width: 200px;
        border-radius: 20px;
        background: #121212;
        margin-bottom: 24px;
    }
    .sk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 20px;
    }
    .sk-card {
        height: 220px;
        border-radius: 28px;
        background: #121212;
    }
    /* Ajustes desktop */
    @media (min-width: 768px) {
        .sk-grid {
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        }
        .sk-card {
            height: 300px;
        }
        .sk-hero-right .sk-image {
            height: 460px;
        }
        .sk-title {
            height: 88px;
        }
    }
    @media (min-width: 1200px) {
        .sk-grid {
            grid-template-columns: repeat(3, 1fr);
        }
        .sk-card {
            height: 360px;
        }
    }
    /* Efecto shimmer moderno */
    .sk-title, .sk-status, .sk-tag, .sk-desc, .sk-btn, .sk-image, .sk-section-header, .sk-card {
        position: relative;
        overflow: hidden;
        background: #141414;
    }
    .sk-title::after, .sk-status::after, .sk-tag::after, .sk-desc::after, 
    .sk-btn::after, .sk-image::after, .sk-section-header::after, .sk-card::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.04) 40%,
            rgba(255, 255, 255, 0.08) 50%,
            rgba(255, 255, 255, 0.04) 60%,
            transparent 100%
        );
        background-size: 200% 100%;
        animation: sk-shimmer 1.8s infinite;
    }
    @keyframes sk-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }
    /* Ocultar loader con animación */
    .geinz-loader.hide {
        opacity: 0;
        transition: opacity 0.4s ease;
        pointer-events: none;
    }
`;

function hideBizLoader() {
  const loader = document.getElementById("geinzLoader");
  document.documentElement.classList.remove("geinz-loading");
  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => loader.remove(), 420);
  }
}

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, auth, storage } from "../db/db.js";
import {
  tiendaDoc,
  tiendaCol,
  tiendaSubCol,
  tiendaSubDoc,
  data_user_logeado,
} from "../rutas/rutas.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
async function getParams() {
  const path = window.location.pathname;
  const desdePath = path.startsWith("/perfil/");

  if (desdePath) {
    let alias = path.split("/perfil/")[1]?.trim();
    if (!alias) throw new Error("Alias inválido");

    let wantsCarta = false;
    if (alias.endsWith("-carta")) {
      wantsCarta = true;
      alias = alias.replace(/-carta$/, "");
    }

    // Detecta sufijo de mesa: alias-mesa-{token}
    let mesaToken = null;
    const mesaMatch = alias.match(/-mesa-([a-zA-Z0-9]+)$/);
    if (mesaMatch) {
      mesaToken = mesaMatch[1];
      alias = alias.slice(0, mesaMatch.index);
    }

    const aliasSnap = await getDoc(doc(db, "alias_tiendas", alias));
    if (!aliasSnap.exists()) throw new Error("Perfil no encontrado");

    const { id, localidad, categoria } = aliasSnap.data();

    const promoId =
      new URLSearchParams(window.location.search).get("p") || null;

    return {
      localidad: localidad.trim().toLowerCase(),
      subcol: (categoria || "").replace(/\+/g, " "),
      id,
      promoIndex: null,
      promoId,
      wantsCarta,
      mesaToken,
    };
  }

  // ── Fallback URL vieja con ?id=&l= ──
  const p = new URLSearchParams(window.location.search);
  const localidad = (p.get("localidad") || p.get("l") || "barranca")
    .trim()
    .toLowerCase();
  let subcol = (p.get("subcol") || p.get("c") || "").trim().toLowerCase();
  subcol = subcol.replace(/\+/g, " ");
  subcol = decodeURIComponent(subcol);
  const id = (p.get("id") || "JHgbs7ttVXRnsIqsEGWS").trim();
  const promoIndex = p.get("i") || null;

  return {
    localidad,
    subcol,
    id,
    promoIndex,
    wantsCarta: false,
    mesaToken: null,
  };
}

async function resolveMesaYRedirigir({ localidad, id }, mesaToken) {
  try {
    const mesasRef = tiendaSubCol(localidad, "tiendas", id, "mesas");
    const snap = await getDocs(mesasRef);
    let mesaDoc = null;

    snap.forEach((d) => {
      if (mesaDoc) return;
      const data = d.data();
      if (data.token_seguridad === mesaToken) {
        mesaDoc = { id: d.id, ...data };
      }
    });

    if (!mesaDoc) {
      showNotFoundScreen("La mesa escaneada no es válida o ya no existe.");
      return true;
    }

    const url = new URL("../carrito/carrito.html", window.location.href);
    url.searchParams.set("localidad", localidad);
    url.searchParams.set("id", id);
    url.searchParams.set("mesaId", mesaDoc.id);
    if (mesaDoc.nombre_alias)
      url.searchParams.set("mesaNombre", mesaDoc.nombre_alias);
    if (mesaDoc.numero_mesa != null)
      url.searchParams.set("mesaNumero", mesaDoc.numero_mesa);
    url.searchParams.set("mesaToken", mesaToken);

    window.location.replace(url.toString());
    return true;
  } catch (e) {
    console.error("Error resolviendo mesa:", e);
    showNotFoundScreen(
      "No se pudo verificar la mesa. Escanea el código de nuevo.",
    );
    return true;
  }
}
async function loadBusiness({ localidad, id }) {
  const ref = tiendaDoc(localidad, "tiendas", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Negocio no encontrado");
  return { id: snap.id, ...snap.data() };
}

// ══════════════════════════════════════════
//  PROMOCIONES ACTIVAS
// ══════════════════════════════════════════

async function loadCarta({ localidad, id }) {
  try {
    const ref = tiendaSubCol(localidad, "tiendas", id, "carta");
    const snap = await getDocs(ref);
    const secciones = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const imgs = (data.imagenes || []).filter(Boolean);
      if (imgs.length)
        secciones.push({
          nombre: data.nombre || docSnap.id,
          imagenes: imgs,
          texto: data.texto || "",
        });
    });
    return secciones;
  } catch (e) {
    console.warn("No se pudo cargar la carta:", e.message);
    return [];
  }
}

function listenCartaRealtime(
  { localidad, id },
  categoria,
  aliasKey,
  nombreNegocio,
  onFirstLoad,
) {
  try {
    const ref = tiendaSubCol(localidad, "tiendas", id, "carta");
    let isFirst = true;
    return onSnapshot(ref, (snap) => {
      const secciones = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const imgs = (data.imagenes || []).filter(Boolean);
        if (imgs.length)
          secciones.push({
            nombre: data.nombre || docSnap.id,
            imagenes: imgs,
            texto: data.texto || "",
          });
      });
      renderCarta(secciones, categoria, aliasKey, nombreNegocio);
      if (isFirst) {
        isFirst = false;
        if (typeof onFirstLoad === "function") onFirstLoad(secciones);
      }
    });
  } catch (e) {
    console.warn("No se pudo escuchar la carta en tiempo real:", e.message);
  }
}

function listenActivePromosRealtime({ localidad, id }) {
  try {
    const ref = tiendaSubCol(localidad, "tiendas", id, "promociones_geinz");
    return onSnapshot(ref, (snap) => {
      const now = Date.now();
      const promos = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const fh = data.datos_hora_fecha || {}; // ← el mapa anidado real

        // ── Estado: "estado" está en la raíz, "activo" está dentro de datos_hora_fecha ──
        const estadoOk = data.estado === "activo";
        const activoOk = fh.activo !== false; // si no existe el campo, se asume true
        if (!estadoOk || !activoOk) return;

        // ── Inicio de vigencia ──
        const inicioMs = fh.timestamp_inicio?.toMillis
          ? fh.timestamp_inicio.toMillis()
          : null;
        if (inicioMs && inicioMs > now) return; // aún no empieza

        // ── Fin de vigencia: prioriza timestamp_fin (fuente de verdad) ──
        let finMs = fh.timestamp_fin?.toMillis
          ? fh.timestamp_fin.toMillis()
          : null;

        // ── Respaldo: fecha_fin + hora_fin como texto, hora de Lima (UTC-5 fijo) ──
        if (finMs === null && fh.fecha_fin) {
          finMs = parseFechaHoraLima(fh.fecha_fin, fh.hora_fin);
        }

        if (finMs === null) return; // sin forma de determinar vigencia → se descarta

        if (finMs < now) return; // ← ya venció

        promos.push({ id: docSnap.id, ...data, _finMs: finMs });
      });

      promos.sort((a, b) => (a._finMs || Infinity) - (b._finMs || Infinity));
      renderActivePromos(promos.slice(0, 4), localidad);
    });
  } catch (e) {
    console.warn("No se pudieron escuchar promociones activas:", e.message);
  }
}
/* Convierte "dd/mm/yyyy" + "HH:mm" (hora de Lima, UTC-5 fijo) a milisegundos UTC.
   Lima no tiene horario de verano, así que el offset es siempre -5. */
function parseFechaHoraLima(fechaStr, horaStr) {
  const [d, m, y] = (fechaStr || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  const limaOffsetMs = -5 * 60 * 60 * 1000;
  const fechaUTC = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  return fechaUTC - limaOffsetMs;
}
function renderCarta(secciones, categoria, aliasKey, nombreNegocio) {
  const sec = document.getElementById("secCarta");
  const filtersEl = document.getElementById("cartaFilters");
  const gridEl = document.getElementById("cartaGrid");
  if (!sec || !filtersEl || !gridEl) return;

  injectCartaTextStyles();

  const esComida = (categoria || "").toLowerCase().includes("comida");
  _navState.carta = esComida && secciones.length > 0;
  updateQuickNav();

  if (!_navState.carta) {
    sec.style.display = "none";
    return;
  }
  sec.style.display = "";
  filtersEl.innerHTML = "";
  gridEl.innerHTML = "";

  // ── Caja de descripción (se inserta una sola vez, antes del grid) ──
  let descBox = document.getElementById("cartaDescBox");
  if (!descBox) {
    descBox = document.createElement("p");
    descBox.id = "cartaDescBox";
    descBox.className = "carta-desc-box";
    filtersEl.insertAdjacentElement("afterend", descBox);
  }

  function paintDesc(idx) {
    const texto = (secciones[idx].texto || "").trim();
    if (!texto) {
      descBox.textContent = "";
      descBox.classList.remove("show");
      descBox.classList.add("hidden");
      return;
    }
    descBox.classList.remove("show");
    descBox.classList.remove("hidden");
    // pequeño delay para que la transición se note al cambiar de filtro
    requestAnimationFrame(() => {
      descBox.textContent = texto;
      requestAnimationFrame(() => descBox.classList.add("show"));
    });
  }

  function paintGrid(idx) {
    gridEl.innerHTML = "";
    const imgs = secciones[idx].imagenes;
    imgs.forEach((src, i) => {
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.style.cursor = "pointer";
      const imgWrap = createImageWithPlaceholder({
        src,
        alt: secciones[idx].nombre,
        onError: () => {
          card.style.display = "none";
        },
      });
      card.appendChild(imgWrap);
      card.addEventListener("click", () => openLightbox(imgs, i));
      gridEl.appendChild(card);
    });
    paintDesc(idx);
  }

  secciones.forEach((s, idx) => {
    const chip = document.createElement("button");
    chip.className = "carta-filter-chip" + (idx === 0 ? " active" : "");
    chip.textContent = s.nombre;
    chip.addEventListener("click", () => {
      filtersEl
        .querySelectorAll(".carta-filter-chip")
        .forEach((el) => el.classList.remove("active"));
      chip.classList.add("active");
      paintGrid(idx);
    });
    filtersEl.appendChild(chip);
  });

  paintGrid(0);

  const shareBtn = document.getElementById("cartaShareBtn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      const shareUrl = aliasKey
        ? `https://geinztech.com/perfil/${aliasKey}-carta`
        : window.location.href;
      const fullText = `Mira la carta digital de ${nombreNegocio} 📖\n${shareUrl}`;
      if (navigator.share) {
        navigator
          .share({ text: fullText })
          .catch(() => copyToClipboard(fullText));
      } else {
        copyToClipboard(fullText);
      }
    };
  }
}

function normalizarCategoria(cat) {
  return (cat || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function listenMesasRealtime({ localidad, id }, categoria, esPresencial) {
  const sec = document.getElementById("secMesas");
  injectMesasStyles(); // ← SIEMPRE se inyecta el CSS, sin importar la categoría
  const esComida = normalizarCategoria(categoria) === "comida y restaurantes";
  if (!esComida || !esPresencial) {
    if (sec) sec.style.display = "none";
    return;
  }
  if (_mesasUnsub) return;
  const ref = tiendaSubCol(localidad, "tiendas", id, "mesas");
  _mesasUnsub = onSnapshot(ref, (snap) => renderMesas(snap));
}

function renderMesas(snap) {
  const sec = document.getElementById("secMesas");
  const grid = document.getElementById("mesasGrid");
  if (!sec || !grid) return;
  if (snap.empty) {
    sec.style.display = "none";
    return;
  }
  injectMesasStyles();
  const mesas = [];
  snap.forEach((d) => mesas.push({ id: d.id, ...d.data() }));
  mesas.sort((a, b) => (a.numero_mesa || 0) - (b.numero_mesa || 0));
  _mesasCache = mesas;
  sec.style.display = "";
  grid.innerHTML = "";
  mesas.forEach((m) => {
    const esOcupada = m.estado === "ocupado";
    const esReservada = m.estado === "reservada";
    const libre = !esOcupada && !esReservada;
    const claseEstado = esOcupada
      ? "mesa-ocupada"
      : esReservada
        ? "mesa-reservada"
        : "mesa-libre";
    const textoEstado = esOcupada
      ? "Ocupada"
      : esReservada
        ? "Reservada"
        : "Libre";
    const chip = document.createElement("div");
    chip.className = "mesa-chip " + claseEstado;
    chip.innerHTML = `<span class="mesa-num">${m.numero_mesa ?? m.mesaNumero ?? "-"}</span><span class="mesa-estado">${textoEstado}</span>`;
    if (libre) {
      chip.addEventListener("click", () =>
        openMesaReservaModal(
          m.nombre_alias || m.mesaNombre || `Mesa ${m.numero_mesa}`,
        ),
      );
    }
    grid.appendChild(chip);
  });
}

function restarMinutos(hhmm, minutos) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m - minutos;
  if (total < 0) total = 0;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function getHorarioHoyRange() {
  if (!_horarioHoy || _horarioHoy.cerrado || !_horarioHoy.bloques?.length)
    return null;
  const bloques = _horarioHoy.bloques;
  return {
    min: bloques[0].h_apertura,
    max: bloques[bloques.length - 1].h_cierre,
  };
}
function openMesaReservaModal(mesaOMesas) {
  const rango = getHorarioHoyRange();
  if (!rango) {
    showToast("El negocio está cerrado hoy, no se puede reservar");
    return;
  }
  _mesaSeleccionada = mesaOMesas;
  _horaMaxReserva = restarMinutos(rango.max, 30);

  const esMultiple = Array.isArray(mesaOMesas);
  const tituloMesas = esMultiple
    ? `Mesas ${mesaOMesas.join(", ")}`
    : mesaOMesas;

  const modal = document.getElementById("mesaReservaModal");
  const horaInput = document.getElementById("mesaReservaHora");
  const errorEl = document.getElementById("mesaReservaError");
  document.getElementById("mesaReservaTitle").textContent =
    `Reservar ${tituloMesas}`;
  document.getElementById("mesaReservaNombre").value = "";
  document.getElementById("mesaReservaPersonas").value = "";
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.remove("show");
  }
  horaInput.min = rango.min;
  horaInput.max = _horaMaxReserva;
  horaInput.value = "";
  modal?.classList.add("open");
}
function closeMesaReservaModal() {
  document.getElementById("mesaReservaModal")?.classList.remove("open");
  _mesaSeleccionada = null;
  const multiInput = document.getElementById("mesasMultiInput");
  if (multiInput) multiInput.value = "";
}
async function ensureClienteRecord({ localidad, id }, uid) {
  try {
    const clientesRef = tiendaSubCol(localidad, "tiendas", id, "clientes");
    const q = query(clientesRef, where("id_usuario", "==", uid), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return; // ya existe, no duplicar

    const newDocRef = doc(clientesRef);
    await setDoc(newDocRef, {
      id: newDocRef.id,
      id_usuario: uid,
      fecha_inicio: serverTimestamp(),
      ultimo_consumo: serverTimestamp(), // arranca igual a fecha_inicio, el SAS lo va actualizando después
    });
  } catch (e) {
    console.warn("No se pudo crear el registro de cliente:", e.message);
  }
}
async function loadPuntosCliente({ localidad, id }, uid) {
  try {
    const clienteRef = doc(
      tiendaSubCol(localidad, "tiendas", id, "clientes"),
      uid,
    );
    const snap = await getDoc(clienteRef);
    if (!snap.exists()) return renderPuntosBadge(0);
    renderPuntosBadge(Number(snap.data().puntos) || 0);
  } catch (e) {
    console.warn("No se pudieron cargar los puntos:", e.message);
  }
}
function renderPuntosBadge(puntos) {
  _currentPuntos = Number(puntos) || 0;
  const badge = document.getElementById("puntosBadge");
  if (!badge) return;
  if (!puntos || puntos <= 0) {
    badge.style.display = "none";
    return;
  }
  badge.style.display = "inline-flex";
  badge.innerHTML = `<span class="puntos-badge-icon">🎁</span> Tienes ${puntos} puntos en ${_bizNombre || "este negocio"} · mostrar tarjeta `;
}

document.getElementById("puntosBadge")?.addEventListener("click", () => {
  if (!_fidelizacionActiva) {
    showToast(_fidelizacionMensajeInactivo); // muestra el mensaje real desde la DB
    return;
  }

  const url = new URL(
    "../../fidelizacion/fidelizacion_client.html",
    window.location.href,
  );
  url.searchParams.set("localidad", _params.localidad);
  url.searchParams.set("id", _params.id);
  if (_currentUid) url.searchParams.set("uid", _currentUid);
  window.location.href = url.toString();
});
function bindFollowButton({ localidad, id }, biz) {
  const btn = document.getElementById("followBtn");
  const icon = document.getElementById("followIcon");
  const text = document.getElementById("followText");
  if (!btn) return;

  let isFollowing = false;
  let isBusy = false;

  function setFollowUI(following) {
    isFollowing = following;
    btn.classList.toggle("following", following);
    icon.textContent = following ? "✅" : "➕";
    text.textContent = following ? "Siguiendo" : "Seguir";
  }

  onAuthStateChanged(auth, async (user) => {
    const uid = user?.uid || null;
    _currentUid = uid;
    if (!uid) {
      btn.onclick = () => {
        openLoginPromptModal();
      };
      _followReady = true;
      tryHideLoader();
      return;
    }

    const favoritoRef = doc(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "users",
      uid,
      "favoritos",
      id,
    );
    const clienteRef = doc(
      tiendaSubCol(localidad, "tiendas", id, "clientes"),
      uid,
    );
    const snap = await getDoc(clienteRef);
    setFollowUI(snap.exists());
    _followReady = true;
    tryHideLoader();

    loadPuntosCliente({ localidad, id }, uid);

    btn.onclick = async () => {
      if (isBusy) return;

      const nextState = !isFollowing;

      // Si va a dejar de seguir y tiene puntos, pedir confirmación primero
      if (!nextState && _currentPuntos > 0) {
        openUnfollowConfirmModal(() => ejecutarUnfollow());
        return;
      }

      await ejecutarToggle(nextState);

      async function ejecutarToggle(next) {
        isBusy = true;
        setFollowUI(next);
        if (next)
          (btn.classList.add("pulse"),
            setTimeout(() => btn.classList.remove("pulse"), 500));

        try {
          if (next) {
            // 👇 AGREGAR ESTA LÍNEA — pide permiso y guarda el token FCM
            registrarTokenWeb(uid).catch((e) =>
              console.warn("No se pudo registrar token FCM:", e.message),
            );

            const ubicacion = biz.ubicacion || {};
            const yaExiste = await getDoc(clienteRef);
            const dataCliente = {
              id: uid,
              id_usuario: uid,
              fecha_inicio: serverTimestamp(),
              ultimo_consumo: serverTimestamp(),
            };
            if (!yaExiste.exists()) dataCliente.puntos = 0;

            await Promise.all([
              setDoc(favoritoRef, {
                id_tienda_lugar: id,
                img_tienda_lugar: biz.img_tienda?.logo_tienda || "",
                latitud: ubicacion.latitud ?? null,
                longitud: ubicacion.longitud ?? null,
                localidad_lugar_tienda: localidad,
                nombre_lugar_tienda: biz.nombre_tienda || biz.nombre || "",
                timesLap_local: String(Date.now()),
              }),
              setDoc(clienteRef, dataCliente, { merge: true }),
            ]);
          } else {
            await ejecutarUnfollow();
          }
        } catch (e) {
          console.error("Error al actualizar seguidor:", e);
          setFollowUI(!next);
          showToast("No se pudo actualizar, intenta de nuevo");
        } finally {
          isBusy = false;
        }
      }

      async function ejecutarUnfollow() {
        isBusy = true;
        setFollowUI(false);
        try {
          await Promise.all([deleteDoc(favoritoRef), deleteDoc(clienteRef)]);
          renderPuntosBadge(0);
        } catch (e) {
          console.error("Error al dejar de seguir:", e);
          setFollowUI(true);
          showToast("No se pudo actualizar, intenta de nuevo");
        } finally {
          isBusy = false;
        }
      }
    };
  });
}
function bindMesaReservaEvents() {
  document
    .getElementById("mesaReservaClose")
    ?.addEventListener("click", closeMesaReservaModal);
  document
    .getElementById("mesaReservaModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "mesaReservaModal") closeMesaReservaModal();
    });
  document
    .getElementById("mesaReservaSubmit")
    ?.addEventListener("click", () => {
      const errorEl = document.getElementById("mesaReservaError");
      const setError = (msg) => {
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.classList.add("show");
        } else {
          showToast(msg);
        }
      };

      const nombre = document.getElementById("mesaReservaNombre").value.trim();
      const personas = document
        .getElementById("mesaReservaPersonas")
        .value.trim();
      const hora = document.getElementById("mesaReservaHora").value.trim();
      const rango = getHorarioHoyRange();

      if (!nombre || !personas || !hora) {
        setError("Completa nombre, personas y hora");
        return;
      }
      const maxPermitido = _horaMaxReserva || rango?.max;
      if (!rango || hora < rango.min || hora > maxPermitido) {
        setError(
          `Elige una hora entre ${rango?.min ?? "-"} y ${maxPermitido ?? "-"}`,
        );
        return;
      }

      if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.remove("show");
      }

      const mesasTexto = Array.isArray(_mesaSeleccionada)
        ? `las mesas ${_mesaSeleccionada.join(", ")}`
        : _mesaSeleccionada;

      const msg = `Hola, quiero reservar ${mesasTexto} hoy a las ${hora} para ${personas} persona(s). Mi nombre es ${nombre}.`;
      if (_waNumeroNegocio) {
        window.open(
          `https://wa.me/51${_waNumeroNegocio}?text=${encodeURIComponent(msg)}`,
          "_blank",
        );
      } else {
        showToast("Reserva enviada");
      }
      closeMesaReservaModal();
    });

  document.getElementById("mesasMultiBtn")?.addEventListener("click", () => {
    const input = document.getElementById("mesasMultiInput");
    const raw = input?.value.trim() || "";
    if (!raw) {
      showToast("Escribe los números de mesa, ej: 4,3,2,1");
      return;
    }
    const numeros = raw
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n));

    if (!numeros.length) {
      showToast("Formato inválido, usa: 4,3,2,1");
      return;
    }

    const invalidas = [];
    const ocupadas = [];
    const reservadas = [];
    numeros.forEach((num) => {
      const mesa = _mesasCache.find((m) => (m.numero_mesa || 0) === num);
      if (!mesa) invalidas.push(num);
      else if (mesa.estado === "ocupado") ocupadas.push(num);
      else if (mesa.estado === "reservada") reservadas.push(num);
    });

    if (invalidas.length) {
      showToast(`Mesa(s) inexistente(s): ${invalidas.join(", ")}`);
      return;
    }
    if (ocupadas.length) {
      showToast(`Mesa(s) ocupada(s): ${ocupadas.join(", ")}`);
      return;
    }
    if (reservadas.length) {
      showToast(`Mesa(s) ya reservada(s): ${reservadas.join(", ")}`);
      return;
    }

    const nombresMesas = numeros.map((num) => {
      const mesa = _mesasCache.find((m) => (m.numero_mesa || 0) === num);
      return mesa.nombre_alias || mesa.mesaNombre || `Mesa ${num}`;
    });

    openMesaReservaModal(nombresMesas);
  });
}
function formatExpiry(finMs) {
  if (!finMs) return { text: "Promo activa", cls: "exp-green" };

  const diffMs = finMs - Date.now();
  if (diffMs <= 0) return { text: "Expirada", cls: "exp-red" };

  const diffH = diffMs / 3600000;
  const diffD = diffH / 24;

  let cls = "exp-green";
  if (diffH <= 24) cls = "exp-red";
  else if (diffD <= 3) cls = "exp-yellow";

  let text;
  if (diffD >= 1) {
    const d = Math.floor(diffD);
    text = `Vence en ${d} día${d !== 1 ? "s" : ""}`;
  } else {
    const h = Math.floor(diffH);
    text = h > 0 ? `Vence en ${h}h` : "Vence en minutos";
  }
  return { text, cls };
}

function renderActivePromos(promos, localidad) {
  const sec = document.getElementById("secPromosActivas");
  const grid = document.getElementById("promosActivasGrid");
  if (!sec || !grid) return;

  if (!promos.length) {
    sec.style.display = "none";
    _navState.ofertas = false;
    updateQuickNav();
    return;
  }

  sec.style.display = "";
  grid.innerHTML = "";
  _navState.ofertas = true;
  updateQuickNav();

  promos.forEach((p) => {
    const info = p.informacion || {};
    const img =
      p.img_container?.lista_img?.[0] || p.img_container?.logo_img || "";
    const expiry = formatExpiry(p._finMs);
    const shareUrl = `https://geinztech.com/api/share?t=prms&l=${encodeURIComponent(localidad)}&pi=${p.id}`;

    const whatsappAllowed = info.contactar && info.numero;
    const shareAllowed = info.compartir;

    const waMsg =
      p.mensaje_predeterminado?.whatsapp?.msje_predermindo ||
      "Hola, quiero esta oferta que vi en Geinz";
    const shareMsg =
      p.mensaje_predeterminado?.compartir?.msje_predermindo ||
      "Mira esta promo en Geinz 🎁";

    const waLink = whatsappAllowed
      ? `https://wa.me/51${info.numero.replace(/\D/g, "")}?text=${encodeURIComponent(
          `${waMsg}: ${shareUrl}`,
        )}`
      : null;

    const card = document.createElement("div");
    card.className = "promo-active-card";
    card.innerHTML = `
      <div class="promo-active-img-wrap">
        <span class="promo-expiry-badge ${expiry.cls}">${expiry.text}</span>
      </div>
      <div class="promo-active-body">
        <h3 class="promo-active-title">${info.titulo || ""}</h3>
        <p class="promo-active-desc">${info.descripcion || ""}</p>
        <div class="promo-active-actions">
          ${waLink ? `<a class="promo-btn-wa" href="${waLink}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ""}
          ${shareAllowed ? `<button class="promo-btn-share" data-share-url="${shareUrl}" data-share-msg="${shareMsg.replace(/"/g, "&quot;")}">Compartir</button>` : ""}
        </div>
      </div>
    `;
    const imgWrapContainer = card.querySelector(".promo-active-img-wrap");
    const imgWrap = createImageWithPlaceholder({
      src: img,
      alt: info.titulo || "Promoción",
      onError: () => {
        imgWrapContainer.style.display = "none";
      },
    });
    imgWrapContainer.prepend(imgWrap);

    grid.appendChild(card);
  });

  grid.querySelectorAll(".promo-btn-share").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.shareUrl;
      const msg = btn.dataset.shareMsg;
      const fullText = `${msg}\n${url}`;
      if (navigator.share) {
        try {
          await navigator.share({ text: fullText });
        } catch (e) {}
      } else {
        copyToClipboard(fullText);
      }
    });
  });
}

// ══════════════════════════════════════════
//  NORMALIZADORES
// ══════════════════════════════════════════
const DAY_KEYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miércoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sábado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];
function renderFidelizacion(f) {
  const meta = document.getElementById("fidelizacionMeta");
  if (!meta) return;
  meta.innerHTML = "";

  const chips = [];

  if (f.vencimientoActivo) {
    chips.push(
      `<span class="fidel-chip">⏳ Puntos válidos por ${f.diasVencimiento} días</span>`,
    );
    chips.push(
      `<span class="fidel-chip warn">🔔 Aviso ${f.diasAviso} días antes de vencer</span>`,
    );
  } else {
    chips.push(`<span class="fidel-chip">♾️ Tus puntos no vencen</span>`);
  }

  meta.innerHTML = chips.join("");
}
function normalizeFidelizacion(f) {
  if (!f || f.activo !== true) return null;
  return {
    diasAviso: f.diasAviso ?? 4,
    diasVencimiento: f.diasVencimiento ?? 100,
    vencimientoActivo: f.vencimientoActivo === true,
    mensajeInactivo: f.mensajeInactivo || "",
  };
}

// Reemplaza normalizeSchedule en el archivo 2
function normalizeSchedule(h) {
  return DAY_KEYS.map(({ key, label }) => {
    const diaData = h?.[key];

    // Día marcado como cerrado
    if (!diaData || diaData.cerrado === true) {
      return {
        dia: label,
        cerrado: true,
        motivo: diaData?.motivo || null,
        bloques: [],
      };
    }

    const bloques = (diaData.bloques || []).filter(
      (b) => b.h_apertura && b.h_cierre,
    );

    return {
      dia: label,
      cerrado: false,
      motivo: null,
      bloques, // puede tener 1 (corrido) o 2 (con descanso)
    };
  });
}
function normalizeContactos(mc = {}) {
  const c = [];
  if (mc.whatsapp?.estado && mc.whatsapp.numero)
    c.push({ tipo: "whatsapp", valor: mc.whatsapp.numero, label: "WhatsApp" });
  if (mc.llamada?.estado && mc.llamada.numero)
    c.push({ tipo: "telefono", valor: mc.llamada.numero, label: "Teléfono" });
  if (mc.facebook?.estado && mc.facebook.url)
    c.push({
      tipo: "facebook",
      valor: mc.facebook.url,
      label: "Facebook",
      nombre: mc.facebook.nombre,
    });
  if (mc.instagram?.estado && mc.instagram.url)
    c.push({
      tipo: "instagram",
      valor: mc.instagram.url,
      label: "Instagram",
      nombre: mc.instagram.nombre,
    });
  if (mc.tiktok?.estado && mc.tiktok.url)
    c.push({
      tipo: "tiktok",
      valor: mc.tiktok.url,
      label: "TikTok",
      nombre: mc.tiktok.nombre,
    });
  if (mc.sitio_web?.estado && mc.sitio_web.url)
    c.push({
      tipo: "web",
      valor: mc.sitio_web.url,
      label: "Sitio Web",
      nombre: mc.sitio_web.nombre,
    });
  return c;
}
const PAYMENT_LABELS = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  visa_mastercard: "Visa / Mastercard",
  agora: "Agora",
};
const PAYMENT_ICONS = {
  efectivo: "../img/efectivo_logo.webp",
  yape: "../img/yape_logo.webp",
  plin: "../img/logo_plin.webp",
  visa_mastercard: "../img/visa_logo.webp",
  agora: "../img/logo_agora.webp",
};
function normalizePagos(mp) {
  return Object.entries(mp || {})
    .filter(([, v]) => v?.enable)
    .map(([key]) => ({
      key,
      label: PAYMENT_LABELS[key] || key,
      icon: PAYMENT_ICONS[key] || "💳",
    }));
}
function normalizeImages(it) {
  const lista = it?.lista_img || {};
  const ambi = Array.isArray(lista.ambientales) ? lista.ambientales : [];
  const productos = Array.isArray(lista.servicios_productos)
    ? lista.servicios_productos
    : [];
  return {
    ambientales: ambi.filter(Boolean), // ← filtra null/undefined/""
    productos: productos.filter(Boolean), // ← filtra null/undefined/""
    todas: [...ambi, ...productos].filter(Boolean),
  };
}
function normalizePromos(it) {
  const p = it?.lista_img?.promociones || {};
  return Object.entries(p).map(([id, url], idx) => ({
    id,
    url,
    titulo: `Promoción ${idx + 1}`,
  }));
}
const AMENITY_ICONS = {
  "zona expandida": "🏢",
  "camaras de seguridad": "📷",
  "servicios higenicos": "🚻",
  wifi: "📶",
  "sala de espera": "🛋️",
  "mesa para niños": "👶",
  "sala de juegos": "🎮",
  estacionamiento: "🅿️",
  enchufe: "🔌",
  "aire acondicionado": "❄️",
  "ingreso con mascotas": "🐾",
};
function normalizeAmenities(sc) {
  const r = [];
  (sc || []).forEach((obj) => {
    Object.entries(obj).forEach(([name, en]) => {
      if (en) r.push({ name, icon: AMENITY_ICONS[name.toLowerCase()] || "✅" });
    });
  });
  return r;
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function copyToClipboard(txt) {
  navigator.clipboard
    .writeText(txt)
    .then(() => showToast())
    .catch(() => {
      const t = document.createElement("textarea");
      t.value = txt;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
      showToast();
    });
}

function createImageWithPlaceholder({
  src,
  alt = "",
  onError,
  onClick,
  useLogoFallback = false,
}) {
  const wrap = document.createElement("div");
  wrap.className = "img-ph-wrap";

  // No hay imagen desde el inicio (producto sin foto) → placeholder de logo directo
  if (!src && useLogoFallback) {
    wrap.appendChild(createLogoPlaceholder(alt));
    wrap.classList.add("loaded");
    if (onClick) wrap.addEventListener("click", onClick);
    return wrap;
  }

  const img = document.createElement("img");
  img.alt = alt;
  img.loading = "lazy";

  img.onload = () => {
    img.classList.add("loaded");
    wrap.classList.add("loaded");
  };
  img.onerror = () => {
    if (useLogoFallback) {
      wrap.innerHTML = "";
      wrap.appendChild(createLogoPlaceholder(alt));
      wrap.classList.add("loaded");
      return;
    }
    if (onError) onError(wrap, img);
    else wrap.remove();
  };

  img.src = src;
  wrap.appendChild(img);

  if (onClick) wrap.addEventListener("click", onClick);
  return wrap;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}
function ocultarNumero(n) {
  const l = n.replace(/\D/g, "");
  return l.length <= 3 ? l : l.slice(0, 3) + "******";
}

// ══════════════════════════════════════════
//  RENDER CONTACTOS
// ══════════════════════════════════════════
const CONTACT_META = {
  whatsapp: {
    icon: "../img/whatsapp_icon.png",
    getHref: (c) => `https://wa.me/${c.valor.replace(/\D/g, "")}`,
  },
  telefono: {
    icon: "../img/llamada_icon.png",
    getHref: (c) => `tel:${c.valor}`,
  },
  facebook: { icon: "../img/facebook_icon.webp", getHref: (c) => c.valor },
  instagram: { icon: "../img/instagram_icon.webp", getHref: (c) => c.valor },
  tiktok: { icon: "../img/tik_tok_icon.webp", getHref: (c) => c.valor },
  web: { icon: "../img/sitio-web.webp", getHref: (c) => c.valor },
};
function renderContactDetail(contactos) {
  const cd = document.getElementById("contactDetail");
  cd.innerHTML = "";
  contactos.forEach((c) => {
    const meta = CONTACT_META[c.tipo] || {
      icon: "🔗",
      getHref: (x) => x.valor,
    };
    const displayVal =
      c.tipo === "whatsapp" || c.tipo === "telefono"
        ? ocultarNumero(c.valor)
        : c.nombre || c.valor;
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);margin-bottom:8px;";
    wrap.innerHTML = `
  <img 
    src="${meta.icon}" 
    alt="${c.tipo}" 
    style="
      width:30px;
      height:30px;
      object-fit:cover;
      border-radius:50%;
      flex-shrink:0;
      overflow:hidden;
    "
  >

  <div style="flex:1;overflow:hidden">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600">
      ${c.label}
    </div>

    <div style="font-size:14px;font-weight:500;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      ${displayVal}
    </div>
  </div>

  <button 
    class="copy-btn" 
    data-copy="${c.valor}" 
    style="
      width:34px;
      height:34px;
      border:none;
      border-radius:10px;
      cursor:pointer;
      background:#1d1633;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
    "
  >
    📋
  </button>

  <a 
    href="${meta.getHref(c)}" 
    target="_blank" 
    rel="noopener" 
    style="
      padding:6px 14px;
      border-radius:99px;
      background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));
      color:white;
      font-size:12.5px;
      font-weight:700;
      text-decoration:none;
      white-space:nowrap;
      border:1px solid rgba(255,255,255,.06);
      box-shadow:0 0 20px rgba(var(--dr),var(--dg),var(--db),.28);
    "
  >
    ir
  </a>
`;
    cd.appendChild(wrap);
  });
  cd.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
        btn.textContent = "✅";
        setTimeout(() => (btn.textContent = "📋"), 1400);
      } catch {
        const t = document.createElement("textarea");
        t.value = value;
        t.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        document.body.removeChild(t);
        btn.textContent = "✅";
        setTimeout(() => (btn.textContent = "📋"), 1400);
      }
    });
  });
}

function updateQuickNav() {
  const row = document.getElementById("quickNavRow");
  if (!row) return;
  row.innerHTML = "";
  const items = [
    _navState.ofertas && {
      emoji: "🔥",
      label: "Ofertas",
      target: "secPromosActivas",
    },
    _navState.productos && {
      emoji: "⭐",
      label: "Lo mejor",
      target: "secProductos",
    },
    _navState.ambientes && {
      emoji: "🌿",
      label: "Ambientes",
      target: "secAmbientes",
    },
    _navState.carta && {
      emoji: "📖",
      label: "Carta digital",
      target: "secCarta",
    },
  ].filter(Boolean);

  items.forEach(({ emoji, label, target }) => {
    const btn = document.createElement("button");
    btn.className = "nav-chip";
    btn.innerHTML = `<span class="emoji">${emoji}</span> ${label}`;
    btn.addEventListener("click", () =>
      document
        .getElementById(target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    row.appendChild(btn);
  });
}

// ══════════════════════════════════════════
//  STATUS BADGE
// ══════════════════════════════════════════
// ══════════════════════════════════════════
//  STATUS BADGE (compatible con nuevo formato de bloques)
// ══════════════════════════════════════════
function calcStatus(horario) {
  const now = new Date();
  const DIAS_ES = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const diaKey = DIAS_ES[now.getDay()]; // clave directa en el objeto horario_atencion

  const badge = document.getElementById("statusBadge");
  const stxt = document.getElementById("statusText");

  // Buscar el día de hoy en el array normalizado (que viene de normalizeSchedule)
  // horario aquí ya es el resultado de normalizeSchedule → array de 7 elementos
  const DAY_KEYS_ORDER = [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
  ];
  const map = [6, 0, 1, 2, 3, 4, 5]; // getDay() → índice en el array normalizado
  const todayIdx = map[now.getDay()];
  const today = horario[todayIdx];

  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const formatDur = (mins) => {
    const h = Math.floor(mins / 60),
      m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  // Día cerrado
  if (!today || today.cerrado || !today.bloques?.length) {
    const motivoTexto = today?.motivo ? ` · ${today.motivo}` : "";

    // Buscar próxima apertura
    for (let i = 1; i <= 7; i++) {
      const next = horario[(todayIdx + i) % 7];
      if (!next?.cerrado && next?.bloques?.length) {
        const label = i === 1 ? "mañana" : next.dia;
        badge.className = "status-badge closed";
        stxt.textContent = `Cerrado${motivoTexto} · Abre ${i === 1 ? "mañana" : "el " + label} a las ${next.bloques[0].h_apertura}`;
        return;
      }
    }
    badge.className = "status-badge closed";
    stxt.textContent = `Cerrado${motivoTexto}`;
    return;
  }

  // Revisar cada bloque de hoy
  for (const bloque of today.bloques) {
    const apertura = toMin(bloque.h_apertura);
    const cierre = toMin(bloque.h_cierre);
    if (apertura === null || cierre === null) continue;

    if (nowMin >= apertura && nowMin < cierre) {
      const diff = cierre - nowMin;
      badge.className = "status-badge open";
      stxt.textContent =
        diff <= 30
          ? `Cierra pronto · ${bloque.h_cierre}`
          : `Cierra en ${formatDur(diff)} · ${bloque.h_cierre}`;
      return;
    }
  }

  // Aún no abre (primer bloque futuro de hoy)
  for (const bloque of today.bloques) {
    const apertura = toMin(bloque.h_apertura);
    if (apertura !== null && apertura > nowMin) {
      const diff = apertura - nowMin;
      badge.className = "status-badge closed";
      stxt.textContent = `Abre hoy en ${formatDur(diff)} · ${bloque.h_apertura}`;
      return;
    }
  }

  // Ya cerró hoy — buscar próximo día
  for (let i = 1; i <= 7; i++) {
    const next = horario[(todayIdx + i) % 7];
    if (!next?.cerrado && next?.bloques?.length) {
      const label = i === 1 ? "mañana" : `el ${next.dia}`;
      badge.className = "status-badge closed";
      stxt.textContent = `Abre ${label} a las ${next.bloques[0].h_apertura}`;
      return;
    }
  }

  badge.className = "status-badge closed";
  stxt.textContent = "Cerrado temporalmente";
}

// ══════════════════════════════════════════
//  CARRUSEL COMPLETO
// ══════════════════════════════════════════
let fullCurrentSlide = 0,
  fullTotalSlides = 0,
  fullAutoTimer = null;
function buildFullGallery(images) {
  const track = document.getElementById("fullGalleryTrack");
  const dotsContainer = document.getElementById("fullGalleryDots");
  if (!track || !dotsContainer) return;
  track.innerHTML = "";
  dotsContainer.innerHTML = "";
  if (!images.length) return;
  fullTotalSlides = images.length;
  images.forEach((src, i) => {
    const slide = document.createElement("div");
    slide.className = "full-gallery-slide";
    const imgWrap = createImageWithPlaceholder({
      src,
      alt: `Galería ${i + 1}`,
      onError: () => {
        slide.style.display = "none";
      },
    });
    slide.appendChild(imgWrap);
    track.appendChild(slide);
    const dot = document.createElement("div");
    dot.className = "full-gallery-dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => {
      goFullSlide(i);
      resetFullAuto();
    });
    dotsContainer.appendChild(dot);
  });
  goFullSlide(0);
  startFullAuto();
}
function goFullSlide(n) {
  if (!fullTotalSlides) return;
  fullCurrentSlide =
    ((n % fullTotalSlides) + fullTotalSlides) % fullTotalSlides;
  document.getElementById("fullGalleryTrack").style.transform =
    `translateX(-${fullCurrentSlide * 100}%)`;
  document
    .querySelectorAll(".full-gallery-dot")
    .forEach((d, i) => d.classList.toggle("active", i === fullCurrentSlide));
}
function startFullAuto() {
  if (fullAutoTimer) clearInterval(fullAutoTimer);
  fullAutoTimer = setInterval(() => goFullSlide(fullCurrentSlide + 1), 4000);
}
function resetFullAuto() {
  clearInterval(fullAutoTimer);
  startFullAuto();
}

function showSnackbar(msg) {
  let sb = document.getElementById("snackbar-geinz");
  if (!sb) {
    sb = document.createElement("div");
    sb.id = "snackbar-geinz";
    sb.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(80px);
      background:#111;color:#fff;padding:14px 22px;border-radius:10px;
      font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.4);
      z-index:9999;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;
      opacity:0;max-width:320px;text-align:center;line-height:1.4;
    `;
    document.body.appendChild(sb);
  }
  sb.textContent = msg;
  sb.style.transform = "translateX(-50%) translateY(0)";
  sb.style.opacity = "1";
  clearTimeout(sb._timer);
  sb._timer = setTimeout(() => {
    sb.style.transform = "translateX(-50%) translateY(80px)";
    sb.style.opacity = "0";
  }, 3500);
}
// ══════════════════════════════════════════
//  RENDER PRINCIPAL
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  LIGHTBOX / CARRUSEL ESTILO IG
// ══════════════════════════════════════════
const LIGHTBOX_CSS = `
.lightbox-modal {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(3,3,3,0.94);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
 transition: opacity 0.28s ease, visibility 0.28s ease;
    touch-action: none;
    overscroll-behavior: contain;
}
  .lightbox-modal.open {
    opacity: 1;
    visibility: visible;
  }
.lightbox-stage {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    box-sizing: border-box;
    overflow: hidden;
    touch-action: none;
}
.lightbox-stage img {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 18px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6);
    opacity: 0;
    transform: scale(0.96);
    transition: opacity 0.32s ease, transform 0.32s cubic-bezier(.2,.8,.2,1);
    touch-action: none;
    cursor: zoom-in;
}
    .lightbox-stage img.zoomed {
    cursor: grab;
}
  .lightbox-stage img.show {
    opacity: 1;
    transform: scale(1);
  }
  .lightbox-close {
    position: absolute;
    top: 20px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, transform 0.15s ease;
  }
  .lightbox-close:hover { background: rgba(255,255,255,0.18); transform: scale(1.05); }
  .lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, transform 0.15s ease;
  }
  .lightbox-nav:hover { background: rgba(255,255,255,0.2); transform: translateY(-50%) scale(1.08); }
  .lightbox-prev { left: 20px; }
  .lightbox-next { right: 20px; }
  .lightbox-counter {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.75);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    background: rgba(255,255,255,0.08);
    padding: 6px 14px;
    border-radius: 20px;
  }
  @media (max-width: 640px) {
    .lightbox-nav { width: 44px; height: 44px; }
    .lightbox-prev { left: 8px; }
    .lightbox-next { right: 8px; }
    .lightbox-stage { padding: 16px; }
  }
`;

const CARTA_TEXT_CSS = `
.carta-desc-box {
    max-width: 780px;
    margin: 0 0 28px;
    padding: 16px 20px;
    border-radius: 18px;
    background: var(--surface, rgba(255,255,255,0.03));
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-left: 3px solid rgb(var(--dr), var(--dg), var(--db));
    color: #d4d4d8;
    font-size: 14.5px;
    line-height: 1.6;
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 0.28s ease, transform 0.28s ease;
}
.carta-desc-box.show {
    opacity: 1;
    transform: translateY(0);
}
.carta-desc-box:empty,
.carta-desc-box.hidden {
    display: none;
}
`;

function injectCartaTextStyles() {
  if (document.getElementById("cartaTextStyle")) return;
  const style = document.createElement("style");
  style.id = "cartaTextStyle";
  style.textContent = CARTA_TEXT_CSS;
  document.head.appendChild(style);
}

let _lightboxImages = [];
let _lightboxIndex = 0;
let _lightboxBound = false;
let _panzoomInstance = null;

const MESAS_CSS = `
.mesas-grid{display:flex;flex-wrap:wrap;gap:12px;}
.mesas-multi-wrap{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
.mesas-multi-wrap input{flex:1;min-width:160px;padding:12px 14px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.1));background:var(--surface,rgba(255,255,255,.04));color:#fff;font-size:14px;}
.mesas-multi-btn{padding:12px 18px;border:none;border-radius:12px;font-weight:700;font-size:13px;color:#fff;cursor:pointer;background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));white-space:nowrap;}
.mesa-reserva-error{font-size:12px;color:#ff6b6b;margin:-6px 0 10px;min-height:14px;display:none;}
.mesa-reserva-error.show{display:block;}
.mesa-chip{min-width:84px;padding:14px 18px;border-radius:16px;text-align:center;font-weight:700;font-size:13px;border:1px solid var(--border,rgba(255,255,255,.08));background:var(--surface,rgba(255,255,255,.03));transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;user-select:none;}
.mesa-chip .mesa-num{display:block;font-size:20px;font-weight:900;margin-bottom:4px;}
.mesa-chip .mesa-estado{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.75;}
.mesa-chip.mesa-libre{cursor:pointer;border-color:rgba(var(--dr),var(--dg),var(--db),.55);background:rgba(var(--dr),var(--dg),var(--db),.12);}
.mesa-chip.mesa-libre:hover{transform:translateY(-2px);box-shadow:0 0 18px rgba(var(--dr),var(--dg),var(--db),.35);border-color:rgba(var(--dr),var(--dg),var(--db),.8);}
.mesa-chip.mesa-ocupada,.mesa-chip.mesa-reservada{cursor:not-allowed;opacity:.45;}
.mesa-reserva-modal{position:fixed;inset:0;z-index:10001;background:rgba(3,3,3,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .25s ease, visibility .25s ease;padding:20px;}
.mesa-reserva-modal.open{opacity:1;visibility:visible;}
.mesa-reserva-box{width:100%;max-width:340px;background:#0b0b0d;border:1px solid rgba(var(--dr),var(--dg),var(--db),.35);border-radius:24px;padding:24px 22px;position:relative;transform:scale(.96);transition:transform .25s ease;}
.mesa-reserva-modal.open .mesa-reserva-box{transform:scale(1);}
.mesa-reserva-close{position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;}
.mesa-reserva-box h3{font-size:18px;font-weight:800;margin:0 0 4px;color:#fff;}
.mesa-reserva-sub{font-size:12px;color:#9c9ca3;margin:0 0 18px;}
.mesa-reserva-box input{width:100%;padding:12px 14px;margin-bottom:12px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:14px;box-sizing:border-box;}
.mesa-reserva-box input:focus{outline:none;border-color:rgba(var(--dr),var(--dg),var(--db),.6);}
.mesa-reserva-hora-label{display:block;font-size:11px;color:#9c9ca3;margin:-4px 0 6px;text-transform:uppercase;letter-spacing:.06em;}
.mesa-reserva-submit{width:100%;padding:13px;border:none;border-radius:12px;font-weight:700;font-size:14px;color:#fff;cursor:pointer;background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));}
`;
const LOGIN_PROMPT_CSS = `
.login-prompt-modal{
  position:fixed;inset:0;z-index:10002;
  background:rgba(3,3,3,.75);
  backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;
  opacity:0;visibility:hidden;
  transition:opacity .28s ease;
  padding:20px;
}
.login-prompt-modal.open{opacity:1;visibility:visible;}
.login-prompt-box{
  width:100%;max-width:360px;
  background:#0b0b0d;
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);
  border-radius:28px;
  padding:32px 26px 26px;
  position:relative;
  text-align:center;
  overflow:hidden;
  transform:scale(.94);
  transition:transform .28s cubic-bezier(.2,.8,.2,1);
  box-shadow:0 25px 60px -12px rgba(0,0,0,.7), 0 0 40px -10px rgba(var(--dr),var(--dg),var(--db),.35);
}
.login-prompt-modal.open .login-prompt-box{transform:scale(1);}
.login-prompt-close{
  position:absolute;top:14px;right:14px;
  width:32px;height:32px;border:none;border-radius:50%;
  background:rgba(255,255,255,.08);color:#fff;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
.login-prompt-glow{
  position:absolute;top:-60px;left:50%;transform:translateX(-50%);
  width:220px;height:220px;border-radius:50%;
  background:radial-gradient(circle, rgba(var(--dr),var(--dg),var(--db),.45), transparent 70%);
  filter:blur(10px);
  pointer-events:none;
}
.login-prompt-logo{
  width:88px;height:88px;border-radius:50%;
  object-fit:cover;margin:0 auto 18px;
  border:2px solid rgba(var(--dr),var(--dg),var(--db),.6);
  box-shadow:0 0 25px rgba(var(--dr),var(--dg),var(--db),.4);
  position:relative;z-index:1;background:#111;display:block;
}
.login-prompt-letter{
  width:88px;height:88px;border-radius:50%;margin:0 auto 18px;
  display:flex;align-items:center;justify-content:center;
  font-size:2rem;font-weight:800;
  color:rgba(var(--dr),var(--dg),var(--db),.95);
  background:rgba(var(--dr),var(--dg),var(--db),.15);
  border:2px solid rgba(var(--dr),var(--dg),var(--db),.5);
  position:relative;z-index:1;
}
.login-prompt-title{font-size:19px;font-weight:800;color:#fff;margin:0 0 8px;position:relative;z-index:1;}
.login-prompt-desc{font-size:13.5px;color:#9c9ca3;line-height:1.55;margin:0 0 24px;position:relative;z-index:1;}
.login-prompt-actions{display:flex;flex-direction:column;gap:10px;position:relative;z-index:1;}
.login-prompt-btn-primary{
  padding:13px;border:none;border-radius:14px;font-weight:700;font-size:14px;color:#fff;
  cursor:pointer;text-decoration:none;display:block;
  background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));
  box-shadow:0 8px 20px -6px rgba(var(--dr),var(--dg),var(--db),.5);
}
.login-prompt-btn-secondary{
  padding:13px;border-radius:14px;font-weight:600;font-size:13.5px;cursor:pointer;
  background:rgba(255,255,255,.06);color:#d4d4d8;border:1px solid rgba(255,255,255,.1);
}
`;

function injectLoginPromptStyles() {
  if (document.getElementById("loginPromptStyle")) return;
  const style = document.createElement("style");
  style.id = "loginPromptStyle";
  style.textContent = LOGIN_PROMPT_CSS;
  document.head.appendChild(style);
}

function openUnfollowConfirmModal(onConfirm) {
  injectLoginPromptStyles();
  const modal = document.getElementById("unfollowConfirmModal");
  const desc = document.getElementById("unfollowConfirmDesc");
  if (!modal) return;

  desc.textContent = `Tienes ${_currentPuntos} puntos en ${_bizNombre || "este negocio"}. Si dejas de seguir, tus puntos se eliminarán permanentemente.`;

  const acceptBtn = document.getElementById("unfollowConfirmAccept");
  const newAccept = acceptBtn.cloneNode(true); // limpia listeners viejos
  acceptBtn.replaceWith(newAccept);
  newAccept.addEventListener("click", () => {
    closeUnfollowConfirmModal();
    onConfirm();
  });

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeUnfollowConfirmModal() {
  document.getElementById("unfollowConfirmModal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function bindUnfollowConfirmEvents() {
  document
    .getElementById("unfollowConfirmClose")
    ?.addEventListener("click", closeUnfollowConfirmModal);
  document
    .getElementById("unfollowConfirmCancel")
    ?.addEventListener("click", closeUnfollowConfirmModal);
  document
    .getElementById("unfollowConfirmModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "unfollowConfirmModal") closeUnfollowConfirmModal();
    });
}
function openLoginPromptModal() {
  injectLoginPromptStyles();
  const modal = document.getElementById("loginPromptModal");
  if (!modal) return;

  const logoWrap = document.getElementById("loginPromptLogoWrap");
  const nameSpan = document.getElementById("loginPromptBizName");
  if (nameSpan) nameSpan.textContent = _bizNombre || "este negocio";

  if (logoWrap) {
    logoWrap.innerHTML = "";
    if (_bizLogoUrl) {
      const img = document.createElement("img");
      img.crossOrigin = "anonymous"; // ← clave: usa la misma caché que bizLogoHero
      img.src = _bizLogoUrl;
      img.alt = _bizNombre || "Logo";
      img.className = "login-prompt-logo";
      logoWrap.appendChild(img);
    } else {
      const letter = document.createElement("div");
      letter.className = "login-prompt-letter";
      letter.textContent = (_bizNombre || "?").trim().charAt(0).toUpperCase();
      logoWrap.appendChild(letter);
    }
  }

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLoginPromptModal() {
  document.getElementById("loginPromptModal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function showPromoBanner(biz) {
  if (_bannerShown) return;
  const bannerModal = document.getElementById("bannerModal");
  const bannerImg = document.getElementById("bannerImg");
  if (!bannerModal || !bannerImg) return;

  const banner = biz.banner || {};
  if (banner.activo === true && banner.imagen) {
    bannerImg.onload = () => {
      bannerModal.classList.add("open");
      document.body.style.overflow = "hidden";
      _bannerShown = true;
    };
    bannerImg.onerror = () => {};
    bannerImg.src = banner.imagen;
  }
}

function bindBannerModalEvents() {
  const modal = document.getElementById("bannerModal");
  const closeBanner = () => {
    modal?.classList.remove("open");
    document.body.style.overflow = "";
  };
  document
    .getElementById("bannerModalClose")
    ?.addEventListener("click", closeBanner);
  modal?.addEventListener("click", (e) => {
    if (e.target.id === "bannerModal") closeBanner();
  });
}
function bindLoginPromptEvents() {
  document
    .getElementById("loginPromptClose")
    ?.addEventListener("click", closeLoginPromptModal);
  document
    .getElementById("loginPromptCancel")
    ?.addEventListener("click", closeLoginPromptModal);
  document
    .getElementById("loginPromptModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "loginPromptModal") closeLoginPromptModal();
    });
}

const LOGO_PLACEHOLDER_CSS = `
.geinz-logo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(var(--dr),var(--dg),var(--db),.18), rgba(var(--dr),var(--dg),var(--db),.05));
}
.geinz-logo-placeholder img {
  width: 90px;
  height: 90px;
  object-fit: cover;
  border-radius: 50%;
  background: #111;
  box-shadow: 0 4px 14px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.06);
  opacity: .95;
}
.geinz-logo-placeholder .ph-letter {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 800;
  color: rgba(var(--dr),var(--dg),var(--db),.95);
  background: rgba(var(--dr),var(--dg),var(--db),.12);
  border: 1px solid rgba(var(--dr),var(--dg),var(--db),.3);
}
`;

function injectLogoPlaceholderStyles() {
  if (document.getElementById("logoPhStyle")) return;
  const style = document.createElement("style");
  style.id = "logoPhStyle";
  style.textContent = LOGO_PLACEHOLDER_CSS;
  document.head.appendChild(style);
}

function createLogoPlaceholder(alt = "") {
  injectLogoPlaceholderStyles();
  const wrap = document.createElement("div");
  wrap.className = "geinz-logo-placeholder";
  if (_bizLogoUrl) {
    const img = document.createElement("img");
    img.src = _bizLogoUrl;
    img.alt = alt || _bizNombre || "Logo";
    img.loading = "lazy";
    wrap.appendChild(img);
  } else {
    const letter = document.createElement("span");
    letter.className = "ph-letter";
    letter.textContent = (_bizNombre || "?").trim().charAt(0).toUpperCase();
    wrap.appendChild(letter);
  }
  return wrap;
}
function injectMesasStyles() {
  if (document.getElementById("mesasStyle")) return;
  const style = document.createElement("style");
  style.id = "mesasStyle";
  style.textContent = MESAS_CSS;
  document.head.appendChild(style);
}
function injectLightboxStyles() {
  if (document.getElementById("lightboxStyle")) return;
  const style = document.createElement("style");
  style.id = "lightboxStyle";
  style.textContent = LIGHTBOX_CSS;
  document.head.appendChild(style);
}

function bindLightboxEvents() {
  if (_lightboxBound) return;
  _lightboxBound = true;

  document
    .getElementById("lightboxClose")
    ?.addEventListener("click", closeLightbox);
  document
    .getElementById("lightboxNext")
    ?.addEventListener("click", lightboxNext);
  document
    .getElementById("lightboxPrev")
    ?.addEventListener("click", lightboxPrev);

  document.getElementById("lightboxModal")?.addEventListener("click", (e) => {
    if (e.target.id === "lightboxModal") closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("lightboxModal");
    if (!modal?.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") lightboxNext();
    if (e.key === "ArrowLeft") lightboxPrev();
  });

  // Swipe táctil
  // Swipe táctil (solo si la imagen no está ampliada)
  let touchStartX = 0;
  const stage = document.querySelector(".lightbox-stage");
  stage?.addEventListener(
    "touchstart",
    (e) => {
      if (_panzoomInstance && _panzoomInstance.getScale() > 1) return;
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );
  stage?.addEventListener(
    "touchend",
    (e) => {
      if (_panzoomInstance && _panzoomInstance.getScale() > 1) return;
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 50) diff > 0 ? lightboxPrev() : lightboxNext();
    },
    { passive: true },
  );
}

function openLightbox(images, index) {
  if (!images?.length) return;
  injectLightboxStyles();
  bindLightboxEvents();
  _lightboxImages = images;
  _lightboxIndex = index;

  const modal = document.getElementById("lightboxModal");
  const nav = document.querySelectorAll(".lightbox-nav");
  nav.forEach(
    (b) => (b.style.display = _lightboxImages.length > 1 ? "flex" : "none"),
  );

  renderLightboxImage();
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  document.getElementById("lightboxModal")?.classList.remove("open");
  document.body.style.overflow = "";
  if (_panzoomInstance) {
    _panzoomInstance.destroy();
    _panzoomInstance = null;
  }
}

function renderLightboxImage() {
  const img = document.getElementById("lightboxImg");
  const counter = document.getElementById("lightboxCounter");

  // Limpia zoom anterior antes de cambiar de imagen
  if (_panzoomInstance) {
    _panzoomInstance.destroy();
    _panzoomInstance = null;
    img.classList.remove("zoomed");
  }

  img.classList.remove("show");
  setTimeout(() => {
    img.src = _lightboxImages[_lightboxIndex];
    img.onload = () => {
      img.classList.add("show");
      initLightboxZoom(img);
    };
  }, 120);

  counter.textContent = `${_lightboxIndex + 1} / ${_lightboxImages.length}`;
  counter.style.display = _lightboxImages.length > 1 ? "block" : "none";
}

let _panzoomWheelHandler = null;
let _lastTapTime = 0;

function initLightboxZoom(img) {
  if (typeof Panzoom === "undefined") return;

  _panzoomInstance = Panzoom(img, {
    maxScale: 4,
    minScale: 1,
    startScale: 1,
    canvas: false,
    cursor: "zoom-in",
    step: 0.5,
    touchAction: "none",
  });

  if (_panzoomWheelHandler) {
    img.parentElement.removeEventListener("wheel", _panzoomWheelHandler);
  }
  _panzoomWheelHandler = (e) => _panzoomInstance.zoomWithWheel(e);
  img.parentElement.addEventListener("wheel", _panzoomWheelHandler, {
    passive: false,
  });

  const toggleZoom = () => {
    if (_panzoomInstance.getScale() > 1) {
      _panzoomInstance.reset();
      img.classList.remove("zoomed");
    } else {
      _panzoomInstance.zoomIn();
      img.classList.add("zoomed");
    }
  };

  // Doble clic (desktop)
  img.ondblclick = toggleZoom;

  // Doble tap manual (móvil) — dblclick no siempre dispara en touch
  img.ontouchend = (e) => {
    const now = Date.now();
    if (now - _lastTapTime < 300) {
      e.preventDefault();
      toggleZoom();
    }
    _lastTapTime = now;
  };

  img.onpanzoomzoom = () => {
    if (_panzoomInstance.getScale() > 1) img.classList.add("zoomed");
    else img.classList.remove("zoomed");
  };
}

function lightboxNext() {
  _lightboxIndex = (_lightboxIndex + 1) % _lightboxImages.length;
  renderLightboxImage();
}
function lightboxPrev() {
  _lightboxIndex =
    (_lightboxIndex - 1 + _lightboxImages.length) % _lightboxImages.length;
  renderLightboxImage();
}

// ── Variables globales ──
let _params = {};
let _navState = {
  ofertas: false,
  productos: false,
  ambientes: false,
  carta: false,
};

let _schedInterval = null; // evitar setInterval duplicados
let _mesasUnsub = null;
let _mesaSeleccionada = null;
let _waNumeroNegocio = "";
let _horarioHoy = null;
let _mesasCache = [];
let _horaMaxReserva = null;
let _bizLogoUrl = null;
let _bizNombre = "";
let _colorReady = false; // ya existe más arriba, no la dupliques si ya está
let _followReady = false;
let _reviewsReady = false;
let _currentPuntos = 0; // NUEVO: true cuando ya sabemos si el user sigue o no
function tryHideLoader() {
  if (_colorReady && _followReady && _reviewsReady) {
    hideBizLoader();
  }
}
async function render(biz, isInitial = true) {
  const nombre = biz.nombre_tienda || biz.nombre || "—";
  const categoria = biz.categoria_tienda || "—";
  const subcategorias = Array.isArray(biz.subcategoria) ? biz.subcategoria : [];
  const descripcion = biz.descripcion || "—";
  const ubicacion = biz.ubicacion || {};
  const horario = normalizeSchedule(biz.horario_atencion);
  const mapDiaHoy = [6, 0, 1, 2, 3, 4, 5];
  _horarioHoy = horario[mapDiaHoy[new Date().getDay()]];
  const esPresencial = biz.modelo_negocio !== false; // true/undefined = presencial, false = delivery
  const plan = (biz.plan_seleccionado || "basico").toLowerCase();
  const esPremium = plan === "emprendedor" || plan === "empresa";
  const contactos = normalizeContactos(biz.metodo_contacto);
  const waContacto = contactos.find((c) => c.tipo === "whatsapp");
  _waNumeroNegocio = waContacto ? waContacto.valor.replace(/\D/g, "") : "";
  const pagos = normalizePagos(biz.metodos_pago);
  const { ambientales, productos, todas } = normalizeImages(biz.img_tienda);
  const promoImages = normalizePromos(biz.img_tienda);
  const amenities = normalizeAmenities(biz.servicios_comodidades);
  const logoUrl = biz.img_tienda?.logo_tienda || null;
  _bizLogoUrl = logoUrl;
  _bizNombre = nombre;
  // Footer dinámico
  const footerBizName = document.getElementById("footerBizName");
  const footerCopyName = document.getElementById("footerCopyName");
  const footerYear = document.getElementById("footerYear");
  const footerLogoImg = document.getElementById("footerLogoImg");

  if (footerBizName) footerBizName.textContent = nombre;
  if (footerCopyName) footerCopyName.textContent = nombre;
  if (footerYear) footerYear.textContent = new Date().getFullYear();
  if (footerLogoImg) {
    if (logoUrl) {
      footerLogoImg.src = logoUrl;
      footerLogoImg.style.display = "block";
    } else {
      footerLogoImg.style.display = "none";
    }
  }

  // Redes sociales en el footer (reutiliza los contactos ya normalizados)
  const footerSocialRow = document.getElementById("footerSocialRow");
  if (footerSocialRow) {
    footerSocialRow.innerHTML = "";
    const socialIcons = {
      whatsapp: "fa-brands fa-whatsapp",
      facebook: "fa-brands fa-facebook-f",
      instagram: "fa-brands fa-instagram",
      tiktok: "fa-brands fa-tiktok",
      web: "fa-solid fa-globe",
    };
    contactos.forEach((c) => {
      if (!socialIcons[c.tipo]) return;
      const meta = CONTACT_META[c.tipo];
      const a = document.createElement("a");
      a.href = meta ? meta.getHref(c) : c.valor;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = `<i class="${socialIcons[c.tipo]}"></i>`;
      footerSocialRow.appendChild(a);
    });
  }

  // Links legales (por ahora estáticos; luego se activan/desactivan desde biz.legal.*)
  const legal = biz.legal || {};
  const linkLibro = document.getElementById("linkLibroReclamaciones");
  const linkTerminos = document.getElementById("linkTerminos");
  const linkPrivacidad = document.getElementById("linkPrivacidad");

  if (linkLibro) {
    linkLibro.style.display =
      legal.libroReclamacionesActivo !== false ? "" : "none";
    if (legal.libroReclamacionesUrl)
      linkLibro.href = legal.libroReclamacionesUrl;
  }
  if (linkTerminos) {
    linkTerminos.style.display = legal.terminosActivo !== false ? "" : "none";
    if (legal.terminosUrl) linkTerminos.href = legal.terminosUrl;
  }
  if (linkPrivacidad) {
    linkPrivacidad.style.display =
      legal.privacidadActivo !== false ? "" : "none";
    if (legal.privacidadUrl) linkPrivacidad.href = legal.privacidadUrl;
  }
  // ── COLOR + LOGO: solo la primera vez ──
  if (!_colorReady) {
    applyDominantColor(colorFromName(nombre));

    const heroImg = document.getElementById("bizLogoHero");
    const heroPlaceholder = document.getElementById("bizLogoPlaceholderHero");

    if (logoUrl) {
      heroImg.src = logoUrl;
      heroImg.style.display = "block";
      heroPlaceholder.style.display = "none";

      setFaviconCircular(logoUrl);

      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.onload = () => {
        getDominantColor(tempImg).then((color) => {
          if (color) applyDominantColor(color);
          _colorReady = true;
          tryHideLoader();
        });
      };
      tempImg.onerror = () => {
        _colorReady = true;
        tryHideLoader();
      };
      tempImg.src =
        logoUrl + (logoUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();
    } else {
      _colorReady = true;
      tryHideLoader();
    }
  }

  // ── CONTENIDO: siempre se actualiza ──
  document.getElementById("bizName").textContent = nombre;
  document.title = nombre;
  const prodTitleEl = document.getElementById("productosTitle");
  if (prodTitleEl) prodTitleEl.textContent = `Lo mejor de ${nombre}`;
  const ambientesEyebrowEl = document.getElementById("ambientesEyebrow");
  const ambientesTitleEl = document.getElementById("ambientesTitle");
  if (ambientesEyebrowEl && ambientesTitleEl) {
    if (esPresencial) {
      ambientesEyebrowEl.textContent = "AMBIENTES";
      ambientesTitleEl.textContent = "Espacios y experiencia";
    } else {
      ambientesEyebrowEl.textContent = "GALERÍA";
      ambientesTitleEl.textContent = "Nuestros productos";
    }
  }
  document.getElementById("cats").innerHTML =
    `<span class="tag cat">${categoria}</span>${subcategorias.map((s) => `<span class="tag sub">${s}</span>`).join("")}`;

  // Status badge
  calcStatus(horario);
  if (_schedInterval) clearInterval(_schedInterval);
  _schedInterval = setInterval(() => calcStatus(horario), 30000);

  document.getElementById("descText").textContent = descripcion;

  // ── UBICACIÓN: solo se pinta en la carga inicial / recarga normal (NO tiempo real) ──
  if (isInitial) {
    const addrReal = document.getElementById("addrRealContent");
    const addrVirtual = document.getElementById("addrVirtualContent");

    if (esPresencial) {
      if (addrReal) addrReal.style.display = "";
      if (addrVirtual) addrVirtual.style.display = "none";

      document.getElementById("addrText").textContent =
        ubicacion.dirección || "—";
      document.getElementById("refText").textContent =
        ubicacion.referencia || "—";

      const zonaSection = document.getElementById("zonaSection");
      if (zonaSection) {
        const aforoMax = biz.aforo_max;
        const zonaTexto = ubicacion.zona
          ? aforoMax
            ? `${ubicacion.zona} / Aforo máx. ${aforoMax} personas`
            : ubicacion.zona
          : aforoMax
            ? `Aforo máx. ${aforoMax} personas`
            : null;

        if (zonaTexto) {
          document.getElementById("zonaText").textContent = zonaTexto;
          zonaSection.style.display = "";
        } else {
          zonaSection.style.display = "none";
        }
      }
    } else {
      if (addrReal) addrReal.style.display = "none";
      if (addrVirtual) addrVirtual.style.display = "flex";
    }
  }
  // Horario (SÍ tiempo real)
  const gridSched = document.getElementById("schedGrid");
  if (gridSched) {
    gridSched.innerHTML = "";
    const todayIdx = [6, 0, 1, 2, 3, 4, 5][new Date().getDay()];
    horario.forEach((h, i) => {
      const div = document.createElement("div");
      div.className = "sched-row" + (i === todayIdx ? " today" : "");
      if (h.cerrado) {
        const motivoText = h.motivo ? ` · ${h.motivo}` : "";
        div.innerHTML = `<span class="day-name">${h.dia}</span><span class="closed-day">Cerrado${motivoText}</span>`;
      } else if (h.bloques.length === 2) {
        div.innerHTML = `
          <span class="day-name">${h.dia}</span>
          <span class="hours">
            ${h.bloques[0].h_apertura} – ${h.bloques[0].h_cierre}
            <span style="color:var(--muted);margin:0 4px">·</span>
            ${h.bloques[1].h_apertura} – ${h.bloques[1].h_cierre}
          </span>`;
      } else if (h.bloques.length === 1) {
        div.innerHTML = `<span class="day-name">${h.dia}</span><span class="hours">${h.bloques[0].h_apertura} – ${h.bloques[0].h_cierre}</span>`;
      } else {
        div.innerHTML = `<span class="day-name">${h.dia}</span><span class="closed-day">Sin horario</span>`;
      }
      gridSched.appendChild(div);
    });
  }

  // Contactos (NO tiempo real)
  if (isInitial && contactos.length) renderContactDetail(contactos);

  // Pagos (SÍ tiempo real)
  const payGrid = document.getElementById("payGrid");
  if (payGrid && pagos.length) {
    payGrid.innerHTML = "";
    pagos.forEach(({ label, icon }) => {
      const chip = document.createElement("div");
      chip.className = "pay-chip";
      chip.innerHTML = `<img src="${icon}" alt="${label}" style="width:30px;height:30px;object-fit:cover;border-radius:50%;margin-right:6px;vertical-align:middle;"> ${label}`;
      payGrid.appendChild(chip);
    });
  }

  // Amenities / servicios y comodidades (NO tiempo real)
  const amenitiesGrid = document.getElementById("amenitiesGrid");
  if (isInitial && amenitiesGrid && amenities.length) {
    amenitiesGrid.innerHTML = "";
    amenities.forEach(({ name, icon }) => {
      const chip = document.createElement("div");
      chip.className = "pay-chip";
      chip.innerHTML = `<span>${icon}</span> ${name}`;
      amenitiesGrid.appendChild(chip);
    });
  }

  // Productos Grid (imágenes → NO tiempo real)
  const prodGrid = document.getElementById("productosGrid");
  if (isInitial && prodGrid && productos.length) {
    prodGrid.innerHTML = "";

    // Grid dinámico según cantidad real visible
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const maxVisible = isMobile ? 4 : productos.length;
    const realCount = Math.min(productos.length, maxVisible);

    if (realCount === 1) {
      prodGrid.className = "grid grid-cols-1 gap-5 max-w-xs";
    } else if (realCount === 2) {
      prodGrid.className = "grid grid-cols-2 gap-5";
    } else {
      prodGrid.className = "grid grid-cols-2 md:grid-cols-3 gap-5";
    }

    const hidden = productos.length - maxVisible;
    productos.forEach((src, idx) => {
      if (idx >= maxVisible) return;
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.style.cursor = "pointer";
      if (isMobile && idx === 3 && hidden > 0) {
        card.style.cssText = "position:relative;cursor:pointer;";
        card.innerHTML = `<img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;border-radius:30px;"><span style="font-size:32px;font-weight:900;color:white;">+${hidden}</span></div>`;
      } else {
        const imgWrap = createImageWithPlaceholder({
          src,
          alt: "Producto",
          onError: () => {
            card.style.display = "none";
          },
        });
        card.appendChild(imgWrap);
      }
      card.addEventListener("click", () => openLightbox(productos, idx));
      prodGrid.appendChild(card);
    });
  }

  // Ambientes Grid (imágenes → NO tiempo real)
  const ambGrid = document.getElementById("ambientesGrid");
  if (isInitial && ambGrid && ambientales.length) {
    ambGrid.innerHTML = "";

    const isMobileAmb = window.matchMedia("(max-width: 767px)").matches;
    const maxVisibleAmb = isMobileAmb ? 4 : ambientales.length;
    const realCountAmb = Math.min(ambientales.length, maxVisibleAmb);

    if (realCountAmb === 1) {
      ambGrid.className = "grid grid-cols-1 gap-5 max-w-xs";
    } else if (realCountAmb === 2) {
      ambGrid.className = "grid grid-cols-2 gap-5";
    } else {
      ambGrid.className = "grid grid-cols-2 md:grid-cols-3 gap-5";
    }

    const hiddenAmb = ambientales.length - maxVisibleAmb;
    ambientales.forEach((src, idx) => {
      if (idx >= maxVisibleAmb) return;
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.style.cursor = "pointer";
      if (isMobileAmb && idx === 3 && hiddenAmb > 0) {
        card.style.cssText = "position:relative;cursor:pointer;";
        card.innerHTML = `<img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;border-radius:30px;"><span style="font-size:32px;font-weight:900;color:white;">+${hiddenAmb}</span></div>`;
      } else {
        const imgWrap = createImageWithPlaceholder({
          src,
          alt: "Producto",
          onError: () => {
            card.style.display = "none";
          },
        });
        card.appendChild(imgWrap);
      }
      card.addEventListener("click", () => openLightbox(ambientales, idx));
      ambGrid.appendChild(card);
    });
  }

  // Carrusel completo (imágenes → NO tiempo real)
  if (isInitial && todas.length) buildFullGallery(todas);

  // Promociones (SÍ tiempo real)
  const promosSec = document.getElementById("secPromos");
  const promoCarousel = document.getElementById("promoCarousel");
  if (promoImages.length && promosSec && promoCarousel) {
    promosSec.style.display = "";
    promoCarousel.innerHTML = "";
    document.getElementById("promoTitle").textContent = `Promos de ${nombre}`;
    const wa = contactos.find((c) => c.tipo === "whatsapp");
    const waNum = wa ? wa.valor.replace(/\D/g, "") : "";
    const catFormatted = (_params.subcol || "")
      .toLowerCase()
      .replace(/\s+/g, "+");
    const promoIdParam = new URLSearchParams(window.location.search).get("p");
    if (promoIdParam) {
      const promoExiste = promoImages.some((p) => p.id === promoIdParam);
      if (!promoExiste) {
        showSnackbar("Esta promo ya no está disponible");
      }
    }
    promoImages.forEach((promo) => {
      const shareBase = biz.alias_key
        ? `https://geinztech.com/perfil/${biz.alias_key}?p=${promo.id}`
        : `https://geinztech.com/api/share?t=p&id=${_params.id}&l=${_params.localidad}&c=${catFormatted}&i=${promo.id}`;
      const waLink = `https://wa.me/51${waNum}?text=${encodeURIComponent(`Hola, quiero esta oferta que vi en su perfil en Geinz: ${shareBase}`)}`;
      const card = document.createElement("div");
      card.className = "promo-card";
      card.innerHTML = `<div class="promo-card-img-wrap"><div class="promo-overlay-actions">${
        /* deja aquí igual los botones de WhatsApp y Compartir */
        `<a class="promo-btn-wa" href="${waLink}" target="_blank"> WhatsApp</a><button class="promo-btn-share" data-share-url="${shareBase}">Compartir</button>`
      }</div></div>`;
      const imgWrapContainer = card.querySelector(".promo-card-img-wrap");
      const imgWrap = createImageWithPlaceholder({
        src: promo.url,
        alt: promo.titulo,
      });
      imgWrapContainer.prepend(imgWrap);
      promoCarousel.appendChild(card);
    });
    promoCarousel.querySelectorAll(".promo-btn-share").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.shareUrl;
        const fullText = `Mira lo que encontre en ${nombre} 👀🔥\n${url}`;
        if (navigator.share)
          try {
            await navigator.share({ text: fullText });
          } catch (e) {}
        else copyToClipboard(fullText);
      });
    });
  }

  // Botones
  const routeBtn = document.getElementById("routeBtn");
  if (routeBtn)
    routeBtn.onclick = () => {
      const lat = ubicacion.latitud,
        lng = ubicacion.longitud;
      if (!lat || !lng) showToast("Ubicación no disponible");
      else
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
          "_blank",
        );
    };

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn)
    shareBtn.onclick = () => {
      // ── Usa alias si existe, si no fallback a URL vieja ──
      const shareUrl = biz.alias_key
        ? `https://geinztech.com/perfil/${biz.alias_key}`
        : `https://geinztech.com/api/share?t=ti&id=${biz.id}&l=${_params.localidad}&c=${(biz.categoria_tienda || "").toLowerCase().replace(/\s+/g, "+")}`;

      const fullText = `Mira ${nombre} en Geinz 🔥\n${shareUrl}`;
      if (navigator.share)
        navigator
          .share({ text: fullText })
          .catch(() => copyToClipboard(fullText));
      else copyToClipboard(fullText);
    };

  // Ocultar secciones vacías (solo en la carga inicial, ya que dependen de datos NO tiempo real)
  if (isInitial) {
    if (!productos.length)
      document
        .getElementById("secProductos")
        ?.style.setProperty("display", "none");
    if (!ambientales.length)
      document
        .getElementById("secAmbientes")
        ?.style.setProperty("display", "none");
    _navState.productos = productos.length > 0;
    _navState.ambientes = ambientales.length > 0;
    updateQuickNav();
    if (!contactos.length)
      document
        .getElementById("secContact")
        ?.style.setProperty("display", "none");
    if (!amenities.length)
      document
        .getElementById("secAmenities")
        ?.style.setProperty("display", "none");
  }
  if (!pagos.length)
    document.getElementById("secPay")?.style.setProperty("display", "none");
  else document.getElementById("secPay")?.style.setProperty("display", "");

  const exploreBtn = document.getElementById("exploreBtn");
  if (exploreBtn) {
    const cat = (biz.categoria_tienda || "").toLowerCase().replace(/\s+/g, "+");
    exploreBtn.href = `https://geinztech.com/scree/negocios?localidad=${_params.localidad}&categoria=${cat}`;
  }

  // ── Reglas por plan y modelo de negocio ──

  const fidelizacionRaw = biz.fidelizacion || {};
  const fidelizacion = normalizeFidelizacion(fidelizacionRaw);
  _fidelizacionActiva = !!fidelizacion; // NUEVO
  _fidelizacionMensajeInactivo =
    fidelizacionRaw.mensajeInactivo ||
    "Este negocio no tiene el programa de fidelización activo por el momento."; // NUEVO
  const secFidel = document.getElementById("secFidelizacion");
  if (fidelizacion) {
    secFidel.style.display = "";
    renderFidelizacion(fidelizacion);
  } else {
    secFidel.style.display = "none";
  }
  document
    .getElementById("geinzHeader")
    ?.style.setProperty("display", esPremium ? "none" : "");
  document
    .getElementById("secCtaExplore")
    ?.style.setProperty("display", esPremium ? "none" : "");
  document
    .getElementById("mainContent")
    ?.style.setProperty("padding-top", esPremium ? "1.55rem" : "");
  document
    .getElementById("secAmenities")
    ?.style.setProperty("display", esPresencial ? "" : "none");
  document
    .getElementById("routeBtn")
    ?.style.setProperty("display", esPresencial ? "" : "none");
  document.getElementById("fidelizacionCard")?.addEventListener("click", () => {
    const url = new URL(
      "../../fidelizacion/fidelizacion_client.html",
      window.location.href,
    );
    url.searchParams.set("localidad", _params.localidad);
    url.searchParams.set("id", _params.id);
    if (_currentUid) url.searchParams.set("uid", _currentUid);
    window.location.href = url.toString();
  });
}

// ── Reglas por plan y modlo de negocio ──
// ══════════════════════════════════════════
//  REALTIME
// ══════════════════════════════════════════
function listenBusinessRealtime({ localidad, id }) {
  const ref = tiendaDoc(localidad, "tiendas", id);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const changed = snap.metadata.hasPendingWrites === false; // vino del server
      render({ id: snap.id, ...snap.data() }, false);
    }
  });
}
// ══════════════════════════════════════════
//  RESEÑAS
// ══════════════════════════════════════════
let _reviewsCache = [];
let _misReview = null;
let _reviewsFiltroEstrellas = "todas";
let _reviewsLastDoc = null;
let _reviewsHayMasServer = true;
let _reviewsCargandoServer = false;
let _reviewImagesData = [null, null, null, null, null];
let _reviewSelectedSlot = null;
let _reviewCalificacion = 0;
let _reviewUserNameCache = {};
let _galleryLoadedOnce = false; // la galería de fotos de la comunidad solo se carga una vez (no en tiempo real)
const REVIEWS_CSS = `
.reviews-summary{display:flex;align-items:stretch;gap:28px;flex-wrap:wrap;padding:26px 28px;border-radius:22px;background:linear-gradient(135deg, rgba(var(--dr),var(--dg),var(--db),.08), rgba(255,255,255,.02));border:1px solid rgba(var(--dr),var(--dg),var(--db),.25);margin-bottom:22px;}
.reviews-avg{font-weight:900;font-size:44px;color:#fff;line-height:1;}
.reviews-summary-right{display:flex;flex-direction:column;gap:5px;}
.reviews-stars-display{font-size:16px;letter-spacing:2px;color:#2c2c33;}
.reviews-stars-display .star-fill{color:#fbbf24;}
.reviews-count{font-size:12.5px;color:var(--muted,#9c9ca3);}
.reviews-cta-btn{margin-left:auto;display:flex;align-items:center;gap:8px;padding:12px 20px;border:none;border-radius:14px;font-weight:700;font-size:13.5px;color:#fff;cursor:pointer;background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));box-shadow:0 8px 20px -6px rgba(var(--dr),var(--dg),var(--db),.5);white-space:nowrap;}

.reviews-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;transition:opacity .2s ease;}
.reviews-filters.disabled{opacity:.5;pointer-events:none;}
.reviews-filter-chip{padding:9px 16px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.1));background:var(--surface,rgba(255,255,255,.03));color:#d4d4d8;font-size:12.5px;font-weight:700;cursor:pointer;transition:background .2s ease,border-color .2s ease,color .2s ease,transform .15s ease;}
.reviews-filter-chip .star-ico{color:#fbbf24;}
.reviews-filter-chip:hover{transform:translateY(-1px);border-color:rgba(var(--dr),var(--dg),var(--db),.5);}
.reviews-filter-chip.active{background:linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.7));border-color:transparent;color:#fff;box-shadow:0 6px 16px -6px rgba(var(--dr),var(--dg),var(--db),.5);}

.reviews-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:34px 0;color:var(--muted,#9c9ca3);font-size:13.5px;font-weight:600;}
.reviews-spinner{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(var(--dr),var(--dg),var(--db),.25);border-top-color:rgba(var(--dr),var(--dg),var(--db),.95);animation:reviews-spin .7s linear infinite;flex-shrink:0;}
@keyframes reviews-spin{to{transform:rotate(360deg);}}

.reviews-list{transition:opacity .22s ease;}
.reviews-list.fading{opacity:0;}
.review-item-delete{margin-top:12px;background:none;border:none;padding:0;font-size:12px;font-weight:700;cursor:pointer;color:#ff6b6b;}
.review-item-delete:hover{text-decoration:underline;}
.review-delete-btn{width:100%;margin-top:10px;padding:11px;border-radius:12px;border:1px solid rgba(255,107,107,.4);background:rgba(255,107,107,.08);color:#ff6b6b;font-weight:700;font-size:13px;cursor:pointer;}
.review-delete-btn:hover{background:rgba(255,107,107,.16);}

.reviews-list{display:flex;flex-direction:column;gap:14px;}
.review-item-reply{
  margin-top:14px;
  padding:14px 16px;
  border-radius:14px;
  background:rgba(var(--dr),var(--dg),var(--db),.08);
  border-left:3px solid rgba(var(--dr),var(--dg),var(--db),.6);
}
.review-item-reply-header{
  display:flex;
  align-items:center;
  gap:8px;
  margin-bottom:6px;
  font-size:12.5px;
  font-weight:700;
  color:rgba(var(--dr),var(--dg),var(--db),.95);
}
.review-item-reply-date{
  font-size:11px;
  font-weight:500;
  color:var(--muted,#9c9ca3);
  margin-left:auto;
}
.review-item-reply-text{
  font-size:13.5px;
  line-height:1.6;
  color:#d4d4d8;
  white-space:pre-wrap;
  margin:0;
}
.review-item{
  padding:20px 22px;
  border-radius:18px;
  background:var(--surface,rgba(255,255,255,.02));
  border:1px solid var(--border,rgba(255,255,255,.06));
  opacity:0;
  transform:translateY(10px);
  transition: opacity .4s ease, transform .4s cubic-bezier(.22,.85,.32,1), border-color .25s ease, background .25s ease;
}
  .review-item.in{
  opacity:1;
  transform:translateY(0);
}
  .reviews-list-more-wrap{ display:flex; justify-content:center; margin-top:8px; }
.reviews-list-more-btn{
    margin-top: 20px;
  padding:11px 22px;border-radius:999px;
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);
  background:rgba(var(--dr),var(--dg),var(--db),.1);
  color:#fff;font-weight:700;font-size:13px;cursor:pointer;
  transition:background .2s ease, border-color .2s ease, transform .15s ease;
}
.reviews-list-more-btn:hover{
  background:rgba(var(--dr),var(--dg),var(--db),.22);
  transform:translateY(-1px);
}
.review-item:hover,
.review-item:focus-within{
  border-color:rgba(var(--dr),var(--dg),var(--db),.35);
  background:rgba(255,255,255,.035);
}

.review-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}
.review-item-who{display:flex;align-items:center;gap:11px;min-width:0;}
.review-avatar{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13.5px;color:#fff;background:linear-gradient(135deg,rgba(var(--dr),var(--dg),var(--db),.9),rgba(var(--dr),var(--dg),var(--db),.4));}
.review-item-name{font-size:13.5px;font-weight:700;color:#fff;line-height:1.3;}
.review-item-date{font-size:11.5px;color:var(--muted,#9c9ca3);margin-top:1px;}

.review-item-badge{
  flex-shrink:0;
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 11px;border-radius:999px;
  background:rgba(var(--dr),var(--dg),var(--db),.13);
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.35);
  color:#fff;font-size:12.5px;font-weight:700;
}
.review-item-badge .badge-star{color:#fbbf24;font-size:12px;}

.review-item-desc{
  font-size:14px;line-height:1.65;color:#d4d4d8;
  margin:0 0 14px;white-space:pre-wrap;
}
.review-item-desc.clamped{
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}
.review-item-more{
  background:none;border:none;padding:0;margin:-8px 0 14px;
  font-size:12.5px;font-weight:700;cursor:pointer;
  color:rgba(var(--dr),var(--dg),var(--db),.95);
}

.reviews-empty{font-size:13px;color:var(--muted,#9c9ca3);text-align:center;padding:28px 0;}
.review-modal-box{max-width:400px;}
.review-stars-picker{display:flex;gap:10px;justify-content:center;margin:6px 0 18px;}
.review-star{font-size:34px;color:#2c2c33;cursor:pointer;transition:color .15s ease,transform .15s ease;user-select:none;}
.review-star.active{color:#fbbf24;transform:scale(1.08);}
#reviewDescInput{width:100%;min-height:90px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:13.5px;font-family:inherit;resize:vertical;margin-bottom:14px;box-sizing:border-box;}
.review-img-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;}
.review-img-slot{aspect-ratio:1;border-radius:12px;border:1.5px dashed rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;overflow:hidden;background:rgba(255,255,255,.03);}
.review-img-slot img{width:100%;height:100%;object-fit:cover;display:none;}
.review-img-slot.filled img{display:block;}
.review-img-slot.filled .review-img-plus{display:none;}
.review-img-plus{font-size:16px;color:var(--muted,#9c9ca3);}
.review-img-remove{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;border:none;font-size:10px;cursor:pointer;display:none;align-items:center;justify-content:center;}
.review-img-slot.filled .review-img-remove{display:flex;}

/* ── Galería de reseñas — estilo premium tipo TripAdvisor ── */
.reviews-gallery-title{
  font-size:14px;
  font-weight:700;
  color:#fff;
  margin:2px 0 16px;
  display:flex;
  align-items:center;
  gap:8px;
  letter-spacing:.01em;
}
.reviews-gallery-title{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top: 20px;}
.reviews-gallery-count{ color:var(--muted,#9c9ca3); font-weight:600; font-size:13px; }
.reviews-gallery-seeall{
  margin-left:auto;
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:7px 16px;
  border-radius:999px;
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);
  background:rgba(var(--dr),var(--dg),var(--db),.1);
  cursor:pointer;
  font-size:12.5px;
  font-weight:700;
  color:#fff;
  letter-spacing:.01em;
  transition:background .2s ease, border-color .2s ease, transform .15s ease;
}
/* Fila horizontal tipo TripAdvisor */
.reviews-gallery-row{
  display:flex;
  gap:10px;
  overflow-x:auto;
  scroll-snap-type:x proximity;
  padding-bottom:2px;
  margin-bottom:28px;
  scrollbar-width:none;
  -ms-overflow-style:none;
  margin-top: 20px;
}
.reviews-gallery-row::-webkit-scrollbar{ display:none; }
.reviews-gallery-row::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.15); border-radius:10px; }

.reviews-gallery-item{
  position:relative;
  flex:0 0 140px;
  width:140px;
  height:140px;
  scroll-snap-align:start;
  cursor:pointer;
  overflow:hidden;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.08);
  background:#0b0b0d;
  transition:transform .25s ease, border-color .25s ease;
}
.reviews-gallery-item:hover{
  transform:translateY(-3px);
  border-color:rgba(var(--dr),var(--dg),var(--db),.55);
}
.reviews-gallery-item img{ width:100%; height:100%; object-fit:cover; display:block; }
.reviews-gallery-more{
  position:absolute; inset:0;
  background:rgba(4,4,6,.68);
  backdrop-filter:blur(4px);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:2px; font-size:20px; font-weight:800; color:#fff;
}
.reviews-gallery-more span{ font-size:11px; font-weight:600; opacity:.85; }

@media (max-width:640px){
  .reviews-gallery-item{ flex-basis:104px; width:104px; height:104px; border-radius:14px; }
}

/* Modal "ver todas" — grid responsive elegante */
.reviews-gallery-modal{
  position:fixed; inset:0; z-index:10003;
  background:rgba(3,3,3,.85);
  backdrop-filter:blur(8px);
  display:flex; align-items:center; justify-content:center;
  opacity:0; visibility:hidden;
 transition:opacity .25s ease, visibility .25s ease;
  padding:24px;
}
  .reviews-gallery-seeall:hover{
  background:rgba(var(--dr),var(--dg),var(--db),.22);
  border-color:rgba(var(--dr),var(--dg),var(--db),.7);
  transform:translateY(-1px);
}
.reviews-gallery-modal.open{ opacity:1; visibility:visible; }
.reviews-gallery-modal-box{
  width:100%; max-width:960px; max-height:86vh;
  background:#0b0b0d;
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.3);
  border-radius:24px;
  display:flex; flex-direction:column;
  overflow:hidden;
  transform:scale(.96);
  transition:transform .25s ease;
}
.reviews-gallery-modal.open .reviews-gallery-modal-box{ transform:scale(1); }
.reviews-gallery-modal-header{
  display:flex; align-items:center; justify-content:space-between;
  padding:18px 22px; border-bottom:1px solid rgba(255,255,255,.08);
}
.reviews-gallery-modal-header h3{ margin:0; font-size:16px; font-weight:800; color:#fff; }
#reviewsGalleryModalCount{ color:var(--muted,#9c9ca3); font-weight:600; font-size:13px; margin-left:6px; }
.reviews-gallery-modal-close{
  width:34px; height:34px; border:none; border-radius:50%;
  background:rgba(255,255,255,.08); color:#fff; cursor:pointer; font-size:14px;
}
.reviews-gallery-modal-grid{
  padding:20px 22px; overflow-y:auto;
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(150px,1fr));
  gap:10px;
}
.reviews-gallery-modal-item{
  aspect-ratio:1; border-radius:14px; overflow:hidden; cursor:pointer;
  border:1px solid rgba(255,255,255,.06);
  transition:transform .2s ease, border-color .2s ease;
}
  .reviews-gallery-modal-item{
  opacity: 0;
  transform: scale(.94) translateY(8px);
}
.reviews-gallery-modal-item.in{
  opacity: 1;
  transform: scale(1) translateY(0);
}
.reviews-gallery-modal-item:hover{ transform:scale(1.03); border-color:rgba(var(--dr),var(--dg),var(--db),.5); }
.reviews-gallery-modal-item img{ width:100%; height:100%; object-fit:cover; display:block; }

@media (max-width:640px){
  .reviews-gallery-modal{ padding:0; }
  .reviews-gallery-modal-box{ max-width:100%; max-height:100vh; border-radius:0; height:100%; }
  .reviews-gallery-modal-grid{ grid-template-columns:repeat(3,1fr); }
}.rv-lightbox{
  position:fixed;inset:0;z-index:10005;
  background:#000;
  display:flex;flex-direction:column;
  opacity:0;visibility:hidden;
  transition:opacity .25s ease, visibility .25s ease;
}
.rv-lightbox.open{opacity:1;visibility:visible;}
.rv-lightbox-topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px;
  background:#0b0b0d;
  border-bottom:1px solid rgba(255,255,255,.08);
  flex-shrink:0;
}
.rv-lightbox-back{
  background:none;border:1px solid rgba(255,255,255,.15);color:#fff;
  padding:8px 16px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;
  display:flex;align-items:center;gap:6px;
}
.rv-lightbox-back:hover{background:rgba(255,255,255,.08);}
.rv-lightbox-close{
  width:36px;height:36px;border-radius:50%;border:none;
  background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:15px;
  flex-shrink:0;
}
.rv-lightbox-body{ flex:1;display:flex;overflow:hidden; }
.rv-lightbox-sidebar{
  width:340px;flex-shrink:0;
  padding:26px 24px;
  overflow-y:auto;
  border-right:1px solid rgba(255,255,255,.08);
  background:#0b0b0d;
}
.rv-lightbox-avatar{
  width:44px;height:44px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:16px;color:#fff;
  background:linear-gradient(135deg,rgba(var(--dr),var(--dg),var(--db),.9),rgba(var(--dr),var(--dg),var(--db),.4));
  margin-bottom:12px;
}
.rv-lightbox-name{font-size:15px;font-weight:700;color:#fff;margin-bottom:8px;}
.rv-lightbox-stars{color:#2c2c33;font-size:15px;letter-spacing:2px;margin-bottom:14px;}
.rv-lightbox-stars .star-fill{color:#fbbf24;}
.rv-lightbox-desc{font-size:14px;line-height:1.65;color:#d4d4d8;margin:0 0 6px;white-space:pre-wrap;}
.rv-lightbox-desc.clamped{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;}
.rv-lightbox-readmore{
  background:none;border:none;padding:0;margin-bottom:16px;
  font-size:12.5px;font-weight:700;cursor:pointer;
  color:rgba(var(--dr),var(--dg),var(--db),.95);
}
.rv-lightbox-date{font-size:12px;color:var(--muted,#9c9ca3);}
.rv-lightbox-stage{
  flex:1;position:relative;display:flex;align-items:center;justify-content:center;
  background:#000;padding:20px;
}
.rv-lightbox-stage img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;}
.rv-lightbox-counter{
  position:absolute;top:16px;left:50%;transform:translateX(-50%);
  font-size:12.5px;font-weight:600;color:rgba(255,255,255,.8);
  background:rgba(255,255,255,.08);padding:5px 14px;border-radius:20px;
}
.rv-lightbox-nav{
  position:absolute;top:50%;transform:translateY(-50%);
  width:46px;height:46px;border-radius:50%;border:none;
  background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:20px;
  display:flex;align-items:center;justify-content:center;
}
.rv-lightbox-nav:hover{background:rgba(255,255,255,.18);}
.rv-lightbox-prev{left:16px;}
.rv-lightbox-next{right:16px;}

@media (max-width:767px){
  .rv-lightbox-body{flex-direction:column;}
  .rv-lightbox-sidebar{
    width:100%;order:2;border-right:none;
    border-top:1px solid rgba(255,255,255,.08);
    padding:16px 18px 24px;
  }
  .rv-lightbox-stage{order:1;flex:0 0 auto;height:44vh;padding:0;}
  .rv-lightbox-nav{width:38px;height:38px;font-size:16px;}
  .rv-lightbox-back span{display:none;}
  .rv-lightbox-topbar{padding:12px 14px;}
}
`;
let _rvPhotos = [];
let _rvIndex = 0;
let _rvBackContext = null;

function bindReviewsLightboxEvents() {
  if (document.getElementById("reviewsLightboxModal")) return;
  injectReviewsStyles();

  const modal = document.createElement("div");
  modal.id = "reviewsLightboxModal";
  modal.className = "rv-lightbox";
  modal.innerHTML = `
    <div class="rv-lightbox-topbar">
      <button class="rv-lightbox-back" id="rvLightboxBack">‹ <span>Volver a la galería</span></button>
      <button class="rv-lightbox-close" id="rvLightboxClose">✕</button>
    </div>
    <div class="rv-lightbox-body">
      <div class="rv-lightbox-sidebar">
        <div class="rv-lightbox-avatar" id="rvLightboxAvatar"></div>
        <div class="rv-lightbox-name" id="rvLightboxName"></div>
        <div class="rv-lightbox-stars" id="rvLightboxStars"></div>
        <p class="rv-lightbox-desc" id="rvLightboxDesc"></p>
        <button class="rv-lightbox-readmore" id="rvLightboxReadMore" style="display:none">Leer más</button>
        <div class="rv-lightbox-date" id="rvLightboxDate"></div>
      </div>
      <div class="rv-lightbox-stage">
        <div class="rv-lightbox-counter" id="rvLightboxCounter"></div>
        <button class="rv-lightbox-nav rv-lightbox-prev" id="rvLightboxPrev">‹</button>
        <img id="rvLightboxImg" alt="">
        <button class="rv-lightbox-nav rv-lightbox-next" id="rvLightboxNext">›</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document
    .getElementById("rvLightboxClose")
    .addEventListener("click", closeReviewsLightbox);
  document.getElementById("rvLightboxBack").addEventListener("click", () => {
    closeReviewsLightbox();
    if (_rvBackContext) _rvBackContext();
  });
  document
    .getElementById("rvLightboxPrev")
    .addEventListener("click", () => rvGoTo(_rvIndex - 1));
  document
    .getElementById("rvLightboxNext")
    .addEventListener("click", () => rvGoTo(_rvIndex + 1));

  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") closeReviewsLightbox();
    if (e.key === "ArrowRight") rvGoTo(_rvIndex + 1);
    if (e.key === "ArrowLeft") rvGoTo(_rvIndex - 1);
  });

  let touchStartX = 0;
  const stage = modal.querySelector(".rv-lightbox-stage");
  stage.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 50)
        diff > 0 ? rvGoTo(_rvIndex - 1) : rvGoTo(_rvIndex + 1);
    },
    { passive: true },
  );
}

function openReviewsLightbox(photos, index, backContext = null) {
  bindReviewsLightboxEvents();
  _rvPhotos = photos;
  _rvIndex = index;
  _rvBackContext = backContext;

  const modal = document.getElementById("reviewsLightboxModal");
  modal
    .querySelectorAll(".rv-lightbox-nav")
    .forEach((b) => (b.style.display = photos.length > 1 ? "flex" : "none"));

  rvRender();
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeReviewsLightbox() {
  document.getElementById("reviewsLightboxModal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function rvGoTo(n) {
  if (!_rvPhotos.length) return;
  _rvIndex = ((n % _rvPhotos.length) + _rvPhotos.length) % _rvPhotos.length;
  rvRender();
}

function rvRender() {
  const photo = _rvPhotos[_rvIndex];
  if (!photo) return;

  document.getElementById("rvLightboxImg").src = photo.url;
  document.getElementById("rvLightboxCounter").textContent =
    `${_rvIndex + 1} de ${_rvPhotos.length}`;

  document.getElementById("rvLightboxAvatar").textContent = (
    photo.nombre || "?"
  )
    .trim()
    .charAt(0)
    .toUpperCase();
  document.getElementById("rvLightboxName").textContent =
    photo.nombre || "Usuario Geinz";
  document.getElementById("rvLightboxStars").innerHTML = starsHTML(
    photo.calificacion || 0,
  );

  const descEl = document.getElementById("rvLightboxDesc");
  const moreBtn = document.getElementById("rvLightboxReadMore");
  const esLarga = (photo.descripcion || "").length > 240;

  descEl.textContent = photo.descripcion || "";
  descEl.classList.toggle("clamped", esLarga);
  moreBtn.style.display = esLarga ? "inline-block" : "none";
  moreBtn.textContent = "Leer más";
  moreBtn.onclick = () => {
    const expandido = !descEl.classList.contains("clamped");
    descEl.classList.toggle("clamped", expandido);
    moreBtn.textContent = expandido ? "Leer más" : "Leer menos";
  };

  const fecha = photo.timestamp?.toDate
    ? photo.timestamp
        .toDate()
        .toLocaleDateString("es-PE", { year: "numeric", month: "long" })
    : "";
  document.getElementById("rvLightboxDate").textContent = fecha;
}
function renderReviewsBreakdown(reviews) {
  let container = document.getElementById("reviewsBreakdown");
  if (!container) {
    container = document.createElement("div");
    container.id = "reviewsBreakdown";
    container.className = "reviews-breakdown";
    const summaryRight = document.querySelector(".reviews-summary-right");
    if (summaryRight) summaryRight.after(container);
  }

  const buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const n = Math.round(Number(r.calificacion) || 0);
    if (buckets[n] !== undefined) buckets[n]++;
  });

  const labels = {
    5: "Excelente",
    4: "Bueno",
    3: "Promedio",
    2: "Malo",
    1: "Terrible",
  };

  const total = reviews.length || 1;

  container.innerHTML = [5, 4, 3, 2, 1]
    .map((n) => {
      const count = buckets[n];
      const pct = Math.round((count / total) * 100);
      return `
        <div class="reviews-breakdown-row">
          <span class="reviews-breakdown-label">${labels[n]}</span>
          <div class="reviews-breakdown-bar">
            <div class="reviews-breakdown-fill" style="width:${pct}%"></div>
          </div>
          <span class="reviews-breakdown-count">${count}</span>
        </div>`;
    })
    .join("");
}
function injectReviewsStyles() {
  if (document.getElementById("reviewsStyle")) return;
  const style = document.createElement("style");
  style.id = "reviewsStyle";
  style.textContent = REVIEWS_CSS;
  document.head.appendChild(style);
}

function comprimirImagenReview(dataURL, maxPx = 1024, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const imgEl = new Image();
    imgEl.onload = () => {
      let { width, height } = imgEl;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(imgEl, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    imgEl.onerror = () => reject(new Error("No se pudo leer imagen"));
    imgEl.src = dataURL;
  });
}

function dataURLtoBlobReview(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ⚠️ Ajusta los nombres de campo si tu doc de usuario usa otro nombre
async function getUserDisplayName(uid) {
  if (_reviewUserNameCache[uid]) return _reviewUserNameCache[uid];
  try {
    const snap = await getDoc(data_user_logeado(uid));
    const d = snap.exists() ? snap.data() : {};
    const nombre =
      d.nombre_completo ||
      d.nombre ||
      d.displayName ||
      auth.currentUser?.displayName ||
      "Usuario Geinz";
    _reviewUserNameCache[uid] = nombre;
    return nombre;
  } catch {
    return "Usuario Geinz";
  }
}

function tiltFromId(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (h % 9) - 4; // rango -4° a 4°
}
function starsHTML(rating, max = 5) {
  let html = "";
  for (let i = 1; i <= max; i++) {
    html += `<span class="${i <= Math.round(rating) ? "star-fill" : ""}">★</span>`;
  }
  return html;
}
// ── Resumen (promedio, total, galería, "mi reseña") ──
// Se trae UNA sola vez (no realtime) para no pagar lecturas continuas.
async function cargarResumenReviews({ localidad, id }) {
  try {
    const ref = tiendaSubCol(localidad, "tiendas", id, "review");
    const snap = await getDocs(
      query(ref, orderBy("timestamp", "desc"), limit(300)),
    );
    const reviews = [];
    snap.forEach((d) => reviews.push({ id: d.id, ...d.data() }));

    const uid = auth.currentUser?.uid;
    _misReview = uid ? reviews.find((r) => r.id === uid) || null : null;

    _reviewsCache = reviews;
    renderReviewsSummary(reviews);
    if (!_galleryLoadedOnce) {
      renderReviewsGallery(reviews);
      _galleryLoadedOnce = true;
    }
  } catch (e) {
    console.warn("No se pudo cargar el resumen de reseñas:", e.message);
  } finally {
    _reviewsReady = true;
    tryHideLoader();
  }
}

// ── Lista de reseñas filtrable por estrellas (usa tus índices de Firestore) ──
function construirReviewsQuery({ localidad, id }, cursor) {
  const ref = tiendaSubCol(localidad, "tiendas", id, "review");
  const condiciones = [orderBy("timestamp", "desc")];
  if (_reviewsFiltroEstrellas !== "todas") {
    condiciones.unshift(
      where("calificacion", "==", Number(_reviewsFiltroEstrellas)),
    );
  }
  condiciones.push(limit(REVIEWS_LIST_BATCH));
  if (cursor) condiciones.push(startAfter(cursor));
  return query(ref, ...condiciones);
}

async function cargarReviewsPagina(params, reset = false) {
  if (_reviewsCargandoServer) return;
  _reviewsCargandoServer = true;

  const listEl = document.getElementById("reviewsList");
  const emptyEl = document.getElementById("reviewsEmpty");
  const loadingEl = document.getElementById("reviewsLoading");
  const filtersEl = document.getElementById("reviewsFilters");

  if (reset) {
    _reviewsLastDoc = null;
    _reviewsHayMasServer = true;
    _reviewsAllData = [];
    document.getElementById("reviewsListMoreWrap")?.remove();
    if (emptyEl) emptyEl.style.display = "none";
    if (filtersEl) filtersEl.classList.add("disabled");

    if (listEl) {
      listEl.classList.add("fading");
      // pequeña pausa para que se note el fade antes de vaciar
      await new Promise((r) => setTimeout(r, 180));
      listEl.innerHTML = "";
    }
    if (loadingEl) loadingEl.style.display = "flex";
  }

  try {
    const snap = await getDocs(construirReviewsQuery(params, _reviewsLastDoc));
    const nuevas = [];
    snap.forEach((d) => nuevas.push({ id: d.id, ...d.data() }));

    _reviewsAllData = _reviewsAllData.concat(nuevas);
    _reviewsLastDoc = snap.docs[snap.docs.length - 1] || _reviewsLastDoc;
    _reviewsHayMasServer = snap.docs.length === REVIEWS_LIST_BATCH;

    if (emptyEl) {
      emptyEl.style.display = _reviewsAllData.length ? "none" : "block";
      emptyEl.textContent =
        _reviewsFiltroEstrellas === "todas"
          ? "Sé el primero en dejar una reseña de este negocio ⭐"
          : `Este negocio no tiene reseñas de ${_reviewsFiltroEstrellas} estrellas`;
    }

    if (loadingEl) loadingEl.style.display = "none";
    if (listEl) listEl.classList.remove("fading");

    await pintarReviewsNuevas(nuevas);
    renderReviewsMoreButtonServer(params);
  } catch (e) {
    console.warn("No se pudieron cargar las reseñas:", e.message);
    if (loadingEl) loadingEl.style.display = "none";
    if (listEl) listEl.classList.remove("fading");
  } finally {
    _reviewsCargandoServer = false;
    if (filtersEl) filtersEl.classList.remove("disabled");
  }
}

function bindReviewsFilterEvents(params) {
  document
    .querySelectorAll("#reviewsFilters .reviews-filter-chip")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) return;
        document
          .querySelectorAll("#reviewsFilters .reviews-filter-chip")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        _reviewsFiltroEstrellas = btn.dataset.estrellas;
        cargarReviewsPagina(params, true);
      });
    });
}

let _galleryModalKeyBound = false;

const REVIEWS_GALLERY_BATCH = 24;
let _galleryAllImages = [];
let _galleryRenderedCount = 0;
let _galleryObserver = null;

function openReviewsGalleryModal(images) {
  injectReviewsStyles();
  let modal = document.getElementById("reviewsGalleryModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reviewsGalleryModal";
    modal.className = "reviews-gallery-modal";
    modal.innerHTML = `
      <div class="reviews-gallery-modal-box">
        <div class="reviews-gallery-modal-header">
          <h3>Fotos de la comunidad <span id="reviewsGalleryModalCount"></span></h3>
          <button class="reviews-gallery-modal-close" id="reviewsGalleryModalClose">✕</button>
        </div>
        <div class="reviews-gallery-modal-grid" id="reviewsGalleryModalGrid"></div>
        <div id="reviewsGalleryModalSentinel" style="height:1px;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target.id === "reviewsGalleryModal") closeReviewsGalleryModal();
    });
    document
      .getElementById("reviewsGalleryModalClose")
      .addEventListener("click", closeReviewsGalleryModal);
  }

  if (!_galleryModalKeyBound) {
    _galleryModalKeyBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open")) {
        closeReviewsGalleryModal();
      }
    });
  }

  document.getElementById("reviewsGalleryModalCount").textContent =
    `(${images.length})`;

  _galleryAllImages = images;
  _galleryRenderedCount = 0;
  document.getElementById("reviewsGalleryModalGrid").innerHTML = "";

  appendGalleryBatch();
  setupGalleryObserver();

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function appendGalleryBatch() {
  const gridModal = document.getElementById("reviewsGalleryModalGrid");
  if (!gridModal) return;
  const start = _galleryRenderedCount;
  const end = Math.min(start + REVIEWS_GALLERY_BATCH, _galleryAllImages.length);

  for (let idx = start; idx < end; idx++) {
    const photo = _galleryAllImages[idx];
    const card = document.createElement("div");
    card.className = "reviews-gallery-modal-item";
    const imgWrap = createImageWithPlaceholder({
      src: photo.url,
      alt: `Foto de ${photo.nombre || "usuario"}`,
      onError: () => {
        card.style.display = "none";
      },
    });
    card.appendChild(imgWrap);
    card.addEventListener("click", () =>
      openReviewsLightbox(_galleryAllImages, idx, () =>
        openReviewsGalleryModal(_galleryAllImages),
      ),
    );
    gridModal.appendChild(card);

    // Entrada escalonada, no todo de golpe
    const delay = (idx - start) * 25;
    requestAnimationFrame(() => {
      setTimeout(() => card.classList.add("in"), delay);
    });
  }

  _galleryRenderedCount = end;
}

function setupGalleryObserver() {
  const sentinel = document.getElementById("reviewsGalleryModalSentinel");
  if (!sentinel) return;
  if (_galleryObserver) _galleryObserver.disconnect();

  _galleryObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (
          entry.isIntersecting &&
          _galleryRenderedCount < _galleryAllImages.length
        ) {
          appendGalleryBatch();
        }
      });
    },
    {
      root: document.querySelector(".reviews-gallery-modal-box"),
      rootMargin: "200px",
    },
  );

  _galleryObserver.observe(sentinel);
}

function closeReviewsGalleryModal() {
  document.getElementById("reviewsGalleryModal")?.classList.remove("open");
  document.body.style.overflow = "";
  if (_galleryObserver) {
    _galleryObserver.disconnect();
    _galleryObserver = null;
  }
}

function renderReviewsGallery(reviews) {
  const wrap = document.getElementById("reviewsGalleryWrap");
  const grid = document.getElementById("reviewsGalleryGrid");
  if (!wrap || !grid) return;

  const photoMap = new Map();
  reviews.forEach((r) => {
    (r.lista_img_url || []).forEach((url) => {
      if (!url || photoMap.has(url)) return;
      photoMap.set(url, {
        url,
        nombre: r.nombre_usuario || "Usuario Geinz",
        id_user: r.id_user,
        timestamp: r.timestamp,
        calificacion: r.calificacion || 0,
        descripcion: r.descripcion || "",
      });
    });
  });
  const allPhotos = [...photoMap.values()];

  if (!allPhotos.length) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";

  const titleEl = wrap.querySelector(".reviews-gallery-title");
  if (titleEl) {
    titleEl.innerHTML = `Fotos de la comunidad <span class="reviews-gallery-count">(${allPhotos.length})</span>`;
    let seeAllBtn = wrap.querySelector(".reviews-gallery-seeall");
    if (!seeAllBtn) {
      seeAllBtn = document.createElement("button");
      seeAllBtn.className = "reviews-gallery-seeall";
      seeAllBtn.textContent = "Ver todas";
      titleEl.after(seeAllBtn);
    }
    seeAllBtn.onclick = () => openReviewsGalleryModal(allPhotos);
  }

  grid.className = "reviews-gallery-row";
  grid.innerHTML = "";

  const MAX_ROW = 10;
  const visible = allPhotos.slice(0, MAX_ROW);
  const hiddenCount = allPhotos.length - MAX_ROW;

  visible.forEach((photo, idx) => {
    const card = document.createElement("div");
    card.className = "reviews-gallery-item";
    card.title = photo.nombre;

    const imgWrap = createImageWithPlaceholder({
      src: photo.url,
      alt: `Foto de ${photo.nombre}`,
      onError: () => {
        card.style.display = "none";
      },
    });
    card.appendChild(imgWrap);

    const isLastWithMore = idx === visible.length - 1 && hiddenCount > 0;
    if (isLastWithMore) {
      const overlay = document.createElement("div");
      overlay.className = "reviews-gallery-more";
      overlay.innerHTML = `+${hiddenCount}<span>Ver todas</span>`;
      card.appendChild(overlay);
      card.addEventListener("click", () => openReviewsGalleryModal(allPhotos));
    } else {
      card.addEventListener("click", () =>
        openReviewsLightbox(allPhotos, idx, () =>
          openReviewsGalleryModal(allPhotos),
        ),
      );
    }

    grid.appendChild(card);
  });
}
const REVIEWS_LIST_BATCH = 5;
let _reviewsAllData = [];

function renderReviewsSummary(reviews) {
  document.getElementById("secReviews").style.visibility = "visible";

  const avgEl = document.getElementById("reviewsAvgNum");
  const starsEl = document.getElementById("reviewsAvgStars");
  const countEl = document.getElementById("reviewsCountText");
  const btnLabel = document.getElementById("btnAbrirReviewLabel");

  if (btnLabel)
    btnLabel.textContent = _misReview ? "Editar mi reseña" : "Dejar una reseña";

  if (!reviews.length) {
    if (avgEl) avgEl.textContent = "0.0";
    if (starsEl) starsEl.innerHTML = starsHTML(0);
    if (countEl) countEl.textContent = `${reviews.length} reseñas`;
    renderReviewsBreakdown(reviews);
    updateHeroRatingBadge(0, 0);
    return;
  }

  const avg =
    reviews.reduce((s, r) => s + (Number(r.calificacion) || 0), 0) /
    reviews.length;
  if (avgEl) avgEl.textContent = avg.toFixed(1);
  const wordEl = document.getElementById("reviewsWordLabel");
  if (wordEl) {
    wordEl.textContent =
      avg >= 4.5
        ? "Excelente"
        : avg >= 3.5
          ? "Muy bueno"
          : avg >= 2.5
            ? "Bueno"
            : avg >= 1.5
              ? "Regular"
              : "Malo";
  }
  if (starsEl) starsEl.innerHTML = starsHTML(avg);
  if (countEl)
    countEl.textContent = `${reviews.length} reseña${reviews.length !== 1 ? "s" : ""}`;

  updateHeroRatingBadge(avg, reviews.length);
}

// ══════════════════════════════════════════
//  BADGE DE REPUTACIÓN (debajo de "Sobre el negocio")
// ══════════════════════════════════════════
function updateHeroRatingBadge(avg, count) {
  const wrap = document.getElementById("secReputacion");
  if (!wrap) return;
  const starsEl = document.getElementById("reputacionStars");
  const avgEl = document.getElementById("reputacionAvg");
  const countEl = document.getElementById("reputacionCount");

  if (!count) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  if (starsEl) starsEl.innerHTML = starsHTML(avg);
  if (avgEl) avgEl.textContent = avg.toFixed(1);
  if (countEl) countEl.textContent = `${count} reseña${count !== 1 ? "s" : ""}`;
}

function bindReputacionBadgeClick() {
  document.getElementById("secReputacion")?.addEventListener("click", () => {
    document
      .getElementById("secReviews")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function pintarReviewsNuevas(nuevas) {
  const listEl = document.getElementById("reviewsList");
  if (!listEl) return;

  for (let i = 0; i < nuevas.length; i++) {
    const r = nuevas[i];
    const nombre = r.nombre_usuario || (await getUserDisplayName(r.id_user));
    const fecha = r.timestamp?.toDate
      ? r.timestamp.toDate().toLocaleDateString("es-PE")
      : "";
    const desc = (r.descripcion || "").replace(/</g, "&lt;");
    const esLarga = desc.length > 220;

    const respuesta = r.respuesta_tienda || null;
    const respuestaTexto = respuesta?.texto
      ? String(respuesta.texto).replace(/</g, "&lt;")
      : "";
    const respuestaFecha = respuesta?.fecha?.toDate
      ? respuesta.fecha.toDate().toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "";
    const respuestaHTML = respuestaTexto
      ? `
      <div class="review-item-reply">
        <div class="review-item-reply-header">
          <span>💬 Respuesta del negocio</span>
          ${respuestaFecha ? `<span class="review-item-reply-date">${respuestaFecha}</span>` : ""}
        </div>
        <p class="review-item-reply-text">${respuestaTexto}</p>
      </div>`
      : "";

    const esMia = auth.currentUser?.uid && r.id === auth.currentUser.uid;

    const item = document.createElement("div");
    item.className = "review-item";
    item.dataset.reviewId = r.id;
    item.tabIndex = 0;
    item.innerHTML = `
      <div class="review-item-top">
        <div class="review-item-who">
          <div class="review-avatar">${nombre.trim().charAt(0).toUpperCase()}</div>
          <div>
            <div class="review-item-name">${nombre}</div>
            <div class="review-item-date">${fecha}</div>
          </div>
        </div>
        <div class="review-item-badge">${(r.calificacion || 0).toFixed(1)} <span class="badge-star">★</span></div>
      </div>
      <p class="review-item-desc${esLarga ? " clamped" : ""}">${desc}</p>
      ${esLarga ? `<button class="review-item-more">Leer más</button>` : ""}
      ${respuestaHTML}
      ${esMia ? `<button class="review-item-delete" data-delete-review>Eliminar mi reseña</button>` : ""}
    `;

    if (esLarga) {
      const descEl = item.querySelector(".review-item-desc");
      const btn = item.querySelector(".review-item-more");
      btn.addEventListener("click", () => {
        const expandido = !descEl.classList.contains("clamped");
        descEl.classList.toggle("clamped", expandido);
        btn.textContent = expandido ? "Leer más" : "Leer menos";
      });
    }

    if (esMia) {
      item
        .querySelector("[data-delete-review]")
        ?.addEventListener("click", () => eliminarMiReview());
    }

    listEl.appendChild(item);

    const delay = i * 40;
    requestAnimationFrame(() =>
      setTimeout(() => item.classList.add("in"), delay),
    );
  }
}
function renderReviewsMoreButtonServer(params) {
  const listEl = document.getElementById("reviewsList");
  let wrap = document.getElementById("reviewsListMoreWrap");

  if (!_reviewsHayMasServer) {
    wrap?.remove();
    return;
  }

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "reviewsListMoreWrap";
    wrap.className = "reviews-list-more-wrap";
    listEl.after(wrap);
  }
  wrap.innerHTML = `<button class="reviews-list-more-btn" id="reviewsListMoreBtn">Ver más reseñas</button>`;
  document
    .getElementById("reviewsListMoreBtn")
    .addEventListener("click", () => cargarReviewsPagina(params, false));
}
function buildReviewImgSlots() {
  const grid = document.getElementById("reviewImgGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const slot = document.createElement("div");
    slot.className = "review-img-slot";
    slot.dataset.index = i;
    slot.innerHTML = `<span class="review-img-plus">+</span><img><button class="review-img-remove">✕</button>`;
    slot.addEventListener("click", (e) => {
      if (e.target.classList.contains("review-img-remove")) return;
      if (_reviewImagesData[i]) return;
      _reviewSelectedSlot = i;
      document.getElementById("reviewImgInput").click();
    });
    slot.querySelector(".review-img-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      _reviewImagesData[i] = null;
      paintReviewSlot(i);
    });
    grid.appendChild(slot);
  }
}

function paintReviewSlot(i) {
  const slot = document.querySelector(`.review-img-slot[data-index="${i}"]`);
  if (!slot) return;
  const data = _reviewImagesData[i];
  const img = slot.querySelector("img");
  if (data) {
    slot.classList.add("filled");
    img.src = typeof data === "string" ? data : data.data;
  } else {
    slot.classList.remove("filled");
    img.src = "";
  }
}

function setReviewStars(n) {
  _reviewCalificacion = n;
  document.querySelectorAll("#reviewStarsPicker .review-star").forEach((s) => {
    s.classList.toggle("active", Number(s.dataset.val) <= n);
  });
}

function openReviewModal() {
  if (!auth.currentUser) {
    openLoginPromptModal();
    return;
  }
  injectReviewsStyles();
  const modal = document.getElementById("reviewModal");
  if (!modal) return;

  buildReviewImgSlots();
  _reviewImagesData = [null, null, null, null, null];

  const deleteBtn = document.getElementById("reviewDeleteBtn");

  if (_misReview) {
    document.getElementById("reviewModalTitle").textContent =
      "Editar tu reseña";
    document.getElementById("reviewDescInput").value =
      _misReview.descripcion || "";
    setReviewStars(_misReview.calificacion || 0);
    (_misReview.lista_img_url || []).slice(0, 5).forEach((url, i) => {
      _reviewImagesData[i] = url;
      paintReviewSlot(i);
    });
    if (deleteBtn) deleteBtn.style.display = "block";
  } else {
    document.getElementById("reviewModalTitle").textContent = "Deja tu reseña";
    document.getElementById("reviewDescInput").value = "";
    setReviewStars(0);
    for (let i = 0; i < 5; i++) paintReviewSlot(i);
    if (deleteBtn) deleteBtn.style.display = "none";
  }
  document.getElementById("reviewModalError").textContent = "";
  document.getElementById("reviewModalError").textContent = "";
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeReviewModal() {
  document.getElementById("reviewModal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function bindReviewEvents() {
  document
    .getElementById("btnAbrirReview")
    ?.addEventListener("click", openReviewModal);
  document
    .getElementById("reviewModalClose")
    ?.addEventListener("click", closeReviewModal);
  document.getElementById("reviewModal")?.addEventListener("click", (e) => {
    if (e.target.id === "reviewModal") closeReviewModal();
  });

  document.querySelectorAll("#reviewStarsPicker .review-star").forEach((s) => {
    s.addEventListener("click", () => setReviewStars(Number(s.dataset.val)));
  });

  document
    .getElementById("reviewImgInput")
    ?.addEventListener("change", function () {
      const file = this.files[0];
      if (!file || _reviewSelectedSlot === null) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        _reviewImagesData[_reviewSelectedSlot] = { data: e.target.result };
        paintReviewSlot(_reviewSelectedSlot);
        _reviewSelectedSlot = null;
        this.value = "";
      };
      reader.readAsDataURL(file);
    });

  document
    .getElementById("reviewSubmitBtn")
    ?.addEventListener("click", submitReview);

  document
    .getElementById("reviewDeleteBtn")
    ?.addEventListener("click", eliminarMiReview);
}
async function submitReview() {
  const errorEl = document.getElementById("reviewModalError");
  const btn = document.getElementById("reviewSubmitBtn");
  const desc = document.getElementById("reviewDescInput").value.trim();
  const uid = auth.currentUser?.uid;

  if (!uid) {
    openLoginPromptModal();
    return;
  }
  if (_reviewCalificacion < 1) {
    errorEl.textContent = "Selecciona una calificación en estrellas";
    return;
  }
  if (desc.length < 5) {
    errorEl.textContent = "Escribe una breve descripción de tu experiencia";
    return;
  }

  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Publicando...";

  try {
    const nombre = await getUserDisplayName(uid);
    const urls = [];

    for (let i = 0; i < _reviewImagesData.length; i++) {
      const item = _reviewImagesData[i];
      if (!item) continue;
      if (typeof item === "string") {
        urls.push(item);
        continue;
      }
      const comprimida = await comprimirImagenReview(item.data);
      const blob = dataURLtoBlobReview(comprimida);
      const nombreImg = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${i}`;
      const sRef = storageRef(
        storage,
        `tiendas/${_params.id}/review/${uid}/${nombreImg}`,
      );
      await uploadBytes(sRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(sRef);
      urls.push(url);
    }

    const reviewRef = tiendaSubDoc(
      _params.localidad,
      "tiendas",
      _params.id,
      "review",
      uid,
    );
    const nuevaReviewData = {
      calificacion: _reviewCalificacion,
      descripcion: desc,
      id_user: uid,
      nombre_usuario: nombre,
      lista_img_url: urls,
      timestamp: serverTimestamp(),
    };
    await setDoc(reviewRef, nuevaReviewData);

    // Se refleja al instante solo para este usuario (sin realtime global)
    const reviewLocal = {
      id: uid,
      ...nuevaReviewData,
      timestamp: { toDate: () => new Date() },
    };
    _misReview = reviewLocal;
    _reviewsCache = [reviewLocal, ..._reviewsCache.filter((r) => r.id !== uid)];
    _reviewsAllData = _reviewsAllData.filter((r) => r.id !== uid);
    if (
      _reviewsFiltroEstrellas === "todas" ||
      Number(_reviewsFiltroEstrellas) === _reviewCalificacion
    ) {
      _reviewsAllData = [reviewLocal, ..._reviewsAllData];
    }
    renderReviewsSummary(_reviewsCache);
    document.getElementById("reviewsList").innerHTML = "";
    document.getElementById("reviewsListMoreWrap")?.remove();
    await pintarReviewsNuevas(_reviewsAllData);

    closeReviewModal();
    showToast("¡Gracias por tu reseña! ⭐");
  } catch (e) {
    console.error("Error publicando reseña:", e);
    errorEl.textContent = "No se pudo publicar tu reseña, intenta de nuevo";
  } finally {
    btn.disabled = false;
    btn.textContent = "Publicar reseña";
  }
}

async function eliminarMiReview() {
  const uid = auth.currentUser?.uid;
  if (!uid || !_misReview) return;

  if (
    !confirm(
      "¿Seguro que quieres eliminar tu reseña? Esta acción no se puede deshacer.",
    )
  )
    return;

  const btn = document.getElementById("reviewDeleteBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Eliminando...";
  }

  try {
    const reviewRef = tiendaSubDoc(
      _params.localidad,
      "tiendas",
      _params.id,
      "review",
      uid,
    );
    await deleteDoc(reviewRef);

    // Se actualiza al instante solo para este usuario (sin realtime global)
    _misReview = null;
    _reviewsCache = _reviewsCache.filter((r) => r.id !== uid);
    _reviewsAllData = _reviewsAllData.filter((r) => r.id !== uid);

    renderReviewsSummary(_reviewsCache);
    document.getElementById("reviewsList").innerHTML = "";
    document.getElementById("reviewsListMoreWrap")?.remove();
    await pintarReviewsNuevas(_reviewsAllData);

    closeReviewModal();
    showToast("Tu reseña fue eliminada");
  } catch (e) {
    console.error("Error eliminando reseña:", e);
    showToast("No se pudo eliminar tu reseña, intenta de nuevo");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Eliminar mi reseña";
    }
  }
}
// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
(async () => {
  try {
    const params = await getParams();
    _params = params;

    if (params.mesaToken) {
      await resolveMesaYRedirigir(params, params.mesaToken);
      return;
    }

    const biz = await loadBusiness(params);
    showPromoBanner(biz); // ← se dispara ANTES de todo el resto del render
    await render(biz, true);

    listenBusinessRealtime(params);
    listenMesasRealtime(
      params,
      biz.categoria_tienda,
      biz.modelo_negocio !== false,
    );
    bindFollowButton(params, biz); // ← ya está bien ubicado, no cambies el orden
    injectReviewsStyles();
    bindReputacionBadgeClick();
    bindReviewsFilterEvents(params);
    await cargarResumenReviews(params);
    await cargarReviewsPagina(params, true);
    // Ofertas activas (promociones_geinz) → tiempo real
    listenActivePromosRealtime(params);
    // Carta digital (solo aplica si es "comida y restaurantes") → tiempo real
    listenCartaRealtime(
      params,
      biz.categoria_tienda,
      biz.alias_key,
      biz.nombre_tienda || biz.nombre,
      (secciones) => {
        if (params.wantsCarta) {
          const esComida = (biz.categoria_tienda || "")
            .toLowerCase()
            .includes("comida");
          if (esComida && secciones.length > 0) {
            setTimeout(() => {
              document
                .getElementById("secCarta")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 350);
          } else {
            const nombreNegocio =
              biz.nombre_tienda || biz.nombre || "Este negocio";
            showSnackbar(`${nombreNegocio} no tiene carta digital disponible`);
          }
        }
      },
    );

    // Catálogo de productos → NO tiempo real (se obtiene en cada carga normal)
    loadProductosCatalogo(params).then((productos) => {
      renderProductosCatalogo(productos, params.localidad, params.id);
    });
  } catch (err) {
    console.error(err);
    showNotFoundScreen(err.message); // ← debe capturarlo
  }
})();
injectLightboxStyles();
injectMesasStyles();
bindMesaReservaEvents();
bindLoginPromptEvents();
bindBannerModalEvents();
bindUnfollowConfirmEvents();
bindReviewEvents();
// REVEAL ANIMATION
const reveal = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("active");
    }),
  { threshold: 0.12 },
);
reveal.forEach((el) => observer.observe(el));

// ══════════════════════════════════════════
//  CARRUSEL HORIZONTAL POR HOVER (solo PC)
// ══════════════════════════════════════════
function setupHoverCarousel(wrapId, trackId) {
  const wrap = document.getElementById(wrapId);
  const track = document.getElementById(trackId);
  if (!wrap || !track) return;

  let rafId = null;
  let direction = 0;
  const MAX_SPEED = 9;

  const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

  function step() {
    if (direction !== 0) track.scrollLeft += direction;
    rafId = requestAnimationFrame(step);
  }

  wrap.addEventListener("mouseenter", () => {
    if (!isDesktop()) return;
    wrap.classList.add("scrolling");
    if (!rafId) rafId = requestAnimationFrame(step);
  });

  wrap.addEventListener("mousemove", (e) => {
    if (!isDesktop()) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edgeZone = Math.min(160, rect.width * 0.28);

    if (x < edgeZone) {
      direction = -MAX_SPEED * (1 - x / edgeZone);
    } else if (x > rect.width - edgeZone) {
      direction = MAX_SPEED * (1 - (rect.width - x) / edgeZone);
    } else {
      direction = 0;
    }
  });

  wrap.addEventListener("mouseleave", () => {
    direction = 0;
    wrap.classList.remove("scrolling");
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
}

async function loadProductosCatalogo({ localidad, id }) {
  try {
    const catRef = tiendaSubCol(localidad, "tiendas", id, "productos");

    const catSnap = await getDocs(catRef);
    const productos = [];

    for (const catDoc of catSnap.docs) {
      const categoria = catDoc.id;
      const subRef = tiendaSubCol(
        localidad,
        "tiendas",
        id,
        "productos",
        categoria,
        categoria,
      );

      const subSnap = await getDocs(subRef);
      subSnap.forEach((pDoc) => {
        const d = pDoc.data();
        if (d.disponible === false) return;
        productos.push({
          id: pDoc.id,
          categoria,
          nombre: d.nombre || "Producto",
          precio: Number(d.precio) || 0,
          imagen: d.imagenes?.[0]?.url || "",
        });
      });
    }
    return productos;
  } catch (e) {
    console.warn("No se pudo cargar el catálogo de productos:", e.message);
    return [];
  }
}

// ── 2. Pinta 5 productos en línea vertical + botón "Ver catálogo" (arriba si hay productos)
function renderProductosCatalogo(productos, localidad, id) {
  const sec = document.getElementById("secCatalogo");
  const btnWrap = document.getElementById("catalogoBtnWrap");
  const list = document.getElementById("catalogoList");
  if (!sec || !list) return;

  if (!productos.length) {
    sec.style.display = "none";
    return;
  }

  sec.style.display = "";

  if (btnWrap) {
    btnWrap.innerHTML = `
      <a href="../carrito/carrito.html?localidad=${encodeURIComponent(localidad)}&id=${encodeURIComponent(id)}"
         class="btn-primary px-6 py-3 rounded-2xl font-bold inline-flex items-center gap-2">
        🛒 Ver productos
      </a>`;
  }

  list.innerHTML = "";
  productos.slice(0, 5).forEach((p) => {
    const row = document.createElement("div");
    row.className = "catalogo-row";

    const imgWrap = createImageWithPlaceholder({
      src: p.imagen,
      alt: p.nombre,
      useLogoFallback: true,
    });
    imgWrap.classList.add("catalogo-row-img");

    const overlay = document.createElement("div");
    overlay.className = "catalogo-row-overlay";
    overlay.innerHTML = `
      <span class="catalogo-row-nombre">${p.nombre}</span>
      <span class="catalogo-row-precio">S/ ${p.precio.toFixed(2)}</span>`;

    row.appendChild(imgWrap);
    row.appendChild(overlay);
    list.appendChild(row);
  });
}

setupHoverCarousel("productosCarouselWrap", "productosGrid");
setupHoverCarousel("ambientesCarouselWrap", "ambientesGrid");

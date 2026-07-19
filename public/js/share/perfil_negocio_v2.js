import PhotoSwipeLightbox from "https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.js";
window.PhotoSwipeLightbox = PhotoSwipeLightbox;

// ══════════════════════════════════════════
//  PANTALLA: PERFIL NO ENCONTRADO
// ══════════════════════════════════════════
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

  console.log(`🎨 Color dominante aplicado → rgb(${r}, ${g}, ${b})`);
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
function showBizLoader() {
  const style = document.createElement("style");
  style.id = "loaderStyle";
  style.textContent = LOADER_CSS;
  document.head.appendChild(style);
  const loader = document.createElement("div");
  loader.className = "geinz-loader";
  loader.id = "geinzLoader";
  loader.innerHTML = `
    <div class="sk-container">
        <div class="sk-hero">
            <div class="sk-hero-left">
                <div class="sk-title"></div>
                <div class="sk-status"></div>
                <div class="sk-tags">
                    <div class="sk-tag"></div>
                    <div class="sk-tag"></div>
                    <div class="sk-tag"></div>
                </div>
                <div class="sk-desc"></div>
                <div class="sk-buttons">
                    <div class="sk-btn"></div>
                    <div class="sk-btn"></div>
                </div>
            </div>
            <div class="sk-hero-right">
                <div class="sk-image"></div>
            </div>
        </div>
        <div class="sk-section">
            <div class="sk-section-header"></div>
            <div class="sk-grid">
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
            </div>
        </div>
        <div class="sk-section">
            <div class="sk-section-header"></div>
            <div class="sk-grid">
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
            </div>
        </div>
    </div>
`;
  document.body.appendChild(loader);
}
function hideBizLoader() {
  const loader = document.getElementById("geinzLoader");
  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => {
      loader.remove();
      document.getElementById("loaderStyle")?.remove();
    }, 420);
  }
}

// ══════════════════════════════════════════
//  FIREBASE
// ══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  databaseURL: "https://geinzworkapp-default-rtdb.firebaseio.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.firebasestorage.app",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
  measurementId: "G-38J7RJP8HK",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getParams() {
  // ── Lee alias desde la URL limpia /perfil/alonsopenarestobar1621 ──
  const path = window.location.pathname;
  const desdePath = path.startsWith("/perfil/");

  if (desdePath) {
    const alias = path.split("/perfil/")[1]?.trim();
    if (!alias) throw new Error("Alias inválido");

    const aliasSnap = await getDoc(doc(db, "alias_tiendas", alias));
    if (!aliasSnap.exists()) throw new Error("Perfil no encontrado");

    const { id, localidad, categoria } = aliasSnap.data();

    // ← leer ?p= aquí
    const promoId =
      new URLSearchParams(window.location.search).get("p") || null;

    return {
      localidad: localidad.trim().toLowerCase(),
      subcol: (categoria || "").replace(/\+/g, " "),
      id,
      promoIndex: null,
      promoId, // ← nuevo
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

  return { localidad, subcol, id, promoIndex };
}
async function loadBusiness({ localidad, id }) {
  const ref = doc(db, "Tiendas", localidad, localidad, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Negocio no encontrado");
  return { id: snap.id, ...snap.data() };
}

// ══════════════════════════════════════════
//  PROMOCIONES ACTIVAS
// ══════════════════════════════════════════
async function loadActivePromos({ localidad, id }) {
  try {
    const ref = collection(
      db,
      "Tiendas",
      localidad,
      localidad,
      id,
      "promociones_geinz",
    );
    const snap = await getDocs(ref);
    const now = Date.now();
    const promos = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.estado !== "activo") return;

      const finMs = data.timestamp_fin?.toMillis
        ? data.timestamp_fin.toMillis()
        : null;

      // Descartar si ya expiró
      if (finMs && finMs < now) return;

      promos.push({ id: docSnap.id, ...data, _finMs: finMs });
    });

    // Las que vencen antes van primero
    promos.sort((a, b) => (a._finMs || Infinity) - (b._finMs || Infinity));

    return promos.slice(0, 4); // máx 4, o menos si hay menos
  } catch (e) {
    console.warn("No se pudieron cargar promociones activas:", e.message);
    return [];
  }
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
    return;
  }

  sec.style.display = "";
  grid.innerHTML = "";

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
        <img src="${img}" alt="${info.titulo || "Promoción"}" loading="lazy">
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

    const imgEl = card.querySelector("img");
    imgEl.onerror = () => {
      card.querySelector(".promo-active-img-wrap").style.display = "none";
    };

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
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Galería ${i + 1}`;
    img.loading = "lazy";
    img.onerror = () => {
      card.style.display = "none"; // oculta el card si la img falla
    };
    slide.appendChild(img);
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
// ── Variables globales ──
let _params = {};
let _colorReady = false;
let _schedInterval = null; // evitar setInterval duplicados

async function render(biz) {
  const nombre = biz.nombre_tienda || biz.nombre || "—";
  const categoria = biz.categoria_tienda || "—";
  const subcategorias = Array.isArray(biz.subcategoria) ? biz.subcategoria : [];
  const descripcion = biz.descripcion || "—";
  const ubicacion = biz.ubicacion || {};
  const horario = normalizeSchedule(biz.horario_atencion);
  const contactos = normalizeContactos(biz.metodo_contacto);
  const pagos = normalizePagos(biz.metodos_pago);
  const { ambientales, productos, todas } = normalizeImages(biz.img_tienda);
  const promoImages = normalizePromos(biz.img_tienda);
  const amenities = normalizeAmenities(biz.servicios_comodidades);
  const logoUrl = biz.img_tienda?.logo_tienda || null;

  // ── COLOR + LOGO: solo la primera vez ──
  if (!_colorReady) {
    applyDominantColor(colorFromName(nombre));

    const heroImg = document.getElementById("bizLogoHero");
    const heroPlaceholder = document.getElementById("bizLogoPlaceholderHero");

    if (logoUrl) {
      heroImg.src = logoUrl;
      heroImg.style.display = "block";
      heroPlaceholder.style.display = "none";

      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.onload = () => {
        getDominantColor(tempImg).then((color) => {
          if (color) applyDominantColor(color);
          _colorReady = true;
          hideBizLoader();
        });
      };
      tempImg.onerror = () => {
        _colorReady = true;
        hideBizLoader();
      };
      tempImg.src =
        logoUrl + (logoUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();
    } else {
      _colorReady = true;
      hideBizLoader();
    }
  }

  // ── CONTENIDO: siempre se actualiza ──
  document.getElementById("bizName").textContent = nombre;
  document.title = nombre;
  document.getElementById("cats").innerHTML =
    `<span class="tag cat">${categoria}</span>${subcategorias.map((s) => `<span class="tag sub">${s}</span>`).join("")}`;

  // Status badge
  calcStatus(horario);
  if (_schedInterval) clearInterval(_schedInterval);
  _schedInterval = setInterval(() => calcStatus(horario), 30000);

  document.getElementById("descText").textContent = descripcion;
  document.getElementById("addrText").textContent = ubicacion.dirección || "—";
  document.getElementById("refText").textContent = ubicacion.referencia || "—";

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
  // Horario
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

  // Contactos
  if (contactos.length) renderContactDetail(contactos);

  // Pagos
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

  // Amenities
  const amenitiesGrid = document.getElementById("amenitiesGrid");
  if (amenitiesGrid && amenities.length) {
    amenitiesGrid.innerHTML = "";
    amenities.forEach(({ name, icon }) => {
      const chip = document.createElement("div");
      chip.className = "pay-chip";
      chip.innerHTML = `<span>${icon}</span> ${name}`;
      amenitiesGrid.appendChild(chip);
    });
  }

  // Productos Grid
  const prodGrid = document.getElementById("productosGrid");
  if (prodGrid && productos.length) {
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
      if (isMobile && idx === 3 && hidden > 0) {
        card.style.cssText = "position:relative;";
        card.innerHTML = `<img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;border-radius:30px;"><span style="font-size:32px;font-weight:900;color:white;">+${hidden}</span></div>`;
      } else {
        const img = document.createElement("img");
        img.src = src;
        img.loading = "lazy";
        img.onerror = () => {
          card.style.display = "none"; // oculta el card si la img falla
        };
        card.appendChild(img);
      }
      prodGrid.appendChild(card);
    });
  }

  // Ambientes Grid
  const ambGrid = document.getElementById("ambientesGrid");
  if (ambGrid && ambientales.length) {
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
      if (isMobileAmb && idx === 3 && hiddenAmb > 0) {
        card.style.cssText = "position:relative;";
        card.innerHTML = `<img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;border-radius:30px;"><span style="font-size:32px;font-weight:900;color:white;">+${hiddenAmb}</span></div>`;
      } else {
        const img = document.createElement("img");
        img.src = src;
        img.loading = "lazy";
        img.onerror = () => {
          card.style.display = "none"; // oculta el card si la img falla
        };
        card.appendChild(img);
      }
      ambGrid.appendChild(card);
    });
  }

  // Carrusel completo
  if (todas.length) buildFullGallery(todas);

  // Promociones
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
      card.innerHTML = `<div class="promo-card-img-wrap"><img src="${promo.url}" alt="${promo.titulo}" loading="lazy"><div class="promo-overlay-actions"><a class="promo-btn-wa" href="${waLink}" target="_blank"> WhatsApp</a><button class="promo-btn-share" data-share-url="${shareBase}">Compartir</button></div></div>`;
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

  // Ocultar secciones vacías
  if (!productos.length)
    document
      .getElementById("secProductos")
      ?.style.setProperty("display", "none");
  if (!ambientales.length)
    document
      .getElementById("secAmbientes")
      ?.style.setProperty("display", "none");
  if (!contactos.length)
    document.getElementById("secContact")?.style.setProperty("display", "none");
  if (!pagos.length)
    document.getElementById("secPay")?.style.setProperty("display", "none");
  if (!amenities.length)
    document
      .getElementById("secAmenities")
      ?.style.setProperty("display", "none");

  const exploreBtn = document.getElementById("exploreBtn");
  if (exploreBtn) {
    const cat = (biz.categoria_tienda || "").toLowerCase().replace(/\s+/g, "+");
    exploreBtn.href = `https://geinztech.com/scree/negocios?localidad=${_params.localidad}&categoria=${cat}`;
  }
}

// ══════════════════════════════════════════
//  REALTIME
// ══════════════════════════════════════════
function listenBusinessRealtime({ localidad, id }) {
  const ref = doc(db, "Tiendas", localidad, localidad, id);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const changed = snap.metadata.hasPendingWrites === false; // vino del server
      render({ id: snap.id, ...snap.data() });
    }
  });
}
// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
(async () => {
  showBizLoader();
  try {
    const params = await getParams(); // ← si falla aquí
    _params = params;
    const biz = await loadBusiness(params);
    await render(biz);
    listenBusinessRealtime(params);

    // Promociones activas (no bloquea el render principal)
    loadActivePromos(params).then((promos) =>
      renderActivePromos(promos, params.localidad),
    );
  } catch (err) {
    console.error(err);
    showNotFoundScreen(err.message); // ← debe capturarlo
  }
})();

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

setupHoverCarousel("productosCarouselWrap", "productosGrid");
setupHoverCarousel("ambientesCarouselWrap", "ambientesGrid");

import PhotoSwipeLightbox from "https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.js";
window.PhotoSwipeLightbox = PhotoSwipeLightbox;

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

function getParams() {
  const p =
    new URLSearchParams(window.location.search) || "JHgbs7ttVXRnsIqsEGWS";
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
function normalizeSchedule(h) {
  return DAY_KEYS.map(({ key, label }) => {
    const b = h?.[key]?.bloques?.[0];
    if (!b || b.cerrado) return { dia: label, apertura: null, cierre: null };
    return { dia: label, apertura: b.h_apertura, cierre: b.h_cierre };
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
    ambientales: ambi,
    productos,
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
function calcStatus(horario) {
  const now = new Date();
  const map = [6, 0, 1, 2, 3, 4, 5];
  const today = horario[map[now.getDay()]];
  const badge = document.getElementById("statusBadge");
  const stxt = document.getElementById("statusText");
  if (!today?.apertura) {
    badge.className = "status-badge closed";
    stxt.textContent = "Cerrado hoy";
    return;
  }
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = toMin(today.apertura);
  const closeMin = toMin(today.cierre);
  if (nowMin >= openMin && nowMin < closeMin) {
    const diff = closeMin - nowMin,
      h = Math.floor(diff / 60),
      m = diff % 60;
    badge.className = "status-badge open";
    stxt.textContent = h > 0 ? `Cierra en ${h}h ${m}m` : `Cierra en ${m}m`;
  } else if (nowMin < openMin) {
    badge.className = "status-badge closed";
    stxt.textContent = `Abre hoy a las ${today.apertura}`;
  } else {
    const dayNames = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ];
    let found = null;
    for (let i = 1; i <= 7; i++) {
      const ni = (map[now.getDay()] + i) % 7;
      if (horario[ni]?.apertura) {
        found = `Abre el ${dayNames[ni]} a las ${horario[ni].apertura}`;
        break;
      }
    }
    badge.className = "status-badge closed";
    stxt.textContent = found || "Cerrado temporalmente";
  }
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

// ══════════════════════════════════════════
//  RENDER PRINCIPAL
// ══════════════════════════════════════════
let _params = {};
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

  // ── 1. Aplicar color fallback (por nombre) inmediatamente ──
  applyDominantColor(colorFromName(nombre));

  // ── 2. Cargar logo ──
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
        hideBizLoader(); // ✅ oculta DESPUÉS del color
      });
    };
    tempImg.onerror = () => {
      // CORS falló — color por nombre ya aplicado
      hideBizLoader(); // ✅ oculta igual si falla
    };
    tempImg.src =
      logoUrl + (logoUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();
  } else {
    // Sin logo — ocultar de una
    hideBizLoader();
  }

  // ── 4. Resto del render ──
  document.getElementById("bizName").textContent = nombre;
  document.title = nombre;
  document.getElementById("cats").innerHTML =
    `<span class="tag cat">${categoria}</span>${subcategorias.map((s) => `<span class="tag sub">${s}</span>`).join("")}`;
  calcStatus(horario);
  setInterval(() => calcStatus(horario), 30000);
  document.getElementById("descText").textContent = descripcion;
  document.getElementById("addrText").textContent = ubicacion.dirección || "—";
  document.getElementById("refText").textContent = ubicacion.referencia || "—";

  // Horario
  const gridSched = document.getElementById("schedGrid");
  if (gridSched) {
    gridSched.innerHTML = "";
    const todayIdx = [6, 0, 1, 2, 3, 4, 5][new Date().getDay()];
    horario.forEach((h, i) => {
      const div = document.createElement("div");
      div.className = "sched-row" + (i === todayIdx ? " today" : "");
      div.innerHTML = h.apertura
        ? `<span class="day-name">${h.dia}</span><span class="hours">${h.apertura} – ${h.cierre}</span>`
        : `<span class="day-name">${h.dia}</span><span class="closed-day">Cerrado</span>`;
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
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const maxVisible = isMobile ? 4 : productos.length;
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
    promoImages.forEach((promo) => {
      const shareBase = `https://geinzworkapp.web.app/api/share?t=p&id=${_params.id}&l=${_params.localidad}&c=${catFormatted}&i=${promo.id}`;
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
      const cat = (biz.categoria_tienda || "")
        .toLowerCase()
        .replace(/\s+/g, "+");
      const shareUrl = `https://geinzworkapp.web.app/api/share?t=ti&id=${biz.id}&l=${_params.localidad}&c=${cat}`;
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
}

// ══════════════════════════════════════════
//  REALTIME
// ══════════════════════════════════════════
function listenBusinessRealtime({ localidad, id }) {
  const ref = doc(db, "Tiendas", localidad, localidad, id);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) render({ id: snap.id, ...snap.data() });
  });
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
(async () => {
  showBizLoader();
  const params = getParams();
  _params = params;
  try {
    const biz = await loadBusiness(params);
    await render(biz);
    listenBusinessRealtime(params);
    // hideBizLoader() se mueve adentro del render
  } catch (err) {
    console.error(err);
    hideBizLoader();
    document.getElementById("bizName").textContent = "Error al cargar";
    document.getElementById("statusText").textContent = err.message;
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

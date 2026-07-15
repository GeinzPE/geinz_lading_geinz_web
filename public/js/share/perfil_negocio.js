/* ════════════════════════════════
   LOADING STATE — shimmer + GEINZ
   ════════════════════════════════ */

const LOADER_CSS = `
  .geinz-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: var(--bg, #09060f);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* TODOS LOS BLOQUES */
  .sk-gallery,
  .sk-block,
  .sk-name,
  .sk-tag,
  .sk-status,
  .sk-btn,
  .sk-section {
    border-radius: 18px !important;
  }

  .sk-gallery { 
    width: calc(100% - 32px);
    margin: 16px auto 0;
    height: 260px;
    background: #110d1e;
    flex-shrink: 0;
  }

  @media(min-width:520px){
    .sk-gallery{
      height:300px;
    }
  }

  .sk-body {
    max-width:520px;
    width:100%;
    margin:0 auto;
    padding:20px 18px;
    display:flex;
    flex-direction:column;
    gap:13px;
  }

  .sk-header-row {
    display:flex;
    flex-direction:column;
    gap:10px;
  }

  .sk-name {
    height:28px;
    width:62%;
  }

  .sk-tags {
    display:flex;
    gap:8px;
  }

  .sk-tag {
    height:22px;
  }

  .sk-t1{width:70px;}
  .sk-t2{width:90px;}
  .sk-t3{width:80px;}

  .sk-status {
    height:26px;
    width:140px;
  }

  .sk-btns {
    display:flex;
    gap:10px;
  }

  .sk-btn {
    height:44px;
    flex:1;
  }

  .sk-section {
    height:52px;
    width:100%;
  }

  .sk-block {
    background:#1a1330;
    position:relative;
    overflow:hidden;
  }

  .sk-gallery,
  .sk-block {
    position:relative;
    overflow:hidden;
  }

  .sk-gallery::after,
  .sk-block::after {
    content:'';
    position:absolute;
    inset:0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(109,47,212,.2) 38%,
      rgba(160,100,255,.32) 50%,
      rgba(109,47,212,.2) 62%,
      transparent 100%
    );
    background-size:200% 100%;
    animation: sk-sweep 1.7s ease-in-out infinite;
  }

  @keyframes sk-sweep {
    0%{
      background-position:200% 0;
    }
    100%{
      background-position:-200% 0;
    }
  }

  .geinz-loader.hide {
    transition:opacity .38s ease;
    opacity:0;
    pointer-events:none;
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
    <div class="sk-gallery"></div>
    <div class="sk-body">
      <div class="sk-header-row">
        <div class="sk-block sk-name"></div>
        <div class="sk-tags">
          <div class="sk-block sk-tag sk-t1"></div>
          <div class="sk-block sk-tag sk-t2"></div>
          <div class="sk-block sk-tag sk-t3"></div>
        </div>
        <div class="sk-block sk-status"></div>
      </div>
      <div class="sk-btns">
        <div class="sk-block sk-btn"></div>
        <div class="sk-block sk-btn"></div>
      </div>
      <div class="sk-block sk-section"></div>
      <div class="sk-block sk-section"></div>
      <div class="sk-block sk-section"></div>
      <div class="sk-block sk-section"></div>
      <div class="sk-block sk-section"></div>
    </div>`;
  document.body.appendChild(loader);
}

function hideBizLoader() {
  const logo = document.getElementById("geinzLogo");
  const loader = document.getElementById("geinzLoader");
  if (logo) {
    logo.style.transition = "opacity .3s";
    logo.style.opacity = "0";
    setTimeout(() => logo.remove(), 320);
  }
  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => {
      loader.remove();
      document.getElementById("loaderStyle")?.remove();
    }, 420);
  }
}

function toggleSectionVisibility(sectionId, hasData) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  if (hasData) {
    section.style.display = "";
    // Asegurar que la clase 'reveal' se mantenga para animación
    if (!section.classList.contains("reveal")) {
      section.classList.add("reveal");
    }
  } else {
    section.style.display = "none";
  }
}

/* ════════════════════════════════
   FIREBASE CONFIG
   ════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  databaseURL: "https://geinzworkapp-default-rtdb.firebaseio.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
  measurementId: "G-38J7RJP8HK",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ════════════════════════════════
   URL PARAMS
   ════════════════════════════════ */
function getParams() {
  const p = new URLSearchParams(window.location.search);

  const data = {
    localidad: p.get("localidad") || p.get("l"),
    subcol: p.get("subcol") || p.get("c"),
    id: p.get("id"),
    promoIndex: p.get("i"),
  };

  return {
    localidad: data.localidad ,
    subcol: data.subcol ,
    id: data.id ,
    promoIndex: data.promoIndex || null,
  };
}
// Llama a la función para ver el resultado inmediatamente
const params = getParams();
console.log("🚀 Resultado final del return:", params);
async function loadBusiness({ localidad, subcol, id }) {
  const ref = doc(db, "Tiendas", localidad, subcol, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Negocio no encontrado");
  return { id: snap.id, ...snap.data() };
}

/* ════════════════════════════════
   BUSINESS REALTIME
   ════════════════════════════════ */
function listenBusinessRealtime({ localidad, subcol, id }) {
  const ref = doc(db, "Tiendas", localidad, subcol, id);
  return onSnapshot(ref, async (snap) => {
    if (!snap.exists()) return;
    const biz = { id: snap.id, ...snap.data() };

    resetBusinessUI();
    render(biz);
    bindAccordions();
  });
}

function resetBusinessUI() {
  [
    "track",
    "dots",
    "schedGrid",
    "contactDetail",
    "payGrid",
    "amenitiesGrid",
    "promoCarousel",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  /* resetear estado de galería para evitar apilamiento en reload */
  currentSlide = 0;
  totalSlides = 0;
  clearInterval(autoTimer);
  autoTimer = null;
  /* resetear PhotoSwipe para que se reinicialice con las nuevas imágenes */
  window.__pswpInitialized = false;
}

/* ════════════════════════════════
   NORMALIZAR HORARIO
   ════════════════════════════════ */
const DAY_KEYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miércoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sábado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

function normalizeSchedule(horario_atencion) {
  return DAY_KEYS.map(({ key, label }) => {
    const bloque = horario_atencion?.[key]?.bloques?.[0];
    if (!bloque || bloque.cerrado)
      return { dia: label, apertura: null, cierre: null };
    return { dia: label, apertura: bloque.h_apertura, cierre: bloque.h_cierre };
  });
}

/* ════════════════════════════════
   NORMALIZAR CONTACTOS
   ════════════════════════════════ */
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

/* ════════════════════════════════
   NORMALIZAR PAGOS
   ════════════════════════════════ */
const PAYMENT_LABELS = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  visa_mastercard: "Visa / Mastercard",
  agora: "Agora",
};

const PAYMENT_ICONS = {
  efectivo: "./img/efectivo_logo.webp",
  yape: "./img/yape_logo.webp",
  plin: "./img/logo_plin.webp",
  visa_mastercard: "./img/visa_logo.webp",
  agora: "./img/agora_icon.webp",
};

function normalizePagos(metodos_pago) {
  return Object.entries(metodos_pago || {})
    .filter(([, v]) => v?.enable)
    .map(([key]) => ({
      key,
      label: PAYMENT_LABELS[key] || key,
      icon: PAYMENT_ICONS[key] || "💳",
    }));
}

/* ════════════════════════════════
   NORMALIZAR IMÁGENES GALERÍA
   ════════════════════════════════ */
function normalizeImages(img_tienda) {
  const lista = img_tienda?.lista_img || {};
  const ambi = Array.isArray(lista.ambientales) ? lista.ambientales : [];
  const productos = Array.isArray(lista.servicios_productos)
    ? lista.servicios_productos
    : [];
  const all = [...ambi, ...productos].filter(Boolean);
  return all.length ? all : null;
}

function normalizePromos(img_tienda) {
  const promos = img_tienda?.lista_img?.promociones || {};
  return Object.entries(promos).map(([id, url], index) => ({
    id,
    url,
    titulo: `Promoción ${index + 1}`,
  }));
}

/* ════════════════════════════════
   NORMALIZAR COMODIDADES
   ════════════════════════════════ */
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

function normalizeAmenities(servicios_comodidades) {
  const result = [];
  (servicios_comodidades || []).forEach((obj) => {
    Object.entries(obj).forEach(([name, enabled]) => {
      if (enabled)
        result.push({ name, icon: AMENITY_ICONS[name.toLowerCase()] || "✅" });
    });
  });
  return result;
}

/* ════════════════════════════════
   HELPER: obtener dimensiones reales de una imagen
   Necesario para que PhotoSwipe no aplaste las fotos
   ════════════════════════════════ */
function getImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1600, h: 1200 }); // fallback seguro
    img.src = src;
  });
}

/* ════════════════════════════════
   GALERÍA PRINCIPAL
   FIX: track con display:flex, slides con min-width:100%
        imágenes con object-fit:cover (sin marco negro)
        dimensiones reales para PhotoSwipe
   ════════════════════════════════ */
let currentSlide = 0,
  totalSlides = 0,
  autoTimer = null,
  touchStartX = 0;

async function buildGallery(images) {
  const track = document.getElementById("track");
  const dots = document.getElementById("dots");
  const gallery = document.getElementById("gallery");

  /* ── FIX 1: el track debe ser flex para que los slides queden en fila ── */
  track.style.cssText = `
    display: flex;
    width: 100%;
    height: 100%;
    transition: transform .45s cubic-bezier(.77,0,.18,1);
    will-change: transform;
  `;

  totalSlides = images.length;

  /* Precargamos dimensiones en paralelo para PhotoSwipe */
  const sizes = await Promise.all(images.map((src) => getImageSize(src)));

  images.forEach((src, i) => {
    const { w, h } = sizes[i];

    /* ── FIX 2: min-width:100% evita que los slides se encojan ── */
    const slide = document.createElement("div");
    slide.className = "slide-placeholder";
    slide.style.cssText = `
      min-width: 100%;
      width: 100%;
      height: 100%;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
      background: #000;
    `;

    const link = document.createElement("a");
    link.href = src;
    link.dataset.pswpWidth = String(w);
    link.dataset.pswpHeight = String(h);
    /* FIX: NO abrir en nueva pestaña, PhotoSwipe intercepta el click */
    link.style.cssText = `
      display: block;
      width: 100%;
      height: 100%;
    `;

    /* ── FIX 3: object-fit:cover llena el espacio sin marco negro ── */
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Imagen ${i + 1}`;
    img.loading = i === 0 ? "eager" : "lazy";
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
      user-select: none;
      -webkit-user-drag: none;
    `;

    link.appendChild(img);
    slide.appendChild(link);
    track.appendChild(slide);

    /* dot */
    const dot = document.createElement("span");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => {
      goSlide(i);
      resetAuto();
    });
    dots.appendChild(dot);
  });

  /* swipe táctil — sólo cuando PhotoSwipe NO está abierto */
  gallery.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );

  gallery.addEventListener(
    "touchend",
    (e) => {
      if (document.querySelector(".pswp--open")) return; // PhotoSwipe abierto → ignorar
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        goSlide(currentSlide + (dx < 0 ? 1 : -1));
        resetAuto();
      }
    },
    { passive: true },
  );

  goSlide(0);
  clearInterval(autoTimer);
  startAuto();
}

function buildGalleryFallback() {
  const track = document.getElementById("track");
  track.style.cssText = "display:flex;width:100%;height:100%;";
  const div = document.createElement("div");
  div.className = "slide-placeholder";
  div.style.cssText =
    "min-width:100%;background:linear-gradient(135deg,#0d0d0d,#1a1a2e);" +
    "display:flex;align-items:center;justify-content:center;font-size:72px;height:100%;";
  div.textContent = "🏪";
  track.appendChild(div);
  totalSlides = 1;
}

function goSlide(n) {
  if (!totalSlides) return;
  currentSlide = ((n % totalSlides) + totalSlides) % totalSlides;
  document.getElementById("track").style.transform =
    `translateX(-${currentSlide * 100}%)`;
  document
    .querySelectorAll(".dot")
    .forEach((d, i) => d.classList.toggle("active", i === currentSlide));
}

function startAuto() {
  clearInterval(autoTimer);
  autoTimer = setInterval(() => goSlide(currentSlide + 1), 4000);
}

function resetAuto() {
  clearInterval(autoTimer);
  startAuto();
}

/* ════════════════════════════════
   PHOTOSWIPE — zoom por librería
   FIX: usa dimensiones reales (cargadas en buildGallery)
        evita navegación nativa del <a>
   ════════════════════════════════ */
function initPhotoSwipe() {
  if (window.__pswpInitialized) return;
  window.__pswpInitialized = true;

  const tryInit = () => {
    if (!window.PhotoSwipeLightbox) {
      setTimeout(tryInit, 80);
      return;
    }

    const lightbox = new window.PhotoSwipeLightbox({
      gallery: "#track",
      children: "a[data-pswp-width]",
      pswpModule: () =>
        import("https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.js"),

      showHideAnimationType: "zoom",
      bgOpacity: 0.96,
      /* sin padding para que la foto ocupe toda la pantalla */
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    /* Pausar autoplay mientras PhotoSwipe está abierto */
    lightbox.on("beforeOpen", () => {
      clearInterval(autoTimer);
      /* evitar que el <a> navegue */
      document
        .getElementById("gallery")
        ?.addEventListener("click", preventGalleryNav, { capture: true });
    });

    lightbox.on("close", () => {
      startAuto(); // reanudar autoplay al cerrar
      document
        .getElementById("gallery")
        ?.removeEventListener("click", preventGalleryNav, { capture: true });
    });

    lightbox.init();
  };

  tryInit();
}

function preventGalleryNav(e) {
  const link = e.target.closest("a[data-pswp-width]");
  if (link) e.preventDefault();
}

/* ════════════════════════════════
   STATUS EN TIEMPO REAL
   ════════════════════════════════ */
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

/* ════════════════════════════════
   HELPERS
   ════════════════════════════════ */
function ocultarNumero(numero) {
  const limpio = numero.replace(/\D/g, "");
  if (limpio.length <= 3) return limpio;
  return limpio.slice(0, 3) + "******";
}

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

/* ════════════════════════════════
   RENDER CONTACTO DETALLADO
   ════════════════════════════════ */
const CONTACT_META = {
  whatsapp: {
    icon: "./img/whatsapp_icon.png",
    getHref: (c) => `https://wa.me/${c.valor.replace(/\D/g, "")}`,
  },
  telefono: {
    icon: "./img/llamada_icon.png",
    getHref: (c) => `tel:${c.valor}`,
  },
  facebook: { icon: "./img/facebook_icon.webp", getHref: (c) => c.valor },
  instagram: { icon: "./img/instagram_icon.webp", getHref: (c) => c.valor },
  tiktok: { icon: "./img/tik_tok_icon.webp", getHref: (c) => c.valor },
  web: { icon: "./img/sitio-web.webp", getHref: (c) => c.valor },
};

function renderContactDetail(contactos) {
  const cd = document.getElementById("contactDetail");

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
      "display:flex;align-items:center;gap:10px;padding:10px 12px;" +
      "border-radius:10px;border:1px solid var(--border);" +
      "background:var(--surface);margin-bottom:8px;";

    wrap.innerHTML = `
      <img src="${meta.icon}" alt="${c.tipo}"
           style="width:16px;height:16px;object-fit:contain;flex-shrink:0;">

      <div style="flex:1;overflow:hidden">
        <div style="
          font-size:11px;
          color:var(--muted);
          text-transform:uppercase;
          letter-spacing:.06em;
          font-weight:600">
          ${c.label}
        </div>

        <div style="
          font-size:14px;
          font-weight:500;
          margin-top:2px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap">
          ${displayVal}
        </div>
      </div>

      <button class="copy-btn"
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
          flex-shrink:0;">
          📋
      </button>

      <a href="${meta.getHref(c)}"
         target="_blank"
         rel="noopener"
         style="
            padding:6px 14px;
            border-radius:99px;
            background:linear-gradient(135deg,#8700F3,#A855F7);
            color:white;
            font-size:12.5px;
            font-weight:700;
            text-decoration:none;
            white-space:nowrap;
            border:1px solid rgba(255,255,255,.06);
            box-shadow:0 0 20px rgba(135,0,243,.28);">
        ir
      </a>
    `;

    cd.appendChild(wrap);
  });

  // COPY
  cd.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copy;

      try {
        await navigator.clipboard.writeText(value);

        btn.textContent = "✅";

        setTimeout(() => {
          btn.textContent = "📋";
        }, 1400);
      } catch {
        const t = document.createElement("textarea");

        t.value = value;

        t.style.position = "fixed";
        t.style.opacity = "0";

        document.body.appendChild(t);

        t.select();

        document.execCommand("copy");

        document.body.removeChild(t);

        btn.textContent = "✅";

        setTimeout(() => {
          btn.textContent = "📋";
        }, 1400);
      }
    });
  });
}
/* ════════════════════════════════
   RENDER COMODIDADES
   ════════════════════════════════ */
function renderAmenities(amenities) {
  const el = document.getElementById("amenitiesGrid");
  if (!el || !amenities.length) return;
  amenities.forEach(({ name, icon }) => {
    const chip = document.createElement("div");
    chip.className = "pay-chip";
    chip.innerHTML = `<span class="pi">${icon}</span> ${name}`;
    el.appendChild(chip);
  });
}

/* ════════════════════════════════
   CARRUSEL DE PROMOCIONES (Firestore)
   ════════════════════════════════ */

/* ════════════════════════════════
   PROMO GALLERY (img_tienda planas)
   ════════════════════════════════ */
function renderPromoGallery(promos, nombreNegocio, contactos) {
  if (!promos.length) return;

  const section = document.getElementById("secPromos");
  const carousel = document.getElementById("promoCarousel");
  section.style.display = "";

  document.getElementById("promoTitle").textContent =
    `Promos de ${nombreNegocio}`;

  const wa = contactos.find((c) => c.tipo === "whatsapp");
  const waNum = wa ? wa.valor.replace(/\D/g, "") : "";

  // Construir la categoría con + en lugar de espacios
  const catFormatted = (_params.subcol || "")
    .toLowerCase()
    .replace(/\s+/g, "+");

  promos.forEach((promo) => {
    // URL base del perfil compartible
    const shareBase = `https://geinztech.com/api/share?t=p&id=${_params.id}&l=${_params.localidad}&c=${catFormatted}&i=${promo.id}`;

    // WhatsApp: texto + URL (sin encodeURIComponent en la URL, wa.me lo maneja)
    const waText = `Hola, quiero esta oferta que vi en su perfil en Geinz: ${shareBase}`;
    const waLink = `https://wa.me/51${waNum}?text=${encodeURIComponent(waText)}`;

    // Compartir: texto descriptivo + URL
    const shareText = `Mira lo que encontre en ${nombreNegocio} 👀🔥\n${shareBase}`;

    const card = document.createElement("div");
    card.className = "promo-card";
    card.innerHTML = `
      <div class="promo-card-img-wrap">
        <img src="${promo.url}" alt="${promo.titulo}" loading="lazy">
        <div class="promo-overlay-actions">
          <a class="promo-btn-wa" href="${waLink}" target="_blank">
            <img src="./img/whatsapp_icon.png" alt="WhatsApp"> WhatsApp
          </a>
          <button class="promo-btn-share"
            data-share-url="${shareBase}"
            data-share-text="${shareText}">
            Compartir
          </button>
        </div>
      </div>`;

    carousel.appendChild(card);
  });

  carousel.querySelectorAll(".promo-btn-share").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.shareUrl;
      const fullText = `Mira lo que encontre en ${nombreNegocio} 👀🔥\n${url}`;

      if (navigator.share) {
        try {
          await navigator.share({
            text: fullText, // ← todo en text, sin title ni url separados
          });
        } catch {}
      } else {
        copyToClipboard(fullText);
      }
    });
  });
}
/* ════════════════════════════════
   RENDER PRINCIPAL
   ════════════════════════════════ */
function render(raw) {
  const nombre = raw.nombre_tienda || raw.nombre || "—";
  const categoria = raw.categoria_tienda || "—";
  const subcategorias = Array.isArray(raw.subcategoria) ? raw.subcategoria : [];
  const descripcion = raw.descripcion || "—";
  const ubicacion = raw.ubicacion || {};
  const horario = normalizeSchedule(raw.horario_atencion);
  const contactos = normalizeContactos(raw.metodo_contacto);
  const pagos = normalizePagos(raw.metodos_pago);
  const images = normalizeImages(raw.img_tienda);
  const promoImages = normalizePromos(raw.img_tienda);
  const targetPromoId = _params.promoIndex;

  let promoExiste = false;

  if (targetPromoId) {
    promoExiste = promoImages.some((p) => p.id == targetPromoId);
  }

  const amenities = normalizeAmenities(raw.servicios_comodidades);

  // Validar datos para cada sección
  const hasDescripcion = descripcion && descripcion !== "—";
  const hasDireccion =
    (ubicacion.dirección && ubicacion.dirección !== "—") ||
    (ubicacion.referencia && ubicacion.referencia !== "—");
  const hasHorario = horario.some((h) => h.apertura !== null);
  const hasContacto = contactos.length > 0;
  const hasPagos = pagos.length > 0;

  // OCULTAR/MOSTRAR SECCIONES según datos disponibles
  toggleSectionVisibility("secDesc", hasDescripcion);
  toggleSectionVisibility("secAddr", hasDireccion);
  toggleSectionVisibility("secSchedule", hasHorario);
  toggleSectionVisibility("secContact", hasContacto);
  toggleSectionVisibility("secPay", hasPagos);

  const routeBtn = document.getElementById("routeBtn");
  const shareBtn = document.getElementById("shareBtn");

  if (shareBtn) {
    shareBtn.onclick = () => {
      const cat = (raw.categoria_tienda || "")
        .toLowerCase()
        .replace(/\s+/g, "+");
      const shareUrl = `https://geinztech.com/api/share?t=ti&id=${raw.id}&l=${_params.localidad}&c=${cat}`;
      const fullText = `Mira ${nombre} en Geinz 🔥\n${shareUrl}`;

      if (navigator.share) {
        navigator
          .share({ text: fullText })
          .catch(() => copyToClipboard(fullText));
      } else {
        copyToClipboard(fullText);
      }
    };
  }

  document.getElementById("refText").textContent = ubicacion.referencia || "—";

  if (routeBtn) {
    routeBtn.onclick = () => {
      const lat = ubicacion.latitud;
      const lng = ubicacion.longitud;
      if (!lat || !lng) {
        showToast("Ubicación no disponible");
        return;
      }
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      window.open(mapsUrl, "_blank");
    };
  }

  document.getElementById("bizName").textContent = nombre;
  document.title = nombre;

  const logoUrl = raw.img_tienda?.logo_tienda || null;
  const bizLogoEl = document.getElementById("bizLogo");
  const bizLogoPlaceholder = document.getElementById("bizLogoPlaceholder");
  if (bizLogoEl) {
    if (logoUrl) {
      bizLogoEl.src = logoUrl;
      bizLogoEl.style.display = "block";
      if (bizLogoPlaceholder) bizLogoPlaceholder.style.display = "none";
    } else {
      bizLogoEl.style.display = "none";
      if (bizLogoPlaceholder) bizLogoPlaceholder.style.display = "flex";
    }
  }

  document.getElementById("cats").innerHTML = `
    <span class="tag cat">${categoria}</span>
    ${subcategorias.map((s) => `<span class="tag sub">${s}</span>`).join("")}`;

  calcStatus(horario);
  setInterval(() => calcStatus(horario), 30_000);

  document.getElementById("descText").textContent = descripcion;
  document.getElementById("addrText").textContent = ubicacion.dirección || "—";
  document.getElementById("refText").textContent = ubicacion.referencia || "—";

  // Solo renderizar horario si tiene datos
  if (hasHorario) {
    const grid = document.getElementById("schedGrid");
    grid.innerHTML = ""; // Limpiar antes de renderizar
    const todayIdx = [6, 0, 1, 2, 3, 4, 5][new Date().getDay()];
    horario.forEach((h, i) => {
      const div = document.createElement("div");
      div.className = "sched-row" + (i === todayIdx ? " today" : "");
      div.innerHTML = h.apertura
        ? `<span class="day-name">${h.dia}</span><span class="hours">${h.apertura} – ${h.cierre}</span>`
        : `<span class="day-name">${h.dia}</span><span class="closed-day">Cerrado</span>`;
      grid.appendChild(div);
    });
  }

  // Solo renderizar contactos si tiene datos
  if (hasContacto) {
    renderContactDetail(contactos);
  }

  // Solo renderizar pagos si tiene datos
  if (hasPagos) {
    const payGrid = document.getElementById("payGrid");
    payGrid.innerHTML = ""; // Limpiar antes de renderizar
    pagos.forEach(({ label, icon }) => {
      const chip = document.createElement("div");
      chip.className = "pay-chip";
      chip.innerHTML = `
        <img src="${icon}" alt="${label}"
             style="width:16px;height:16px;object-fit:contain;margin-right:6px;vertical-align:middle;">
        ${label}`;
      payGrid.appendChild(chip);
    });
  }

  renderAmenities(amenities);

  /* Galería — buildGallery es async por getImageSize */
  if (images && images.length) {
    buildGallery(images).then(() => initPhotoSwipe());
  } else {
    buildGalleryFallback();
  }

  if (promoImages.length) {
    renderPromoGallery(promoImages, nombre, contactos);
  }
  if (promoExiste) {
    setTimeout(() => {
      const sec = document.getElementById("secPromos");

      if (sec) {
        sec.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        sec.classList.add("promo-highlight");

        setTimeout(() => {
          sec.classList.remove("promo-highlight");
        }, 2600);
      }
    }, 700);
  }
}

/* ════════════════════════════════
   ACCORDIONS
   ════════════════════════════════ */
function toggleSection(id) {
  const sec = document.getElementById(id);
  if (!sec) return;
  sec.classList.toggle("expanded"); // ← solo toggle del que se clickea, sin cerrar los demás
}
function bindAccordions() {
  document.querySelectorAll(".section-header").forEach((header) => {
    if (header.dataset.binded) return;

    header.dataset.binded = "true";

    header.style.cursor = "pointer";

    header.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      const section = this.closest(".section");

      if (!section) return;

      section.classList.toggle("expanded");
    });
  });
}

window.toggleSection = toggleSection;

/* ════════════════════════════════
   INIT
   ════════════════════════════════ */
/* ════════════════════════════════
   INIT
   ════════════════════════════════ */
let _params = {};
(async () => {
  showBizLoader();

  const params = getParams();
  _params = params;
  try {
    // cargar negocio
    const biz = await loadBusiness(params);

    // limpiar y renderizar
    resetBusinessUI();

    // ESPERAR TODO
    await render(biz);

    bindAccordions();

    // realtime después del primer render
    listenBusinessRealtime(params);

    // ocultar recién cuando TODO terminó
    hideBizLoader();
  } catch (err) {
    console.error(err);

    hideBizLoader();

    document.getElementById("bizName").textContent = "Error al cargar";

    document.getElementById("statusText").textContent = err.message;
  }
})();






/* ── CSS DE ESTADOS (inyectado dinámicamente) ── */
const STATE_CSS = `
 
  /* ════════════════════════════════
     PANTALLA BASE
  ════════════════════════════════ */
  .state-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #08080a;
    display: flex;
    flex-direction: column;
    animation: fadeInState .25s ease both;
    overflow: hidden;
  }
 
  @keyframes fadeInState {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
 
  /* ════════════════════════════════
     SHIMMER — ESTRUCTURA FULL GRID
     Replica exacta del shell real:
     desktop = 2 cols, mobile = 1 col
  ════════════════════════════════ */
  .state-screen.loading {
    display: grid;
    grid-template-columns: 1.1fr .9fr;
    min-height: 100vh;
  }
 
  /* ── LADO IZQUIERDO: bloque imagen ── */
  .sk-img-col {
    position: relative;
    background: #0f0f12;
    overflow: hidden;
  }
 
  /* ── LADO DERECHO: contenido ── */
  .sk-body-col {
    padding: 56px 52px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
    background: #09090b;
    border-left: 1px solid rgba(255,255,255,.04);
  }
 
  /* ── NEGOCIO ROW ── */
  .sk-biz {
    display: flex;
    align-items: center;
    gap: 14px;
  }
 
  .sk-avatar {
    width: 58px;
    height: 58px;
    min-width: 58px;
    border-radius: 20px;
    background: #16161a;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }
 
  .sk-biz-lines {
    display: flex;
    flex-direction: column;
    gap: 9px;
    flex: 1;
  }
 
  /* ── TÍTULO ── */
  .sk-title-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
 
  /* ── DESCRIPCIÓN ── */
  .sk-desc-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
 
  /* ── PÍLDORA DÍAS ── */
  .sk-pill {
    width: 140px;
    height: 40px;
    border-radius: 999px;
    background: #16161a;
    position: relative;
    overflow: hidden;
  }
 
  /* ── BOTÓN ── */
  .sk-btn {
    height: 62px;
    border-radius: 18px;
    background: #16161a;
    position: relative;
    overflow: hidden;
  }
 
  /* ── SHARE ROW ── */
  .sk-share {
    display: flex;
    align-items: center;
    gap: 14px;
  }
 
  .sk-share-line {
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,.05);
  }
 
  .sk-share-pill {
    width: 120px;
    height: 44px;
    border-radius: 999px;
    background: #16161a;
    position: relative;
    overflow: hidden;
  }
 
  /* ── BASE LINE SHIMMER ── */
  .sh {
    background: #16161a;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }
 
  .sh.r-full { border-radius: 999px; }
 
  /* ── SHIMMER SWEEP (plateado puro, sin color) ── */
  .sk-img-col::after,
  .sh::after,
  .sk-avatar::after,
  .sk-pill::after,
  .sk-btn::after,
  .sk-share-pill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent       0%,
      transparent      35%,
      rgba(255,255,255,.035) 45%,
      rgba(255,255,255,.07)  50%,
      rgba(255,255,255,.035) 55%,
      transparent      65%,
      transparent     100%
    );
    background-size: 250% 100%;
    animation: sk-sweep 1.8s ease-in-out infinite;
  }
 
  /* Delays escalonados para sensación orgánica */
  .sk-avatar::after          { animation-delay: 0s; }
  .sk-biz-lines .sh:first-child::after { animation-delay: .1s; }
  .sk-biz-lines .sh:last-child::after  { animation-delay: .2s; }
  .sk-title-group .sh:first-child::after { animation-delay: .05s; }
  .sk-title-group .sh:last-child::after  { animation-delay: .15s; }
  .sk-btn::after             { animation-delay: .25s; }
  .sk-img-col::after         { animation-delay: .08s; }
 
  @keyframes sk-sweep {
    0%   { background-position: 120% 0; }
    100% { background-position: -120% 0; }
  }
 
  /* ── LOGO GEINZ ── */
  .loading-logo {
    position: fixed;
    top: 36px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .25em;
    color: rgba(255,255,255,.18);
    z-index: 10000;
    font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    pointer-events: none;
  }
 
  /* ── OCULTAR CONTENIDO REAL MIENTRAS CARGA ── */
  .shell.is-loading > * {
    visibility: hidden;
  }
 
  /* ── REVEAL ANIMATION ── */
  @keyframes contentReveal {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
 
  .shell.revealed .promo-img-wrap {
    animation: contentReveal .45s cubic-bezier(0.16,1,0.3,1) both;
  }
 
  .shell.revealed .body {
    animation: contentReveal .45s cubic-bezier(0.16,1,0.3,1) .06s both;
  }
 
  /* ════════════════════════════════
     ESTADOS: EXPIRED / DELETED
     Pantalla completa centrada
  ════════════════════════════════ */
  .state-screen.state-full {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    gap: 0;
  }
 
  /* Glow de fondo suave */
  .state-full::before {
    content: '';
    position: absolute;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    filter: blur(140px);
    opacity: .12;
    pointer-events: none;
  }
 
  .state-full.expired::before  { background: #fbbf24; }
  .state-full.deleted::before  { background: #ef4444; }
 
  /* Icono grande */
  .state-icon {
    width: 96px;
    height: 96px;
    border-radius: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    margin-bottom: 28px;
    position: relative;
    z-index: 1;
  }
 
  .state-icon.expired {
    background: rgba(251,191,36,.06);
    border: 1px solid rgba(251,191,36,.15);
    box-shadow: 0 0 60px rgba(251,191,36,.08), inset 0 1px 0 rgba(255,255,255,.04);
  }
 
  .state-icon.deleted {
    background: rgba(239,68,68,.06);
    border: 1px solid rgba(239,68,68,.15);
    box-shadow: 0 0 60px rgba(239,68,68,.08), inset 0 1px 0 rgba(255,255,255,.04);
  }
 
  .state-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    padding: 7px 16px;
    border-radius: 999px;
    margin-bottom: 20px;
    position: relative;
    z-index: 1;
  }
 
  .state-badge.expired {
    background: rgba(251,191,36,.07);
    color: #fbbf24;
    border: 1px solid rgba(251,191,36,.18);
  }
 
  .state-badge.deleted {
    background: rgba(239,68,68,.07);
    color: #f87171;
    border: 1px solid rgba(239,68,68,.18);
  }
 
  .state-title {
    font-size: clamp(22px, 4vw, 28px);
    font-weight: 800;
    color: #f4f4f5;
    margin-bottom: 12px;
    text-align: center;
    letter-spacing: -.03em;
    line-height: 1.1;
    position: relative;
    z-index: 1;
  }
 
  .state-sub {
    font-size: 15px;
    color: #71717a;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 36px;
    max-width: 320px;
    position: relative;
    z-index: 1;
  }
 
  .state-back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #ffffff;
    border: none;
    color: #000;
    font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 700;
    border-radius: 999px;
    padding: 14px 28px;
    cursor: pointer;
    transition: transform .2s ease, box-shadow .2s ease;
    position: relative;
    z-index: 1;
  }
 
  .state-back-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 30px rgba(255,255,255,.12);
  }
 
  .state-back-btn:active {
    transform: translateY(0);
  }
 
  /* ════════════════════════════════
     RESPONSIVE SKELETON
  ════════════════════════════════ */
  @media (max-width: 768px) {
 
    .state-screen.loading {
      grid-template-columns: 1fr;
      grid-template-rows: 44svh 1fr;
    }
 
    .sk-body-col {
      padding: 28px 20px 40px;
      gap: 22px;
      border-left: none;
      border-top: 1px solid rgba(255,255,255,.04);
    }
 
    .sk-avatar {
      width: 48px;
      height: 48px;
      min-width: 48px;
      border-radius: 16px;
    }
 
    .sk-btn { height: 56px; border-radius: 16px; }
 
    .loading-logo { top: 24px; font-size: 12px; }
  }
 
  @media (max-width: 400px) {
    .sk-body-col { padding: 22px 16px 36px; }
  }
`;
function injectCSS(css) {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

/* ── SHIMMER SKELETON ── */

function showLoading() {
  injectCSS(STATE_CSS);

  /* Logo GEINZ flotante */
  const logo = document.createElement("div");
  logo.className = "loading-logo";

  document.body.appendChild(logo);

  /* Skeleton — replica el grid del shell */
  const screen = document.createElement("div");
  screen.className = "state-screen loading";
  screen.id = "stateScreen";
  screen.innerHTML = `
 
    <!-- Columna imagen -->
    <div class="sk-img-col"></div>
 
    <!-- Columna contenido -->
    <div class="sk-body-col">
 
      <!-- Negocio -->
      <div class="sk-biz">
        <div class="sk-avatar"></div>
        <div class="sk-biz-lines">
          <div class="sh r-full" style="height:14px;width:52%"></div>
          <div class="sh r-full" style="height:10px;width:32%"></div>
        </div>
        <div class="sh r-full" style="height:36px;width:100px;flex-shrink:0"></div>
      </div>
 
      <!-- Título -->
      <div class="sk-title-group">
        <div class="sh" style="height:26px;width:95%;border-radius:10px"></div>
        <div class="sh" style="height:26px;width:72%;border-radius:10px"></div>
        <div class="sh" style="height:26px;width:48%;border-radius:10px"></div>
      </div>
 
      <!-- Descripción -->
      <div class="sk-desc-group">
        <div class="sh r-full" style="height:12px;width:100%"></div>
        <div class="sh r-full" style="height:12px;width:88%"></div>
        <div class="sh r-full" style="height:12px;width:60%"></div>
      </div>
 
      <!-- Píldora días -->
      <div class="sk-pill"></div>
 
      <!-- Divider -->
      <div style="height:1px;background:rgba(255,255,255,.04)"></div>
 
      <!-- Botón -->
      <div class="sk-btn"></div>
 
      <!-- Share row -->
      <div class="sk-share">
        <div class="sh r-full" style="height:10px;width:60px"></div>
        <div class="sk-share-line"></div>
        <div class="sk-share-pill"></div>
      </div>
 
    </div>
  `;

  document.body.appendChild(screen);
}

function hideLoading() {
  const logo = document.querySelector(".loading-logo");
  if (logo) logo.remove();

  const screen = document.getElementById("stateScreen");
  if (screen) {
    screen.style.transition = "opacity .4s ease";
    screen.style.opacity = "0";
    setTimeout(() => screen.remove(), 400);
  }

  setTimeout(
    () => document.querySelector(".shell")?.classList.add("revealed"),
    350,
  );
}
/* ── ESTADO VENCIDO ── */
function showExpired() {
  const screen = document.getElementById("stateScreen");
  if (screen) screen.remove();
  const logo = document.querySelector(".loading-logo");
  if (logo) logo.remove();

  const s = document.createElement("div");
  s.className = "state-screen state-full expired";
  s.innerHTML = `
    <div class="state-icon expired">⏰</div>
    <div class="state-badge expired">Promoción vencida</div>
    <div class="state-title">Esta promo ya terminó</div>
    <div class="state-sub">El tiempo de esta oferta ha expirado.<br>Descubre más promos vigentes en Geinz.</div>
    <button class="state-back-btn" onclick="history.back()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Volver
    </button>`;
  document.body.appendChild(s);
}

/* ── ESTADO ELIMINADO / NO EXISTE ── */
function showDeleted(isDeleted = false) {
  const screen = document.getElementById("stateScreen");
  if (screen) screen.remove();
  const logo = document.querySelector(".loading-logo");
  if (logo) logo.remove();

  const s = document.createElement("div");
  s.className = "state-screen state-full deleted";
  s.innerHTML = `
    <div class="state-icon deleted">${isDeleted ? "🗑️" : "🔍"}</div>
    <div class="state-badge deleted">${isDeleted ? "Eliminada" : "No encontrada"}</div>
    <div class="state-title">Esta promo ya no existe</div>
    <div class="state-sub">${
      isDeleted
        ? "El negocio ha eliminado esta promoción."
        : "No encontramos esta promoción en nuestro sistema."
    }<br>Busca otras ofertas en Geinz.</div>
    <button class="state-back-btn" onclick="history.back()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Volver
    </button>`;
  document.body.appendChild(s);
}

/* ════════════════════════════════
   FIREBASE — mismo proyecto
   ════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
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
   ?localidad=barranca&id=yHA8BOswrDpnMyN26dYw
   ════════════════════════════════ */
function getParams() {
  const p = new URLSearchParams(window.location.search);

  return {
    localidad: p.get("localidad") || p.get("l") || "barranca",

    id: p.get("id") || p.get("pi") || "k8TFjbHn9x6rZ9PizMQv",
  };
}

/* ════════════════════════════════
   DÍAS RESTANTES
   ════════════════════════════════ */
function calcDaysLeft(datos) {
  if (!datos?.timestamp_fin) return null;
  const fin = datos.timestamp_fin?.toDate
    ? datos.timestamp_fin.toDate()
    : new Date(datos.timestamp_fin);
  const diff = Math.ceil((fin - Date.now()) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/* ════════════════════════════════
   PHOTOSWIPE GALLERY SETUP
   ════════════════════════════════ */
let currentImgIndex = 0;
let galleryImages = [];

function setupGallery(images) {
  galleryImages = images;
  const imgWrap = document.querySelector(".promo-img-wrap");
  if (!imgWrap || !images.length) return;

  // Limpiar contenido previo
  imgWrap.innerHTML = "";

  // Crear imagen principal
  const img = document.createElement("img");
  img.className = "promo-img";
  img.src = images[0];
  img.alt = "Promoción";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
  imgWrap.appendChild(img);

  // Si solo hay 1 imagen, solo permitir zoom al hacer clic
  if (images.length <= 1) {
    imgWrap.style.cursor = "zoom-in";

    img.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPhotoSwipe(0);
    });

    img.addEventListener("mouseleave", () => {
      imgWrap.style.cursor = "zoom-in";
    });

    return;
  }

  // Cursor normal para galerías múltiples
  imgWrap.style.cursor = "default";

  // Contador
  const counter = document.createElement("div");
  counter.className = "img-counter";
  counter.textContent = `1 / ${images.length}`;
  imgWrap.appendChild(counter);

  // Dots
  const dots = document.createElement("div");
  dots.className = "img-dots";
  images.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = `img-dot${i === 0 ? " active" : ""}`;
    dot.dataset.index = i;
    dots.appendChild(dot);
  });
  imgWrap.appendChild(dots);

  // Flechas
  const prevBtn = document.createElement("button");
  prevBtn.className = "img-nav prev";
  prevBtn.innerHTML = "‹";
  prevBtn.setAttribute("aria-label", "Anterior");
  imgWrap.appendChild(prevBtn);

  const nextBtn = document.createElement("button");
  nextBtn.className = "img-nav next";
  nextBtn.innerHTML = "›";
  nextBtn.setAttribute("aria-label", "Siguiente");
  imgWrap.appendChild(nextBtn);

  // Actualizar vista
  function updateView(index) {
    currentImgIndex = index;
    img.src = images[index];
    counter.textContent = `${index + 1} / ${images.length}`;

    dots.querySelectorAll(".img-dot").forEach((d, i) => {
      d.classList.toggle("active", i === index);
    });

    prevBtn.classList.toggle("hidden", index === 0);
    nextBtn.classList.toggle("hidden", index === images.length - 1);
  }

  // Eventos de flechas
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentImgIndex > 0) updateView(currentImgIndex - 1);
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentImgIndex < images.length - 1) updateView(currentImgIndex + 1);
  });

  // Click en imagen abre PhotoSwipe en la posición actual
  img.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPhotoSwipe(currentImgIndex);
  });

  // Swipe táctil para móvil
  let touchStartX = 0;
  let touchEndX = 0;

  imgWrap.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true },
  );

  imgWrap.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentImgIndex < images.length - 1) {
        updateView(currentImgIndex + 1);
      } else if (diff < 0 && currentImgIndex > 0) {
        updateView(currentImgIndex - 1);
      }
    }
  });

  updateView(0);
}

async function openPhotoSwipe(index) {
  if (!galleryImages.length) return;

  const PhotoSwipeModule =
    await import("https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.js");
  const PhotoSwipeLightboxModule =
    await import("https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.js");

  // Cargar dimensiones reales de cada imagen
  const dataSource = await Promise.all(
    galleryImages.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({ src, w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ src, w: 1600, h: 1200 }); // fallback si falla
          img.src = src;
        }),
    ),
  );

  const pswp = new PhotoSwipeModule.default({
    dataSource: dataSource,
    index: index,
    pswpModule: PhotoSwipeModule,
    bgOpacity: 0.98,
    showHideAnimationType: "zoom",
    allowPanToNext: true,
  });

  pswp.init();
}

/* ════════════════════════════════
   RENDER
   ════════════════════════════════ */
function render(data) {
  const info = data.informacion || {};
  const img = data.img_container || {};
  const msgs = data.mensaje_predeterminado || {};
  const datos = data.datos_hora_fecha || {};

  /* ── GALERÍA DE IMÁGENES ── */
  const images = img.lista_img || [];
  if (images.length > 0) {
    setupGallery(images);
  }

  /* ── BADGE DESCUENTO ── */
  const badge = document.querySelector(".badge-pct");
  if (badge) {
    const rango = data.rango_establecido;
    badge.textContent = rango ? `${rango}% Dscto` : "";
    if (!rango) badge.style.display = "none";
  }

  /* ── LOGO / AVATAR DEL NEGOCIO ── */
  const avatar = document.querySelector(".biz-avatar");
  if (avatar && img.logo_img) {
    const logoEl = document.createElement("img");
    logoEl.src = img.logo_img;
    logoEl.alt = info.nombre_tienda || "";
    logoEl.style.cssText =
      "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
    avatar.textContent = "";
    avatar.appendChild(logoEl);
  } else if (avatar) {
    avatar.textContent = (info.nombre_tienda || "?")[0].toUpperCase();
  }

  /* ── NOMBRE NEGOCIO ── */
  const bizName = document.querySelector(".biz-name");
  if (bizName) bizName.textContent = info.nombre_tienda || "—";

  /* ── META ── */
  const bizMeta = document.querySelector(".biz-meta");
  if (bizMeta)
    bizMeta.textContent = `Solo publicaciones de ${info.nombre_tienda || "este negocio"}`;

  /* ── TÍTULO ── */
  const title = document.querySelector(".promo-title");
  if (title) title.textContent = info.titulo || "—";

  /* ── DESCRIPCIÓN ── */
  const desc = document.querySelector(".promo-desc");
  if (desc) desc.textContent = info.descripcion || "—";

  /* ── DÍAS RESTANTES ── */
  const daysRow = document.querySelector(".days-row");
  if (daysRow) {
    const days = calcDaysLeft(datos);
    if (days === null) {
      daysRow.style.display = "none";
    } else if (days === 0) {
      daysRow.innerHTML = `<div class="days-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;"></div> ¡Último día!`;
      daysRow.style.background = "rgba(239,68,68,.15)";
      daysRow.style.border = "1px solid rgba(239,68,68,.35)";
      daysRow.style.color = "#fca5a5";
    } else if (days <= 2) {
      daysRow.innerHTML = `<div class="days-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;animation:blink 1s ease-in-out infinite;"></div> ${days} día${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`;
      daysRow.style.background = "rgba(239,68,68,.12)";
      daysRow.style.border = "1px solid rgba(239,68,68,.3)";
      daysRow.style.color = "#fca5a5";
    } else if (days <= 5) {
      daysRow.innerHTML = `<div class="days-dot" style="background:#f59e0b;box-shadow:0 0 6px #f59e0b;"></div> ${days} días restantes`;
      daysRow.style.background = "rgba(245,158,11,.12)";
      daysRow.style.border = "1px solid rgba(245,158,11,.3)";
      daysRow.style.color = "#fcd34d";
    } else {
      daysRow.innerHTML = `<div class="days-dot" style="background:#10b981;box-shadow:0 0 6px #10b981;"></div> ${days} días restantes`;
      daysRow.style.background = "rgba(16,185,129,.1)";
      daysRow.style.border = "1px solid rgba(16,185,129,.25)";
      daysRow.style.color = "#6ee7b7";
    }
  }

  /* ── BOTÓN WHATSAPP ── */
  const btnWa = document.querySelector(".btn-wa");
  if (btnWa) {
    const numero = info.numero?.replace(/\D/g, "");
    const msjeWa =
      msgs.whatsapp?.msje_predermindo ||
      "Hola, quiero esta oferta que vi en Geinz:";
    // URL de contacto: usa la localidad completa (ej: "barranca")
    const linkWa = `https://geinzworkapp.web.app/api/share?t=prms&l=${window._localidad}&pi=${data.id}`;
    const texto = encodeURIComponent(`${msjeWa} ${linkWa}`);

    if (info.contactar && numero) {
      btnWa.href = `https://wa.me/51${numero}?text=${texto}`;
      btnWa.style.display = "";
    } else {
      btnWa.style.display = "none";
    }
  }

  /* ── BOTÓN COMPARTIR ── */
  const shareText =
    msgs.compartir?.msje_predermindo || "Mira esta promo en Geinz ❤️‍🔥";

  console.log("════════════════════════════");
  console.log("🚀 CONFIG SHARE PROMO");
  console.log("📝 shareText =", shareText);

  // URL de compartir: usa "ba" como localidad corta

  const shareLink = `https://geinzworkapp.web.app/api/share?t=prms&l=${window._localidad}&pi=${data.id}`;

  console.log("🔗 shareLink =", shareLink);
  console.log("🆔 promoId =", data.id);

  window._shareTitle = shareText;
  window._shareUrl = shareLink;

  console.log("💾 window._shareTitle =", window._shareTitle);
  console.log("💾 window._shareUrl =", window._shareUrl);

  console.log("📤 info.compartir =", info.compartir);

  if (!info.compartir) {
    console.log("⛔ Compartir desactivado → ocultando botones");

    document
      .querySelectorAll(".btn-share, .icon-btn, .btn-share-pill")
      .forEach((b, index) => {
        console.log(`🙈 Ocultando botón share #${index}`);

        b.style.display = "none";
      });
  } else {
    console.log("✅ Compartir habilitado");
  }

  /* ── TÍTULO DE PÁGINA ── */

  document.title = `${info.nombre_tienda || "Promo"} — Geinz`;

  console.log("📄 document.title =", document.title);
  console.log("🏪 nombre_tienda =", info.nombre_tienda);
  console.log("════════════════════════════");

  /* ── PERFIL NEGOCIO CLICK ── */
  const bizWrap =
    document.querySelector(".biz") ||
    document.querySelector(".biz-row") ||
    document.querySelector(".biz-info-wrap");

  // 👇 ID tienda
  const idTienda =
    info.id_tienda || data.id_tienda || info.id || data.id_negocio || "";

  // 👇 categoría tienda
  const categoriaTienda =
    info.categoria || info.cat || data.categoria || data.cat || "general";

  // 👇 localidad
  const localidadTienda = window._localidad || "barranca";

  // 👇 convertir espacios a +
  const categoriaFinal = encodeURIComponent(categoriaTienda).replace(
    /%20/g,
    "+",
  );

  // 👇 URL PERFIL
  const perfilUrl = `https://geinzworkapp.web.app/api/share?t=ti&id=${idTienda}&l=${localidadTienda}&c=${categoriaFinal}`;

  console.log("🏪 PERFIL URL:", perfilUrl);

  // 👇 hacer clickeable
  if (bizWrap && idTienda) {
    bizWrap.style.cursor = "pointer";

    bizWrap.addEventListener("click", () => {
      console.log("🚀 Abriendo perfil tienda");

      window.location.href = perfilUrl;
    });
  }
}

/* ════════════════════════════════
   SHARE  (expuesto globalmente para el onclick del HTML)
   ════════════════════════════════ */
function handleShare() {
  const url = window._shareUrl || window.location.href;
  const text = window._shareTitle || "Mira esta promo en Geinz ❤️‍🔥";

  if (navigator.share) {
    navigator
      .share({
        // ✅ Combinar texto + url en "text", no en "title"
        text: `${text}\n${url}`,
      })
      .catch(() => copy(`${text}\n${url}`));
  } else {
    copy(`${text}\n${url}`);
  }
}

function copy(txt) {
  const contenido = txt || `${window._shareTitle}\n${window._shareUrl}`;
  navigator.clipboard
    .writeText(contenido)
    .then(showToast)
    .catch(() => {
      const t = document.createElement("textarea");
      t.value = contenido;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
      showToast();
    });
}
function showToast() {
  const el = document.getElementById("toast");
  if (!el) return;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

/* Exponer al scope global (onclick en HTML) */
window.handleShare = handleShare;

/* ════════════════════════════════
   VERIFICAR VENCIMIENTO
   ════════════════════════════════ */
function isExpired(data) {
  if (data.estado === "vencido" || data.estado === "expirado") return true;
  if (data.datos_hora_fecha?.activo === false) return true;
  const tsf = data.datos_hora_fecha?.timestamp_fin;
  if (tsf) {
    const fin = tsf?.toDate ? tsf.toDate() : new Date(tsf);
    if (!isNaN(fin) && fin < new Date()) return true;
  }
  return false;
}

function isDeleted(data) {
  return data.estado === "eliminado" || data.eliminado === true;
}

/* ════════════════════════════════
   INIT
   ════════════════════════════════ */
(async () => {
  showLoading();
  const params = getParams();
  try {
    const snap_ref = doc(
      db,
      "Tiendas",
      params.localidad,
      "promos_ofertas",
      params.id,
    );
    const snap = await getDoc(snap_ref);

    /* ── NO EXISTE ── */
    if (!snap.exists()) {
      showDeleted(false);
      return;
    }

    const promo = { id: snap.id, ...snap.data() };

    /* ── ELIMINADA ── */
    if (isDeleted(promo)) {
      showDeleted(true);
      return;
    }

    /* ── VENCIDA ── */
    if (isExpired(promo)) {
      showExpired();
      return;
    }

    /* ── DISPONIBLE ── */
    window._localidad = params.localidad; // ← disponible en render()
    render(promo);
    hideLoading();
  } catch (err) {
    console.error("Error cargando promo:", err);
    showDeleted(false);
  }
})();

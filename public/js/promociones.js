/* ════════════════════════════════
   ESTADOS: loading | available | expired | deleted
   ════════════════════════════════ */

/* ── CSS DE ESTADOS (inyectado dinámicamente) ── */
const STATE_CSS = `
  /* ── PANTALLA DE ESTADO FULLSCREEN ── */
  .state-screen {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #07050e;
    gap: 0;
    animation: fadeInState .3s ease both;
  }
  @keyframes fadeInState { from{opacity:0;} to{opacity:1;} }

  /* ── SHIMMER LOADING ── */
  .state-screen.loading {
    gap: 0;
  }
  .shimmer-wrap {
    width: 100%; max-width: 540px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .shimmer-img {
    width: 100%; aspect-ratio: 16/9;
    background: #1a1228;
    position: relative; overflow: hidden;
    flex-shrink: 0;
  }
  .shimmer-body { padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; }
  .shimmer-biz  { display: flex; align-items: center; gap: 12px; }
  .shimmer-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: #1a1228; flex-shrink: 0;
  }
  .shimmer-biz-info { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .sh-line {
    background: #1a1228; border-radius: 6px;
    position: relative; overflow: hidden;
  }
  .sh-line::after, .shimmer-img::after, .shimmer-avatar::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(130,70,240,.18) 40%,
      rgba(160,100,255,.28) 50%,
      rgba(130,70,240,.18) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer-move 1.6s ease-in-out infinite;
  }
  @keyframes shimmer-move {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .sh-l1 { height: 16px; width: 55%; }
  .sh-l2 { height: 12px; width: 38%; }
  .sh-title1 { height: 22px; width: 90%; }
  .sh-title2 { height: 22px; width: 70%; }
  .sh-desc1  { height: 13px; width: 100%; }
  .sh-desc2  { height: 13px; width: 82%; }
  .sh-desc3  { height: 13px; width: 60%; }
  .sh-pill   { height: 28px; width: 130px; border-radius: 99px; }
  .sh-btn    { height: 50px; width: 100%; border-radius: 14px; }

  /* logo GEINZ centrado sobre el shimmer */
  .loading-logo {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10000;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: clamp(26px, 7vw, 36px);
    font-weight: 700;
    letter-spacing: 6px;
    color: transparent;
    background: linear-gradient(120deg, #7c3aed, #bf97fb, #c026d3, #7c3aed);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    animation: logo-shift 2.4s ease-in-out infinite;
    user-select: none;
    text-shadow: none;
  }
  @keyframes logo-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
  }

  /* ── ESTADO VENCIDO ── */
  .state-icon {
    width: 80px; height: 80px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 38px; margin-bottom: 24px;
  }
  .state-icon.expired  { background: rgba(234,179,8,.1);  border: 1px solid rgba(234,179,8,.25); }
  .state-icon.deleted  { background: rgba(239,68,68,.1);  border: 1px solid rgba(239,68,68,.25); }
  .state-title {
    font-family: 'Fraunces', serif;
    font-size: clamp(22px, 5vw, 28px);
    font-weight: 400;
    color: #ede8ff;
    margin-bottom: 10px;
    text-align: center;
    padding: 0 24px;
  }
  .state-sub {
    font-size: 14px; color: #5c5070;
    text-align: center; line-height: 1.6;
    padding: 0 32px;
    margin-bottom: 32px;
  }
  .state-badge {
    font-size: 12px; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase;
    padding: 6px 18px; border-radius: 99px;
    margin-bottom: 36px;
  }
  .state-badge.expired { background: rgba(234,179,8,.12); color: #fbbf24; border: 1px solid rgba(234,179,8,.3); }
  .state-badge.deleted { background: rgba(239,68,68,.12);  color: #f87171; border: 1px solid rgba(239,68,68,.3); }
  .state-back-btn {
    display: flex; align-items: center; gap: 8px;
    background: rgba(124,58,237,.12);
    border: 1px solid rgba(124,58,237,.3);
    color: #bf97fb;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; font-weight: 600;
    border-radius: 99px; padding: 11px 24px;
    cursor: pointer;
    transition: all .25s;
  }
  .state-back-btn:hover { background: rgba(124,58,237,.22); }

  /* content hidden while loading */
  .shell.is-loading > *:not(.state-screen) { visibility: hidden; }

  /* fade in content */
  @keyframes contentReveal { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
  .shell.revealed .promo-img-wrap,
  .shell.revealed .body {
    animation: contentReveal .5s ease both;
  }
  .shell.revealed .body { animation-delay: .1s; }

  /* ── PHOTOSWIPE GALLERY ── */
  .promo-img-wrap {
    cursor: pointer;
    transition: opacity .2s;
  }
  .promo-img-wrap:hover {
    opacity: .92;
  }

  .img-counter {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 3;
    background: rgba(7,5,14,.75);
    backdrop-filter: blur(8px);
    color: #ede8ff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 99px;
    border: 1px solid rgba(255,255,255,.1);
    pointer-events: none;
  }

  .img-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(7,5,14,.6);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,.12);
    color: #ede8ff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all .2s;
    font-size: 18px;
    line-height: 1;
  }
  .img-nav:hover {
    background: rgba(124,58,237,.3);
    border-color: rgba(124,58,237,.4);
  }
  .img-nav.prev { left: 10px; }
  .img-nav.next { right: 10px; }
  .img-nav.hidden { display: none; }

  .img-dots {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    gap: 5px;
    pointer-events: none;
  }
  .img-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,.35);
    transition: all .25s;
  }
  .img-dot.active {
    background: #bf97fb;
    box-shadow: 0 0 6px rgba(124,58,237,.6);
    width: 16px;
    border-radius: 99px;
  }

  .pswp {
    --pswp-bg: #07050e;
  }
`;

function injectCSS(css) {
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

/* ── SHIMMER SKELETON ── */
function showLoading() {
  injectCSS(STATE_CSS);

  /* Logo GEINZ flotante */
  const logo = document.createElement('div');
  logo.className = 'loading-logo';
  logo.textContent = 'GEINZ';
  document.body.appendChild(logo);

  /* Shimmer skeleton */
  const screen = document.createElement('div');
  screen.className = 'state-screen loading';
  screen.id = 'stateScreen';
  screen.innerHTML = `
    <div class="shimmer-wrap">
      <div class="shimmer-img"></div>
      <div class="shimmer-body">
        <div class="shimmer-biz">
          <div class="shimmer-avatar sh-line"></div>
          <div class="shimmer-biz-info">
            <div class="sh-line sh-l1"></div>
            <div class="sh-line sh-l2"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="sh-line sh-title1"></div>
          <div class="sh-line sh-title2"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px">
          <div class="sh-line sh-desc1"></div>
          <div class="sh-line sh-desc2"></div>
          <div class="sh-line sh-desc3"></div>
        </div>
        <div class="sh-line sh-pill"></div>
        <div class="sh-line sh-btn"></div>
      </div>
    </div>`;
  document.body.appendChild(screen);
}

function hideLoading() {
  /* quitar logo */
  const logo = document.querySelector('.loading-logo');
  if (logo) logo.remove();
  /* fade out skeleton */
  const screen = document.getElementById('stateScreen');
  if (screen) {
    screen.style.transition = 'opacity .4s ease';
    screen.style.opacity = '0';
    setTimeout(() => screen.remove(), 400);
  }
  /* revelar contenido */
  setTimeout(() => document.querySelector('.shell')?.classList.add('revealed'), 350);
}

/* ── ESTADO VENCIDO ── */
function showExpired() {
  const screen = document.getElementById('stateScreen');
  if (screen) screen.remove();
  const logo = document.querySelector('.loading-logo');
  if (logo) logo.remove();

  const s = document.createElement('div');
  s.className = 'state-screen';
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
  const screen = document.getElementById('stateScreen');
  if (screen) screen.remove();
  const logo = document.querySelector('.loading-logo');
  if (logo) logo.remove();

  const s = document.createElement('div');
  s.className = 'state-screen';
  s.innerHTML = `
    <div class="state-icon deleted">${isDeleted ? '🗑️' : '🔍'}</div>
    <div class="state-badge deleted">${isDeleted ? 'Eliminada' : 'No encontrada'}</div>
    <div class="state-title">Esta promo ya no existe</div>
    <div class="state-sub">${isDeleted
      ? 'El negocio ha eliminado esta promoción.'
      : 'No encontramos esta promoción en nuestro sistema.'}<br>Busca otras ofertas en Geinz.</div>
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
    localidad:
      p.get("localidad") ||
      p.get("l") ||
      "barranca",

    id:
      p.get("id") ||
      p.get("pi") ||
      "gPjdfCe26YTHphbCUfCU",
  };
}

/* ════════════════════════════════
   DÍAS RESTANTES
   ════════════════════════════════ */
function calcDaysLeft(datos) {
  if (!datos?.timestamp_fin) return null;
  const fin =
    datos.timestamp_fin?.toDate
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
  const imgWrap = document.querySelector('.promo-img-wrap');
  if (!imgWrap || !images.length) return;

  // Limpiar contenido previo
  imgWrap.innerHTML = '';

  // Crear imagen principal
  const img = document.createElement('img');
  img.className = 'promo-img';
  img.src = images[0];
  img.alt = 'Promoción';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  imgWrap.appendChild(img);

  // Si solo hay 1 imagen, solo permitir zoom al hacer clic
  if (images.length <= 1) {
    imgWrap.style.cursor = 'zoom-in'; // 👈 Cursor de lupa al hacer hover
    
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPhotoSwipe(0);
    });
    
    // 👇 Restaurar cursor cuando PhotoSwipe se cierra
    img.addEventListener('mouseleave', () => {
      imgWrap.style.cursor = 'zoom-in';
    });
    
    return;
  }

  // 👇 Cursor normal para galerías múltiples (las flechas manejan la navegación)
  imgWrap.style.cursor = 'default';

  // Contador
  const counter = document.createElement('div');
  counter.className = 'img-counter';
  counter.textContent = `1 / ${images.length}`;
  imgWrap.appendChild(counter);

  // Dots
  const dots = document.createElement('div');
  dots.className = 'img-dots';
  images.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = `img-dot${i === 0 ? ' active' : ''}`;
    dot.dataset.index = i;
    dots.appendChild(dot);
  });
  imgWrap.appendChild(dots);

  // Flechas
  const prevBtn = document.createElement('button');
  prevBtn.className = 'img-nav prev';
  prevBtn.innerHTML = '‹';
  prevBtn.setAttribute('aria-label', 'Anterior');
  imgWrap.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'img-nav next';
  nextBtn.innerHTML = '›';
  nextBtn.setAttribute('aria-label', 'Siguiente');
  imgWrap.appendChild(nextBtn);

  // Actualizar vista
  function updateView(index) {
    currentImgIndex = index;
    img.src = images[index];
    counter.textContent = `${index + 1} / ${images.length}`;
    
    // Dots
    dots.querySelectorAll('.img-dot').forEach((d, i) => {
      d.classList.toggle('active', i === index);
    });

    // Flechas
    prevBtn.classList.toggle('hidden', index === 0);
    nextBtn.classList.toggle('hidden', index === images.length - 1);
  }

  // Eventos de flechas
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentImgIndex > 0) updateView(currentImgIndex - 1);
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentImgIndex < images.length - 1) updateView(currentImgIndex + 1);
  });

  // Click en imagen abre PhotoSwipe en la posición actual
  img.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPhotoSwipe(currentImgIndex);
  });

  // Swipe táctil para móvil
  let touchStartX = 0;
  let touchEndX = 0;

  imgWrap.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  imgWrap.addEventListener('touchend', (e) => {
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

  // 1. Importar los módulos necesarios de PhotoSwipe 5
  const PhotoSwipeModule = await import('https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.js');
  const PhotoSwipeLightboxModule = await import('https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.js');

  // 2. Preparar los datos (DataSource)
  const dataSource = galleryImages.map((src) => ({
    src: src,
    // Dimensiones sugeridas para que el zoom funcione (PhotoSwipe las necesita)
    w: 1600, 
    h: 1200,
  }));

  // 3. Configurar e inicializar PhotoSwipe
  const pswp = new PhotoSwipeModule.default({
    dataSource: dataSource,
    index: index, // Empezar en la imagen clickeada
    pswpModule: PhotoSwipeModule,
    // Configuraciones de visualización
    bgOpacity: 0.98,
    showHideAnimationType: 'zoom',
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
    logoEl.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
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
  if (bizMeta) bizMeta.textContent = `Solo publicaciones de ${info.nombre_tienda || "este negocio"}`;

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
    // Último día - ROJO
    daysRow.innerHTML = `<div class="days-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;"></div> ¡Último día!`;
    daysRow.style.background = "rgba(239,68,68,.15)";
    daysRow.style.border = "1px solid rgba(239,68,68,.35)";
    daysRow.style.color = "#fca5a5";
  } else if (days <= 2) {
    // 1-2 días - ROJO (urgencia)
    daysRow.innerHTML = `<div class="days-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;animation:blink 1s ease-in-out infinite;"></div> ${days} día${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`;
    daysRow.style.background = "rgba(239,68,68,.12)";
    daysRow.style.border = "1px solid rgba(239,68,68,.3)";
    daysRow.style.color = "#fca5a5";
  } else if (days <= 5) {
    // 3-5 días - NARANJA (precaución)
    daysRow.innerHTML = `<div class="days-dot" style="background:#f59e0b;box-shadow:0 0 6px #f59e0b;"></div> ${days} días restantes`;
    daysRow.style.background = "rgba(245,158,11,.12)";
    daysRow.style.border = "1px solid rgba(245,158,11,.3)";
    daysRow.style.color = "#fcd34d";
  } else {
    // 6+ días - VERDE (tranquilidad)
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
    const msjeWa = msgs.whatsapp?.msje_predermindo || "Hola, quiero esta oferta que vi en Geinz:";
    const texto = encodeURIComponent(`${msjeWa} ${info.titulo || ""}`);

    if (info.contactar && numero) {
      btnWa.href = `https://wa.me/51${numero}?text=${texto}`;
      btnWa.style.display = "";
    } else {
      btnWa.style.display = "none";
    }
  }

  /* ── BOTÓN COMPARTIR (ambos) ── */
  const shareTitle = msgs.compartir?.msje_predermindo || "Mira esta promo en Geinz ❤️‍🔥";
  window._shareTitle = shareTitle; // usado por handleShare()

  if (!info.compartir) {
    document.querySelectorAll(".btn-share, .icon-btn").forEach((b) => (b.style.display = "none"));
  }

  /* ── TÍTULO DE PÁGINA ── */
  document.title = `${info.nombre_tienda || "Promo"} — Geinz`;
}

/* ════════════════════════════════
   SHARE  (expuesto globalmente para el onclick del HTML)
   ════════════════════════════════ */
function handleShare() {
  const url = window.location.href;
  const text = window._shareTitle || "Mira esta promo en Geinz ❤️‍🔥";
  if (navigator.share) {
    navigator.share({ title: text, url }).catch(() => copy(url));
  } else {
    copy(url);
  }
}

function copy(txt) {
  navigator.clipboard.writeText(txt).then(showToast).catch(() => {
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
  /* estado explícito */
  if (data.estado === 'vencido' || data.estado === 'expirado') return true;
  /* activo=false */
  if (data.datos_hora_fecha?.activo === false) return true;
  /* timestamp_fin en el pasado */
  const tsf = data.datos_hora_fecha?.timestamp_fin;
  if (tsf) {
    const fin = tsf?.toDate ? tsf.toDate() : new Date(tsf);
    if (!isNaN(fin) && fin < new Date()) return true;
  }
  return false;
}

function isDeleted(data) {
  return data.estado === 'eliminado' || data.eliminado === true;
}

/* ════════════════════════════════
   INIT
   ════════════════════════════════ */
(async () => {
  showLoading();
  const params = getParams();
  try {
    const snap_ref = doc(db, "Tiendas", params.localidad, "promos_ofertas", params.id);
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
    render(promo);
    hideLoading();

  } catch (err) {
    console.error("Error cargando promo:", err);
    showDeleted(false);
  }
})();
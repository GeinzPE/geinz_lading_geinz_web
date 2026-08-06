import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../db/db.js";
import { tiendaSubDoc } from "../rutas/rutas.js";

const params = new URLSearchParams(window.location.search);
const idsRaw = params.get("ids") || "";
const ids = idsRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const localidad = params.get("localidad") || params.get("l") || "barranca";
const nombreParam = params.get("n") || params.get("nombre") || "";

if (nombreParam)
  document.getElementById("nombreUsuario").innerHTML = nombreParam;

const grid = document.getElementById("grid");

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function copyToClip(text) {
  navigator.clipboard
    .writeText(text)
    .then(showToast)
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast();
    });
}

function calcDaysLeft(datos) {
  if (!datos?.timestamp_fin) return null;
  const fin = datos.timestamp_fin?.toDate
    ? datos.timestamp_fin.toDate()
    : new Date(datos.timestamp_fin);
  const diff = Math.ceil((fin - Date.now()) / 86400000);
  return diff > 0 ? diff : 0;
}

function isExpired(promo) {
  if (promo.estado === "vencido" || promo.estado === "expirado") return true;
  const fechaData = promo.datos_hora_fecha || {};
  if (fechaData.activo === false) return true;
  const tsFin = fechaData.timestamp_fin;
  if (tsFin) {
    const fin = tsFin?.toDate ? tsFin.toDate() : new Date(tsFin);
    if (!isNaN(fin) && fin < new Date()) return true;
  }
  return false;
}

// Galería mejorada
function setupGallery(wrap, images) {
  if (!images.length) {
    wrap.innerHTML = `<div class="card-placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:48px;background:#08080c;">🎁</div>`;
    return;
  }
  wrap.innerHTML = "";
  let current = 0;
  const imgEl = document.createElement("img");
  imgEl.className = "card-img";
  imgEl.src = images[0];
  wrap.appendChild(imgEl);

  if (images.length === 1) {
    imgEl.addEventListener("click", () => openPSWP(images, 0));
    return;
  }

  const counter = document.createElement("div");
  counter.className = "img-counter";
  counter.innerText = `1/${images.length}`;
  wrap.appendChild(counter);

  const dotsDiv = document.createElement("div");
  dotsDiv.className = "img-dots";
  images.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = `img-dot ${i === 0 ? "active" : ""}`;
    dotsDiv.appendChild(dot);
  });
  wrap.appendChild(dotsDiv);

  const prevBtn = document.createElement("button");
  prevBtn.className = "img-nav prev hidden";
  prevBtn.innerHTML = "‹";
  wrap.appendChild(prevBtn);
  const nextBtn = document.createElement("button");
  nextBtn.className = "img-nav next";
  nextBtn.innerHTML = "›";
  wrap.appendChild(nextBtn);

  function updateView(index) {
    current = index;
    imgEl.src = images[current];
    counter.innerText = `${current + 1}/${images.length}`;
    const allDots = dotsDiv.querySelectorAll(".img-dot");
    allDots.forEach((d, i) => d.classList.toggle("active", i === current));
    prevBtn.classList.toggle("hidden", current === 0);
    nextBtn.classList.toggle("hidden", current === images.length - 1);
  }

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current > 0) updateView(current - 1);
  });
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current < images.length - 1) updateView(current + 1);
  });
  imgEl.addEventListener("click", () => openPSWP(images, current));

  let startX = 0;
  wrap.addEventListener(
    "touchstart",
    (e) => {
      startX = e.changedTouches[0].screenX;
    },
    { passive: true },
  );
  wrap.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].screenX;
    const diff = startX - endX;
    if (Math.abs(diff) > 45) {
      if (diff > 0 && current < images.length - 1) updateView(current + 1);
      else if (diff < 0 && current > 0) updateView(current - 1);
    }
  });
}

async function openPSWP(images, index) {
  const PhotoSwipe = (
    await import("https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.js")
  ).default;
  const dataSource = await Promise.all(
    images.map(
      (src) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () =>
            res({ src, w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => res({ src, w: 1200, h: 900 });
          img.src = src;
        }),
    ),
  );
  new PhotoSwipe({
    dataSource,
    index,
    bgOpacity: 0.96,
    showHideAnimationType: "zoom",
  }).init();
}

function renderDaysWidget(container, datos) {
  const days = calcDaysLeft(datos);
  if (days === null) {
    container.style.display = "none";
    return;
  }
  if (days === 0) {
    container.innerHTML = `<div class="days-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444;"></div> 🧨 ¡Último día!`;
    container.style.background = "rgba(239,68,68,0.12)";
    container.style.borderColor = "rgba(239,68,68,0.5)";
    container.style.color = "#fca5a5";
  } else if (days <= 2) {
    container.innerHTML = `<div class="days-dot" style="background:#ef4444;animation:blink 1s infinite;"></div> ${days} día${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`;
    container.style.background = "rgba(239,68,68,0.1)";
    container.style.borderColor = "rgba(239,68,68,0.45)";
    container.style.color = "#fecaca";
  } else if (days <= 5) {
    container.innerHTML = `<div class="days-dot" style="background:#f59e0b;"></div> ⏳ ${days} días restantes`;
    container.style.background = "rgba(245,158,11,0.1)";
    container.style.borderColor = "rgba(245,158,11,0.4)";
    container.style.color = "#fde68a";
  } else {
    container.innerHTML = `<div class="days-dot" style="background:#10b981;"></div> 🟢 ${days} días vigente`;
    container.style.background = "rgba(16,185,129,0.08)";
    container.style.borderColor = "rgba(16,185,129,0.35)";
    container.style.color = "#a7f3d0";
  }
}

function buildCard(promo, id) {
  const info = promo.informacion || {};
  const imgC = promo.img_container || {};
  const msgs = promo.mensaje_predeterminado || {};
  const datos = promo.datos_hora_fecha || {};
  const images = imgC.lista_img || [];

  const card = document.createElement("div");
  card.className = "promo-card";

  const imgWrap = document.createElement("div");
  imgWrap.className = "card-img-wrap";
  setupGallery(imgWrap, images);
  if (promo.rango_establecido) {
    const badge = document.createElement("div");
    badge.textContent = `${promo.rango_establecido}% OFF`;
    imgWrap.appendChild(badge);
  }
  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "card-body";

  // fila negocio
  const bizRow = document.createElement("div");
  bizRow.className = "biz-row";
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "biz-avatar";
  if (imgC.logo_img) {
    const logoImg = document.createElement("img");
    logoImg.src = imgC.logo_img;
    avatarDiv.appendChild(logoImg);
  } else {
    avatarDiv.textContent = (info.nombre_tienda || "G")[0].toUpperCase();
  }
  const bizInfoDiv = document.createElement("div");
  bizInfoDiv.className = "biz-info";
  bizInfoDiv.innerHTML = `<div class="biz-name">${info.nombre_tienda || "Negocio destacado"}</div><div class="biz-meta">Ofertas verificadas</div>`;
  const verifiedBadge = document.createElement("div");
  verifiedBadge.className = "biz-verified";
  verifiedBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Confiable`;

  const tiendaId = info.id_tienda || promo.id_tienda || "";
  if (tiendaId) {
    bizRow.style.cursor = "pointer";
    bizRow.addEventListener("click", async () => {
      try {
        const snapTienda = await getDoc(
          tiendaSubDoc(localidad, "tiendas", tiendaId),
        );
        const alias = snapTienda.exists() ? snapTienda.data().alias_key : null;
        if (alias) {
          window.location.href = `https://geinztech.com/perfil/${alias}`;
        } else {
          window.location.href = `https://geinztech.com/api/share?t=ti&id=${tiendaId}&l=${localidad}&c=${info.categoria || "general"}`;
        }
      } catch {
        window.location.href = `https://geinztech.com/api/share?t=ti&id=${tiendaId}&l=${localidad}&c=${info.categoria || "general"}`;
      }
    });
  }
  bizRow.append(avatarDiv, bizInfoDiv, verifiedBadge);
  body.appendChild(bizRow);

  // título
  const title = document.createElement("h2");
  title.className = "promo-title";
  title.textContent = info.titulo || "Oferta especial";
  body.appendChild(title);

  // descripción
  const desc = document.createElement("p");
  desc.className = "promo-desc";
  desc.textContent = info.descripcion || "Aprovecha esta oportunidad única 🔥";
  body.appendChild(desc);

  // días restantes
  const daysRow = document.createElement("div");
  daysRow.className = "days-row";
  renderDaysWidget(daysRow, datos);
  body.appendChild(daysRow);

  const hrDiv = document.createElement("div");
  hrDiv.className = "hr";
  body.appendChild(hrDiv);

  // Grupo de botones (siempre al fondo)
  const buttonsGroup = document.createElement("div");
  buttonsGroup.className = "buttons-group";

  const numero = info.numero?.replace(/\D/g, "");
  const shareLink = `https://geinztech.com/api/share?t=prms&l=${localidad}&pi=${id}`;
  const waMsg =
    msgs.whatsapp?.msje_predermindo ||
    "¡Hola! Vi esta promo en Geinz y me interesa:";

  if (info.contactar && numero) {
    const btnWa = document.createElement("a");
    btnWa.className = "btn-wa";
    btnWa.href = `https://wa.me/51${numero}?text=${encodeURIComponent(waMsg + " " + shareLink)}`;
    btnWa.target = "_blank";
    btnWa.innerHTML = `Contactar por WhatsApp`;
    buttonsGroup.appendChild(btnWa);
  }

  // fila compartir
  const shareRow = document.createElement("div");
  shareRow.className = "share-row";
  const shareText =
    msgs.compartir?.msje_predermindo || "Mira esta increíble promo en Geinz ✨";
  const shareBtn = document.createElement("button");
  shareBtn.className = "btn-share-pill";
  shareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Compartir promo`;
  shareBtn.addEventListener("click", () => {
    const fullMsg = `${shareText}\n${shareLink}`;
    if (navigator.share)
      navigator.share({ text: fullMsg }).catch(() => copyToClip(fullMsg));
    else copyToClip(fullMsg);
  });
  shareRow.innerHTML = `<span class="share-label">Difundir</span><div class="share-divider"></div>`;
  shareRow.appendChild(shareBtn);
  buttonsGroup.appendChild(shareRow);

  body.appendChild(buttonsGroup);
  card.appendChild(body);
  return card;
}

function buildSkeleton() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < ids.length; i++) {
    const sk = document.createElement("div");
    sk.className = "sk-card";
    sk.id = `sk-${i}`;
    sk.innerHTML = `
        <div class="sk-img"></div>
        <div class="sk-body">
          <div style="display:flex; gap:14px;"><div class="sk-avatar"></div><div style="flex:1"><div class="sk-line" style="width:70%"></div><div class="sk-line short" style="margin-top:8px"></div></div></div>
          <div class="sk-line medium"></div>
          <div class="sk-line"></div>
          <div class="sk-line short"></div>
          <div class="sk-line" style="width:40%"></div>
        </div>`;
    frag.appendChild(sk);
  }
  grid.appendChild(frag);
}

async function loadPromoById(id) {
  const ref = tiendaSubDoc(localidad, "promos_ofertas", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function init() {
  if (!ids.length) {
    grid.innerHTML = `<div class="state-card"><div class="state-icon">🔍</div><div class="state-badge deleted">Sin IDs</div><div class="state-title">No se encontraron promociones</div><div class="state-sub">Verifica el enlace compartido.</div></div>`;
    document.getElementById("countLabel").innerText = "0 promos";
    return;
  }
  buildSkeleton();
  let validCount = 0;
  for (let i = 0; i < ids.length; i++) {
    const skel = document.getElementById(`sk-${i}`);
    if (!skel) continue;
    try {
      const promo = await loadPromoById(ids[i]);
      if (!promo || isExpired(promo)) {
        const expiredCard = document.createElement("div");
        expiredCard.className = "state-card";
        expiredCard.innerHTML = `<div class="state-icon">⏳</div><div class="state-badge expired">Promoción vencida</div><div class="state-title">Esta oferta ya expiró</div><div class="state-sub">El tiempo límite finalizó, pero hay más promos disponibles en Geinz.</div>`;
        skel.replaceWith(expiredCard);
        continue;
      }
      const cardElement = buildCard(promo, ids[i]);
      skel.replaceWith(cardElement);
      validCount++;
    } catch (error) {
      const errorCard = document.createElement("div");
      errorCard.className = "state-card";
      errorCard.innerHTML = `<div class="state-icon">⚠️</div><div class="state-badge deleted">Error</div><div class="state-title">No se pudo cargar</div><div class="state-sub">Intenta nuevamente más tarde.</div>`;
      skel.replaceWith(errorCard);
    }
  }
  document.getElementById("countLabel").innerHTML =
    `${validCount} promo${validCount !== 1 ? "s" : ""} activa${validCount !== 1 ? "s" : ""}`;
}
init();

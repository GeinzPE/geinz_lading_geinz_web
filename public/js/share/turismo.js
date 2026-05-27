/* ════════════════════════════════
   FIREBASE CONFIG
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
   DOM ELEMENTS
   ════════════════════════════════ */

const loadingScreen = document.getElementById("loadingScreen");
const heroSlider = document.getElementById("heroSlider");
const slideIndicators = document.getElementById("slideIndicators");

const badgesContainer = document.getElementById("badgesContainer");
const placeTitle = document.getElementById("placeTitle");
const placeDescription = document.getElementById("placeDescription");
const placeAddress = document.getElementById("placeAddress");
const placeCoords = document.getElementById("placeCoords");
const galleryGrid = document.getElementById("galleryGrid");
const gallerySection = document.getElementById("gallerySection");
const viewOnMapBtn = document.getElementById("viewOnMap");
const shareBtnMain = document.getElementById("shareBtnMain");
const shareBtn = document.getElementById("shareBtn");
const toast = document.getElementById("toast");
const navbar = document.getElementById("navbar");

/* ════════════════════════════════
   STATE
   ════════════════════════════════ */

let currentSlide = 0;
let allImages = [];
let placeData = null;
let placeId = "p4QWaeKNTgJvUL2kFkDO";
let locationName = "barranca";
let autoSlideInterval = null;

/* ════════════════════════════════
   HELPERS
   ════════════════════════════════ */

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function showToast(message = "✓ Enlace copiado al portapapeles") {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

/* ════════════════════════════════
   AUTO SLIDE
   ════════════════════════════════ */

function startAutoSlide() {
  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
  }
  
  autoSlideInterval = setInterval(() => {
    goToSlide(currentSlide + 1);
  }, 5000);
}

function stopAutoSlide() {
  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }
}

function resetAutoSlide() {
  stopAutoSlide();
  if (allImages.length > 1) {
    startAutoSlide();
  }
}

/* ════════════════════════════════
   SLIDER LOGIC
   ════════════════════════════════ */

function buildSlider(images) {
  heroSlider.innerHTML = "";
  slideIndicators.innerHTML = "";

  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }

  if (!images || images.length === 0) {
    const slide = document.createElement("div");
    slide.className = "slide active";
    slide.innerHTML = `<img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80" alt="Imagen por defecto">`;
    heroSlider.appendChild(slide);

    return;
  }

  allImages = images;

  images.forEach((imgUrl, index) => {
    const slide = document.createElement("div");
    slide.className = `slide ${index === 0 ? "active" : ""}`;
    const img = document.createElement("img");
    img.src = imgUrl;
    img.alt = placeData?.titulo || "Imagen del lugar";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;";
    slide.appendChild(img);
    heroSlider.appendChild(slide);

    const indicator = document.createElement("button");
    indicator.className = `indicator ${index === 0 ? "active" : ""}`;
    indicator.addEventListener("click", () => {
      goToSlide(index);
      resetAutoSlide();
    });
    slideIndicators.appendChild(indicator);
  });


  if (images.length > 1) {
    startAutoSlide();
  }
}

function goToSlide(index) {
  const slides = heroSlider.querySelectorAll(".slide");
  const indicators = slideIndicators.querySelectorAll(".indicator");

  if (slides.length === 0) return;

  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;

  slides.forEach(s => s.classList.remove("active"));
  indicators.forEach(i => i.classList.remove("active"));

  slides[index].classList.add("active");
  if (indicators[index]) indicators[index].classList.add("active");

  currentSlide = index;
}

/* ════════════════════════════════
   GALLERY WITH PHOTOSWIPE
   ════════════════════════════════ */

function buildGallery(images) {
  if (!images || images.length === 0) {
    gallerySection.style.display = "none";
    return;
  }

  gallerySection.style.display = "block";
  galleryGrid.innerHTML = "";

  const displayImages = images.slice(0, 6);

  displayImages.forEach((imgUrl, index) => {
    const item = document.createElement("div");
    item.className = "gallery-item";

    const img = document.createElement("img");
    img.src = imgUrl;
    img.alt = `Imagen ${index + 1}`;
    img.loading = "lazy";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;";

    item.appendChild(img);

    if (index === 5 && images.length > 6) {
      const overlay = document.createElement("div");
      overlay.className = "gallery-overlay";
      overlay.textContent = `+${images.length - 6}`;
      item.appendChild(overlay);
    }

    item.addEventListener("click", () => openPhotoSwipe(index, images));
    galleryGrid.appendChild(item);
  });
}

function openPhotoSwipe(index, imagesArray) {
  if (!imagesArray || imagesArray.length === 0) return;

  if (typeof window.PhotoSwipeLightbox === "undefined") {
    console.warn("PhotoSwipe no está cargado, abriendo lightbox simple");
    openLightboxFallback(imagesArray[index]);
    return;
  }

  const dataSource = imagesArray.map((src) => ({
    src: src,
    w: 1200,
    h: 800,
  }));

  const lightbox = new window.PhotoSwipeLightbox({
    dataSource: dataSource,
    pswpModule: () =>
      import("https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.js"),
    initialZoomLevel: "fit",
    secondaryZoomLevel: 2.5,
    maxZoomLevel: 4,
    bgOpacity: 0.95,
    spacing: 0.08,
    loop: true,
    arrowPrev: true,
    arrowNext: true,
    zoom: true,
    close: true,
    counter: true,
    showHideAnimationType: "fade",
  });

  lightbox.init();
  lightbox.loadAndOpen(index);

  lightbox.on("destroy", () => {
    lightbox.destroy();
  });
}

function openLightboxFallback(imgUrl) {
  const existing = document.querySelector(".lightbox");
  if (existing) existing.remove();

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox active";
  lightbox.innerHTML = `
    <button class="lightbox-close">✕</button>
    <img src="${imgUrl}" alt="Vista ampliada">
  `;

  lightbox.addEventListener("click", (e) => {
    if (
      e.target === lightbox ||
      e.target.classList.contains("lightbox-close")
    ) {
      lightbox.classList.remove("active");
      setTimeout(() => lightbox.remove(), 300);
    }
  });

  document.body.appendChild(lightbox);
}

/* ════════════════════════════════
   SHARE LOGIC
   ════════════════════════════════ */

function getShareUrl() {
  return `https://geinzworkapp.web.app/share?t=tu&id=${placeId}&l=${locationName}&c=lugares_turisticos`;
}

async function handleShare() {
  const shareUrl = getShareUrl();
  const title = placeData?.titulo || "Lugar turístico";
  const description = placeData?.descripcion || "Descubre este increíble lugar";

  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: description,
        url: shareUrl,
      });
      showToast("✓ Compartido exitosamente");
    } catch (err) {
      if (err.name !== "AbortError") {
        copyToClipboard(shareUrl);
      }
    }
  } else {
    copyToClipboard(shareUrl);
  }
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("✓ Enlace copiado al portapapeles");
    })
    .catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("✓ Enlace copiado al portapapeles");
    });
}

/* ════════════════════════════════
   GOOGLE MAPS
   ════════════════════════════════ */

function openInGoogleMaps() {
  const lat = placeData?.ubicacion?.latitud;
  const lng = placeData?.ubicacion?.longitud;

  if (lat && lng) {

    // Navegación directa
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    window.open(mapsUrl, "_blank");

  } else {
    showToast("Coordenadas no disponibles");
  }
}

/* ════════════════════════════════
   FETCH PLACE DATA
   ════════════════════════════════ */

async function fetchPlaceData() {
  try {

    const idFromUrl = getParam("id");

    const locFromUrl =
      getParam("localidad") ||
      getParam("l");

    console.log("🆔 ID URL:", idFromUrl);
    console.log("📍 LOCALIDAD URL:", locFromUrl);

    if (idFromUrl) placeId = idFromUrl;
    if (locFromUrl) locationName = locFromUrl;

    console.log("🔍 Buscando lugar:", locationName, placeId);

    const docRef = doc(
      db,
      "Tiendas",
      locationName,
      "lugares_turisticos",
      placeId,
    );

    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Lugar no encontrado");
    }

    placeData = docSnap.data();

    console.log("✅ Datos cargados:", placeData);

    renderPlaceData();

  } catch (error) {

    console.error("❌ Error al cargar el lugar:", error);

    placeTitle.textContent = "Lugar no encontrado";

    placeDescription.textContent =
      "No se pudo cargar la información. Verifica el enlace o intenta de nuevo.";

    buildSlider(null);

    gallerySection.style.display = "none";

  } finally {

    setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, 600);
  }
}

function renderPlaceData() {
  if (!placeData) return;

  document.title = placeData.titulo || "Lugar turístico";

  placeTitle.textContent = placeData.titulo || "Lugar turístico";

  placeDescription.textContent =
    placeData.descripcion || "Sin descripción disponible.";

  badgesContainer.innerHTML = "";
  if (placeData.categoria && Array.isArray(placeData.categoria)) {
    placeData.categoria.forEach((cat) => {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = cat;
      badgesContainer.appendChild(badge);
    });
  } else if (placeData.categoria && typeof placeData.categoria === "string") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = placeData.categoria;
    badgesContainer.appendChild(badge);
  }

  const direccion = placeData.ubicacion?.direccion || "";
  placeAddress.textContent = direccion || "Sin dirección registrada";

  const lat = placeData.ubicacion?.latitud;
  const lng = placeData.ubicacion?.longitud;
  if (lat && lng) {
    placeCoords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } else {
    placeCoords.textContent = "No disponibles";
  }

  const imgData = placeData.img || {};
  const principal = imgData.principal || null;
  const listaImg = imgData.lista_img || [];

  console.log("🖼️ imgData:", imgData);
  console.log("🖼️ principal:", principal);
  console.log("🖼️ lista_img:", listaImg);

  let todasLasImagenes = [];

  if (principal && typeof principal === "string" && principal.trim() !== "") {
    todasLasImagenes.push(principal);
  }
  if (Array.isArray(listaImg)) {
    listaImg.forEach((img) => {
      if (img && typeof img === "string" && img.trim() !== "") {
        if (img.trim() !== principal?.trim()) {
          todasLasImagenes.push(img.trim());
        }
      }
    });
  }
  todasLasImagenes = [...new Set(todasLasImagenes)];
  console.log(
    "🖼️ Total imágenes únicas:",
    todasLasImagenes.length,
    todasLasImagenes,
  );

  buildSlider(todasLasImagenes);
  buildGallery(todasLasImagenes);

  updateMetaTags();
}

function updateMetaTags() {
  const title = placeData?.titulo || "Lugar turístico";
  const description = placeData?.descripcion || "Descubre este increíble lugar";
  const image =
    placeData?.img?.principal || placeData?.img?.lista_img?.[0] || "";

  document.title = title;

  setMetaTag("og:title", title);
  setMetaTag("og:description", description);
  setMetaTag("og:image", image);
  setMetaTag("og:url", getShareUrl());

  setMetaTag("twitter:title", title);
  setMetaTag("twitter:description", description);
  setMetaTag("twitter:image", image);
}

function setMetaTag(property, content) {
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

/* ════════════════════════════════
   EVENT LISTENERS
   ════════════════════════════════ */



document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    goToSlide(currentSlide - 1);
    resetAutoSlide();
  }
  if (e.key === "ArrowRight") {
    goToSlide(currentSlide + 1);
    resetAutoSlide();
  }
  if (e.key === "Escape") {
    const lightbox = document.querySelector(".lightbox");
    if (lightbox) {
      lightbox.classList.remove("active");
      setTimeout(() => lightbox.remove(), 300);
    }
  }
});

viewOnMapBtn.addEventListener("click", openInGoogleMaps);

shareBtnMain.addEventListener("click", handleShare);
if (shareBtn) {
  shareBtn.addEventListener("click", handleShare);
}

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }
});

let touchStartX = 0;
let touchEndX = 0;

heroSlider.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
});

heroSlider.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 50) {
    if (diff > 0) {
      goToSlide(currentSlide + 1);
    } else {
      goToSlide(currentSlide - 1);
    }
    resetAutoSlide();
  }
}

// Pausar auto-slide cuando el mouse está sobre el slider
heroSlider.addEventListener("mouseenter", () => {
  stopAutoSlide();
});

// Reanudar auto-slide cuando el mouse sale del slider
heroSlider.addEventListener("mouseleave", () => {
  if (allImages.length > 1) {
    startAutoSlide();
  }
});

// Pausar cuando la pestaña no está visible
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoSlide();
  } else {
    if (allImages.length > 1) {
      startAutoSlide();
    }
  }
});

function actualizarBanner(nombreLugar) {

    const title = document.getElementById("discoverTitle");

    if (!title) return;

    title.innerHTML = `
        Obtén los lugares cercanos de <span>${nombreLugar}</span>
        descargando Geinz
    `;
}
/* ════════════════════════════════
   INIT
   ════════════════════════════════ */

console.log("🚀 Iniciando carga del lugar turístico...");
fetchPlaceData();
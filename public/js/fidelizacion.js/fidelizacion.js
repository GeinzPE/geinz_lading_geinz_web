import { db, auth } from "../db/db.js";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  runTransaction,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signInWithCustomToken,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  tiendaDoc,
  clienteDoc,
  tiendaDescuentosCol,
  data_user_logeado,
  clienteCuponDoc,
  tiendaSubCol,
} from "../rutas/rutas.js";
import { setFaviconCircular } from "../favicon/favicon.js";
import { initFidelizacionUI } from "./fidelizacion_ui_front.js";

const LANDING_BASE_URL = "https://geinztech.com";
const LOCALIDAD_FIJA = "barranca";
const AUTH_ORIGIN = "https://geinztech.com";
const ES_DOMINIO_PROPIO =
  location.hostname !== "geinztech.com" &&
  location.hostname !== "www.geinztech.com";
const LOGO_FALLBACK_URL =
  "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/tiendas%2FfW7W8RsgkkQ3IYfxKHGR%2Flogo%2Flogo.webp?alt=media&token=bb6e8d14-131a-449b-92bf-e4675bdab41b";

const NIVELES = [
  { min: 0, label: "Nivel Bronce" },
  { min: 150, label: "Nivel Plata" },
  { min: 400, label: "Nivel Oro VIP" },
];

const HP_PAGE_SIZE = 15;

/* ══════════════ Estado global ══════════════ */
let LOCALIDAD = LOCALIDAD_FIJA;
let NEGOCIO_ID = null;
let ALIAS_NEGOCIO = null;
let UID_ACTUAL = null;
let ui = null;
let horarioEstado = { abierto: true, mensaje: "" };
let horarioCheckInterval = null;
let brandDarkHex = "#2e1065";
const qrState = { code: null, colorReady: false, rendered: false };
let _esperandoToken = new URLSearchParams(window.location.hash.slice(1)).has(
  "wl_token",
);

/* ══════════════ Horario de atención ══════════════ */
const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const DIAS_SEMANA_LABEL = {
  domingo: "domingo",
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
};

function parseHoraAMinutos(str) {
  if (!str || typeof str !== "string" || !str.includes(":")) return null;
  const [h, m] = str.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatMinutosAHora(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function calcularProximaApertura(horarios, desde) {
  for (let offset = 0; offset < 8; offset++) {
    const fecha = new Date(desde);
    fecha.setDate(fecha.getDate() + offset);
    const diaKey = DIAS_SEMANA[fecha.getDay()];
    const diaData = horarios[diaKey];
    if (!diaData || diaData.cerrado) continue;

    const bloques = (diaData.bloques || [])
      .map((b) => ({
        inicio: parseHoraAMinutos(b.h_apertura),
        fin: parseHoraAMinutos(b.h_cierre),
      }))
      .filter((b) => b.inicio !== null && b.fin !== null)
      .sort((a, b) => a.inicio - b.inicio);

    for (const b of bloques) {
      if (offset === 0) {
        const minutosAhora = desde.getHours() * 60 + desde.getMinutes();
        if (b.inicio > minutosAhora)
          return { dia: diaKey, offset, hora: b.inicio };
      } else {
        return { dia: diaKey, offset, hora: b.inicio };
      }
    }
  }
  return null;
}

function evaluarHorarioNegocio(biz, fecha = new Date()) {
  const horarios = biz?.horario_atencion;
  if (!horarios || typeof horarios !== "object") {
    return { abierto: true, mensaje: "" };
  }

  const diaKey = DIAS_SEMANA[fecha.getDay()];
  const diaData = horarios[diaKey];
  if (!diaData) return { abierto: true, mensaje: "" };

  if (diaData.cerrado) {
    const motivo = (diaData.motivo || "").trim();
    return {
      abierto: false,
      mensaje: motivo
        ? `Cerrado hoy: ${motivo}`
        : `Hoy (${DIAS_SEMANA_LABEL[diaKey]}) no atendemos`,
    };
  }

  const minutosAhora = fecha.getHours() * 60 + fecha.getMinutes();
  const bloques = diaData.bloques || [];

  for (const bloque of bloques) {
    const inicio = parseHoraAMinutos(bloque.h_apertura);
    const fin = parseHoraAMinutos(bloque.h_cierre);
    if (inicio === null || fin === null) continue;

    if (fin <= inicio) {
      if (minutosAhora >= inicio || minutosAhora < fin)
        return { abierto: true, mensaje: "" };
    } else {
      if (minutosAhora >= inicio && minutosAhora < fin)
        return { abierto: true, mensaje: "" };
    }
  }

  const proxima = calcularProximaApertura(horarios, fecha);
  let mensaje = "Cerrado ahora";
  if (proxima) {
    const horaTxt = formatMinutosAHora(proxima.hora);
    if (proxima.offset === 0)
      mensaje = `Cerrado ahora · Abrimos hoy a las ${horaTxt}`;
    else if (proxima.offset === 1)
      mensaje = `Cerrado ahora · Abrimos mañana a las ${horaTxt}`;
    else
      mensaje = `Cerrado ahora · Abrimos el ${DIAS_SEMANA_LABEL[proxima.dia]} a las ${horaTxt}`;
  }
  return { abierto: false, mensaje };
}

/* ══════════════ Resolución de ruta ══════════════
   Formato nuevo: /perfil/{alias}/fidelizacion/{uid}
   Formato viejo: ?localidad=&id= */

async function resolverNegocioDesdeAlias(alias) {
  try {
    const aliasSnap = await getDoc(doc(db, "alias_tiendas", alias));
    if (aliasSnap.exists()) {
      const data = aliasSnap.data();
      if (data.id && data.localidad) {
        return { id: data.id, localidad: data.localidad.trim().toLowerCase() };
      }
    }
  } catch (e) {
    console.error("[fidelizacion] No se pudo resolver el alias:", e);
  }
  return null;
}

function parseRutaCruda() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("id")) {
    return {
      tipo: "id",
      negocioId: params.get("id"),
      localidad: params.get("localidad") || LOCALIDAD_FIJA,
    };
  }

  const partes = window.location.pathname.split("/").filter(Boolean);
  const idxPerfil = partes.indexOf("perfil");
  const idxFidel = partes.indexOf("fidelizacion");
  if (idxPerfil !== -1 && idxFidel !== -1 && idxFidel === idxPerfil + 2) {
    return {
      tipo: "alias",
      alias: decodeURIComponent(partes[idxPerfil + 1]),
      uidPath: partes[idxFidel + 1] || null,
    };
  }
  return null;
}

async function resolverRuta() {
  if (window.__NEGOCIO_ID__ && window.__NEGOCIO_LOCALIDAD__) {
    return {
      negocioId: window.__NEGOCIO_ID__,
      localidad: window.__NEGOCIO_LOCALIDAD__.trim().toLowerCase(),
    };
  }

  const cruda = parseRutaCruda();
  if (!cruda) return null;

  if (cruda.tipo === "id") {
    return { negocioId: cruda.negocioId, localidad: cruda.localidad };
  }

  const resuelto = await resolverNegocioDesdeAlias(cruda.alias);
  if (!resuelto) return null;
  ALIAS_NEGOCIO = cruda.alias;
  return { negocioId: resuelto.id, localidad: resuelto.localidad };
}

/* ══════════════ Login en dominio personalizado ══════════════ */
function abrirLoginPopup(nombre, logoUrl, rgb) {
  const u = new URL(`${AUTH_ORIGIN}/auth-popup.html`);
  u.searchParams.set("o", window.location.origin);
  u.searchParams.set("r", window.location.href.split("#")[0]);
  u.searchParams.set("n", nombre || "");
  if (logoUrl) u.searchParams.set("l", logoUrl);
  u.searchParams.set("c", rgb);
  window.location.href = u.toString();
}

// Al volver del login: la URL trae #wl_token=...
(async () => {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const t = p.get("wl_token");
  if (!t) return;
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  try {
    await signInWithCustomToken(auth, t);
    // onAuthStateChanged (en el INIT) se dispara solo y carga la tarjeta
  } catch (err) {
    console.error("signInWithCustomToken:", err);
    _esperandoToken = false;
    if (NEGOCIO_ID) showLoginGate();
  }
})();

/* ══════════════ Datos ══════════════ */
async function cargarProductos(negocioId) {
  try {
    const col = tiendaDescuentosCol(LOCALIDAD, negocioId);
    const snap = await getDocs(col);
    const productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    await Promise.all(
      productos.map(async (p) => {
        p.disponible = await verificarDisponibilidadRecompensa(p);
      }),
    );

    return productos;
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function cargarUsuario(idUsuario) {
  if (!idUsuario) return {};
  const snap = await getDoc(data_user_logeado(idUsuario));
  return snap.exists() ? snap.data() : {};
}

async function verificarDisponibilidadRecompensa(p) {
  // las recompensas manuales siempre están disponibles
  if (p.origen !== "catalogo" || !p.productoId || !p.categoria) return true;

  try {
    const prodRef = doc(
      tiendaSubCol(
        LOCALIDAD,
        "tiendas",
        NEGOCIO_ID,
        "productos",
        p.categoria,
        p.categoria,
      ),
      p.productoId,
    );
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists() || prodSnap.data().disponible === false)
      return false;

    const prodData = prodSnap.data();
    const ve = p.varianteElegida;
    if (ve && typeof ve === "object") {
      for (const [condNombre, opcionNombre] of Object.entries(ve)) {
        const cond = (prodData.condiciones || []).find(
          (c) => c.nombre === condNombre,
        );
        const op = cond?.opciones?.find((o) => o.nombre === opcionNombre);
        const sinStock = typeof op?.stock === "number" && op.stock <= 0;
        if (!cond || !op || op.activo === false || sinStock) return false;
      }
    }
    return true;
  } catch (e) {
    console.warn("No se pudo verificar disponibilidad de recompensa:", e);
    return true;
  }
}

/* ══════════════ Logo / color de marca ══════════════ */
function cargarLogoYColor(logoURL, nombreTienda) {
  return new Promise((resolve) => {
    const img = document.getElementById("logoImg");
    if (!img || !logoURL) {
      resolve(colorFromName(nombreTienda));
      return;
    }

    setFaviconCircular(logoURL);

    img.src = logoURL;
    img.onload = async () => {
      img.classList.remove("hidden");
      document.getElementById("logoSkeleton")?.remove();
      const color = await getDominantColor(img);
      resolve(color || colorFromName(nombreTienda));
    };
    img.onerror = () => {
      document.getElementById("logoSkeleton")?.remove();
      resolve(colorFromName(nombreTienda));
    };
  });
}

function getDominantColor(imgEl) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 100;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

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

        if (l > 0.8 || l < 0.1 || s < 0.25) continue;

        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
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
      resolve(null);
    }
  });
}

function colorFromName(name) {
  let hash = 0;
  const str = name || "Fidelidad";
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  return hslToRgb(hue / 360, 0.65, 0.5);
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function aplicarColorMarca({ r, g, b }) {
  if (r == null) return;
  const { h, s } = rgbToHsl(r, g, b);

  const vivid = hslToRgb(h, Math.max(s, 0.6), 0.5);
  document.documentElement.style.setProperty(
    "--brand-vivid",
    rgbToHex(vivid.r, vivid.g, vivid.b),
  );

  const glow = hslToRgb(h, Math.max(s, 0.65), 0.35);
  document.documentElement.style.setProperty(
    "--brand-glow",
    rgbToHex(glow.r, glow.g, glow.b),
  );

  const dark = hslToRgb(h, Math.max(s, 0.5), 0.12);
  const darkHex = rgbToHex(dark.r, dark.g, dark.b);
  document.documentElement.style.setProperty("--brand-dark", darkHex);

  brandDarkHex = darkHex;
  qrState.colorReady = true;
  tryRenderQR();
}

/* ══════════════ Utilidades de UI ══════════════ */
function calcularNivel(puntos) {
  let elegido = NIVELES[0];
  for (const n of NIVELES) {
    if (puntos >= n.min) elegido = n;
  }
  return elegido.label;
}

function capitalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function formatearFechaInicio(timestamp) {
  try {
    const fecha = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat("es-PE", {
      month: "short",
      year: "numeric",
    }).format(fecha);
  } catch {
    return null;
  }
}

function showError(msg) {
  const box = document.getElementById("errorBox");
  if (!box) return;
  box.innerHTML = msg;
  box.classList.remove("hidden");
}

function revealCard() {
  const skel = document.getElementById("fullSkeleton");
  const content = document.getElementById("appContent");
  if (!content) return;
  content.style.opacity = "1";
  content.style.pointerEvents = "auto";
  if (skel) {
    skel.style.transition = "opacity .4s ease";
    skel.style.opacity = "0";
    setTimeout(() => skel.remove(), 420);
  }
}

/* ── Gate: no logeado ── */
async function showLoginGate() {
  const skel = document.getElementById("fullSkeleton");
  if (!skel) return;

  let nombre = "";
  let logo = "";
  if (ES_DOMINIO_PROPIO) {
    try {
      const snap = await getDoc(tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID));
      const t = snap.exists() ? snap.data() : {};
      nombre = t.nombre_tienda || t.nombre || "";
      logo =
        t.img_tienda?.logo_tienda || t.logoURL || t.logo || t.urlLogo || "";
    } catch (e) {
      console.warn("No se pudo cargar el negocio para el login:", e.message);
    }
  }

  const c = colorFromName(nombre || "Fidelidad");
  const rgb = `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;

  const avatar = logo
    ? `<img src="${logo}" alt="Logo" class="w-full h-full object-cover">`
    : `<div class="w-full h-full skeleton"></div>`;

  const accion = ES_DOMINIO_PROPIO
    ? `<button id="btnLoginWl" type="button" class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold inline-block">Iniciar sesión</button>`
    : `<a href="../logindata/login.html?redirect=${encodeURIComponent(window.location.href)}"
         class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold inline-block">Iniciar sesión</a>`;

  skel.innerHTML = `
    <div class="w-full max-w-sm mx-auto text-center px-4">
      <div class="rounded-[24px] border border-white/5 bg-[#0d0e12] px-6 py-10 flex flex-col items-center">
        <div class="logo-avatar mb-5"><div class="logo-avatar-inner">${avatar}</div></div>
        <p class="font-display font-semibold text-white text-base mb-2">Inicia sesión para ver tu tarjeta</p>
        <p class="text-white/40 text-xs font-mono-card mb-6 leading-relaxed">Necesitas tu cuenta de Geinz para ver tus puntos y canjear recompensas.</p>
        ${accion}
      </div>
    </div>`;

  if (ES_DOMINIO_PROPIO) {
    document
      .getElementById("btnLoginWl")
      .addEventListener("click", () => abrirLoginPopup(nombre, logo, rgb));
  }
}

/* ── Gate: logeado pero no sigue el negocio ── */
function showFollowGate(nombreTienda, logoURL, onFollow) {
  const skel = document.getElementById("fullSkeleton");
  if (!skel) return;

  if (logoURL) setFaviconCircular(logoURL);

  skel.innerHTML = `
    <div class="w-full max-w-sm mx-auto text-center px-4">
      <div class="rounded-[24px] border border-white/5 bg-[#0d0e12] px-6 py-10 flex flex-col items-center">
        <div class="logo-avatar mb-5"><div class="logo-avatar-inner">
          ${logoURL ? `<img src="${logoURL}" alt="Logo" class="w-full h-full object-cover" crossorigin="anonymous">` : `<div class="w-full h-full skeleton"></div>`}
        </div></div>
        <p class="font-display font-semibold text-white text-base mb-2">Sigue a ${nombreTienda || "este negocio"}</p>
        <p class="text-white/40 text-xs font-mono-card mb-6 leading-relaxed">Para ver tu tarjeta y las recompensas que puedes canjear, primero debes seguir este negocio.</p>
        <button id="btnSeguirNegocio" class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold w-full max-w-[220px]">Seguir negocio</button>
        <p id="followError" class="hidden text-red-400/80 text-xs mt-3"></p>
      </div>
    </div>`;

  document
    .getElementById("btnSeguirNegocio")
    .addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Siguiendo...";
      try {
        await onFollow();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = "Seguir negocio";
        const errEl = document.getElementById("followError");
        if (errEl) {
          errEl.textContent = "No se pudo completar, intenta de nuevo.";
          errEl.classList.remove("hidden");
        }
      }
    });
}

async function seguirNegocio(uid) {
  const ref = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);
  await setDoc(ref, {
    id: uid,
    id_usuario: uid,
    puntos: 0,
    fecha_inicio: serverTimestamp(),
    ultimo_consumo: serverTimestamp(),
  });
}

/* ══════════════ Tilt / Flip / QR / Barcode ══════════════ */
let tiltFlipIniciado = false;

function initTilt() {
  const scene = document.querySelector(".card-scene");
  if (!scene) return;
  const card = document.getElementById("cardTilt");
  const max = 6;

  function updateTilt(clientX, clientY) {
    const rect = scene.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const rotY = (px - 0.5) * max * 2;
    const rotX = (0.5 - py) * max * 2;
    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.015)`;
    card.style.setProperty("--mx", `${px * 100}%`);
    card.style.setProperty("--my", `${py * 100}%`);
  }
  function resetTilt() {
    card.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)";
  }

  scene.addEventListener("mousemove", (e) => updateTilt(e.clientX, e.clientY));
  scene.addEventListener("mouseleave", resetTilt);
  scene.addEventListener(
    "touchstart",
    (e) => {
      scene.classList.add("is-active");
      updateTilt(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  scene.addEventListener(
    "touchmove",
    (e) => updateTilt(e.touches[0].clientX, e.touches[0].clientY),
    { passive: true },
  );
  scene.addEventListener("touchend", () => {
    scene.classList.remove("is-active");
    resetTilt();
  });
}

function initFlip() {
  const flipper = document.getElementById("cardFlipper");
  if (!flipper) return;
  const toggle = () => flipper.classList.toggle("is-flipped");

  flipper.addEventListener("click", toggle);
  flipper.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
}

function renderBarcode(seedStr) {
  const svg = document.getElementById("barcodeSvg");
  if (!svg) return;
  const width = 220,
    height = 28;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  let seed = 0;
  for (let i = 0; i < seedStr.length; i++)
    seed += seedStr.charCodeAt(i) * (i + 7);
  if (seed === 0) seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let x = 0;
  while (x < width) {
    const w = 1 + Math.floor(rand() * 2.5);
    if (rand() > 0.2) {
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.setAttribute("x", x);
      rect.setAttribute("y", 0);
      rect.setAttribute("width", w);
      rect.setAttribute("height", height);
      rect.setAttribute("fill", "currentColor");
      rect.setAttribute("opacity", (0.45 + rand() * 0.55).toFixed(2));
      svg.appendChild(rect);
    }
    x += w + 1 + Math.floor(rand() * 2);
  }

  document.getElementById("barcodeSkeleton")?.classList.add("hidden");
  svg.classList.remove("hidden");
}

function crearQREstilizado(codigoStr, colorHex) {
  return new window.QRCodeStyling({
    width: 300,
    height: 300,
    type: "canvas",
    data: codigoStr,
    margin: 10,
    qrOptions: { errorCorrectionLevel: "H" },
    dotsOptions: { type: "dots", color: colorHex },
    cornersSquareOptions: { type: "extra-rounded", color: colorHex },
    cornersDotOptions: { type: "dot", color: colorHex },
    backgroundOptions: { color: "#fdfdfd" },
  });
}

function pintarQR(codigoStr, colorHex) {
  const canvasHost = document.getElementById("qrCanvas");
  if (!canvasHost) return;

  if (typeof window.QRCodeStyling === "function") {
    canvasHost.innerHTML = "";
    const qr = crearQREstilizado(codigoStr, colorHex);
    qr.append(canvasHost);
    document.getElementById("qrSkeleton")?.remove();
    canvasHost.classList.remove("hidden");
  }

  const qrText = document.getElementById("qrCodeText");
  if (qrText) qrText.textContent = "ID: " + codigoStr;
}

function tryRenderQR() {
  if (qrState.rendered || !qrState.code) return;
  // qr-code-styling carga con defer: si aún no está, reintenta
  if (typeof window.QRCodeStyling !== "function") {
    setTimeout(tryRenderQR, 300);
    return;
  }
  pintarQR(qrState.code, brandDarkHex);
  qrState.rendered = true;
}

/* ══════════════ Textos de recompensas ══════════════ */
function textoVariante(p) {
  if (p.varianteTexto) return p.varianteTexto;

  const ve = p.varianteElegida;
  if (ve && typeof ve === "object" && Object.keys(ve).length) {
    return Object.entries(ve)
      .map(([clave, valor]) => `${clave}: ${valor}`)
      .join(", ");
  }
  return null;
}

function textoBeneficio(p) {
  if (p.origen !== "catalogo" || p.precioOriginal == null) return null;
  const orig = Number(p.precioOriginal);
  const d = p.descuento || {};
  switch (p.tipoBeneficio) {
    case "monto": {
      const monto = Number(d.monto || 0);
      const final =
        p.precioFinalEstimado != null
          ? Number(p.precioFinalEstimado)
          : Math.max(0, orig - monto);
      return `S/ ${orig.toFixed(2)} → <b>S/ ${final.toFixed(2)}</b> (–S/ ${monto.toFixed(2)})`;
    }
    case "porcentaje": {
      const pct = Number(d.porcentaje || 0);
      const final =
        p.precioFinalEstimado != null
          ? Number(p.precioFinalEstimado)
          : Math.max(0, orig * (1 - pct / 100));
      return `S/ ${orig.toFixed(2)} → <b>S/ ${final.toFixed(2)}</b> (–${pct}%)`;
    }
    case "cantidad": {
      const compra = d.compraUnidades ?? "?";
      const paga = d.pagaUnidades ?? "?";
      return `S/ ${orig.toFixed(2)} c/u · <b>${compra}x${paga}</b>`;
    }
    case "gratis":
    default:
      return `S/ ${orig.toFixed(2)} · <b>gratis con puntos</b>`;
  }
}

function rfCategoriaDe(p) {
  return p.categoria || p.categoriaNombre || p.categoria_producto || null;
}

const plano = (html) => String(html || "").replace(/<[^>]+>/g, "");

function pintarPuntosDOM(n) {
  const t = Number(n || 0).toLocaleString("es-PE");
  const c = document.getElementById("clientPoints");
  if (c) c.textContent = t;
  const h = document.getElementById("pointsHint");
  if (h) h.textContent = `${t} pts`;
}

function premiosParaUI(productos) {
  return productos
    .filter((p) => p.disponible !== false)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre || "Producto",
      costoPuntos: Number(p.costoPuntos ?? 0),
      imagenUrl: p.imagenUrl || "",
      detalle: [plano(textoBeneficio(p)), textoVariante(p)]
        .filter(Boolean)
        .join(" · "),
      categoria: rfCategoriaDe(p),
         unico: p.origen !== "catalogo",
      // campos que necesita el canje real (se conservan tal cual)
      origen: p.origen,
      productoId: p.productoId,
      tipoBeneficio: p.tipoBeneficio,
      descuento: p.descuento,
      varianteElegida: p.varianteElegida,
      precioOriginal: p.precioOriginal,
      precioFinalEstimado: p.precioFinalEstimado,
      compraMinima: p.compraMinima,
      tipoDescuentoManual: p.tipoDescuentoManual,
      porcentajeManual: p.porcentajeManual,
      montoManual: p.montoManual,
    }));
}

/* ══════════════ Historial paginado (para el módulo UI) ══════════════ */
async function fetchHistorialUI({ cursor }) {
  const ref = tiendaSubCol(
    LOCALIDAD,
    "tiendas",
    NEGOCIO_ID,
    "clientes",
    UID_ACTUAL,
    "historial",
  );
  const q = cursor
    ? query(
        ref,
        orderBy("fecha", "desc"),
        startAfter(cursor),
        limit(HP_PAGE_SIZE),
      )
    : query(ref, orderBy("fecha", "desc"), limit(HP_PAGE_SIZE));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => {
    const h = d.data();
    const puntos = Number(h.puntos ?? h.puntos_ganados ?? 0);
    return {
      tipo: h.tipo || (puntos >= 0 ? "ganado" : "canje"),
      concepto: h.concepto || (puntos >= 0 ? "Puntos ganados" : "Canje"),
      fecha: h.fecha?.toDate ? h.fecha.toDate() : null,
      puntos,
    };
  });
  return {
    rows,
    cursor: snap.docs[snap.docs.length - 1] || null,
    hayMas: snap.docs.length === HP_PAGE_SIZE,
  };
}

/* ══════════════ Cupones ══════════════ */
function cuponesCol(uid) {
  return tiendaSubCol(
    LOCALIDAD,
    "tiendas",
    NEGOCIO_ID,
    "clientes",
    uid,
    "cupones",
  );
}

async function cargarCuponesActivos(uid) {
  try {
    const q = query(
      cuponesCol(uid),
      where("estado", "==", "activo"),
      where("usado", "==", false),
      orderBy("creado", "desc"),
    );
    const snap = await getDocs(q);
    ui?.setCupones(
      snap.docs.map((d) => {
        const c = d.data();
        return {
          id: d.id,
          ...c,
          nombre: c.nombre || c.productoNombre || "Cupón",
        };
      }),
    );
  } catch (e) {
    console.warn("No se pudieron cargar los cupones activos:", e);
  }
}

/* Devuelve los puntos del cupón y lo marca como cancelado (transacción atómica) */
async function cancelarCupon(cupon, uid) {
  const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);
  const cuponRef = clienteCuponDoc(LOCALIDAD, NEGOCIO_ID, uid, cupon.codigo);
  const costo = Number(cupon.costoPuntos ?? 0);

  try {
    await runTransaction(db, async (tx) => {
      const cuponSnap = await tx.get(cuponRef);
      if (!cuponSnap.exists()) throw { motivo: "cupon_no_existe" };

      const cuponData = cuponSnap.data();
      if (cuponData.estado !== "activo" || cuponData.usado) {
        throw { motivo: "cupon_no_cancelable" };
      }

      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists()) throw { motivo: "sin_cliente" };
      const puntosActuales = Number(clienteSnap.data().puntos ?? 0);

      tx.update(clienteRef, { puntos: puntosActuales + costo });
      tx.update(cuponRef, {
        estado: "cancelado",
        canceladoEn: serverTimestamp(),
      });
    });

    try {
      await addDoc(
        tiendaSubCol(
          LOCALIDAD,
          "tiendas",
          NEGOCIO_ID,
          "clientes",
          uid,
          "historial",
        ),
        {
          tipo: "devolucion",
          fecha: serverTimestamp(),
          puntos: costo,
          concepto: `Devolución: ${cupon.nombre || cupon.productoNombre || "cupón"}`,
          codigoCupon: cupon.codigo,
        },
      );
    } catch (e) {
      console.warn("No se pudo registrar el historial de devolución:", e);
    }

    return true;
  } catch (err) {
    console.error("Error cancelando cupón:", err);
    if (err?.motivo === "cupon_no_cancelable") {
      showError(
        "Este cupón ya no se puede cancelar (ya fue usado o cancelado).",
      );
    } else {
      showError("No se pudo cancelar el cupón, intenta de nuevo.");
    }
    return false;
  }
}

async function onCancelarCuponUI(cupon) {
  const ok = await cancelarCupon(cupon, UID_ACTUAL);
  if (!ok) throw new Error("No se pudo cancelar");
  const snap = await getDoc(clienteDoc(LOCALIDAD, NEGOCIO_ID, UID_ACTUAL));
  const puntos = Number(snap.data()?.puntos ?? 0);
  pintarPuntosDOM(puntos);
  ui?.setPuntos(puntos);
  await cargarCuponesActivos(UID_ACTUAL);
}

/* ══════════════ Canje ══════════════ */
function generarCodigoCupon() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
  let codigo = "";
  for (let i = 0; i < 8; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

function armarCuponData(producto, codigo, uid) {
  const esProducto = producto.origen === "catalogo";
  return {
    codigo,
    tipo: esProducto ? "producto" : "manual",
    origen: "fidelizacion",
    costoPuntos: Number(producto.costoPuntos ?? 0),
    nombre: producto.nombre || null,
    productoId: esProducto ? producto.productoId || null : null,
    productoNombre: esProducto ? producto.nombre || null : null,
    tipoBeneficio: esProducto ? producto.tipoBeneficio || null : null,
    descuento: esProducto ? producto.descuento || null : null,
    varianteElegida: esProducto ? producto.varianteElegida || null : null,
    precioOriginal: esProducto ? (producto.precioOriginal ?? null) : null,
    precioFinalEstimado: esProducto
      ? (producto.precioFinalEstimado ?? null)
      : null,
    compraMinima: !esProducto ? Number(producto.compraMinima ?? 0) : null,
    tipoDescuentoManual: !esProducto
      ? producto.tipoDescuentoManual || null
      : null,
    porcentajeManual: !esProducto ? (producto.porcentajeManual ?? null) : null,
    montoManual: !esProducto ? (producto.montoManual ?? null) : null,
    clienteId: uid,
    negocioId: NEGOCIO_ID,
    localidad: LOCALIDAD,
    estado: "activo",
    usado: false,
    pedidoId: null,
    creado: serverTimestamp(),
  };
}

/* Canje de VARIOS premios en UNA sola transacción (todo o nada) */
async function canjearVarios(itemsIn, uid) {
  const items = itemsIn.map((it) => ({
    premio: it.premio,
    cantidad: it.premio?.unico ? 1 : it.cantidad,
  }));
  const unidades = [];
  items.forEach(({ premio, cantidad }) => {
    for (let i = 0; i < cantidad; i++) unidades.push(premio);
  });
  if (!unidades.length) throw new Error("No elegiste ningún premio");

  const total = unidades.reduce((s, p) => s + Number(p.costoPuntos || 0), 0);
  const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);

  const codigos = new Set();
  while (codigos.size < unidades.length) codigos.add(generarCodigoCupon());
  const lista = [...codigos];
  const cuponRefs = lista.map((c) =>
    clienteCuponDoc(LOCALIDAD, NEGOCIO_ID, uid, c),
  );

  // Un solo ref por producto real del catálogo
  const prodRefs = new Map();
  unidades.forEach((p) => {
    if (
      p.origen === "catalogo" &&
      p.productoId &&
      p.categoria &&
      !prodRefs.has(p.productoId)
    ) {
      prodRefs.set(
        p.productoId,
        doc(
          tiendaSubCol(
            LOCALIDAD,
            "tiendas",
            NEGOCIO_ID,
            "productos",
            p.categoria,
            p.categoria,
          ),
          p.productoId,
        ),
      );
    }
  });

  let puntosRestantes = 0;
  await runTransaction(db, async (tx) => {
    // ---- lecturas ----
    const cs = await tx.get(clienteRef);
    if (!cs.exists()) throw new Error("No encontramos tu tarjeta");
    const puntosDb = Number(cs.data().puntos ?? 0);
    if (puntosDb < total)
      throw new Error("Tus puntos cambiaron, ya no te alcanzan");

    const prodData = new Map();
    for (const [id, ref] of prodRefs) {
      const s = await tx.get(ref);
      prodData.set(id, s.exists() ? s.data() : null);
    }
    for (const ref of cuponRefs) {
      const s = await tx.get(ref);
      if (s.exists()) throw new Error("Código duplicado, intenta de nuevo");
    }

    // ---- validaciones ----
    for (const p of unidades) {
      if (!prodRefs.has(p.productoId)) continue;
      const d = prodData.get(p.productoId);
      if (!d || d.disponible === false)
        throw new Error(`"${p.nombre}" ya no está disponible`);
      const ve = p.varianteElegida;
      if (ve && typeof ve === "object") {
        for (const [cn, on] of Object.entries(ve)) {
          const cond = (d.condiciones || []).find((c) => c.nombre === cn);
          const op = cond?.opciones?.find((o) => o.nombre === on);
          const sinStock = typeof op?.stock === "number" && op.stock <= 0;
          if (!cond || !op || op.activo === false || sinStock)
            throw new Error(
              `La variante de "${p.nombre}" ya no está disponible`,
            );
        }
      }
    }

    // ---- escrituras ----
    puntosRestantes = puntosDb - total;
    tx.update(clienteRef, { puntos: puntosRestantes });
    unidades.forEach((p, i) =>
      tx.set(cuponRefs[i], armarCuponData(p, lista[i], uid)),
    );
  });

  // Historial (una línea por premio, fuera de la transacción)
  const histRef = tiendaSubCol(
    LOCALIDAD,
    "tiendas",
    NEGOCIO_ID,
    "clientes",
    uid,
    "historial",
  );
  await Promise.all(
    items.map(({ premio, cantidad }) =>
      addDoc(histRef, {
        tipo: "canje",
        fecha: serverTimestamp(),
        puntos: -Number(premio.costoPuntos || 0) * cantidad,
        concepto:
          cantidad > 1
            ? `${premio.nombre} ×${cantidad}`
            : premio.nombre || "Canje de recompensa",
      }).catch((e) => console.warn("historial canje:", e)),
    ),
  );

  return { codigos: lista, puntosRestantes };
}

function irAlCarritoConCupon(codigo) {
  const destino = ES_DOMINIO_PROPIO
    ? `/carrito?cupon=${encodeURIComponent(codigo)}`
    : ALIAS_NEGOCIO
      ? `${LANDING_BASE_URL}/perfil/${encodeURIComponent(ALIAS_NEGOCIO)}/carrito?cupon=${encodeURIComponent(codigo)}`
      : `${LANDING_BASE_URL}/carrito?id=${encodeURIComponent(NEGOCIO_ID)}&localidad=${encodeURIComponent(LOCALIDAD)}&cupon=${encodeURIComponent(codigo)}`;
  window.location.href = destino;
}

async function onCanjearUI(items) {
  if (!horarioEstado.abierto)
    throw new Error(horarioEstado.mensaje || "El negocio está cerrado ahora");
  if (!UID_ACTUAL) throw new Error("Debes iniciar sesión");

  const { codigos, puntosRestantes } = await canjearVarios(items, UID_ACTUAL);
  // Solo el texto de la tarjeta: el módulo ya resta los puntos en su estado.
  pintarPuntosDOM(puntosRestantes);
  cargarCuponesActivos(UID_ACTUAL);

  // Un solo premio: te lleva al carrito con el cupón aplicado.
  if (codigos.length === 1)
    setTimeout(() => irAlCarritoConCupon(codigos[0]), 700);
}

/* ══════════════ Carga principal ══════════════ */
async function cargarDatos(uid) {
  try {
    if (!NEGOCIO_ID || !uid) throw new Error("Faltan parámetros.");

    const tiendaRef = tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID);
    const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);

    const [tiendaSnap, clienteSnap] = await Promise.all([
      getDoc(tiendaRef),
      getDoc(clienteRef),
    ]);

    const tienda = tiendaSnap.exists() ? tiendaSnap.data() : {};
    horarioEstado = evaluarHorarioNegocio(tienda, new Date());
    const nombreTienda = tienda.nombre_tienda || "Mi Negocio";
    const logoURL =
      tienda.logoURL || tienda.logo || tienda.urlLogo || LOGO_FALLBACK_URL;

    if (!clienteSnap.exists()) {
      showFollowGate(nombreTienda, logoURL, async () => {
        await seguirNegocio(uid);
        await cargarDatos(uid);
      });
      return;
    }

    const cliente = clienteSnap.data();

    const storeNameEl = document.getElementById("storeName");
    if (storeNameEl) storeNameEl.textContent = nombreTienda;

    const [colorLogo, usuario, productos] = await Promise.all([
      cargarLogoYColor(logoURL, nombreTienda),
      cargarUsuario(cliente.id_usuario),
      cargarProductos(NEGOCIO_ID),
    ]);

    aplicarColorMarca(colorLogo);

    const nombreCliente =
      [capitalizar(usuario.nombre), capitalizar(usuario.apellido)]
        .filter(Boolean)
        .join(" ") ||
      usuario.nombre_user ||
      "Cliente Frecuente";

    const puntos = Number(cliente.puntos ?? 0);
    const nivel = calcularNivel(puntos);
    const codigo = cliente.id || clienteSnap.id;
    const clienteDesde = formatearFechaInicio(cliente.fecha_inicio);

    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setText("clientName", nombreCliente);
    setText("clientCode", "ID: " + codigo);
    setText("tierBadge", nivel);
    pintarPuntosDOM(puntos);
    renderBarcode(String(codigo));

    qrState.code = String(codigo);
    tryRenderQR();

    if (clienteDesde && !document.getElementById("clienteDesdeTxt")) {
      const pointsEl = document.getElementById("clientPoints");
      if (pointsEl) {
        const p = document.createElement("p");
        p.id = "clienteDesdeTxt";
        p.className =
          "fluid-eyebrow text-white/30 mt-1.5 font-mono-card uppercase";
        p.textContent = `Cliente desde ${clienteDesde}`;
        pointsEl.insertAdjacentElement("afterend", p);
      }
    }

    // ── Módulo UI nuevo (recompensas, historial, cupones) ──
    if (!ui) {
      ui = initFidelizacionUI({
        grid: document.getElementById("rewardsGrid"),
        filtros: document.getElementById("rewardsFiltros"),
        header: document.getElementById("pointsHint").parentElement,
        onCanjear: onCanjearUI,
        fetchHistorial: fetchHistorialUI,
        onCancelarCupon: onCancelarCuponUI,
      });
    }
    ui.setPuntos(puntos);
    ui.setPremios(premiosParaUI(productos));
    cargarCuponesActivos(uid);

    if (!tiltFlipIniciado) {
      initTilt();
      initFlip();
      tiltFlipIniciado = true;
    }

    // Revisa el horario cada 30 s; si cambia, refresca los premios
    if (horarioCheckInterval) clearInterval(horarioCheckInterval);
    horarioCheckInterval = setInterval(() => {
      const nuevoEstado = evaluarHorarioNegocio(tienda, new Date());
      const cambio = nuevoEstado.abierto !== horarioEstado.abierto;
      horarioEstado = nuevoEstado;
      if (cambio && ui) ui.setPremios(premiosParaUI(productos));
    }, 30000);

    revealCard();
  } catch (err) {
    console.error(err);
    showError("No se pudieron cargar los datos.");
    document.getElementById("logoSkeleton")?.remove();
    revealCard();
  }
}

/* ══════════════ INIT ══════════════ */
(async () => {
  const ruta = await resolverRuta();
  if (!ruta) {
    showError("Enlace inválido: falta el negocio.");
    return;
  }
  NEGOCIO_ID = ruta.negocioId;
  LOCALIDAD = ruta.localidad;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      if (_esperandoToken) return;
      showLoginGate();
      return;
    }
    _esperandoToken = false;
    UID_ACTUAL = user.uid;
    cargarDatos(user.uid);
  });
})();
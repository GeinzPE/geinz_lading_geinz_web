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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  tiendaDoc,
  clienteDoc,
  tiendaDescuentosCol,
  data_user_logeado,
  clienteCuponDoc,
  tiendaSubCol,
} from "../rutas/rutas.js";
import { setFaviconCircular } from "../favicon/favicon.js";

const LANDING_BASE_URL = "https://geinztech.com";
const LOCALIDAD_FIJA = "barranca";

const USUARIOS_ROOT = "Trabajadores_Usuarios_Drivers/users/users";
const LOGO_FALLBACK_URL =
  "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/tiendas%2FfW7W8RsgkkQ3IYfxKHGR%2Flogo%2Flogo.webp?alt=media&token=bb6e8d14-131a-449b-92bf-e4675bdab41b";

const NIVELES = [
  { min: 0, label: "Nivel Bronce" },
  { min: 150, label: "Nivel Plata" },
  { min: 400, label: "Nivel Oro VIP" },
];
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

let horarioEstado = { abierto: true, mensaje: "" };
let horarioCheckInterval = null;

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
    let fin = parseHoraAMinutos(bloque.h_cierre);
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
   Formato nuevo y seguro: /perfil/{alias}/fidelizacion/{uid}
     -> se resuelve el negocio real (id + localidad) consultando alias_tiendas,
        igual que en carrito.js / estado_pedidos.js. El {uid} del path es
        informativo (la tarjeta siempre es la del usuario autenticado); no
        se usa para las consultas, pero queda disponible por si se necesita
        más adelante (ej. validar que coincide con auth.currentUser.uid).
   Formato viejo (compatibilidad con links ya enviados):
     ?localidad=&id=   -> usa esos valores tal cual, LOCALIDAD_FIJA si falta. */

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
    console.error(
      "[fidelizacion] No se pudo resolver el alias del negocio:",
      e,
    );
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

  // Formato nuevo: /perfil/{alias}/fidelizacion/{uid}
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
  const cruda = parseRutaCruda();
  if (!cruda) return null;

  if (cruda.tipo === "id") {
    return { negocioId: cruda.negocioId, localidad: cruda.localidad };
  }

  const resuelto = await resolverNegocioDesdeAlias(cruda.alias);
  if (!resuelto) return null;
  ALIAS_NEGOCIO = cruda.alias; // se guarda para construir el link de vuelta al carrito
  return { negocioId: resuelto.id, localidad: resuelto.localidad };
}
// ─── Estas dos se completan de forma async antes de arrancar (ver INIT al final) ───
let LOCALIDAD = LOCALIDAD_FIJA;
let NEGOCIO_ID = null;
let ALIAS_NEGOCIO = null;
let UID_ACTUAL = null;

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

function cargarLogoYColor(logoURL, nombreTienda) {
  return new Promise((resolve) => {
    const img = document.getElementById("logoImg");
    if (!img || !logoURL) {
      resolve(colorFromName(nombreTienda));
      return;
    }

    // Actualiza el favicon dinámicamente con el logo del negocio
    setFaviconCircular(logoURL);

    img.src = logoURL;
    img.onload = async () => {
      img.classList.remove("hidden");
      document.getElementById("logoSkeleton")?.remove();
      let color = await getDominantColor(img);
      resolve(color || colorFromName(nombreTienda));
    };
    img.onerror = () => {
      document.getElementById("logoSkeleton")?.remove();
      resolve(colorFromName(nombreTienda));
    };
  });
}

let brandDarkHex = "#2e1065";
const qrState = { code: null, colorReady: false, rendered: false };

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

/* ── Gate: no logeado. Oculta la tarjeta (sin destruirla) y muestra
   el aviso dentro del contenedor de skeleton. ── */
function showLoginGate() {
  const skel = document.getElementById("fullSkeleton");
  if (skel) {
    skel.innerHTML = `
      <div class="w-full max-w-sm mx-auto text-center px-4">
        <div class="rounded-[24px] border border-white/5 bg-[#0d0e12] px-6 py-10 flex flex-col items-center">
          <div class="logo-avatar mb-5"><div class="logo-avatar-inner">
            <div class="w-full h-full skeleton"></div>
          </div></div>
          <p class="font-display font-semibold text-white text-base mb-2">Inicia sesión para ver tu tarjeta</p>
          <p class="text-white/40 text-xs font-mono-card mb-6 leading-relaxed">Necesitas tu cuenta de Geinz para ver tus puntos y canjear recompensas.</p>
          <a href="../logindata/login.html?redirect=${encodeURIComponent(window.location.href)}"
             class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold inline-block">Iniciar sesión</a>
        </div>
      </div>`;
  }
}

/* ── Gate: logeado pero no sigue el negocio. Igual: oculta, no destruye. ── */
function showFollowGate(nombreTienda, logoURL, onFollow) {
  const skel = document.getElementById("fullSkeleton");
  if (!skel) return;

  if (logoURL) {
    setFaviconCircular(logoURL);
  }

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

        const br = r >> 4,
          bg = g >> 4,
          bb = b >> 4;
        const key = `${br},${bg},${bb}`;
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
    (e) => {
      updateTilt(e.touches[0].clientX, e.touches[0].clientY);
    },
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
  pintarQR(qrState.code, brandDarkHex);
  qrState.rendered = true;
}

function textoVariante(p) {
  // Prioriza el texto ya armado si viene de la DB
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

function generarCodigoCupon() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para que no se confundan al leerlo
  let codigo = "";
  for (let i = 0; i < 8; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

async function verificarDisponibilidadRecompensa(p) {
  // las recompensas manuales (no ligadas a un producto del catálogo) siempre están disponibles
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
    return true; // si falla la verificación, no bloqueamos por las dudas
  }
}
/* Descuenta puntos y crea el cupón en una sola transacción atómica */
async function canjearRecompensa(producto, uid, puntosActuales) {
  console.log(
    "[CUPON] (fidelizacion) canjearRecompensa() con producto:",
    producto,
  );
  console.log(
    "[CUPON] (fidelizacion) varianteElegida del producto a canjear:",
    producto.varianteElegida,
  );
  const costo = Number(producto.costoPuntos ?? 0);
  if (puntosActuales < costo) {
    showError("No tienes suficientes puntos para este canje.");
    return null;
  }
  const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);
  const codigo = generarCodigoCupon();
  const cuponRef = clienteCuponDoc(LOCALIDAD, NEGOCIO_ID, uid, codigo);
  const esProducto = producto.origen === "catalogo";

  // Referencia al producto REAL del catálogo (no al doc de la recompensa,
  // que puede estar desactualizado). Solo aplica si es canje de producto.
  const productoRealRef =
    esProducto && producto.productoId && producto.categoria
      ? doc(
          tiendaSubCol(
            LOCALIDAD,
            "tiendas",
            NEGOCIO_ID,
            "productos",
            producto.categoria,
            producto.categoria,
          ),
          producto.productoId,
        )
      : null;

  try {
    await runTransaction(db, async (tx) => {
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists()) throw { motivo: "sin_cliente" };

      const puntosDb = Number(clienteSnap.data().puntos ?? 0);
      if (puntosDb < costo) throw { motivo: "sin_puntos" };

      // ── Validación en tiempo real: ¿el producto/variante sigue existiendo? ──
      if (productoRealRef) {
        const prodSnap = await tx.get(productoRealRef);
        if (!prodSnap.exists() || prodSnap.data().disponible === false) {
          throw { motivo: "producto_no_disponible" };
        }

        const prodData = prodSnap.data();
        const ve = producto.varianteElegida;
        if (ve && typeof ve === "object") {
          for (const [condNombre, opcionNombre] of Object.entries(ve)) {
            const cond = (prodData.condiciones || []).find(
              (c) => c.nombre === condNombre,
            );
            const op = cond?.opciones?.find((o) => o.nombre === opcionNombre);
            const sinStock = typeof op?.stock === "number" && op.stock <= 0;
            if (!cond || !op || op.activo === false || sinStock) {
              throw { motivo: "variante_no_disponible" };
            }
          }
        }
      }

      const cuponSnap = await tx.get(cuponRef);
      if (cuponSnap.exists()) throw { motivo: "codigo_duplicado" };

      const cuponData = {
        codigo,
        tipo: esProducto ? "producto" : "manual",
        origen: "fidelizacion",
        costoPuntos: costo,
        nombre: producto.nombre || null,
        productoId: esProducto ? producto.productoId || null : null,
        productoNombre: esProducto ? producto.nombre || null : null,
        tipoBeneficio: esProducto ? producto.tipoBeneficio || null : null,
        descuento: esProducto ? producto.descuento || null : null,
        varianteElegida: esProducto ? producto.varianteElegida || null : null, // ← nuevo
        precioOriginal: esProducto ? (producto.precioOriginal ?? null) : null,
        precioFinalEstimado: esProducto
          ? (producto.precioFinalEstimado ?? null)
          : null,
        compraMinima: !esProducto ? Number(producto.compraMinima ?? 0) : null,
        tipoDescuentoManual: !esProducto
          ? producto.tipoDescuentoManual || null
          : null,
        porcentajeManual: !esProducto
          ? (producto.porcentajeManual ?? null)
          : null,
        montoManual: !esProducto ? (producto.montoManual ?? null) : null,
        clienteId: uid,
        negocioId: NEGOCIO_ID,
        localidad: LOCALIDAD,
        estado: "activo",
        usado: false,
        pedidoId: null,
        creado: serverTimestamp(),
      };
      tx.update(clienteRef, { puntos: puntosDb - costo });
      tx.set(cuponRef, cuponData);
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
          tipo: "canje",
          fecha: serverTimestamp(),
          puntos: -costo,
          concepto: producto.nombre || "Canje de recompensa",
          codigoCupon: codigo,
        },
      );
    } catch (e) {
      console.warn("No se pudo registrar el historial de canje:", e);
    }

    return codigo;
    console.log(
      "[CUPON] (fidelizacion) cupón creado con código:",
      codigo,
      "| varianteElegida guardada:",
      producto.varianteElegida,
    );
  } catch (err) {
    console.error("Error canjeando recompensa:", err);
    if (err?.motivo === "sin_puntos")
      showError("Tus puntos cambiaron, ya no te alcanza para este canje.");
    else if (err?.motivo === "producto_no_disponible")
      showError("Este producto ya no está disponible para canjear.");
    else if (err?.motivo === "variante_no_disponible")
      showError("Esa variante ya no está disponible, elige otra recompensa.");
    else showError("No se pudo procesar el canje, intenta de nuevo.");
    return null;
  }
}

async function onCanjearClick(btn, producto, puntosActuales) {
  if (!horarioEstado.abierto) {
    showError(
      horarioEstado.mensaje ||
        "El negocio está cerrado ahora, no se puede canjear.",
    );
    return;
  }
  if (!UID_ACTUAL) {
    showError("Debes iniciar sesión.");
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Canjeando...";

  const codigo = await canjearRecompensa(producto, UID_ACTUAL, puntosActuales);
  if (!codigo) {
    btn.disabled = false;
    btn.textContent = original;
    // refresca la lista de recompensas por si esta ya no está disponible
    const productosFrescos = await cargarProductos(NEGOCIO_ID);
    inicializarFiltrosRecompensas(productosFrescos, puntosActuales);
    return;
  }

  const destino = ALIAS_NEGOCIO
    ? `${LANDING_BASE_URL}/perfil/${encodeURIComponent(ALIAS_NEGOCIO)}/carrito?cupon=${encodeURIComponent(codigo)}`
    : `${LANDING_BASE_URL}/carrito?id=${encodeURIComponent(NEGOCIO_ID)}&localidad=${encodeURIComponent(LOCALIDAD)}&cupon=${encodeURIComponent(codigo)}`;

  btn.textContent = "¡Canjeado! Yendo al carrito…";
  setTimeout(() => {
    window.location.href = destino;
  }, 500);
}

function renderRecompensas(productos, puntosCliente) {
  const grid = document.getElementById("rewardsGrid");
  if (!grid) return;

  // fade-out suave del contenido anterior antes de reemplazarlo
  grid.style.transition = "opacity 0.15s ease";
  grid.style.opacity = "0";

  setTimeout(() => {
    grid.innerHTML = "";

    if (!productos.length) {
      grid.innerHTML = `<p class="col-span-2 text-center text-white/30 text-xs font-mono-card py-6">Aún no hay recompensas disponibles.</p>`;
      grid.style.opacity = "1";
      return;
    }

    productos.forEach((p) => {
      const costo = Number(p.costoPuntos ?? 0);
      const disponible = p.disponible !== false;
      const alcanza =
        disponible && puntosCliente >= costo && horarioEstado.abierto;
      const beneficioTxt = textoBeneficio(p);
      const varianteTxt = textoVariante(p);
      const el = document.createElement("div");
      el.className =
        "reward-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between";
      el.innerHTML = `
        <div class="min-w-0">
          <div class="reward-icon overflow-hidden mb-2.5">
            ${
              p.imagenUrl
                ? `<img src="${p.imagenUrl}" alt="${p.nombre || ""}" class="w-full h-full object-cover rounded-xl"
                     loading="eager" decoding="async"
                     onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'text-base sm:text-lg',textContent:'🎁'}))">`
                : `<span class="text-base sm:text-lg">🎁</span>`
            }
          </div>
          <p class="font-display text-[12.5px] sm:text-xs font-semibold leading-tight text-white break-words">${p.nombre || "Producto"}</p>
          ${beneficioTxt ? `<p class="font-mono-card text-[10px] sm:text-[10.5px] text-white/45 mt-1 leading-snug">${beneficioTxt}</p>` : ""}
          ${varianteTxt ? `<p class="font-mono-card text-[10px] sm:text-[10.5px] text-white/40 mt-1 leading-snug">🔸 ${varianteTxt}</p>` : ""}
          <p class="font-mono-card text-[10.5px] sm:text-xs text-white/40 mt-1">${costo} pts</p>
        </div>
     <button class="btn-redeem mt-3 sm:mt-4 text-[11px] font-mono-card font-semibold rounded-lg py-2 w-full active:scale-[0.97]" ${alcanza ? "" : "disabled"}>
    ${!disponible ? "AGOTADO" : !horarioEstado.abierto ? "CERRADO" : alcanza ? "CANJEAR" : "BLOQUEADO"}
  </button>
      `;
      if (alcanza) {
        const btn = el.querySelector(".btn-redeem");
        btn.addEventListener("click", () =>
          onCanjearClick(btn, p, puntosCliente),
        );
      }
      grid.appendChild(el);
    });

    grid.style.opacity = "1";
  }, 150);
}

/* ══════════════════════════════════════════
   FILTROS DE RECOMPENSAS POR CATEGORÍA
   Solo se activan si los productos traen un campo de categoría
   en la base de datos (categoria / categoriaNombre). Si ningún
   producto lo trae, la barra de filtros no se muestra y todo
   sigue funcionando exactamente igual que antes.
   ══════════════════════════════════════════ */
let rfProductosTodos = [];
let rfFiltroActivo = "todos";

function rfCategoriaDe(p) {
  return p.categoria || p.categoriaNombre || p.categoria_producto || null;
}

function inicializarFiltrosRecompensas(productos, puntosCliente) {
  rfProductosTodos = productos;
  rfFiltroActivo = "todos";

  const cont = document.getElementById("rewardsFiltros");
  if (!cont) {
    renderRecompensas(productos, puntosCliente);
    return;
  }

  const categorias = [...new Set(productos.map(rfCategoriaDe).filter(Boolean))];

  // Sin categorías (o solo una) en la DB -> no mostrar filtros
  if (categorias.length < 2) {
    cont.className = "";
    cont.innerHTML = "";
    renderRecompensas(productos, puntosCliente);
    return;
  }

  cont.className = "hp-filtros mb-1";
  cont.innerHTML = `
    <button type="button" class="hp-chip active" data-cat="todos">Todos</button>
    ${categorias
      .map(
        (c) =>
          `<button type="button" class="hp-chip" data-cat="${c}">${c}</button>`,
      )
      .join("")}
  `;

  cont.querySelectorAll(".hp-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      cont
        .querySelectorAll(".hp-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      rfFiltroActivo = chip.dataset.cat;

      const filtrados =
        rfFiltroActivo === "todos"
          ? rfProductosTodos
          : rfProductosTodos.filter((p) => rfCategoriaDe(p) === rfFiltroActivo);

      renderRecompensas(filtrados, puntosCliente);
    });
  });

  renderRecompensas(productos, puntosCliente);
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

function formatearFechaHistorial(ts) {
  try {
    const fecha = ts?.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(fecha);
  } catch {
    return "";
  }
}

const HP_PAGE_SIZE = 15;
let hpTodosLosMovimientos = []; // caché en memoria de todo lo ya traído de Firestore
let hpFiltroActivo = "todos";
let hpVisibleCount = HP_PAGE_SIZE;
let hpUidActual = null;
let hpCargando = false;

function hpRenderRow(h) {
  const iconMap = { ganado: "🎉", canje: "🎁", devolucion: "↩️" };
  const puntos = Number(h.puntos ?? h.puntos_ganados ?? 0);
  const positivo = puntos >= 0;
  const icon = iconMap[h.tipo] || (positivo ? "🎉" : "🎁");
  return `
    <div class="hp-row">
      <div class="min-w-0">
        <p class="hp-concepto">${icon} ${h.concepto || (positivo ? "Puntos ganados" : "Canje")}</p>
        <p class="hp-fecha">${formatearFechaHistorial(h.fecha)}</p>
      </div>
      <span class="hp-puntos ${positivo ? "positivo" : "negativo"}">${positivo ? "+" : ""}${puntos} pts</span>
    </div>`;
}

function hpPintarLista() {
  const cont = document.getElementById("historialPuntosList");
  const verMasBtn = document.getElementById("hpVerMasBtn");
  const countBadge = document.getElementById("hpCountBadge");
  if (!cont) return;

  const filtrados =
    hpFiltroActivo === "todos"
      ? hpTodosLosMovimientos
      : hpTodosLosMovimientos.filter((h) => h.tipo === hpFiltroActivo);

  if (countBadge) countBadge.textContent = hpTodosLosMovimientos.length;

  if (!filtrados.length) {
    cont.innerHTML = `<p class="text-center text-white/30 text-xs font-mono-card py-4">Sin movimientos en esta categoría.</p>`;
    if (verMasBtn) verMasBtn.classList.add("hidden");
    return;
  }

  const visibles = filtrados.slice(0, hpVisibleCount);
  cont.innerHTML = visibles.map(hpRenderRow).join("");

  if (verMasBtn) {
    const hayMasEnFiltro = visibles.length < filtrados.length;
    verMasBtn.classList.toggle("hidden", !hayMasEnFiltro);
    verMasBtn.textContent = "Ver más";
    verMasBtn.disabled = false;
  }
}

async function hpCargarMasDesdeDB() {
  if (hpCargando || !hpUidActual) return;
  hpCargando = true;
  try {
    const ref = tiendaSubCol(
      LOCALIDAD,
      "tiendas",
      NEGOCIO_ID,
      "clientes",
      hpUidActual,
      "historial",
    );
    const q = query(
      ref,
      orderBy("fecha", "desc"),
      limit(hpTodosLosMovimientos.length + HP_PAGE_SIZE),
    );
    const snap = await getDocs(q);
    hpTodosLosMovimientos = snap.docs.map((d) => d.data());
  } catch (e) {
    console.warn("No se pudo cargar más historial:", e);
  } finally {
    hpCargando = false;
  }
}

async function cargarHistorialPuntos(uid) {
  const cont = document.getElementById("historialPuntosList");
  if (!cont) return;
  hpUidActual = uid;

  try {
    const ref = tiendaSubCol(
      LOCALIDAD,
      "tiendas",
      NEGOCIO_ID,
      "clientes",
      uid,
      "historial",
    );
    const q = query(ref, orderBy("fecha", "desc"), limit(HP_PAGE_SIZE));
    const snap = await getDocs(q);
    hpTodosLosMovimientos = snap.docs.map((d) => d.data());
    hpVisibleCount = HP_PAGE_SIZE;
    hpPintarLista();
  } catch (e) {
    console.warn("No se pudo cargar el historial de puntos:", e);
    cont.innerHTML = `<p class="text-center text-white/30 text-xs font-mono-card py-4">No se pudo cargar el historial.</p>`;
  }
}

/* ══════════════════════════════════════════
   CUPONES ACTIVOS
   ══════════════════════════════════════════ */

function cuponesCol(uid) {
  // Si tu subcolección real tiene otro nombre, cámbialo aquí:
  return tiendaSubCol(
    LOCALIDAD,
    "tiendas",
    NEGOCIO_ID,
    "clientes",
    uid,
    "cupones",
  );
}

let cuponesToggleWired = false;

function renderCupones(lista) {
  const wrap = document.getElementById("cuponesSection");
  const cont = document.getElementById("cuponesList");
  const badge = document.getElementById("cuponesCountBadge");
  if (!wrap || !cont) return;

  if (badge) badge.textContent = lista.length;

  if (!lista.length) {
    wrap.classList.add("hidden");
    cont.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");

  // Engancha el toggle solo una vez (la primera vez que aparecen cupones)
  if (!cuponesToggleWired) {
    const toggleBtn = document.getElementById("cuponesToggleBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => wrap.classList.toggle("open"));
    }
    cuponesToggleWired = true;
  }

  cont.innerHTML = lista
    .map((c) => {
      const nombre = c.nombre || c.productoNombre || "Cupón";
      let detalle = `${c.costoPuntos ?? 0} pts`;
      if (c.tipoBeneficio === "monto" && c.descuento?.monto != null) {
        detalle += ` · –S/ ${Number(c.descuento.monto).toFixed(2)}`;
      } else if (
        c.tipoBeneficio === "porcentaje" &&
        c.descuento?.porcentaje != null
      ) {
        detalle += ` · –${c.descuento.porcentaje}%`;
      }
      return `
        <div class="cupon-row">
          <div class="min-w-0">
            <p class="cupon-nombre">${nombre}</p>
            <p class="cupon-detalle">${detalle}</p>
            <p class="cupon-codigo">${c.codigo}</p>
          </div>
          <button class="btn-cancelar-cupon" data-codigo="${c.codigo}">Cancelar</button>
        </div>`;
    })
    .join("");

  cont.querySelectorAll(".btn-cancelar-cupon").forEach((btn) => {
    const cupon = lista.find((x) => x.codigo === btn.dataset.codigo);
    btn.addEventListener("click", () => onCancelarCuponClick(btn, cupon));
  });
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
    const cupones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCupones(cupones);
  } catch (e) {
    // Si Firestore pide un índice compuesto, el error trae el link
    // para crearlo automáticamente en la consola.
    console.warn("No se pudieron cargar los cupones activos:", e);
  }
}

/* Devuelve los puntos del cupón al cliente y lo marca como cancelado,
   todo en una transacción atómica (igual que el canje). */
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

async function refrescarTrasCancelacion(uid) {
  const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);
  const snap = await getDoc(clienteRef);
  const puntos = Number(snap.data()?.puntos ?? 0);

  document.getElementById("clientPoints") &&
    (document.getElementById("clientPoints").textContent =
      puntos.toLocaleString("es-PE"));
  document.getElementById("pointsHint") &&
    (document.getElementById("pointsHint").textContent =
      `${puntos.toLocaleString("es-PE")} pts`);

  const productos = await cargarProductos(NEGOCIO_ID);
  inicializarFiltrosRecompensas(productos, puntos);
  await cargarCuponesActivos(uid);
  await cargarHistorialPuntos(uid);
}

async function onCancelarCuponClick(btn, cupon) {
  if (!UID_ACTUAL || !cupon) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Cancelando...";

  const ok = await cancelarCupon(cupon, UID_ACTUAL);
  if (ok) {
    await refrescarTrasCancelacion(UID_ACTUAL);
  } else {
    btn.disabled = false;
    btn.textContent = original;
  }
}
function initHistorialPuntosUI() {
  const section = document.getElementById("historialSection");
  const toggleBtn = document.getElementById("hpToggleBtn");
  if (toggleBtn && section) {
    toggleBtn.addEventListener("click", () => section.classList.toggle("open"));
  }

  document.querySelectorAll("#hpFiltros .hp-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll("#hpFiltros .hp-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      hpFiltroActivo = chip.dataset.filtro;
      hpVisibleCount = HP_PAGE_SIZE;
      hpPintarLista();
    });
  });

  const verMasBtn = document.getElementById("hpVerMasBtn");
  if (verMasBtn) {
    verMasBtn.addEventListener("click", async () => {
      verMasBtn.disabled = true;
      verMasBtn.textContent = "Cargando…";
      const antes = hpTodosLosMovimientos.length;
      await hpCargarMasDesdeDB();
      if (hpTodosLosMovimientos.length === antes) {
        // ya no hay más en la base de datos
        hpVisibleCount = hpTodosLosMovimientos.length + 1;
      } else {
        hpVisibleCount += HP_PAGE_SIZE;
      }
      hpPintarLista();
    });
  }
}
initHistorialPuntosUI();

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

    document.getElementById("clientName") &&
      (document.getElementById("clientName").textContent = nombreCliente);
    document.getElementById("clientPoints") &&
      (document.getElementById("clientPoints").textContent =
        puntos.toLocaleString("es-PE"));
    document.getElementById("clientCode") &&
      (document.getElementById("clientCode").textContent = "ID: " + codigo);
    document.getElementById("tierBadge") &&
      (document.getElementById("tierBadge").textContent = nivel);
    document.getElementById("pointsHint") &&
      (document.getElementById("pointsHint").textContent =
        `${puntos.toLocaleString("es-PE")} pts`);
    renderBarcode(String(codigo));

    qrState.code = String(codigo);
    tryRenderQR();

    if (clienteDesde) {
      const pointsEl = document.getElementById("clientPoints");
      if (pointsEl) {
        const p = document.createElement("p");
        p.className =
          "fluid-eyebrow text-white/30 mt-1.5 font-mono-card uppercase";
        p.textContent = `Cliente desde ${clienteDesde}`;
        pointsEl.insertAdjacentElement("afterend", p);
      }
    }

    inicializarFiltrosRecompensas(productos, puntos);
    cargarHistorialPuntos(uid);
    cargarCuponesActivos(uid);
    initTilt();
    initFlip();
    if (horarioCheckInterval) clearInterval(horarioCheckInterval);
    horarioCheckInterval = setInterval(() => {
      const nuevoEstado = evaluarHorarioNegocio(tienda, new Date());
      const cambio = nuevoEstado.abierto !== horarioEstado.abierto;
      horarioEstado = nuevoEstado;
      if (cambio) {
        inicializarFiltrosRecompensas(productos, puntos);
      }
    }, 30000);
    revealCard();
  } catch (err) {
    console.error(err);
    showError("No se pudieron cargar los datos.");
    document.getElementById("logoSkeleton")?.remove();
    revealCard();
  }
}

/* ══════════════════════════════════════════
   INIT
   Primero se resuelve la ruta (alias -> negocioId + localidad, o el
   formato viejo por query params), y recién con eso se arranca el
   listener de autenticación.
   ══════════════════════════════════════════ */
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
      showLoginGate();
      return;
    }
    UID_ACTUAL = user.uid;
    cargarDatos(user.uid);
  });
})();

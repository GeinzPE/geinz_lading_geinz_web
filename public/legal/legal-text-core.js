import { getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaDoc } from "../js/rutas/rutas.js"; // ruta real de tu módulo de rutas Firestore

// ══════════════════════════════════════════
//  HELPERS COMPARTIDOS (mismo criterio que el libro de reclamaciones)
// ══════════════════════════════════════════
function getParams() {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("id");
  const localidad = (p.get("localidad") || p.get("l") || "barranca")
    .trim()
    .toLowerCase();
  return { id, localidad };
}

function getDominantColor(imgEl) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 80;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    try {
      ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const buckets = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        const rn = r / 255, gn = g / 255, bn = b / 255;
        const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
        const l = (max + min) / 2;
        const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
        if (l > 0.72 || l < 0.1 || s < 0.28) continue;
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
        buckets[key].count++;
        buckets[key].r += r;
        buckets[key].g += g;
        buckets[key].b += b;
      }
      const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);
      if (!sorted.length) return resolve(null);
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
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  hash |= 0;
  const hue = Math.abs(hash % 360);
  const s = 0.65, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function applyColor({ r, g, b }) {
  document.documentElement.style.setProperty("--dr", r);
  document.documentElement.style.setProperty("--dg", g);
  document.documentElement.style.setProperty("--db", b);
  const blob1 = document.getElementById("blobUno");
  const blob2 = document.getElementById("blobDos");
  if (blob1) blob1.style.background = `rgba(${r},${g},${b},.10)`;
  if (blob2) blob2.style.background = `rgba(${r},${g},${b},.08)`;
}

function formatFecha(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    return d.toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

// ══════════════════════════════════════════
//  RENDER DE PÁRRAFOS
//  El panel admin guarda "parrafos" como ARRAY (uno por cada
//  bloque que se escribió en el editor). Pintamos cada elemento
//  tal cual está en la DB, en el mismo orden.
// ══════════════════════════════════════════
function renderTexto(container, parrafos) {
  container.innerHTML = "";
  (parrafos || []).forEach((p) => {
    const el = document.createElement("p");
    el.className = "legal-paragraph";
    el.textContent = p;
    container.appendChild(el);
  });
}

// ══════════════════════════════════════════
//  INIT GENÉRICO DE PÁGINA LEGAL DE TEXTO
// ══════════════════════════════════════════
export async function initLegalTextPage({
  getContenidoDoc,     // (localidad, negocioId) => DocumentReference del texto legal
  footerFlag = null,   // clave opcional dentro de biz.footer que debe ser true (ej: "politicas_privacidad")
  tituloFallback = "Documento legal",
  descripcionFallback = "",
  labelSuperior = "Documento legal",
}) {
  const loader = document.getElementById("loaderScreen");
  const mainWrap = document.getElementById("mainWrap");
  const notAvailable = document.getElementById("notAvailableScreen");

  function showNotAvailable(msg) {
    loader.style.display = "none";
    mainWrap.style.display = "none";
    notAvailable.style.display = "flex";
    if (msg) document.getElementById("notAvailableMsg").textContent = msg;
  }

  try {
    const { id, localidad } = getParams();
    if (!id) return showNotAvailable("No se especificó el negocio.");

    // 1) Datos del negocio (para logo, nombre y color)
    const tiendaRef = tiendaDoc(localidad, "tiendas", id);
    const tiendaSnap = await getDoc(tiendaRef);
    if (!tiendaSnap.exists()) return showNotAvailable("Negocio no encontrado.");

    const biz = tiendaSnap.data();
    const footer = biz.footer || {};
    if (footerFlag && (footer.activo !== true || footer[footerFlag] !== true)) {
      return showNotAvailable("Este negocio no tiene disponible este documento por el momento.");
    }

    // 2) Contenido legal específico (políticas o términos)
    const contenidoRef = getContenidoDoc(localidad, id);
    const contenidoSnap = await getDoc(contenidoRef);
    if (!contenidoSnap.exists()) {
      return showNotAvailable("Este documento aún no fue configurado.");
    }
    const contenido = contenidoSnap.data();

    // 3) Cabecera del negocio + color dominante del logo
    const nombre = biz.nombre_tienda || biz.nombre || "Negocio";
    const logoUrl = biz.img_tienda?.logo_tienda || null;
    document.getElementById("bizNombre").textContent = nombre;

    const titulo = contenido.titulo || tituloFallback;
    document.title = `${titulo} · ${nombre}`;

    const logoImg = document.getElementById("bizLogo");
    const logoLetter = document.getElementById("bizLogoLetter");

    const colorReady = new Promise((resolve) => {
      if (logoUrl) {
        logoImg.src = logoUrl;
        logoImg.style.display = "block";
        logoLetter.style.display = "none";

        const tempImg = new Image();
        tempImg.crossOrigin = "anonymous";
        tempImg.onload = async () => {
          const color = await getDominantColor(tempImg);
          applyColor(color || colorFromName(nombre));
          resolve();
        };
        tempImg.onerror = () => {
          applyColor(colorFromName(nombre));
          resolve();
        };
        tempImg.src = logoUrl + (logoUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();
      } else {
        logoLetter.textContent = nombre.trim().charAt(0).toUpperCase();
        applyColor(colorFromName(nombre));
        resolve();
      }
    });

    // 4) Pintar contenido legal
    document.getElementById("labelSuperior").textContent = labelSuperior;
    document.getElementById("legalTitulo").textContent = titulo;

    const descripcion = contenido.descripcion || descripcionFallback;
    const descEl = document.getElementById("legalDescripcion");
    if (descripcion) {
      descEl.textContent = descripcion;
      descEl.style.display = "block";
    } else {
      descEl.style.display = "none";
    }

    // ── FIX: leer el array "parrafos" (formato real que guarda el panel admin) ──
    // Si algún doc viejo quedó como string único en "texto"/"contenido"/"cuerpo",
    // lo partimos por doble salto de línea para no perder esa data.
    const parrafos =
      Array.isArray(contenido.parrafos) && contenido.parrafos.length
        ? contenido.parrafos.filter((p) => typeof p === "string" && p.trim())
        : String(contenido.texto || contenido.contenido || contenido.cuerpo || "")
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean);

    renderTexto(document.getElementById("legalTexto"), parrafos);

    const fechaTxt = formatFecha(contenido.fecha_actualizacion || contenido.actualizado);
    const fechaEl = document.getElementById("legalFecha");
    if (fechaTxt) {
      fechaEl.textContent = `Última actualización: ${fechaTxt}`;
      fechaEl.style.display = "block";
    } else {
      fechaEl.style.display = "none";
    }

    const razonSocial = contenido["razon social"] || contenido.razon_social || "";
    const badgesWrap = document.getElementById("legalBadges");
    if (badgesWrap) {
      const chips = [];
      if (razonSocial)
        chips.push(`<span class="legal-chip"><i class="fa-solid fa-signature"></i> ${razonSocial}</span>`);
      if (contenido.ruc)
        chips.push(`<span class="legal-chip"><i class="fa-solid fa-building"></i> RUC ${contenido.ruc}</span>`);
      badgesWrap.innerHTML = chips.join("");
      badgesWrap.style.display = chips.length ? "flex" : "none";
    }

    await colorReady;

    loader.style.display = "none";
    mainWrap.style.display = "block";
    requestAnimationFrame(() => mainWrap.classList.add("in"));
  } catch (err) {
    console.error(err);
    showNotAvailable("Ocurrió un error al cargar el documento.");
  }
}
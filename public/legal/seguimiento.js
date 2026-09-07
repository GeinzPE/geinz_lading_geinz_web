import {
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaDoc, reclamacionesCol } from "../js/rutas/rutas.js";

// ══════════════════════════════════════════
//  CAMPOS A MOSTRAR EN EL RESULTADO
//  clave del doc del reclamo → cómo se pinta
// ══════════════════════════════════════════
const RESULT_FIELD_DEFS = [
  { key: "nombre", label: "Nombres", join: "apellido" }, // se combina con apellido
  { key: "correo", label: "Correo" },
  { key: "direcion_consumidor", label: "Dirección" },
  { key: "tipo_documento", label: "Documento", join: "numero_documento", joinSep: " " },
  { key: "pedido_consumidor", label: "Tipo de pedido" },
  { key: "monto_reclamacion", label: "Monto reclamado", prefix: "S/ ", onlyIfTruthy: true },
  { key: "descripcion", label: "Descripción de los hechos" },
  { key: "detalle", label: "Detalle de lo solicitado" },
];

const ESTADO_META = {
  pendiente: { texto: "Pendiente", clase: "status-pendiente" },
  en_proceso: { texto: "En proceso", clase: "status-proceso" },
  proceso: { texto: "En proceso", clase: "status-proceso" },
  resuelto: { texto: "Resuelto", clase: "status-resuelto" },
  atendido: { texto: "Resuelto", clase: "status-resuelto" },
  rechazado: { texto: "Rechazado", clase: "status-rechazado" },
  cerrado: { texto: "Cerrado", clase: "status-rechazado" },
};

function getParams() {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("id");
  const localidad = (p.get("localidad") || p.get("l") || "barranca")
    .trim()
    .toLowerCase();
  return { id, localidad };
}

// ══════════════════════════════════════════
//  COLOR DOMINANTE DEL LOGO (mismo criterio que las demás páginas)
// ══════════════════════════════════════════
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
    return d.toLocaleString("es-PE", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function renderResultBody(data) {
  const body = document.getElementById("resultBody");
  body.innerHTML = "";

  // Nombre completo (nombre + apellido) como primera fila si existe
  const nombreCompleto = [data.nombre, data.apellido].filter(Boolean).join(" ");
  if (nombreCompleto) {
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="result-row"><span class="result-label">Reclamante</span><span class="result-value">${nombreCompleto}</span></div>`,
    );
  }

  RESULT_FIELD_DEFS.forEach((def) => {
    if (def.key === "nombre") return; // ya se pintó arriba combinado con apellido
    let val = data[def.key];
    if (def.join && data[def.join]) {
      val = [val, data[def.join]].filter(Boolean).join(def.joinSep || " · ");
    }
    if (def.onlyIfTruthy && !val) return;
    if (!val) return;
    if (def.prefix) val = `${def.prefix}${val}`;
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="result-row"><span class="result-label">${def.label}</span><span class="result-value">${String(val)}</span></div>`,
    );
  });

  const fechaTxt = formatFecha(data.fecha);
  if (fechaTxt) {
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="result-row"><span class="result-label">Fecha de registro</span><span class="result-value">${fechaTxt}</span></div>`,
    );
  }
}

function renderEstado(estadoRaw) {
  const key = String(estadoRaw || "pendiente").toLowerCase().trim();
  const meta = ESTADO_META[key] || { texto: estadoRaw || "Pendiente", clase: "status-default" };
  const pill = document.getElementById("resultEstado");
  pill.className = `status-pill ${meta.clase}`;
  pill.innerHTML = `<span class="status-dot"></span><span>${meta.texto}</span>`;
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
(async () => {
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

    // 1) Validar que el negocio tenga el libro de reclamaciones activo
    const tiendaRef = tiendaDoc(localidad, "tiendas", id);
    const tiendaSnap = await getDoc(tiendaRef);
    if (!tiendaSnap.exists()) return showNotAvailable("Negocio no encontrado.");

    const biz = tiendaSnap.data();
    const footer = biz.footer || {};
    if (footer.activo !== true || footer.libro_reclamaciones !== true) {
      return showNotAvailable("Este negocio no tiene activo el Libro de Reclamaciones por el momento.");
    }

    // 2) Cabecera del negocio + color dominante del logo
    const nombre = biz.nombre_tienda || biz.nombre || "Negocio";
    const logoUrl = biz.img_tienda?.logo_tienda || null;
    document.getElementById("bizNombre").textContent = nombre;
    document.title = `Seguimiento de Reclamación · ${nombre}`;

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

    await colorReady;

    loader.style.display = "none";
    mainWrap.style.display = "block";
    requestAnimationFrame(() => mainWrap.classList.add("in"));

    // 3) Buscador de reclamos por código de seguimiento
    const form = document.getElementById("buscarForm");
    const input = document.getElementById("codigoInput");
    const btn = document.getElementById("buscarBtn");
    const errorEl = document.getElementById("searchError");
    const resultCard = document.getElementById("resultCard");
    const notFoundCard = document.getElementById("notFoundCard");

    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase();
      errorEl.classList.remove("show");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const codigo = input.value.trim().toUpperCase();
      errorEl.classList.remove("show");
      resultCard.style.display = "none";
      resultCard.classList.remove("in");
      notFoundCard.style.display = "none";

      if (!codigo) {
        errorEl.textContent = "Ingresa tu código de seguimiento.";
        errorEl.classList.add("show");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Buscando...`;

      try {
        const col = reclamacionesCol(localidad, id);
        const q = query(col, where("codigo_seguimiento", "==", codigo), limit(1));
        const snap = await getDocs(q);

        if (snap.empty) {
          notFoundCard.style.display = "block";
        } else {
          const data = snap.docs[0].data();
          document.getElementById("resultCodigo").textContent = data.codigo_seguimiento || codigo;
          renderEstado(data.estado);
          renderResultBody(data);
          resultCard.style.display = "block";
          requestAnimationFrame(() => resultCard.classList.add("in"));
        }
      } catch (err) {
        console.error("Error al buscar reclamo:", err);
        errorEl.textContent = "No se pudo buscar tu reclamación, intenta de nuevo.";
        errorEl.classList.add("show");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-2"></i> Buscar`;
      }
    });
  } catch (err) {
    console.error(err);
    showNotAvailable("Ocurrió un error al cargar la página de seguimiento.");
  }
})();
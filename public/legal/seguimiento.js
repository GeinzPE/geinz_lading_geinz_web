import {
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  aliasTiendaDoc,
  tiendaDoc,
  reclamacionesCol,
} from "../js/rutas/rutas.js"; // ⚠️ ajusta esta ruta a donde tengas rutas.js
import { setFaviconCircular } from "../js/favicon/favicon.js";
import {
  cargarColoresNegocio,
  aplicarColoresDesdeCache,
} from "../js/colores_dinamicos/dinamicos.js";
// ══════════════════════════════════════════
//  CAMPOS A MOSTRAR EN EL RESULTADO
//  clave del doc del reclamo → cómo se pinta
// ══════════════════════════════════════════
const RESULT_FIELD_DEFS = [
  { key: "nombre", label: "Nombres", join: "apellido" }, // se combina con apellido
  { key: "correo", label: "Correo" },
  { key: "direcion_consumidor", label: "Dirección" },
  {
    key: "tipo_documento",
    label: "Documento",
    join: "numero_documento",
    joinSep: " ",
  },
  { key: "pedido_consumidor", label: "Tipo de pedido" },
  {
    key: "monto_reclamacion",
    label: "Monto reclamado",
    prefix: "S/ ",
    onlyIfTruthy: true,
  },
  { key: "descripcion", label: "Descripción de los hechos" },
  { key: "detalle", label: "Detalle de lo solicitado" },
];

const ESTADO_META = {
  pendiente: { texto: "Pendiente", clase: "status-pendiente" },
  en_proceso: { texto: "En proceso", clase: "status-proceso" },
  proceso: { texto: "En proceso", clase: "status-proceso" },
  respondido: { texto: "Respondido", clase: "status-respondido" },
  resuelto: { texto: "Resuelto", clase: "status-resuelto" },
  atendido: { texto: "Resuelto", clase: "status-resuelto" },
  rechazado: { texto: "Rechazado", clase: "status-rechazado" },
  cerrado: { texto: "Cerrado", clase: "status-rechazado" },
};

// ══════════════════════════════════════════
//  RESOLVER ALIAS → { id, localidad }
//  (idéntico al de legal.js — soporta /legal/seguimiento/{alias},
//  ?alias=... y el viejo ?id=&localidad= como fallback)
// ══════════════════════════════════════════
async function resolverNegocio() {
  if (window.__NEGOCIO_ID__ && window.__NEGOCIO_LOCALIDAD__) {
    return {
      id: window.__NEGOCIO_ID__,
      localidad: window.__NEGOCIO_LOCALIDAD__.trim().toLowerCase(),
    };
  }
  const path = window.location.pathname;

  let alias = null;

  // Ruta nueva: /perfil/{alias}/seguimiento_reclamaciones
  const matchPerfil = path.match(
    /^\/perfil\/([^/]+)\/seguimiento_reclamaciones\/?$/,
  );
  if (matchPerfil) {
    alias = decodeURIComponent(matchPerfil[1]);
  }

  // Compatibilidad con la ruta vieja: /legal/seguimiento_reclamaciones/{alias}
  if (!alias && path.startsWith("/legal/seguimiento_reclamaciones/")) {
    alias = decodeURIComponent(
      path.split("/legal/seguimiento_reclamaciones/")[1] || "",
    ).trim();
    alias = alias.split(/[/?#]/)[0];
  }

  const params = new URLSearchParams(window.location.search);
  if (!alias) alias = params.get("alias"); // fallback a links viejos con ?alias=

  console.log("🔍 DEBUG seguimiento.js — URL completa:", window.location.href);
  console.log("🔍 DEBUG alias recibido:", alias);

  if (!alias) {
    const id = params.get("id");
    const localidad = (params.get("localidad") || params.get("l") || "barranca")
      .trim()
      .toLowerCase();
    console.log("🔍 DEBUG fallback id:", id, "localidad:", localidad);
    if (!id) throw new Error("No se especificó el negocio.");
    return { id, localidad };
  }

  const aliasSnap = await getDoc(aliasTiendaDoc(alias));
  console.log("🔍 DEBUG alias existe en Firestore:", aliasSnap.exists());
  if (!aliasSnap.exists()) throw new Error("Perfil no encontrado.");

  const data = aliasSnap.data();
  console.log("🔍 DEBUG data del alias:", data);

  const { id, localidad } = data;
  if (!id || !localidad) throw new Error("Alias mal configurado.");

  return { id, localidad: localidad.trim().toLowerCase() };
}

function formatFecha(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    return d.toLocaleString("es-PE", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Escapa HTML antes de insertar texto libre (respuesta del negocio) con innerHTML,
// para que un reclamo o respuesta no pueda romper el layout ni inyectar markup.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  // ── Respuesta del negocio ──
  // Si el negocio ya contestó desde el panel Legal (respuesta_tienda.texto),
  // se muestra destacada debajo de los datos del reclamo.
  const respuesta = data.respuesta_tienda;
  if (respuesta?.texto) {
    const fechaResp = formatFecha(respuesta.fecha);
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="respuesta-card">
        <div class="respuesta-header"><i class="fa-solid fa-reply"></i> Respuesta del negocio</div>
        <div class="respuesta-texto">${escapeHtml(respuesta.texto)}</div>
        ${fechaResp ? `<div class="respuesta-fecha">Respondido el ${fechaResp}</div>` : ""}
      </div>`,
    );
  }
}

function renderEstado(estadoRaw) {
  const key = String(estadoRaw || "pendiente")
    .toLowerCase()
    .trim();
  const meta = ESTADO_META[key] || {
    texto: estadoRaw || "Pendiente",
    clase: "status-default",
  };
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
    const { id, localidad } = await resolverNegocio();
    aplicarColoresDesdeCache(id);
    // 1) Validar que el negocio tenga el libro de reclamaciones activo
    const tiendaRef = tiendaDoc(localidad, "tiendas", id);
    const tiendaSnap = await getDoc(tiendaRef);
    if (!tiendaSnap.exists()) return showNotAvailable("Negocio no encontrado.");

    const biz = tiendaSnap.data();
    const footer = biz.footer || {};
    if (footer.activo !== true || footer.libro_reclamaciones !== true) {
      return showNotAvailable(
        "Este negocio no tiene activo el Libro de Reclamaciones por el momento.",
      );
    }

    // 2) Cabecera del negocio + color dominante del logo
    const nombre = biz.nombre_tienda || biz.nombre || "Negocio";
    const logoUrl = biz.img_tienda?.logo_tienda || null;
    document.getElementById("bizNombre").textContent = nombre;
    document.title = `Seguimiento de Reclamación · ${nombre}`;

    const logoImg = document.getElementById("bizLogo");
    const logoLetter = document.getElementById("bizLogoLetter");

    // Colores dinámicos (color_marca → logo → nombre), usando el biz que ya leíste
    const colorReady = cargarColoresNegocio({ id, localidad, biz }).catch((e) =>
      console.warn("colores:", e.message),
    );

    if (logoUrl) {
      logoImg.src = logoUrl;
      logoImg.style.display = "block";
      logoLetter.style.display = "none";
      setFaviconCircular(logoUrl);
    } else {
      logoLetter.textContent = nombre.trim().charAt(0).toUpperCase();
    }
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
        const q = query(
          col,
          where("codigo_seguimiento", "==", codigo),
          limit(1),
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          notFoundCard.style.display = "block";
        } else {
          const data = snap.docs[0].data();
          console.log("🔍 DEBUG documento del reclamo:", data);
          console.log("🔍 DEBUG respuesta_tienda:", data.respuesta_tienda);
          document.getElementById("resultCodigo").textContent =
            data.codigo_seguimiento || codigo;
          renderEstado(data.estado);
          renderResultBody(data);
          resultCard.style.display = "block";
          requestAnimationFrame(() => resultCard.classList.add("in"));
        }
      } catch (err) {
        console.error("Error al buscar reclamo:", err);
        errorEl.textContent =
          "No se pudo buscar tu reclamación, intenta de nuevo.";
        errorEl.classList.add("show");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-2"></i> Buscar`;
      }
    });
  } catch (err) {
    console.error(err);
    showNotAvailable(
      err.message || "Ocurrió un error al cargar la página de seguimiento.",
    );
  }
})();

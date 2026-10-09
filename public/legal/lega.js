import {
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  aliasTiendaDoc,
  tiendaDoc,
  libroReclamacionesConfigDoc,
  reclamacionesCol,
} from "../js/rutas/rutas.js"; // ruta real de tu módulo de rutas Firestore
import { setFaviconCircular } from "../js/favicon/favicon.js"; // ══════════════════════════════════════════
import {
  cargarColoresNegocio,
  aplicarColoresDesdeCache,
} from "../js/colores_dinamicos/dinamicos.js"
//  CONFIG DE CAMPOS DINÁMICOS
//  clave del mapa "campos" en Firestore → cómo se pinta en el form
//  "group" agrupa visualmente el campo en la sección 1 (Tus datos)
//  o la sección 2 (Detalle del reclamo)
// ══════════════════════════════════════════
const FIELD_DEFS = {
  nombre: {
    label: "Nombres",
    type: "text",
    icon: "fa-user",
    placeholder: "Tus nombres",
    col: 1,
    group: 1,
    required: true,
    validate: (v) => (v.trim().length >= 2 ? null : "Ingresa un nombre válido"),
  },
  apellido: {
    label: "Apellidos",
    type: "text",
    icon: "fa-user",
    placeholder: "Tus apellidos",
    col: 1,
    group: 1,
    required: true,
    validate: (v) =>
      v.trim().length >= 2 ? null : "Ingresa un apellido válido",
  },
  tipo_documento: {
    label: "Tipo y N° de documento",
    type: "doc_combo",
    icon: "fa-id-card",
    col: 1,
    group: 1,
    required: true,
  },
  correo: {
    label: "Correo electrónico",
    type: "email",
    icon: "fa-envelope",
    placeholder: "tucorreo@ejemplo.com",
    col: 1,
    group: 1,
    required: true,
    validate: (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
        ? null
        : "Ingresa un correo válido",
  },
  direcion_consumidor: {
    label: "Dirección",
    type: "text",
    icon: "fa-location-dot",
    placeholder: "Dirección del consumidor",
    col: 2,
    group: 1,
    required: true,
    validate: (v) =>
      v.trim().length >= 5 ? null : "Ingresa una dirección válida",
  },
  padre_madre_apoderado: {
    label: "Padre / Madre / Apoderado (si es menor de edad)",
    type: "text",
    icon: "fa-people-roof",
    placeholder: "Nombre completo (opcional si eres mayor de edad)",
    col: 2,
    group: 1,
    required: false,
  },
  pedido_consumidor: {
    label: "Tipo de pedido",
    type: "select",
    icon: "fa-clipboard-list",
    optionsKey: "opciones_pedido",
    defaultOptions: ["Reclamo", "Queja"],
    col: 1,
    group: 2,
    required: true,
  },
  monto_reclamacion: {
    label: "Monto reclamado (S/)",
    type: "number",
    icon: "fa-sack-dollar",
    placeholder: "0.00",
    col: 1,
    group: 2,
    required: false,
    validate: (v) => {
      if (!v) return null;
      const n = Number(v);
      return isNaN(n) || n < 0 ? "Ingresa un monto válido" : null;
    },
  },
  descripcion: {
    label: "Descripción de los hechos",
    type: "textarea",
    icon: "fa-align-left",
    placeholder: "Cuéntanos qué sucedió con el mayor detalle posible...",
    col: 2,
    group: 2,
    required: true,
    validate: (v) =>
      v.trim().length >= 15
        ? null
        : "Cuéntanos con un poco más de detalle (mín. 15 caracteres)",
  },
  detalle: {
    label: "Detalle de lo solicitado",
    type: "textarea",
    icon: "fa-file-lines",
    placeholder: "¿Qué solución esperas de parte del negocio?",
    col: 2,
    group: 2,
    required: true,
    validate: (v) =>
      v.trim().length >= 10
        ? null
        : "Cuéntanos qué solución esperas (mín. 10 caracteres)",
  },
};

const GROUP_META = {
  1: { title: "Tus datos", icon: "fa-user-large" },
  2: { title: "Detalle del reclamo", icon: "fa-file-signature" },
};

const DOC_TIPO_VALIDATORS = {
  DNI: { regex: /^\d{8}$/, msg: "El DNI debe tener 8 dígitos" },
  CE: { regex: /^[A-Za-z0-9]{9,12}$/, msg: "N° de CE inválido" },
  Pasaporte: { regex: /^[A-Za-z0-9]{6,12}$/, msg: "N° de pasaporte inválido" },
};

// ══════════════════════════════════════════
//  RESOLVER ALIAS → { id, localidad }
// ══════════════════════════════════════════
// ══════════════════════════════════════════
//  RESOLVER ALIAS → { id, localidad }
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

  // Ruta nueva: /perfil/{alias}/libro_reclamaciones
  const matchPerfil = path.match(/^\/perfil\/([^/]+)\/libro_reclamaciones\/?$/);
  if (matchPerfil) {
    alias = decodeURIComponent(matchPerfil[1]);
  }

  // Compatibilidad con la ruta vieja: /legal/libro_reclamaciones/{alias}
  if (!alias && path.startsWith("/legal/libro_reclamaciones/")) {
    alias = decodeURIComponent(
      path.split("/legal/libro_reclamaciones/")[1] || "",
    ).trim();
    alias = alias.split(/[/?#]/)[0];
  }

  const params = new URLSearchParams(window.location.search);
  if (!alias) alias = params.get("alias"); // fallback a links viejos con ?alias=

  console.log("🔍 DEBUG lega.js — URL completa:", window.location.href);
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



// ══════════════════════════════════════════
//  OPCIONES DINÁMICAS (selects) DESDE LA DB
//  Acepta array de strings o mapa { "DNI": true, "CE": true, ... }
// ══════════════════════════════════════════
function normalizeOpciones(raw, fallback) {
  if (Array.isArray(raw) && raw.length) return raw.filter(Boolean);
  if (raw && typeof raw === "object") {
    const keys = Object.entries(raw)
      .filter(([, v]) => v === true || v === undefined)
      .map(([k]) => k);
    if (keys.length) return keys;
  }
  return fallback;
}

// ══════════════════════════════════════════
//  RENDER DE CAMPOS DINÁMICOS
// ══════════════════════════════════════════
function buildFieldMarkup(key, def, opcionesMap) {
  const colClass = def.col === 2 ? "md:col-span-2" : "";
  let inputHtml = "";

  if (def.type === "textarea") {
    inputHtml = `<textarea class="field-textarea" data-field="${key}" rows="4" placeholder="${def.placeholder}"></textarea>`;
  } else if (def.type === "select") {
    const opciones = normalizeOpciones(
      opcionesMap[def.optionsKey],
      def.defaultOptions,
    );
    inputHtml = `<select class="field-select" data-field="${key}">
      <option value="" disabled selected>Selecciona una opción</option>
      ${opciones.map((o) => `<option value="${o}">${o}</option>`).join("")}
    </select>`;
  } else if (def.type === "doc_combo") {
    const tipos = normalizeOpciones(opcionesMap.opciones_documento, [
      "DNI",
      "CE",
      "Pasaporte",
    ]);
    inputHtml = `
      <div class="doc-combo-grid">
        <select class="field-select" data-field="${key}_tipo">
          ${tipos.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <input class="field-input" data-field="${key}" type="text" inputmode="numeric" placeholder="N° de documento" />
      </div>`;
  } else {
    inputHtml = `<input class="field-input" data-field="${key}" type="${def.type}" placeholder="${def.placeholder || ""}" />`;
  }

  return `
    <div class="field-group ${colClass}" data-field-wrap="${key}">
      <label class="field-label"><i class="fa-solid ${def.icon || "fa-pen"} field-label-icon"></i>${def.label}${def.required ? " *" : ""}</label>
      ${inputHtml}
      <p class="field-error" data-field-error="${key}"></p>
    </div>`;
}

function renderFields(camposConfig, opcionesMap) {
  const wrap = document.getElementById("formFields");
  wrap.innerHTML = "";

  [1, 2].forEach((groupNum) => {
    const entries = Object.entries(FIELD_DEFS).filter(
      ([key, def]) => camposConfig?.[key] === true && def.group === groupNum,
    );
    if (!entries.length) return;

    const meta = GROUP_META[groupNum];
    const section = document.createElement("div");
    section.className = "form-section";
    section.innerHTML = `
      <div class="form-section-title">
        <span class="step-badge"><i class="fa-solid ${meta.icon}"></i></span>
        <span>${meta.title}</span>
      </div>
      <div class="form-section-grid"></div>
    `;
    const grid = section.querySelector(".form-section-grid");
    entries.forEach(([key, def]) => {
      grid.insertAdjacentHTML(
        "beforeend",
        buildFieldMarkup(key, def, opcionesMap),
      );
    });
    wrap.appendChild(section);
  });

  // Validación en vivo al salir del campo
  wrap.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("blur", () => {
      const baseKey = el.dataset.field.replace(/_tipo$/, "");
      if (FIELD_DEFS[baseKey]) validateSingleField(baseKey, camposConfig);
    });
    el.addEventListener("input", () =>
      clearFieldError(el.dataset.field.replace(/_tipo$/, "")),
    );
  });
}

function clearFieldError(key) {
  const wrap = document.querySelector(`[data-field-wrap="${key}"]`);
  const err = document.querySelector(`[data-field-error="${key}"]`);
  wrap?.classList.remove("has-error");
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
}

function setFieldError(key, msg) {
  const wrap = document.querySelector(`[data-field-wrap="${key}"]`);
  const err = document.querySelector(`[data-field-error="${key}"]`);
  wrap?.classList.add("has-error");
  if (err) {
    err.textContent = msg;
    err.classList.add("show");
  }
}

function validateSingleField(key, camposConfig) {
  if (camposConfig?.[key] !== true) return true;
  const def = FIELD_DEFS[key];

  if (def.type === "doc_combo") {
    const tipo =
      document.querySelector(`[data-field="${key}_tipo"]`)?.value || "";
    const num =
      document.querySelector(`[data-field="${key}"]`)?.value.trim() || "";
    if (!num) {
      setFieldError(key, "Ingresa tu número de documento");
      return false;
    }
    const rule = DOC_TIPO_VALIDATORS[tipo];
    if (rule && !rule.regex.test(num)) {
      setFieldError(key, rule.msg);
      return false;
    }
    clearFieldError(key);
    return true;
  }

  const el = document.querySelector(`[data-field="${key}"]`);
  const val = el?.value?.trim() || "";

  if (def.required && !val) {
    setFieldError(key, "Este campo es obligatorio");
    return false;
  }
  if (def.validate) {
    const msg = def.validate(val);
    if (msg) {
      setFieldError(key, msg);
      return false;
    }
  }
  clearFieldError(key);
  return true;
}

function collectFormData(camposConfig) {
  const data = {};
  let ok = true;

  Object.entries(FIELD_DEFS).forEach(([key, def]) => {
    if (camposConfig?.[key] !== true) return;

    const valido = validateSingleField(key, camposConfig);
    if (!valido) ok = false;

    if (def.type === "doc_combo") {
      data.tipo_documento =
        document.querySelector(`[data-field="${key}_tipo"]`)?.value || "";
      data.numero_documento =
        document.querySelector(`[data-field="${key}"]`)?.value.trim() || "";
      return;
    }

    const el = document.querySelector(`[data-field="${key}"]`);
    const val = el?.value?.trim() || "";
    data[key] = def.type === "number" ? Number(val) || 0 : val;
  });

  return { data, ok };
}

function generarCodigoSeguimiento() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const fecha = new Date();
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  return `RC-${yy}${mm}-${rand}`;
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
    // 1) Validar que el negocio tenga el libro activo en su footer
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

    // 2) Traer la configuración dinámica del libro
    const libroRef = libroReclamacionesConfigDoc(localidad, id);
    const libroSnap = await getDoc(libroRef);
    if (!libroSnap.exists()) {
      return showNotAvailable(
        "El Libro de Reclamaciones aún no fue configurado.",
      );
    }
    const libroData = libroSnap.data();
    const campos = libroData.campos || {};

    // 3) Pintar cabecera del negocio + color dominante del logo (igual que el perfil)
    const nombre = biz.nombre_tienda || biz.nombre || "Negocio";
    const logoUrl = biz.img_tienda?.logo_tienda || null;
    document.getElementById("bizNombre").textContent = nombre;
    document.title = `Libro de Reclamaciones · ${nombre}`;

    const logoImg = document.getElementById("bizLogo");
    const logoLetter = document.getElementById("bizLogoLetter");

    // Promesa que se resuelve solo cuando el color ya fue aplicado
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

    // 4) Pintar contenido dinámico del libro (título, descripción, RUC, razón social)
    document.getElementById("libroTitulo").textContent =
      libroData.titulo || "Libro de Reclamaciones";
    document.getElementById("libroDescripcion").textContent =
      libroData.descripcion ||
      "Este establecimiento cuenta con un Libro de Reclamaciones a tu disposición conforme a la normativa vigente.";

    const razonSocial =
      libroData["razon social"] || libroData.razon_social || "";
    const badgesWrap = document.getElementById("legalBadges");
    if (badgesWrap) {
      const chips = [];
      if (razonSocial)
        chips.push(
          `<span class="legal-chip"><i class="fa-solid fa-signature"></i> ${razonSocial}</span>`,
        );
      if (libroData.ruc)
        chips.push(
          `<span class="legal-chip"><i class="fa-solid fa-building"></i> RUC ${libroData.ruc}</span>`,
        );
      badgesWrap.innerHTML = chips.join("");
      badgesWrap.style.display = chips.length ? "flex" : "none";
    }

    // 5) Pintar campos dinámicos del formulario, con selects que vienen de la DB
    const opcionesMap = {
      opciones_documento: libroData.opciones_documento,
      opciones_pedido: libroData.opciones_pedido,
    };
    renderFields(campos, opcionesMap);

    // Espera a que el color del logo termine de aplicarse antes de quitar el loader
    await colorReady;

    loader.style.display = "none";
    mainWrap.style.display = "block";
    requestAnimationFrame(() => mainWrap.classList.add("in"));

    // 6) Envío del formulario
    const form = document.getElementById("reclamoForm");
    const submitBtn = document.getElementById("submitBtn");
    const generalError = document.getElementById("formGeneralError");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      generalError.classList.remove("show");

      const { data, ok } = collectFormData(campos);
      if (!ok) {
        generalError.textContent =
          "Revisa los campos marcados en rojo antes de continuar.";
        generalError.classList.add("show");
        document
          .querySelector(".field-group.has-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Enviando...`;

      try {
        const codigo = generarCodigoSeguimiento();

        // ══════════════════════════════════════════
        // El reclamo se guarda en:
        // .../politicas/legal/reclamaciones/{autoId}
        // Se genera el doc con doc() para poder guardar
        // su propio id adentro (igual que en "clientes"),
        // junto con todo el contenido del formulario (data).
        // ══════════════════════════════════════════
        const nuevoReclamoRef = doc(reclamacionesCol(localidad, id));
        await setDoc(nuevoReclamoRef, {
          id: nuevoReclamoRef.id,
          ...data,
          codigo_seguimiento: codigo,
          estado: "pendiente",
          fecha: serverTimestamp(),
        });

        form.style.display = "none";
        document.getElementById("codigoReclamo").textContent = codigo;
        document.getElementById("successCard").style.display = "block";
        requestAnimationFrame(() =>
          document.getElementById("successCard").classList.add("in"),
        );
      } catch (err) {
        console.error("Error al guardar reclamo:", err);
        generalError.textContent =
          "No se pudo enviar tu reclamación, intenta de nuevo.";
        generalError.classList.add("show");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> Enviar reclamación`;
      }
    });
  } catch (err) {
    console.error(err);
    showNotAvailable(
      err.message || "Ocurrió un error al cargar el Libro de Reclamaciones.",
    );
  }
})();

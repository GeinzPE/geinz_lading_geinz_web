// ══════════════════════════════════════════
//  LEGAL.JS — conexión real a Firestore
//  Usa exactamente las rutas que ya tienes en ../rutas/rutas.js
// ══════════════════════════════════════════
import {
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "../db/db.js";
import {
  tiendaDoc,
  data_user_logeado,
  libroReclamacionesConfigDoc,
  reclamacionesCol,
  reclamacionDoc,
  politicasPrivacidadDoc,
  terminosCondicionesDoc,
} from "../rutas/rutas.js";

// ══════════════════════════════════════════
//  ESTADO GLOBAL DEL MÓDULO
// ══════════════════════════════════════════
let _localidad = null;
let _negocioId = null;
const _editorLegalRefs = {}; // se llena dentro de initEditorLegalTexto

// ══════════════════════════════════════════
//  PLAN: qué ítems de Legal están activos en la DB
// ══════════════════════════════════════════
const RUTAS_LEGAL = {
  libro: "mi_negocio.legal.libro_reclamaciones",
  politicas: "mi_negocio.legal.politicas",
  terminos: "mi_negocio.legal.terminos",
};
const PLAN_LEGAL = { libro: false, politicas: false, terminos: false };

const _nodo = (obj, ruta) => ruta.split(".").reduce((o, k) => o?.[k], obj);
const _on = (v, def) => (v === undefined ? def : v === true);
const _flag = (s, ruta, def = false) => _on(_nodo(s, ruta), def);

// qué elementos controla cada ítem del plan
// (Reclamos va junto con Libro de reclamaciones)
const ELEMENTOS_LEGAL = {
  libro: () => [
    document.getElementById("tabBtnLibro"),
    document.getElementById("tabBtnReclamos"),
    document.getElementById("panelLibro"),
    document.getElementById("panelReclamos"),
    document.getElementById("toggleLibro")?.closest(".sub-toggle-row"),
  ],
  politicas: () => [
    document.getElementById("tabBtnPoliticas"),
    document.getElementById("panelPoliticas"),
    document.getElementById("togglePoliticas")?.closest(".sub-toggle-row"),
  ],
  terminos: () => [
    document.getElementById("tabBtnTerminos"),
    document.getElementById("panelTerminos"),
    document.getElementById("toggleTerminos")?.closest(".sub-toggle-row"),
  ],
};

function activarTab(tab) {
  document
    .querySelectorAll(".legal-tab")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelector(`.legal-tab[data-tab="${tab}"]`)
    ?.classList.add("active");
  document
    .getElementById("panel" + tab.charAt(0).toUpperCase() + tab.slice(1))
    ?.classList.add("active");
}

function aplicarPlanLegal(servicios) {
  if (!servicios) return;

  Object.keys(RUTAS_LEGAL).forEach((k) => {
    PLAN_LEGAL[k] = _flag(servicios, RUTAS_LEGAL[k], false);
    ELEMENTOS_LEGAL[k]().forEach((el) =>
      el?.classList.toggle("plan-oculto", !PLAN_LEGAL[k]),
    );
  });

  // si la pestaña activa quedó oculta, abrir la primera visible
  const tabs = [...document.querySelectorAll(".legal-tab")];
  const activa = tabs.find((b) => b.classList.contains("active"));
  if (!activa || activa.classList.contains("plan-oculto")) {
    const primera = tabs.find((b) => !b.classList.contains("plan-oculto"));
    if (primera) activarTab(primera.dataset.tab);
  }

  // si no queda ningún ítem, ocultar la tarjeta de visibilidad también
  const alguno = Object.values(PLAN_LEGAL).some(Boolean);
  document
    .querySelector(".master-card")
    ?.classList.toggle("plan-oculto", !alguno);
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "SERVICIOS_UPDATE") aplicarPlanLegal(e.data.servicios);
});
// pedir el doc al padre
window.parent.postMessage(
  { type: "PEDIR_DATOS_TIENDA" },
  window.location.origin,
);

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function pick(obj = {}, keys = []) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(msg) {
  const el = document.getElementById("legalToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function fmtFecha(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estadoLabel(estado) {
  return (
    (estado || "pendiente").charAt(0).toUpperCase() +
    (estado || "pendiente").slice(1)
  );
}
function estadoClase(estado) {
  const map = {
    pendiente: "status-pendiente",
    respondido: "status-respondido",
    resuelto: "status-resuelto",
    rechazado: "status-rechazado",
  };
  return map[estado] || "status-pendiente";
}
function iniciales(nombre = "", apellido = "") {
  const a = (nombre || "").trim().charAt(0);
  const b = (apellido || "").trim().charAt(0);
  const val = (a + b).toUpperCase();
  return val || "?";
}

// ══════════════════════════════════════════
//  GENERACIÓN DE DOCUMENTOS LEGALES CON IA
// ══════════════════════════════════════════
const CLOUD_FUNCTION_GENERAR_DOC_LEGAL =
  "https://generardocumentolegal-oixttik5rq-uc.a.run.app";

const TITULOS_IA = {
  politica_privacidad: "Política de privacidad",
  terminos_condiciones: "Términos y condiciones",
};

// Campos del negocio que el usuario puede revisar/editar antes de generar
const CAMPOS_DATOS_IA = [
  ["nombre_comercial", "Nombre del negocio", "input"],
  ["razon_social", "Razón social", "input"],
  ["ruc", "RUC", "input"],
  ["telefono", "Teléfono", "input"],
  ["direccion", "Dirección", "input"],
  ["categoria", "Rubro / categoría", "input"],
  ["descripcion", "Describe tu negocio", "textarea"],
];

// Preguntas extra según el documento (todas opcionales)
const CAMPOS_RESP_IA = {
  libro_reclamaciones: [
    ["descripcion_operacion", "¿Qué vendes o qué servicio ofreces?"],
    ["informacion_adicional", "Algo más que quieras incluir"],
  ],
  politica_privacidad: [
    [
      "datos_personales",
      "¿Qué datos personales pides a tus clientes? (nombre, correo, teléfono…)",
    ],
    ["uso_datos", "¿Para qué usas esos datos?"],
    ["marketing", "¿Les envías promociones o publicidad?"],
    [
      "terceros",
      "¿Compartes datos con terceros? (pasarela de pago, delivery…)",
    ],
    ["informacion_adicional", "Algo más que quieras incluir"],
  ],
  terminos_condiciones: [
    ["descripcion_operacion", "¿Qué vendes o qué servicio ofreces?"],
    ["cambios_devoluciones", "¿Cómo manejas cambios y devoluciones?"],
    ["entrega", "¿Cómo y en cuánto tiempo entregas?"],
    ["informacion_adicional", "Algo más que quieras incluir"],
  ],
};

// Llama a la Cloud Function (protocolo "callable" de Firebase v2:
// body envuelto en {data:...}, respuesta envuelta en {result:...}).
async function llamarGenerarDocumentoLegal(
  tipo_documento,
  datos_negocio,
  respuestas_negocio,
) {
  const headers = { "Content-Type": "application/json" };
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(CLOUD_FUNCTION_GENERAR_DOC_LEGAL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: { tipo_documento, datos_negocio, respuestas_negocio },
    }),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(json.error.message || "Error generando el documento");
  }
  // json.result = { success, tipo_documento, titulo, contenido, campos?, preguntas_pendientes }
  if (json.result?.success === false) {
    throw new Error(
      json.result.error?.message || "No se pudo generar el documento",
    );
  }
  return json.result;
}

// Pinta las preguntas_pendientes que devuelva Gemini cuando falte info,
// junto con un botón para reenviar la generación ya con esas respuestas.
function renderPreguntasPendientes(containerId, preguntas, onReenviar) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  cont.innerHTML = "";

  if (!preguntas || !preguntas.length) {
    cont.classList.add("hidden");
    return;
  }

  cont.classList.remove("hidden");

  const respuestas = {};
  preguntas.forEach((p) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <label class="field-label">${esc(p.pregunta)}</label>
      <textarea class="field-textarea" rows="2" data-campo="${esc(p.campo)}"></textarea>
    `;
    wrap.querySelector("textarea").addEventListener("input", (e) => {
      respuestas[p.campo] = e.target.value;
    });
    cont.appendChild(wrap);
  });

  const btn = document.createElement("button");
  btn.className = "btn-primary mt-1";
  btn.textContent = "Reenviar con estas respuestas";
  btn.addEventListener("click", () => onReenviar(respuestas));
  cont.appendChild(btn);
}

// Quita todo el formato markdown que pueda devolver la IA
function limpiarMarkdown(texto) {
  if (!texto) return "";
  return String(texto)
    .replace(/```[a-z]*\n?/gi, "") // cercas de código
    .replace(/^\s{0,3}#{1,6}\s*/gm, "") // ### títulos
    .replace(/^\s*>\s?/gm, "") // > citas
    .replace(/^\s*[*\-+•]\s+/gm, "• ") // viñetas (* - +) → •
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1") // ***negrita cursiva***
    .replace(/\*\*(.+?)\*\*/g, "$1") // **negrita**
    .replace(/__(.+?)__/g, "$1") // __negrita__
    .replace(/\*(.+?)\*/g, "$1") // *cursiva*
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // [texto](url)
    .replace(/\*+/g, "") // asteriscos sueltos que queden
    .replace(/^\s*[-_*]{3,}\s*$/gm, "") // líneas ---
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contenidoAParrafos(contenido) {
  return limpiarMarkdown(contenido)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length);
}

// Lee el negocio desde su ruta y lo traduce a los nombres que espera la Cloud Function
async function obtenerDatosNegocioParaIA(tipoDocumento) {
  const snap = await getDoc(tiendaDoc(_localidad, "tiendas", _negocioId));
  const t = snap.exists() ? snap.data() : {};

  let libro = {};
  try {
    const ls = await getDoc(
      libroReclamacionesConfigDoc(_localidad, _negocioId),
    );
    libro = ls.exists() ? ls.data() : {};
  } catch (_) {}

  const mc = t.metodo_contacto || {};
  const ub = t.ubicacion || {};
  const telefono =
    (mc.whatsapp?.estado && mc.whatsapp?.numero) ||
    (mc.llamada?.estado && mc.llamada?.numero) ||
    mc.whatsapp?.numero ||
    mc.llamada?.numero ||
    "";
  const ig = mc.instagram?.nombre || "";
  const redes = {};
  if (ig) redes.instagram = ig.startsWith("@") ? ig : "@" + ig;

  const datos = {
    nombre_comercial: t.nombre_tienda || "",
    // RUC y razón social: primero lo escrito en el formulario del Libro, luego lo guardado
    razon_social:
      document.getElementById("libroRazonSocial")?.value.trim() ||
      libro.razon_social ||
      libro["razon social"] ||
      "",
    ruc: document.getElementById("libroRuc")?.value.trim() || libro.ruc || "",
    telefono,
    direccion: ub["dirección"] || ub.direccion || "",
    pais: "Perú",
    // 👇 ajusta estos nombres si en tu doc de tienda se llaman distinto
    categoria: t.categoria || "",
    subcategoria: t.subcategoria || "",
    descripcion: t.descripcion || "",
    descripcion_seo: t.descripcion_seo || "",
    horario: t.horario || "",
    metodos_pago: t.metodos_pago || "",
    redes_sociales: redes,
  };

  // respuestas que el negocio ya escribió antes para este tipo de documento
  const guardadas = t.legal_ia?.[tipoDocumento] || {};
  return { datos, guardadas };
}

// Panel lateral. Al pulsar "Generar documento" el botón pasa a "Generando..." al instante
// y el panel queda abierto hasta que llegue el resultado.
function abrirModalDatosIA(tipoDocumento, titulo, datos, guardadas, onGenerar) {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  const panel = document.createElement("aside");
  panel.className = "drawer-panel";

  const campo = (grupo, key, label, tipo, valor) => `
    <div>
      <label class="field-label">${esc(label)}</label>
      ${
        tipo === "textarea"
          ? `<textarea class="field-textarea" rows="3" data-grupo="${grupo}" data-campo="${key}">${esc(valor)}</textarea>`
          : `<input class="field-input" data-grupo="${grupo}" data-campo="${key}" value="${esc(valor)}">`
      }
    </div>`;

  const htmlDatos = CAMPOS_DATOS_IA.map(([k, l, tp]) =>
    campo("datos", k, l, tp, datos[k] || ""),
  ).join("");
  const htmlResp = (CAMPOS_RESP_IA[tipoDocumento] || [])
    .map(([k, l]) => campo("resp", k, l, "textarea", guardadas[k] || ""))
    .join("");

  const TEXTO_BTN = "✨ Generar documento";

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-[16px] font-bold">Generar ${esc(titulo)}</h3>
      <button class="btn-ghost !px-3 !py-2" data-cerrar type="button">✕</button>
    </div>
    <p class="field-hint" style="margin:0 0 18px">
      Usamos los datos de tu negocio. Revisa, corrige o completa lo que quieras.
      Lo que dejes vacío se redactará de forma genérica.
    </p>
    <div class="space-y-4">
      <p class="drawer-section-label">Datos de tu negocio</p>
      ${htmlDatos}
      <p class="drawer-section-label" style="margin-top:8px">Información para el documento (opcional)</p>
      ${htmlResp}
      <button class="btn-primary w-full" data-generar type="button">${TEXTO_BTN}</button>
    </div>`;

  document.body.append(overlay, panel);
  requestAnimationFrame(() => {
    overlay.classList.add("open");
    panel.classList.add("open");
  });

  let ocupado = false;

  const cerrar = () => {
    overlay.classList.remove("open");
    panel.classList.remove("open");
    setTimeout(() => {
      overlay.remove();
      panel.remove();
    }, 350);
  };

  const btnGen = panel.querySelector("[data-generar]");
  const campos = () => panel.querySelectorAll("[data-grupo]");

  overlay.addEventListener("click", () => {
    if (!ocupado) cerrar();
  });
  panel.querySelector("[data-cerrar]").addEventListener("click", () => {
    if (!ocupado) cerrar();
  });

  btnGen.addEventListener("click", async () => {
    if (ocupado) return;

    // 1) leer lo que el negocio dejó en el panel
    const datosOut = { ...datos }; // conserva redes_sociales, metodos_pago, etc.
    const respOut = {};
    campos().forEach((el) => {
      const v = el.value.trim();
      if (el.dataset.grupo === "datos") datosOut[el.dataset.campo] = v;
      else if (v) respOut[el.dataset.campo] = v;
    });

    // 2) estado "generando" INSTANTÁNEO
    ocupado = true;
    btnGen.disabled = true;
    btnGen.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:8px"></span>Generando...`;
    campos().forEach((el) => (el.disabled = true));

    // 3) llamar a la IA; si sale bien se cierra, si falla se reactiva
    try {
      await onGenerar({ datos: datosOut, respuestas: respOut });
      cerrar();
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar con IA: " + e.message);
      ocupado = false;
      btnGen.disabled = false;
      btnGen.textContent = TEXTO_BTN;
      campos().forEach((el) => (el.disabled = false));
    }
  });
}

// Guarda las respuestas SIN esperar (no frena la generación)
function guardarRespuestasIA(tipoDocumento, respuestas) {
  updateDoc(tiendaDoc(_localidad, "tiendas", _negocioId), {
    [`legal_ia.${tipoDocumento}`]: respuestas,
  }).catch((e) =>
    console.warn("No se pudieron guardar las respuestas de IA:", e),
  );
}

// Clic en "✨ Generar con IA": el botón reacciona al instante, abre el panel y listo
async function abrirFlujoIA(btn, tipoDocumento, titulo, onResultado) {
  if (!btn || btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Abriendo...";
  try {
    const { datos, guardadas } = await obtenerDatosNegocioParaIA(tipoDocumento);
    abrirModalDatosIA(
      tipoDocumento,
      titulo,
      datos,
      guardadas,
      async (entrada) => {
        guardarRespuestasIA(tipoDocumento, entrada.respuestas); // sin await
        const resultado = await llamarGenerarDocumentoLegal(
          tipoDocumento,
          entrada.datos,
          entrada.respuestas,
        );
        onResultado(resultado, entrada);
      },
    );
  } catch (e) {
    console.error(e);
    showToast("No se pudo abrir: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── Libro de reclamaciones ──
function generarIALibro() {
  abrirFlujoIA(
    document.getElementById("btnGenerarIALibro"),
    "libro_reclamaciones",
    "Libro de reclamaciones",
    (resultado, entrada) => aplicarResultadoLibro(resultado, entrada),
  );
}

function aplicarResultadoLibro(resultado, entrada) {
  if (resultado.contenido) {
    if (resultado.titulo)
      document.getElementById("libroTitulo").value = limpiarMarkdown(
        resultado.titulo,
      );
    document.getElementById("libroDescripcion").value = limpiarMarkdown(
      resultado.contenido,
    );
    if (entrada.datos.ruc)
      document.getElementById("libroRuc").value = entrada.datos.ruc;
    if (entrada.datos.razon_social)
      document.getElementById("libroRazonSocial").value =
        entrada.datos.razon_social;
    if (resultado.campos) aplicarCamposIALibro(resultado.campos);
    showToast("Generado con IA. Revisa y guarda los cambios.");
  }
  renderPreguntasPendientes(
    "iaLibroPendientes",
    resultado.preguntas_pendientes,
    async (nuevas) => {
      try {
        const respuestas = { ...entrada.respuestas, ...nuevas };
        const r2 = await llamarGenerarDocumentoLegal(
          "libro_reclamaciones",
          entrada.datos,
          respuestas,
        );
        aplicarResultadoLibro(r2, { datos: entrada.datos, respuestas });
      } catch (e) {
        showToast("No se pudo generar con IA: " + e.message);
      }
    },
  );
}

// ── Políticas de privacidad / Términos y condiciones ──
function generarIASeccion(prefix, tipoDocumento) {
  abrirFlujoIA(
    document.getElementById(`btnGenerarIA${capitalizar(prefix)}`),
    tipoDocumento,
    TITULOS_IA[tipoDocumento] || "documento",
    (resultado, entrada) =>
      aplicarResultadoTexto(resultado, prefix, entrada, tipoDocumento),
  );
}

function aplicarResultadoTexto(resultado, prefix, entrada, tipoDocumento) {
  if (resultado.contenido) {
    const parrafos = contenidoAParrafos(resultado.contenido);
    _editorLegalRefs[prefix]?.setContenido(
      limpiarMarkdown(resultado.titulo),
      parrafos,
    );
    showToast("Generado con IA. Revisa y guarda los cambios.");
  }
  renderPreguntasPendientes(
    `ia${capitalizar(prefix)}Pendientes`,
    resultado.preguntas_pendientes,
    async (nuevas) => {
      try {
        const respuestas = { ...entrada.respuestas, ...nuevas };
        const r2 = await llamarGenerarDocumentoLegal(
          tipoDocumento,
          entrada.datos,
          respuestas,
        );
        aplicarResultadoTexto(
          r2,
          prefix,
          { datos: entrada.datos, respuestas },
          tipoDocumento,
        );
      } catch (e) {
        showToast("No se pudo generar con IA: " + e.message);
      }
    },
  );
}

// ══════════════════════════════════════════
//  0) RESOLVER NEGOCIO ACTUAL (localidad + id)
// ══════════════════════════════════════════
function mostrarErrorNegocio(motivo, dataDebug) {
  const badge = document.getElementById("legalLoadingBadge");
  const wrap = document.querySelector(".max-w-5xl");
  if (badge) badge.remove();
  const box = document.createElement("div");
  box.className = "card p-5 mb-6";
  box.style.border = "1px solid rgba(255,107,107,.4)";
  box.innerHTML = `
    <p style="color:#ff6b6b;font-weight:800;font-size:14px;margin:0 0 8px">
      No pude detectar tu negocio (localidad / id)
    </p>
    <p style="color:#d4d4d8;font-size:13px;line-height:1.6;margin:0 0 10px">
      Motivo: ${motivo}. Copia esto y pásaselo a Claude para conectar la ruta correcta:
    </p>
    <pre style="background:#000;padding:10px;border-radius:10px;font-size:11px;color:#9c9ca3;overflow:auto;max-height:220px">${JSON.stringify(dataDebug, null, 2)}</pre>
  `;
  wrap?.prepend(box);
}
function pedirNegocioAlPadre(timeoutMs = 10000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);

    function onMsg(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "DATOS_TIENDA") return;
      const { localidad, id } = e.data;
      if (!localidad || !id) return;
      clearTimeout(t);
      window.removeEventListener("message", onMsg);
      resolve({ localidad, id });
    }

    window.addEventListener("message", onMsg);
    window.parent.postMessage(
      { type: "PEDIR_DATOS_TIENDA" },
      window.location.origin,
    );
  });
}

async function resolverNegocioActual() {
  // 1) lo que ya haya definido el dashboard
  if (window.NEGOCIO_ACTUAL?.localidad && window.NEGOCIO_ACTUAL?.id) {
    return { localidad: window.NEGOCIO_ACTUAL.localidad, id: window.NEGOCIO_ACTUAL.id };
  }
  const sLoc = sessionStorage.getItem("negocioLocalidad") || sessionStorage.getItem("localidad");
  const sId = sessionStorage.getItem("negocioId") || sessionStorage.getItem("id");
  if (sLoc && sId) return { localidad: sLoc, id: sId };

  // 2) preguntarle al dashboard (padre)
  const delPadre = await pedirNegocioAlPadre();
  if (delPadre) return delPadre;

  // 3) último recurso: doc del usuario (solo si tiene tienda_propietario)
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        mostrarErrorNegocio("no hay sesión activa", {});
        return resolve(null);
      }
      try {
        const snap = await getDoc(data_user_logeado(user.uid));
        const p = snap.data()?.tienda_propietario;
        if (p?.id_negocio && p?.distrito) {
          return resolve({ localidad: p.distrito, id: p.id_negocio });
        }
        mostrarErrorNegocio(
          "el dashboard no envió el negocio y el usuario no tiene tienda_propietario",
          {},
        );
        resolve(null);
      } catch (e) {
        mostrarErrorNegocio("error leyendo el usuario: " + e.message, {});
        resolve(null);
      }
    });
  });
}

// ══════════════════════════════════════════
//  1) VISIBILIDAD EN EL PERFIL — footer{ libro_reclamaciones, politicas_privacidad, terminos_condiciones }
// ══════════════════════════════════════════
function initFooterConfig() {
  const ref = tiendaDoc(_localidad, "tiendas", _negocioId);

  const toggleLibro = document.getElementById("toggleLibro");
  const togglePoliticas = document.getElementById("togglePoliticas");
  const toggleTerminos = document.getElementById("toggleTerminos");

  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const footer = snap.data().footer || {};
    toggleLibro.checked = footer.libro_reclamaciones === true;
    togglePoliticas.checked = footer.politicas_privacidad === true;
    toggleTerminos.checked = footer.terminos_condiciones === true;

    actualizarTabsDisponibles(footer);
  });

  [toggleLibro, togglePoliticas, toggleTerminos].forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const campo = toggle.dataset.config; // libro_reclamaciones | politicas_privacidad | terminos_condiciones
      try {
        await updateDoc(ref, { [`footer.${campo}`]: toggle.checked });
        showToast("Actualizado");
      } catch (e) {
        console.error(e);
        toggle.checked = !toggle.checked; // revertir visualmente
        showToast("No se pudo actualizar, intenta de nuevo");
      }
    });
  });
}

function actualizarTabsDisponibles(footer) {
  document.getElementById("tabBtnLibro").disabled =
    !footer.libro_reclamaciones;
  document.getElementById("tabBtnPoliticas").disabled =
    !footer.politicas_privacidad;
  document.getElementById("tabBtnTerminos").disabled =
    !footer.terminos_condiciones;
}

// ══════════════════════════════════════════
//  2) LIBRO DE RECLAMACIONES — config
// ══════════════════════════════════════════
const CAMPOS_LIBRO_DEFAULT = {
  nombre: true,
  apellido: true,
  tipo_documento: true,
  correo: true,
  direcion_consumidor: true,
  padre_madre_apoderado: false,
  pedido_consumidor: true,
  monto_reclamacion: true,
  descripcion: true,
  detalle: true,
  envio_imagenes: false,
};

const ETIQUETAS_CAMPOS_LIBRO = {
  nombre: "Nombre",
  apellido: "Apellido",
  tipo_documento: "Tipo de documento",
  correo: "Correo",
  direcion_consumidor: "Dirección del consumidor",
  padre_madre_apoderado: "Padre / madre / apoderado",
  pedido_consumidor: "Pedido del consumidor",
  monto_reclamacion: "Monto reclamado",
  descripcion: "Descripción",
  detalle: "Detalle",
  envio_imagenes: "Envío de imágenes",
};

function pintarCamposLibro(campos) {
  const grid = document.getElementById("libroCamposGrid");
  grid.innerHTML = "";
  Object.entries(campos).forEach(([campo, activo]) => {
    const label =
      ETIQUETAS_CAMPOS_LIBRO[campo] ||
      campo.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const row = document.createElement("label");
    row.className = "checkbox-row";
    row.innerHTML = `<input type="checkbox" data-campo="${campo}" ${activo ? "checked" : ""}> <span class="text-[12.5px]">${label}</span>`;
    grid.appendChild(row);
  });
}

// La IA marca/desmarca; el negocio corrige después
function aplicarCamposIALibro(campos) {
  const grid = document.getElementById("libroCamposGrid");
  Object.entries(campos || {}).forEach(([campo, activo]) => {
    const chk = grid.querySelector(`input[data-campo="${campo}"]`);
    if (chk) chk.checked = activo === true;
  });
}

async function initLibroReclamaciones() {
  const ref = libroReclamacionesConfigDoc(_localidad, _negocioId);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};

  document.getElementById("libroTitulo").value = pick(d, ["titulo"]) || "";
  document.getElementById("libroRuc").value = pick(d, ["ruc"]) || "";
  document.getElementById("libroRazonSocial").value =
    pick(d, ["razon_social", "razon social"]) || "";
  document.getElementById("libroDescripcion").value =
    pick(d, ["descripcion"]) || "";

  const grid = document.getElementById("libroCamposGrid");
  // mezcla con los defaults para que los negocios antiguos también vean "Envío de imágenes"
  pintarCamposLibro({ ...CAMPOS_LIBRO_DEFAULT, ...(d.campos || {}) });

  document
    .getElementById("btnGuardarLibro")
    .addEventListener("click", async () => {
      const btn = document.getElementById("btnGuardarLibro");
      const hint = document.getElementById("libroSavedHint");
      btn.disabled = true;
      btn.textContent = "Guardando...";
      try {
        const camposActualizados = {};
        grid.querySelectorAll("input[data-campo]").forEach((chk) => {
          camposActualizados[chk.dataset.campo] = chk.checked;
        });
        await setDoc(
          ref,
          {
            titulo: document.getElementById("libroTitulo").value.trim(),
            ruc: document.getElementById("libroRuc").value.trim(),
            razon_social: document
              .getElementById("libroRazonSocial")
              .value.trim(),
            descripcion: document
              .getElementById("libroDescripcion")
              .value.trim(),
            campos: camposActualizados,
          },
          { merge: true },
        );
        hint.textContent = "Guardado ✓";
        showToast("Libro de reclamaciones actualizado");
        setTimeout(() => (hint.textContent = ""), 2500);
      } catch (e) {
        console.error(e);
        showToast("No se pudo guardar, intenta de nuevo");
      } finally {
        btn.disabled = false;
        btn.textContent = "Guardar cambios";
      }
    });
}

// ══════════════════════════════════════════
//  3) RECLAMOS — lista + drawer de respuesta
// ══════════════════════════════════════════
let _reclamosCache = [];
let _reclamoSeleccionadoId = null;
let _reclamosPrimeraCarga = true;

function initReclamos() {
  const listEl = document.getElementById("reclamosList");
  const loadingEl = document.getElementById("reclamosLoading");
  const emptyEl = document.getElementById("reclamosEmpty");
  const filtroSelect = document.getElementById("filtroEstadoReclamos");
  const ordenSelect = document.getElementById("ordenReclamos");
  const badge = document.getElementById("reclamosPendCount");
  const sound = document.getElementById("reclamoSound");

  loadingEl.style.display = "flex";

  const q = query(
    reclamacionesCol(_localidad, _negocioId),
    orderBy("fecha", "desc"),
  );

  onSnapshot(q, (snap) => {
    const reclamos = [];
    snap.forEach((d) => reclamos.push({ id: d.id, ...d.data() }));
    _reclamosCache = reclamos;

    if (!_reclamosPrimeraCarga) {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          sound?.play().catch(() => {});
        }
      });
    }
    _reclamosPrimeraCarga = false;

    const pendientes = reclamos.filter(
      (r) => (r.estado || "pendiente") === "pendiente",
    ).length;
    badge.style.display = pendientes > 0 ? "inline-flex" : "none";
    badge.textContent = pendientes;

    loadingEl.style.display = "none";
    renderReclamos(filtroSelect.value, ordenSelect.value);

    if (_reclamoSeleccionadoId) {
      const actual = _reclamosCache.find(
        (x) => x.id === _reclamoSeleccionadoId,
      );
      if (actual) pintarDrawer(actual);
    }
  });

  filtroSelect.addEventListener("change", () =>
    renderReclamos(filtroSelect.value, ordenSelect.value),
  );
  ordenSelect.addEventListener("change", () =>
    renderReclamos(filtroSelect.value, ordenSelect.value),
  );

  function renderReclamos(filtro, orden) {
    let data =
      filtro === "todos"
        ? [..._reclamosCache]
        : _reclamosCache.filter((r) => (r.estado || "pendiente") === filtro);

    data.sort((a, b) => {
      const fa = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
      const fb = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
      return orden === "antiguos" ? fa - fb : fb - fa;
    });

    listEl.innerHTML = "";
    emptyEl.style.display = data.length ? "none" : "block";

    const tpl = document.getElementById("tplReclamoRow");
    data.forEach((r) => {
      const node = tpl.content.cloneNode(true);
      const row = node.querySelector(".claim-row");
      const estado = r.estado || "pendiente";
      row.dataset.claimId = r.id;
      row.dataset.estado = estado;
      row.querySelector('[data-field="avatar"]').textContent = iniciales(
        r.nombre,
        r.apellido,
      );
      row.querySelector('[data-field="nombreCompleto"]').textContent =
        `${r.nombre || ""} ${r.apellido || ""}`.trim() || "Consumidor";
      row.querySelector('[data-field="codigo"]').textContent =
        r.codigo_seguimiento || r.id;
      row.querySelector('[data-field="descripcion"]').textContent =
        r.descripcion || "—";
      row.querySelector('[data-field="fecha"]').textContent = fmtFecha(r.fecha);
      row.querySelector('[data-field="monto"]').textContent = Number(
        r.monto_reclamacion || 0,
      ).toFixed(2);
      const pill = row.querySelector('[data-field="estadoPill"]');
      pill.textContent = estadoLabel(estado);
      pill.classList.add(estadoClase(estado));

      row.addEventListener("click", () => abrirDrawerReclamo(r.id));
      listEl.appendChild(node);
    });
  }
}

function pintarDrawer(r) {
  document.getElementById("drawerCodigo").textContent =
    r.codigo_seguimiento || r.id;
  const pill = document.getElementById("drawerEstadoPill");
  pill.className = "status-pill " + estadoClase(r.estado);
  pill.textContent = estadoLabel(r.estado);

  document.getElementById("drawerNombre").textContent =
    `${r.nombre || ""} ${r.apellido || ""}`.trim() || "—";
  document.getElementById("drawerDocumento").textContent =
    `${r.tipo_documento || "—"} ${r.numero_documento || ""}`;
  document.getElementById("drawerCorreo").textContent = r.correo || "—";
  document.getElementById("drawerDireccion").textContent =
    r.direcion_consumidor || "—";
  document.getElementById("drawerApoderado").textContent =
    r.padre_madre_apoderado || "—";
  document.getElementById("drawerTipoPedido").textContent =
    r.pedido_consumidor || "—";
  document.getElementById("drawerMonto").textContent =
    "S/ " + Number(r.monto_reclamacion || 0).toFixed(2);
  document.getElementById("drawerDescripcion").textContent =
    r.descripcion || "—";
  document.getElementById("drawerDetalle").textContent = r.detalle || "—";

  document.getElementById("drawerEstadoSelect").value = r.estado || "pendiente";
  document.getElementById("drawerRespuestaInput").value =
    r.respuesta_tienda?.texto || "";
  const fechaHint = r.respuesta_tienda?.fecha
    ? "Última respuesta: " + fmtFecha(r.respuesta_tienda.fecha)
    : "Aún no has respondido este reclamo";
  document.getElementById("drawerRespuestaFechaHint").textContent = fechaHint;
}

function abrirDrawerReclamo(id) {
  const r = _reclamosCache.find((x) => x.id === id);
  if (!r) return;
  _reclamoSeleccionadoId = id;
  pintarDrawer(r);

  document.getElementById("reclamoDrawerOverlay").classList.add("open");
  document.getElementById("reclamoDrawerPanel").classList.add("open");
}

function cerrarDrawerReclamo() {
  document.getElementById("reclamoDrawerOverlay").classList.remove("open");
  document.getElementById("reclamoDrawerPanel").classList.remove("open");
  _reclamoSeleccionadoId = null;
}

function bindDrawerEvents() {
  document
    .getElementById("reclamoDrawerClose")
    .addEventListener("click", cerrarDrawerReclamo);
  document
    .getElementById("reclamoDrawerOverlay")
    .addEventListener("click", cerrarDrawerReclamo);

  document
    .getElementById("drawerGuardarBtn")
    .addEventListener("click", async () => {
      if (!_reclamoSeleccionadoId) return;
      const btn = document.getElementById("drawerGuardarBtn");
      btn.disabled = true;
      btn.textContent = "Guardando...";
      try {
        const texto = document
          .getElementById("drawerRespuestaInput")
          .value.trim();
        let estado = document.getElementById("drawerEstadoSelect").value;

        // Si escribiste una respuesta pero dejaste el estado en "pendiente",
        // lo pasamos a "respondido" automáticamente.
        if (texto && estado === "pendiente") {
          estado = "respondido";
        }

        // updateDoc() escribe en el mismo documento que lee la vista pública
        // del consumidor, así que el cambio se refleja de inmediato.
        const payload = { estado };
        if (texto) {
          payload.respuesta_tienda = { texto, fecha: serverTimestamp() };
        }
        await updateDoc(
          reclamacionDoc(_localidad, _negocioId, _reclamoSeleccionadoId),
          payload,
        );

        showToast(
          estado === "respondido" ? "Respuesta enviada" : "Reclamo actualizado",
        );
        cerrarDrawerReclamo();
      } catch (e) {
        console.error(e);
        showToast("No se pudo guardar, intenta de nuevo");
      } finally {
        btn.disabled = false;
        btn.textContent = "Guardar respuesta y estado";
      }
    });
}

// ══════════════════════════════════════════
//  4) POLÍTICAS DE PRIVACIDAD / TÉRMINOS — título + párrafos
// ══════════════════════════════════════════
function initEditorLegalTexto({ ref, prefix }) {
  const tituloInput = document.getElementById(`${prefix}Titulo`);
  const parrafosWrap = document.getElementById(`${prefix}Parrafos`);
  const btnAgregar = document.getElementById(
    `btnAgregarParrafo${prefix.charAt(0).toUpperCase() + prefix.slice(1)}`,
  );
  const btnGuardar = document.getElementById(
    `btnGuardar${prefix.charAt(0).toUpperCase() + prefix.slice(1)}`,
  );
  const hint = document.getElementById(`${prefix}SavedHint`);

  let parrafos = [];

  function render() {
    parrafosWrap.innerHTML = "";
    if (!parrafos.length) parrafos = [""];
    parrafos.forEach((texto, idx) => {
      const item = document.createElement("div");
      item.className = "paragraph-item";
      item.innerHTML = `
        <span class="paragraph-index">${idx + 1}</span>
        <textarea class="field-textarea" rows="3" data-idx="${idx}" placeholder="Párrafo ${idx + 1}...">${esc(texto)}</textarea>
        ${parrafos.length > 1 ? '<button class="paragraph-remove" type="button">✕</button>' : ""}
      `;
      item.querySelector("textarea").addEventListener("input", (e) => {
        parrafos[idx] = e.target.value;
      });
      item.querySelector(".paragraph-remove")?.addEventListener("click", () => {
        parrafos.splice(idx, 1);
        render();
      });
      parrafosWrap.appendChild(item);
    });
  }

  btnAgregar.addEventListener("click", () => {
    parrafos.push("");
    render();
  });

  btnGuardar.addEventListener("click", async () => {
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";
    try {
      await setDoc(
        ref,
        {
          titulo: tituloInput.value.trim(),
          parrafos: parrafos.map((p) => p.trim()).filter((p) => p.length),
          actualizado: serverTimestamp(),
        },
        { merge: true },
      );
      hint.textContent = "Guardado ✓";
      showToast("Cambios guardados");
      setTimeout(() => (hint.textContent = ""), 2500);
    } catch (e) {
      console.error(e);
      showToast("No se pudo guardar, intenta de nuevo");
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar cambios";
    }
  });

  function setContenido(nuevoTitulo, nuevosParrafos) {
    if (typeof nuevoTitulo === "string" && nuevoTitulo)
      tituloInput.value = nuevoTitulo;
    parrafos = nuevosParrafos && nuevosParrafos.length ? nuevosParrafos : [""];
    render();
  }
  _editorLegalRefs[prefix] = { setContenido };

  getDoc(ref).then((snap) => {
    const d = snap.exists() ? snap.data() : {};
    tituloInput.value = d.titulo || "";
    parrafos =
      Array.isArray(d.parrafos) && d.parrafos.length ? d.parrafos : [""];
    render();
  });
}

// ══════════════════════════════════════════
//  5) TABS
// ══════════════════════════════════════════
function bindTabs() {
  document.querySelectorAll(".legal-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled || btn.classList.contains("plan-oculto")) return;
      activarTab(btn.dataset.tab);
    });
  });
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
(async () => {
  bindTabs();
  bindDrawerEvents();

  const negocio = await resolverNegocioActual();
  if (!negocio) return; // el error ya se muestra en pantalla

  _localidad = negocio.localidad;
  _negocioId = negocio.id;

  document.getElementById("legalLoadingBadge")?.remove();

  initFooterConfig();
  initLibroReclamaciones();
  initReclamos();
  initEditorLegalTexto({
    ref: politicasPrivacidadDoc(_localidad, _negocioId),
    prefix: "politicas",
  });
  initEditorLegalTexto({
    ref: terminosCondicionesDoc(_localidad, _negocioId),
    prefix: "terminos",
  });

  document
    .getElementById("btnGenerarIALibro")
    ?.addEventListener("click", generarIALibro);
  document
    .getElementById("btnGenerarIAPoliticas")
    ?.addEventListener("click", () =>
      generarIASeccion("politicas", "politica_privacidad"),
    );
  document
    .getElementById("btnGenerarIATerminos")
    ?.addEventListener("click", () =>
      generarIASeccion("terminos", "terminos_condiciones"),
    );
})();
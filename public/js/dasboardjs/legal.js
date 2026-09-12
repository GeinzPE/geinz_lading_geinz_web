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
//  0) RESOLVER NEGOCIO ACTUAL (localidad + id)
// ══════════════════════════════════════════
let _localidad = null;
let _negocioId = null;
// ══════════════════════════════════════════
//  GENERACIÓN DE DOCUMENTOS LEGALES CON IA
// ══════════════════════════════════════════
const CLOUD_FUNCTION_GENERAR_DOC_LEGAL =
  "https://generardocumentolegal-oixttik5rq-uc.a.run.app";

// Llama a la Cloud Function (protocolo "callable" de Firebase v2:
// body envuelto en {data:...}, respuesta envuelta en {result:...}).
async function llamarGenerarDocumentoLegal(tipo_documento, datos_negocio, respuestas_negocio) {
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
  // json.result = { success, tipo_documento, titulo, contenido, preguntas_pendientes }
  if (json.result?.success === false) {
    throw new Error(json.result.error?.message || "No se pudo generar el documento");
  }
  return json.result;
}

// Trae el doc crudo de la tienda tal cual está en Firestore (sin filtrar,
// solo para esta prueba — la Cloud Function ya filtra lo sensible).
async function obtenerDatosNegocioCrudos() {
  const snap = await getDoc(tiendaDoc(_localidad, "tiendas", _negocioId));
  return snap.exists() ? snap.data() : {};
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
      <label class="field-label">${p.pregunta}</label>
      <textarea class="field-textarea" rows="2" data-campo="${p.campo}"></textarea>
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

function contenidoAParrafos(contenido) {
  return contenido
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length);
}

// ── Libro de reclamaciones ──
async function generarIALibro() {
  const btn = document.getElementById("btnGenerarIALibro");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando...";
  try {
    const datosNegocio = await obtenerDatosNegocioCrudos();
    const resultado = await llamarGenerarDocumentoLegal("libro_reclamaciones", datosNegocio, {});
    aplicarResultadoLibro(resultado, datosNegocio);
  } catch (e) {
    console.error(e);
    showToast("No se pudo generar con IA: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function aplicarResultadoLibro(resultado, datosNegocio) {
  if (resultado.contenido) {
    if (resultado.titulo) document.getElementById("libroTitulo").value = resultado.titulo;
    document.getElementById("libroDescripcion").value = resultado.contenido;
    showToast("Generado con IA. Revisa y guarda los cambios.");
  }
  renderPreguntasPendientes("iaLibroPendientes", resultado.preguntas_pendientes, async (respuestas) => {
    try {
      const resultado2 = await llamarGenerarDocumentoLegal("libro_reclamaciones", datosNegocio, respuestas);
      aplicarResultadoLibro(resultado2, datosNegocio);
    } catch (e) {
      showToast("No se pudo generar con IA: " + e.message);
    }
  });
}

// ── Políticas de privacidad / Términos y condiciones (mismo formato) ──
const _editorLegalRefs = {}; // llenado dentro de initEditorLegalTexto (ver paso 3)

async function generarIASeccion(prefix, tipoDocumento) {
  const btnId = `btnGenerarIA${capitalizar(prefix)}`;
  const btn = document.getElementById(btnId);
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando...";
  try {
    const datosNegocio = await obtenerDatosNegocioCrudos();
    const resultado = await llamarGenerarDocumentoLegal(tipoDocumento, datosNegocio, {});
    aplicarResultadoTexto(resultado, prefix, datosNegocio, tipoDocumento);
  } catch (e) {
    console.error(e);
    showToast("No se pudo generar con IA: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function aplicarResultadoTexto(resultado, prefix, datosNegocio, tipoDocumento) {
  if (resultado.contenido) {
    const parrafos = contenidoAParrafos(resultado.contenido);
    _editorLegalRefs[prefix]?.setContenido(resultado.titulo, parrafos);
    showToast("Generado con IA. Revisa y guarda los cambios.");
  }
  renderPreguntasPendientes(`ia${capitalizar(prefix)}Pendientes`, resultado.preguntas_pendientes, async (respuestas) => {
    try {
      const resultado2 = await llamarGenerarDocumentoLegal(tipoDocumento, datosNegocio, respuestas);
      aplicarResultadoTexto(resultado2, prefix, datosNegocio, tipoDocumento);
    } catch (e) {
      showToast("No se pudo generar con IA: " + e.message);
    }
  });
}
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

async function resolverNegocioActual() {
  if (window.NEGOCIO_ACTUAL?.localidad && window.NEGOCIO_ACTUAL?.id) {
    return { localidad: window.NEGOCIO_ACTUAL.localidad, id: window.NEGOCIO_ACTUAL.id };
  }
  const sLoc = sessionStorage.getItem("negocioLocalidad") || sessionStorage.getItem("localidad");
  const sId = sessionStorage.getItem("negocioId") || sessionStorage.getItem("id");
  if (sLoc && sId) return { localidad: sLoc, id: sId };

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        mostrarErrorNegocio("no hay sesión activa (auth.currentUser es null)", {});
        return resolve(null);
      }
      try {
        const snap = await getDoc(data_user_logeado(user.uid));
        if (!snap.exists()) {
          mostrarErrorNegocio("el doc del usuario logueado no existe", { uid: user.uid });
          return resolve(null);
        }
        const d = snap.data();
        const propietario = d.tienda_propietario || {};
        const id = propietario.id_negocio;
        const localidad = propietario.distrito;
        if (id && localidad) return resolve({ localidad, id });

        mostrarErrorNegocio(
          "encontré tu doc de usuario pero tienda_propietario.id_negocio o tienda_propietario.distrito no tienen valor",
          d,
        );
        resolve(null);
      } catch (e) {
        mostrarErrorNegocio("error leyendo el doc del usuario: " + e.message, {});
        resolve(null);
      }
    });
  });
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function pick(obj = {}, keys = []) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
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
  return (estado || "pendiente").charAt(0).toUpperCase() + (estado || "pendiente").slice(1);
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
//  1) CONFIG MAESTRA — footer{ activo, libro_reclamaciones, politicas_privacidad, terminos_condiciones }
// ══════════════════════════════════════════
function initFooterConfig() {
  const ref = tiendaDoc(_localidad, "tiendas", _negocioId);

  const toggleActivo = document.getElementById("toggleFooterActivo");
  const toggleLibro = document.getElementById("toggleLibro");
  const togglePoliticas = document.getElementById("togglePoliticas");
  const toggleTerminos = document.getElementById("toggleTerminos");
  const subWrap = document.getElementById("subTogglesWrap");

  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const footer = snap.data().footer || {};
    toggleActivo.checked = footer.activo !== false; // default true si no existe
    toggleLibro.checked = footer.libro_reclamaciones === true;
    togglePoliticas.checked = footer.politicas_privacidad === true;
    toggleTerminos.checked = footer.terminos_condiciones === true;

    const activo = toggleActivo.checked;
    [toggleLibro, togglePoliticas, toggleTerminos].forEach((t) => (t.disabled = !activo));
    subWrap.style.opacity = activo ? "1" : ".45";

    actualizarTabsDisponibles(footer);
  });

  [toggleActivo, toggleLibro, togglePoliticas, toggleTerminos].forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const campo = toggle.dataset.config; // activo | libro_reclamaciones | ...
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
  const activo = footer.activo !== false;
  document.getElementById("tabBtnLibro").disabled = !(activo && footer.libro_reclamaciones);
  document.getElementById("tabBtnPoliticas").disabled = !(activo && footer.politicas_privacidad);
  document.getElementById("tabBtnTerminos").disabled = !(activo && footer.terminos_condiciones);
  // "Reclamos" siempre se puede revisar aunque el libro esté apagado del perfil público
}

// ══════════════════════════════════════════
//  2) LIBRO DE RECLAMACIONES — config
// ══════════════════════════════════════════
async function initLibroReclamaciones() {
  const ref = libroReclamacionesConfigDoc(_localidad, _negocioId);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};

  document.getElementById("libroTitulo").value = pick(d, ["titulo"]) || "";
  document.getElementById("libroRuc").value = pick(d, ["ruc"]) || "";
  document.getElementById("libroRazonSocial").value = pick(d, ["razon_social", "razon social"]) || "";
  document.getElementById("libroDescripcion").value = pick(d, ["descripcion"]) || "";

  const campos = d.campos || {
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
  };

  const grid = document.getElementById("libroCamposGrid");
  grid.innerHTML = "";
  Object.entries(campos).forEach(([campo, activo]) => {
    const label = campo.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const row = document.createElement("label");
    row.className = "checkbox-row";
    row.innerHTML = `<input type="checkbox" data-campo="${campo}" ${activo ? "checked" : ""}> <span class="text-[12.5px]">${label}</span>`;
    grid.appendChild(row);
  });

  document.getElementById("btnGuardarLibro").addEventListener("click", async () => {
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
          razon_social: document.getElementById("libroRazonSocial").value.trim(),
          descripcion: document.getElementById("libroDescripcion").value.trim(),
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

  const q = query(reclamacionesCol(_localidad, _negocioId), orderBy("fecha", "desc"));

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

    const pendientes = reclamos.filter((r) => (r.estado || "pendiente") === "pendiente").length;
    badge.style.display = pendientes > 0 ? "inline-flex" : "none";
    badge.textContent = pendientes;

    loadingEl.style.display = "none";
    renderReclamos(filtroSelect.value, ordenSelect.value);

    if (_reclamoSeleccionadoId) {
      const actual = _reclamosCache.find((x) => x.id === _reclamoSeleccionadoId);
      if (actual) pintarDrawer(actual);
    }
  });

  filtroSelect.addEventListener("change", () => renderReclamos(filtroSelect.value, ordenSelect.value));
  ordenSelect.addEventListener("change", () => renderReclamos(filtroSelect.value, ordenSelect.value));

  function renderReclamos(filtro, orden) {
    let data =
      filtro === "todos" ? [..._reclamosCache] : _reclamosCache.filter((r) => (r.estado || "pendiente") === filtro);

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
      row.querySelector('[data-field="avatar"]').textContent = iniciales(r.nombre, r.apellido);
      row.querySelector('[data-field="nombreCompleto"]').textContent =
        `${r.nombre || ""} ${r.apellido || ""}`.trim() || "Consumidor";
      row.querySelector('[data-field="codigo"]').textContent = r.codigo_seguimiento || r.id;
      row.querySelector('[data-field="descripcion"]').textContent = r.descripcion || "—";
      row.querySelector('[data-field="fecha"]').textContent = fmtFecha(r.fecha);
      row.querySelector('[data-field="monto"]').textContent = Number(r.monto_reclamacion || 0).toFixed(2);
      const pill = row.querySelector('[data-field="estadoPill"]');
      pill.textContent = estadoLabel(estado);
      pill.classList.add(estadoClase(estado));

      row.addEventListener("click", () => abrirDrawerReclamo(r.id));
      listEl.appendChild(node);
    });
  }
}

function pintarDrawer(r) {
  document.getElementById("drawerCodigo").textContent = r.codigo_seguimiento || r.id;
  const pill = document.getElementById("drawerEstadoPill");
  pill.className = "status-pill " + estadoClase(r.estado);
  pill.textContent = estadoLabel(r.estado);

  document.getElementById("drawerNombre").textContent = `${r.nombre || ""} ${r.apellido || ""}`.trim() || "—";
  document.getElementById("drawerDocumento").textContent = `${r.tipo_documento || "—"} ${r.numero_documento || ""}`;
  document.getElementById("drawerCorreo").textContent = r.correo || "—";
  document.getElementById("drawerDireccion").textContent = r.direcion_consumidor || "—";
  document.getElementById("drawerApoderado").textContent = r.padre_madre_apoderado || "—";
  document.getElementById("drawerTipoPedido").textContent = r.pedido_consumidor || "—";
  document.getElementById("drawerMonto").textContent = "S/ " + Number(r.monto_reclamacion || 0).toFixed(2);
  document.getElementById("drawerDescripcion").textContent = r.descripcion || "—";
  document.getElementById("drawerDetalle").textContent = r.detalle || "—";

  document.getElementById("drawerEstadoSelect").value = r.estado || "pendiente";
  document.getElementById("drawerRespuestaInput").value = r.respuesta_tienda?.texto || "";
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
  document.getElementById("reclamoDrawerClose").addEventListener("click", cerrarDrawerReclamo);
  document.getElementById("reclamoDrawerOverlay").addEventListener("click", cerrarDrawerReclamo);

  document.getElementById("drawerGuardarBtn").addEventListener("click", async () => {
    if (!_reclamoSeleccionadoId) return;
    const btn = document.getElementById("drawerGuardarBtn");
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      const texto = document.getElementById("drawerRespuestaInput").value.trim();
      let estado = document.getElementById("drawerEstadoSelect").value;

      // Si escribiste una respuesta pero dejaste el estado en "pendiente",
      // lo pasamos a "respondido" automáticamente: así el reclamo nunca se
      // queda marcado como pendiente cuando en realidad ya fue contestado.
      if (texto && estado === "pendiente") {
        estado = "respondido";
      }

      // ── Esto es lo que "se ve reflejado del otro lado" ──
      // updateDoc() escribe directamente en el mismo documento de Firestore
      // (reclamacionDoc) que lee la vista pública del consumidor. En cuanto
      // este updateDoc() se confirma, cualquier pantalla que tenga un
      // onSnapshot() sobre ese documento (como esta misma lista, vía
      // reclamacionesCol) recibe el cambio al instante, sin recargar la
      // página. Si la vista del consumidor solo hace un getDoc() puntual,
      // verá el estado actualizado la próxima vez que abra/recargue esa
      // pantalla.
      const payload = { estado };
      if (texto) {
        payload.respuesta_tienda = { texto, fecha: serverTimestamp() };
      }
      await updateDoc(reclamacionDoc(_localidad, _negocioId, _reclamoSeleccionadoId), payload);

      showToast(estado === "respondido" ? "Respuesta enviada" : "Reclamo actualizado");
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
  const btnGuardar = document.getElementById(`btnGuardar${prefix.charAt(0).toUpperCase() + prefix.slice(1)}`);
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
        <textarea class="field-textarea" rows="3" data-idx="${idx}" placeholder="Párrafo ${idx + 1}...">${texto}</textarea>
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
    if (typeof nuevoTitulo === "string" && nuevoTitulo) tituloInput.value = nuevoTitulo;
    parrafos = nuevosParrafos && nuevosParrafos.length ? nuevosParrafos : [""];
    render();
  }
  _editorLegalRefs[prefix] = { setContenido };
  getDoc(ref).then((snap) => {
    const d = snap.exists() ? snap.data() : {};
    tituloInput.value = d.titulo || "";
    parrafos = Array.isArray(d.parrafos) && d.parrafos.length ? d.parrafos : [""];
    render();
  });
}

// ══════════════════════════════════════════
//  5) TABS
// ══════════════════════════════════════════
function bindTabs() {
  document.querySelectorAll(".legal-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      document.querySelectorAll(".legal-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("panel" + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.add("active");
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
  initEditorLegalTexto({ ref: politicasPrivacidadDoc(_localidad, _negocioId), prefix: "politicas" });
  initEditorLegalTexto({ ref: terminosCondicionesDoc(_localidad, _negocioId), prefix: "terminos" });
    document.getElementById("btnGenerarIALibro")?.addEventListener("click", generarIALibro);
  document.getElementById("btnGenerarIAPoliticas")?.addEventListener("click", () =>
    generarIASeccion("politicas", "politica_privacidad"),
  );
  document.getElementById("btnGenerarIATerminos")?.addEventListener("click", () =>
    generarIASeccion("terminos", "terminos_condiciones"),
  );
})();
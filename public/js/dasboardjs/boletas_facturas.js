import {
  CONFIG_DEFAULT,
  obtenerConfigComprobante,
  guardarConfigComprobante,
  procesarLogo,
  renderComprobante,
  imprimirComprobante,
  pedidoDemo,
} from "./comprobantes.js";

const $ = (id) => document.getElementById(id);

/* ══════════════════════════════════════════
   Equipo lento / conexión lenta (Nokia, 2G, ahorro de datos)
   → menos renders y más paciencia con la red
   ══════════════════════════════════════════ */
const conn = navigator.connection;
const EQUIPO_LENTO =
  (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
  !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")));
const RETARDO_VISTA = EQUIPO_LENTO ? 350 : 140; // debounce de la vista previa
const ESPERA_TIENDA = EQUIPO_LENTO ? 12000 : 7000; // cuánto esperar a que el panel mande la tienda

/* ── Constantes ── */
const QR_DEFAULT = location.origin + "/c/{codigo}"; // 👈 cambia /c/ por tu ruta real
const FUENTES = {
  arial: "Arial, Helvetica, sans-serif",
  dmsans: "'DM Sans', sans-serif",
  sora: "'Sora', sans-serif",
  courier: "'Courier Prime', 'Courier New', monospace",
  robotomono: "'Roboto Mono', monospace",
};

/* ── Datos de la tienda ──
   Orden: URL (?tienda=...&localidad=...) → sessionStorage → localStorage →
   postMessage del panel (DATOS_TIENDA). */
const qs = new URLSearchParams(location.search);
let TIENDA_ID =
  qs.get("tienda") ||
  sessionStorage.getItem("tiendaId") ||
  localStorage.getItem("tiendaId") ||
  "";
let LOCALIDAD = qs.get("localidad") || sessionStorage.getItem("localidad") || "";
let NOMBRE_TIENDA = sessionStorage.getItem("nombreTienda") || "";

let cfg = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
let logoOriginal = "";
let listo = false; // config ya cargada desde la DB
let iniciado = false; // ya se arrancó con una tienda válida
let ultimoPayload = null; // último payload de tienda recibido por postMessage

/* ── Aviso al HTML: "ya cargó todo" → quita el skeleton ── */
let avisado = false;
function senalListo() {
  if (avisado) return;
  avisado = true;
  window.dispatchEvent(new Event("comprobante:listo"));
}

/* get/set por ruta "a.b.c" */
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const set = (o, p, v) => {
  const ks = p.split(".");
  const l = ks.pop();
  ks.reduce((x, k) => (x[k] ??= {}), o)[l] = v;
};

/* ══════════════════════════════════════════
   Formulario
   ══════════════════════════════════════════ */
const CAMPOS = document.querySelectorAll("[data-k]");
const elSinValor = document.querySelector('[data-k="documento.sinValorTributario"]');

function pintarFormulario() {
  CAMPOS.forEach((el) => {
    const v = get(cfg, el.dataset.k);
    if (el.type === "checkbox") {
      const b = !!v;
      if (el.checked !== b) el.checked = b;
    } else {
      const s = v ?? "";
      if (el.value !== s) el.value = s; // evita saltos de cursor
    }
  });
  pintarLogo();
}

let logoPintado = null;
function pintarLogo() {
  const src = cfg.negocio?.logo || "";
  if (src === logoPintado) return;
  logoPintado = src;
  const drop = $("drop");
  if (!src) {
    drop.innerHTML = "<span>Subir<br>logo</span>";
    return;
  }
  const img = new Image();
  img.alt = "logo";
  img.decoding = "async";
  img.src = src;
  drop.replaceChildren(img);
}

let msgActual = "";
function mensaje(txt, ok = false, err = false) {
  const cls = "msg" + (ok ? " ok" : "") + (err ? " err" : "");
  if (msgActual === txt + "|" + cls) return; // no tocar el DOM si no cambió
  msgActual = txt + "|" + cls;
  const el = $("msg");
  el.textContent = txt;
  el.className = cls;
}

/* ══════════════════════════════════════════
   Vista previa (un render a la vez, sin pisarse)
   ══════════════════════════════════════════ */
const estiloFuente = document.createElement("style");
document.head.appendChild(estiloFuente);
let fuenteActual = null;

function aplicarFuente() {
  const clave = cfg.estilo?.fuente || "";
  if (clave === fuenteActual) return;
  fuenteActual = clave;
  const f = FUENTES[clave];
  estiloFuente.textContent = f ? `#ticket, #ticket * { font-family: ${f} !important; }` : "";
}

const elQr = document.querySelector('[data-k="qr.plantilla"]')?.closest("label")?.nextElementSibling;
let qrAviso = "";
function revisarQr() {
  if (!elQr) return;
  const url = (cfg.qr?.plantilla || "").trim();
  const txt = !url
    ? "Usa {codigo} para que cada venta tenga su propio QR."
    : url.includes("{codigo}")
      ? "✓ QR dinámico: cada venta genera un QR distinto."
      : "⚠ Sin {codigo} el QR será el mismo en todas las ventas (estático).";
  if (txt === qrAviso) return;
  qrAviso = txt;
  elQr.textContent = txt;
}

let renderizando = false;
let pendiente = false;
async function renderAhora() {
  if (renderizando) {
    pendiente = true; // se repite al terminar, con el último cfg
    return;
  }
  renderizando = true;
  try {
    do {
      pendiente = false;
      await renderComprobante($("ticket"), pedidoDemo(), cfg);
      aplicarFuente();
      revisarQr();
    } while (pendiente);
  } catch (e) {
    console.error("Error al dibujar el comprobante:", e);
  } finally {
    renderizando = false;
  }
}

let tVista;
function vista() {
  clearTimeout(tVista);
  tVista = setTimeout(renderAhora, RETARDO_VISTA);
}

document.addEventListener("input", (e) => {
  const el = e.target;
  const k = el.dataset?.k;
  if (!k) return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (k === "negocio.ruc") {
    v = v.replace(/\D/g, "");
    if (el.value !== v) el.value = v;
    set(cfg, "documento.sinValorTributario", !v); // sin RUC → sin valor tributario
    if (elSinValor) elSinValor.checked = !v;
  }
  set(cfg, k, v);
  mensaje("Cambios sin guardar");
  vista();
});

/* ══════════════════════════════════════════
   Logo
   ══════════════════════════════════════════ */
async function aplicarLogo() {
  if (!logoOriginal) {
    cfg.negocio.logo = "";
    pintarLogo();
    mensaje("Cambios sin guardar");
    vista();
    return;
  }
  try {
    cfg.negocio.logo = await procesarLogo(logoOriginal, { bn: $("logoBw").checked });
    mensaje("Cambios sin guardar");
  } catch {
    mensaje("No se pudo leer la imagen", false, true);
  }
  pintarLogo();
  vista();
}
$("drop").onclick = $("logoBtn").onclick = () => $("logoFile").click();
$("logoFile").onchange = (e) => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith("image/")) return;
  const r = new FileReader();
  r.onload = () => {
    logoOriginal = r.result;
    aplicarLogo();
  };
  r.readAsDataURL(f);
};
$("logoDel").onclick = () => {
  logoOriginal = "";
  $("logoFile").value = "";
  aplicarLogo();
};
$("logoBw").onchange = () => {
  if (logoOriginal) aplicarLogo();
};

/* ══════════════════════════════════════════
   Guardar / probar impresión
   ══════════════════════════════════════════ */
$("btnSave").onclick = async () => {
  if (!listo || !TIENDA_ID || !LOCALIDAD) {
    mensaje("Aún no se identifica la tienda, espera un momento", false, true);
    return;
  }
  const btn = $("btnSave");
  const textoOriginal = "Guardar cambios";

  btn.disabled = true;
  btn.classList.remove("listo", "fallo");
  btn.classList.add("cargando");
  btn.textContent = "Guardando…";
  $("prog").classList.add("on");
  mensaje("Guardando cambios…");

  let ok = false;
  try {
    // mínimo 600 ms para que se alcance a ver el progreso
    [ok] = await Promise.all([
      guardarConfigComprobante(TIENDA_ID, LOCALIDAD, cfg),
      new Promise((r) => setTimeout(r, 600)),
    ]);
  } catch (e) {
    console.error(e);
    ok = false;
  }

  $("prog").classList.remove("on");
  btn.classList.remove("cargando");
  btn.classList.add(ok ? "listo" : "fallo");
  btn.textContent = ok ? "✓ Guardado" : "✕ No se pudo guardar";
  mensaje(
    ok ? "Cambios guardados correctamente" : "No se pudo guardar, intenta de nuevo",
    ok,
    !ok,
  );

  setTimeout(() => {
    btn.classList.remove("listo", "fallo");
    btn.textContent = textoOriginal;
    btn.disabled = false;
    if (ok) mensaje("");
  }, 2200);
};
$("btnPrint").onclick = () => imprimirComprobante(pedidoDemo(), cfg);

/* ══════════════════════════════════════════
   Autocompletar con los datos del perfil del negocio
   ══════════════════════════════════════════ */
function leerNegocio() {
  // Primero el estado del panel padre; si no está, el último payload recibido
  let t = null;
  try {
    t = window.parent?.APP_STATE?.tienda || null;
  } catch {
    t = null;
  }
  t = t || ultimoPayload;
  if (!t) return null;

  const mc = t.metodo_contacto || {};
  const ub = t.ubicacion || {};
  const telefono =
    (mc.whatsapp?.estado && mc.whatsapp?.numero) ||
    (mc.llamada?.estado && mc.llamada?.numero) ||
    mc.whatsapp?.numero ||
    mc.llamada?.numero ||
    "";
  const ig = mc.instagram?.nombre || "";
  return {
    nombre: t.nombre_tienda || t.nombre || "",
    telefono,
    direccion: ub["dirección"] || "",
    redes: ig ? (ig.startsWith("@") ? ig : "@" + ig) : "",
    logo: t.logo_tienda || t.img_tienda?.logo_tienda || "",
  };
}

// Descarga el logo y lo convierte a data URL (no contamina el canvas).
// Primero usa la caché; si falla por CORS, reintenta saltándola.
async function urlADataURL(url) {
  async function intentar(opts) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10000); // no se queda colgado en redes lentas
    try {
      const r = await fetch(url, { mode: "cors", signal: ctl.signal, ...opts });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.blob();
    } finally {
      clearTimeout(to);
    }
  }
  let blob;
  try {
    blob = await intentar({});
  } catch {
    blob = await intentar({ cache: "reload" });
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

async function traerLogo(d, forzar) {
  if (!d.logo) return;
  if (!forzar && cfg.negocio.logo) return;
  try {
    logoOriginal = await urlADataURL(d.logo);
    await aplicarLogo();
  } catch (e) {
    console.warn("No se pudo traer el logo:", e);
    mensaje("No se pudo traer el logo del negocio", false, true);
  }
}

// forzar=false → solo llena lo vacío; forzar=true → sobrescribe
let huellaNegocio = "";
async function aplicarNegocio(forzar = false) {
  const d = leerNegocio();
  if (!d) return false;

  // Si el perfil no cambió desde la última vez, no repintar ni redibujar
  const huella = JSON.stringify(d);
  if (!forzar && huella === huellaNegocio) return true;
  huellaNegocio = huella;

  const poner = (ruta, valor) => {
    if (!valor) return;
    if (!forzar && (get(cfg, ruta) || "").toString().trim()) return;
    set(cfg, ruta, valor);
  };
  poner("negocio.nombre", d.nombre);
  poner("negocio.telefono", d.telefono);
  poner("negocio.direccion", d.direccion);
  poner("negocio.redes", d.redes);

  // QR dinámico por defecto si está vacío
  if (!(cfg.qr?.plantilla || "").trim()) set(cfg, "qr.plantilla", QR_DEFAULT);

  pintarFormulario();
  await renderAhora();

  // El logo baja en segundo plano: no frena la pantalla
  const logo = traerLogo(d, forzar);
  if (forzar) await logo;
  return true;
}

$("btnTraerNegocio")?.addEventListener("click", async () => {
  const ok = await aplicarNegocio(true);
  mensaje(
    ok ? "Datos del negocio cargados. Pulsa Guardar." : "Aún no hay datos del negocio.",
    ok,
  );
});

/* ══════════════════════════════════════════
   Arranque
   ══════════════════════════════════════════ */
async function iniciar() {
  $("btnSave").disabled = true;
  mensaje("Cargando…");
  try {
    cfg = await obtenerConfigComprobante(TIENDA_ID, LOCALIDAD, { nombre: NOMBRE_TIENDA });
    listo = true;
    mensaje("");
  } catch (e) {
    console.error(e);
    mensaje("No se pudo cargar la configuración", false, true);
  }
  $("btnSave").disabled = false;

  try {
    // Rellena lo vacío con el perfil y dibuja; si aún no hay perfil, dibuja la config tal cual
    if (!(await aplicarNegocio(false))) {
      pintarFormulario();
      await renderAhora();
    }
  } catch (e) {
    console.error(e);
  }
  senalListo(); // → el HTML quita el skeleton
}

function arrancar() {
  if (iniciado || !TIENDA_ID || !LOCALIDAD) return false;
  iniciado = true;
  iniciar();
  return true;
}

arrancar();

if (!iniciado) {
  // Esperamos a que el panel mande DATOS_TIENDA (en equipos lentos puede tardar)
  setTimeout(() => {
    if (iniciado) return;
    TIENDA_ID ||= sessionStorage.getItem("tiendaId") || "";
    LOCALIDAD ||= sessionStorage.getItem("localidad") || "";
    if (arrancar()) return;

    $("btnSave").disabled = true;
    mensaje("No se encontró la tienda. Abre esta página desde el panel.", false, true);
    pintarFormulario();
    renderAhora().then(senalListo);
  }, ESPERA_TIENDA);
}

/* ── Mensajes del panel (un solo listener) ── */
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d) return;
  const tipo = d.type || d.tipo;

  if (tipo === "DATOS_TIENDA") {
    if (d.payload) ultimoPayload = d.payload;

    if (!iniciado) {
      // también funciona si llega después del aviso de "no se encontró la tienda"
      TIENDA_ID = d.tiendaId || d.id || d.payload?.id_tienda || TIENDA_ID;
      LOCALIDAD = d.localidad || d.payload?.localidad || LOCALIDAD;
      NOMBRE_TIENDA = d.payload?.nombre_tienda || d.nombreTienda || NOMBRE_TIENDA;
      arrancar();
    } else if (listo) {
      aplicarNegocio(false); // el perfil llegó tarde
    }
    return;
  }

  if (tipo === "PATCH_TIENDA" && listo) {
    aplicarNegocio(false);
  }
});
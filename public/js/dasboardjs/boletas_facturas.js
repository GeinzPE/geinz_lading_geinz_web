import {
  CONFIG_DEFAULT,
  obtenerConfigComprobante,
  guardarConfigComprobante,
  procesarLogo,
  renderComprobante,
  imprimirComprobante,
  pedidoDemo,
} from "./comprobantes.js";

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

const $ = (id) => document.getElementById(id);
let cfg = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
let logoOriginal = "";
let listo = false; // true cuando ya se cargó la config desde la caché/DB
let ultimoPayload = null; // último payload de tienda recibido por postMessage

/* get/set por ruta "a.b.c" */
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const set = (o, p, v) => {
  const ks = p.split(".");
  const l = ks.pop();
  ks.reduce((x, k) => (x[k] ??= {}), o)[l] = v;
};

function pintarFormulario() {
  document.querySelectorAll("[data-k]").forEach((el) => {
    const v = get(cfg, el.dataset.k);
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
  });
  pintarLogo();
}
function pintarLogo() {
  $("drop").innerHTML = cfg.negocio.logo
    ? `<img src="${cfg.negocio.logo}" alt="logo">`
    : "<span>Subir<br>logo</span>";
}

let t;
function vista() {
  clearTimeout(t);
  t = setTimeout(async () => {
    await renderComprobante($("ticket"), pedidoDemo(), cfg);
    aplicarFuente();
    revisarQr();
  }, 120);
}
function mensaje(txt, ok = false, err = false) {
  $("msg").textContent = txt;
  $("msg").className = "msg" + (ok ? " ok" : "") + (err ? " err" : "");
}
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset?.k) return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.k === "negocio.ruc") {
    v = v.replace(/\D/g, "");
    el.value = v;
    set(cfg, "documento.sinValorTributario", !v); // sin RUC → sin valor tributario
    document.querySelector('[data-k="documento.sinValorTributario"]').checked = !v;
  }
  set(cfg, el.dataset.k, v);
  mensaje("Cambios sin guardar");
  vista();
});

/* Logo */
async function aplicarLogo() {
  if (!logoOriginal) {
    cfg.negocio.logo = "";
    pintarLogo();
    mensaje("Cambios sin guardar");
    return vista();
  }
  try {
    cfg.negocio.logo = await procesarLogo(logoOriginal, { bn: $("logoBw").checked });
    mensaje("Cambios sin guardar");
  } catch {
    mensaje("No se pudo leer la imagen");
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

/* Guardar / probar */
$("btnSave").onclick = async () => {
  if (!listo || !TIENDA_ID || !LOCALIDAD) {
    mensaje("Aún no se identifica la tienda, espera un momento", false, true);
    return;
  }
  const btn = $("btnSave");
  const textoOriginal = "Guardar cambios";

  // estado: guardando
  btn.disabled = true;
  btn.classList.remove("listo", "fallo");
  btn.classList.add("cargando");
  btn.textContent = "Guardando…";
  $("prog").classList.add("on");
  mensaje("Guardando cambios…");

  let ok = false;
  try {
    // mínimo 600 ms para que el cliente alcance a ver el progreso
    [ok] = await Promise.all([
      guardarConfigComprobante(TIENDA_ID, LOCALIDAD, cfg),
      new Promise((r) => setTimeout(r, 600)),
    ]);
  } catch (e) {
    console.error(e);
    ok = false;
  }

  // estado: resultado
  $("prog").classList.remove("on");
  btn.classList.remove("cargando");
  btn.classList.add(ok ? "listo" : "fallo");
  btn.textContent = ok ? "✓ Guardado" : "✕ No se pudo guardar";
  mensaje(
    ok ? "Cambios guardados correctamente" : "No se pudo guardar, intenta de nuevo",
    ok,
    !ok,
  );

  // volver al estado normal
  setTimeout(() => {
    btn.classList.remove("listo", "fallo");
    btn.textContent = textoOriginal;
    btn.disabled = false;
    if (ok) mensaje("");
  }, 2200);
};
$("btnPrint").onclick = () => imprimirComprobante(pedidoDemo(), cfg);

/* ── Autocompletar con los datos del perfil del negocio ── */
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
    nombre: t.nombre_tienda || "",
    telefono,
    direccion: ub["dirección"] || "",
    redes: ig ? (ig.startsWith("@") ? ig : "@" + ig) : "",
    logo: t.logo_tienda || "",
  };
}
// Descarga el logo y lo convierte a data URL (no contamina el canvas)
async function urlADataURL(url) {
  const r = await fetch(url, { mode: "cors", cache: "reload" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const blob = await r.blob();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
// forzar=false → solo llena lo que esté vacío; forzar=true → sobrescribe
async function aplicarNegocio(forzar = false) {
  const d = leerNegocio();
  if (!d) return false;

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
  vista();
  if (d.logo && (forzar || !cfg.negocio.logo)) {
    try {
      logoOriginal = await urlADataURL(d.logo);
      await aplicarLogo();
    } catch (e) {
      console.warn("No se pudo traer el logo:", e);
      mensaje("No se pudo traer el logo del negocio");
    }
  }
  return true;
}

$("btnTraerNegocio")?.addEventListener("click", async () => {
  const ok = await aplicarNegocio(true);
  mensaje(
    ok ? "Datos del negocio cargados. Pulsa Guardar." : "Aún no hay datos del negocio.",
    ok,
  );
});
/* ── Fuente del comprobante ── */
const FUENTES = {
  arial: "Arial, Helvetica, sans-serif",
  dmsans: "'DM Sans', sans-serif",
  sora: "'Sora', sans-serif",
  courier: "'Courier Prime', 'Courier New', monospace",
  robotomono: "'Roboto Mono', monospace",
};
const estiloFuente = document.createElement("style");
document.head.appendChild(estiloFuente);

function aplicarFuente() {
  const f = FUENTES[cfg.estilo?.fuente];
  estiloFuente.textContent = f ? `#ticket, #ticket * { font-family: ${f} !important; }` : "";
}

/* ── QR dinámico ── */
const QR_DEFAULT = location.origin + "/c/{codigo}"; // 👈 cambia /c/ por tu ruta real

function revisarQr() {
  const url = (cfg.qr?.plantilla || "").trim();
  const h = document.querySelector('[data-k="qr.plantilla"]')
    ?.closest("label")?.nextElementSibling; // el <p class="hint">
  if (!h) return;
  h.textContent = !url
    ? "Usa {codigo} para que cada venta tenga su propio QR."
    : url.includes("{codigo}")
      ? "✓ QR dinámico: cada venta genera un QR distinto."
      : "⚠ Sin {codigo} el QR será el mismo en todas las ventas (estático).";
}
/* ── Arranque ── */
async function iniciar() {
  $("btnSave").disabled = true;
  mensaje("Cargando…");
  try {
    cfg = await obtenerConfigComprobante(TIENDA_ID, LOCALIDAD, { nombre: NOMBRE_TIENDA });
    listo = true;
    mensaje("");
  } catch (e) {
    console.error(e);
    mensaje("No se pudo cargar la configuración");
  }
  $("btnSave").disabled = false;
  pintarFormulario();
  vista();
  await aplicarNegocio(false); // rellena lo vacío con el perfil
}

// Pinta ya el formulario con valores por defecto mientras se identifica la tienda
pintarFormulario();
vista();

let resuelto = false;

if (TIENDA_ID && LOCALIDAD) {
  resuelto = true;
  iniciar();
} else {
  setTimeout(() => {
    if (resuelto) return;
    resuelto = true;
    if (!TIENDA_ID || !LOCALIDAD) {
      $("btnSave").disabled = true;
      mensaje("No se encontró la tienda. Abre esta página desde el panel.");
    } else {
      iniciar();
    }
  }, 1200);
}

/* ── Mensajes del panel (un solo listener) ── */
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d) return;
  const tipo = d.type || d.tipo;

  if (tipo === "DATOS_TIENDA") {
    if (d.payload) ultimoPayload = d.payload;

    if (!resuelto) {
      resuelto = true;
      TIENDA_ID = d.tiendaId || d.id || d.payload?.id_tienda || TIENDA_ID;
      LOCALIDAD = d.localidad || d.payload?.localidad || LOCALIDAD;
      NOMBRE_TIENDA = d.payload?.nombre_tienda || d.nombreTienda || NOMBRE_TIENDA;
      iniciar();
    } else if (listo) {
      aplicarNegocio(false); // el perfil llegó tarde
    }
    return;
  }

  if (tipo === "PATCH_TIENDA" && listo) {
    aplicarNegocio(false);
  }
});
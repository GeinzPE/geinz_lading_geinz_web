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
  }, 120);
}
function mensaje(txt, ok = false) {
  $("msg").textContent = txt;
  $("msg").className = "msg" + (ok ? " ok" : "");
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
    mensaje("Aún no se identifica la tienda, espera un momento");
    return;
  }
  $("btnSave").disabled = true;
  const ok = await guardarConfigComprobante(TIENDA_ID, LOCALIDAD, cfg);
  $("btnSave").disabled = false;
  mensaje(ok ? "Guardado ✓" : "No se pudo guardar", ok);
};
$("btnPrint").onclick = () => imprimirComprobante(pedidoDemo(), cfg);

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
}

// Pinta ya el formulario con valores por defecto mientras se identifica la tienda
pintarFormulario();
vista();

if (TIENDA_ID && LOCALIDAD) {
  iniciar();
} else {
  let resuelto = false;
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (resuelto || !d || (d.type !== "DATOS_TIENDA" && d.tipo !== "DATOS_TIENDA")) return;
    resuelto = true;
    TIENDA_ID = d.tiendaId || d.id || TIENDA_ID;
    LOCALIDAD = d.localidad || LOCALIDAD;
    NOMBRE_TIENDA = d.nombreTienda || NOMBRE_TIENDA;
    iniciar();
  });
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
// =====================================================================
//  preciis_planes.js  —  Registro de negocio GEINZ TECH (versión corregida)
//  Arreglo principal: ningún elemento se usa sin comprobar antes que existe,
//  así nunca más aparece "Cannot set properties of null (setting 'innerHTML')".
// =====================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { planesConfigDoc } from "../rutas/rutas.js"; // misma función que usa precios.js

// ---------------------------------------------------------------------
// 0) Utilidades
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id); // atajo: devuelve null si no existe

// Escapa texto antes de meterlo en innerHTML (evita romper el HTML o inyectar código)
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => {
  n = r2(Number(n) || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

// Pone texto en un elemento solo si existe
const setText = (id, txt) => {
  const el = $(id);
  if (el) el.textContent = txt;
};

// ---------------------------------------------------------------------
// 1) Firebase
// ---------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.firebasestorage.app",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
};

// Si rutas.js ya inicializó Firebase se reutiliza (evita "duplicate-app")
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const functions = getFunctions(app, "us-central1");
const registrarNegocioFn = httpsCallable(functions, "registrarNegocioGeinz");

// Función global que usa el botón "Enviar registro"
window.__enviarRegistroNegocio = async (payload) => (await registrarNegocioFn(payload))?.data;

// Carga los planes (con caché de 10 min en sessionStorage)
async function cargarPlanes() {
  try {
    const c = JSON.parse(sessionStorage.getItem("geinz_planes_v1") || "null");
    if (c && Date.now() - c.t < 600000) return c.p;
  } catch { /* ignorar caché dañada */ }

  const s = await getDoc(planesConfigDoc());
  const p = s.exists() ? s.data().planes : null;
  if (p && Object.keys(p).length) {
    try { sessionStorage.setItem("geinz_planes_v1", JSON.stringify({ t: Date.now(), p })); } catch { /* ignorar */ }
    return p;
  }
  return null;
}

// ---------------------------------------------------------------------
// 2) Estado general del formulario
// ---------------------------------------------------------------------
const state = {
  step: 1,
  nombre: "", telefono: "", logoBase64: null,
  lat: null, lng: null,
  pais: "PE", paisLabel: "Perú",
  departamentoId: "", departamentoNombre: "",
  provinciaId: "", provinciaNombre: "",
  distritoId: "", distritoNombre: "",
  direccion: "",
  plan: "", planLabel: "", periodo: "mensual", tipoVenta: "",
  termsAccepted: false,
};

// ---------------------------------------------------------------------
// 3) UBIGEO (Perú): departamentos, provincias, distritos
// ---------------------------------------------------------------------
const UBIGEO_BASE = "https://cdn.jsdelivr.net/gh/joseluisq/ubigeos-peru/json";
let DEPARTAMENTOS = [];
let obtenerProvinciasDe = () => [];
let obtenerDistritosDe = () => [];

// Convierte el JSON (objeto o arreglo) en una función "dame los hijos de este padre"
function crearLookup(data) {
  if (data && !Array.isArray(data) && typeof data === "object") {
    const valores = Object.values(data);
    if (valores.length && Array.isArray(valores[0])) {
      return (parentId) => data[parentId] || data[String(parentId)] || [];
    }
    return (parentId) => valores.filter((item) => String(item.id_padre_ubigeo) === String(parentId));
  }
  if (Array.isArray(data)) {
    return (parentId) => data.filter((item) => String(item.id_padre_ubigeo) === String(parentId));
  }
  return () => [];
}

// ---------------------------------------------------------------------
// 4) Dropdown personalizado con buscador (CoolSelect)
//    Si el elemento raíz no existe devuelve un "select vacío" que no hace nada,
//    así el resto del código no se rompe.
// ---------------------------------------------------------------------
function CoolSelect(rootEl) {
  // Versión "nula": mismos métodos, no hace nada
  const nulo = {
    setOptions() {}, onChange() {}, getValue() { return null; }, reset() {}, disable() {},
  };
  if (!rootEl) return nulo;

  const trigger = rootEl.querySelector(".cool-select-trigger");
  const valueEl = rootEl.querySelector(".cool-select-value");
  const search = rootEl.querySelector(".cool-select-search");
  const optionsWrap = rootEl.querySelector(".cool-select-options");
  if (!trigger || !valueEl || !optionsWrap) return nulo; // estructura incompleta

  let items = [];
  let selectedValue = null;
  let onChangeCb = null;

  // Dibuja la lista de opciones (filtrada por lo que se escribe en el buscador)
  function renderOptions(filterText) {
    const f = (filterText || "").trim().toLowerCase();
    const filtered = f ? items.filter((i) => i.label.toLowerCase().includes(f)) : items;
    optionsWrap.innerHTML = filtered.length
      ? filtered.map((i) => `
        <div class="cool-select-option ${selectedValue === i.value ? "is-selected" : ""}" data-value="${esc(i.value)}">
          <span>${esc(i.label)}</span>
          <svg class="cool-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5" /></svg>
        </div>`).join("")
      : `<div class="cool-select-empty">Sin resultados</div>`;
  }

  function open() {
    if (trigger.disabled) return;
    // cierra cualquier otro dropdown abierto
    document.querySelectorAll(".cool-select.open").forEach((el) => { if (el !== rootEl) el.classList.remove("open"); });
    rootEl.classList.add("open");
    renderOptions("");
    if (search) { search.value = ""; setTimeout(() => search.focus(), 60); }
  }
  function close() { rootEl.classList.remove("open"); }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    rootEl.classList.contains("open") ? close() : open();
  });

  if (search) search.addEventListener("input", () => renderOptions(search.value));

  // Al elegir una opción
  optionsWrap.addEventListener("click", (e) => {
    const opt = e.target.closest(".cool-select-option");
    if (!opt) return;
    selectedValue = opt.dataset.value;
    const item = items.find((i) => String(i.value) === String(selectedValue));
    valueEl.textContent = item ? item.label : "";
    valueEl.classList.remove("is-placeholder");
    close();
    if (onChangeCb) onChangeCb(selectedValue, item);
  });

  // Clic fuera → cerrar
  document.addEventListener("click", (e) => {
    if (!rootEl.contains(e.target)) close();
  });

  return {
    setOptions(newItems, placeholder) {
      items = newItems || [];
      selectedValue = null;
      valueEl.textContent = placeholder || (items.length ? "Selecciona..." : "Sin opciones");
      valueEl.classList.add("is-placeholder");
      trigger.disabled = items.length === 0;
      rootEl.classList.toggle("is-disabled", items.length === 0);
      close();
    },
    onChange(cb) { onChangeCb = cb; },
    getValue() { return selectedValue; },
    reset(placeholder) {
      selectedValue = null;
      valueEl.textContent = placeholder || "Selecciona...";
      valueEl.classList.add("is-placeholder");
    },
    disable(placeholder) {
      items = [];
      selectedValue = null;
      trigger.disabled = true;
      rootEl.classList.add("is-disabled");
      valueEl.textContent = placeholder || "Selecciona...";
      valueEl.classList.add("is-placeholder");
    },
  };
}

const csDepartamento = CoolSelect($("csDepartamento"));
const csProvincia = CoolSelect($("csProvincia"));
const csDistrito = CoolSelect($("csDistrito"));
csProvincia.disable("Elige depto.");
csDistrito.disable("Elige provincia");

// Descarga el ubigeo y llena el select de departamentos
async function cargarUbigeo() {
  if (!$("csDepartamento")) return; // esta página no tiene ubicación → no hacer nada
  try {
    const [depRes, provRes, distRes] = await Promise.all([
      fetch(UBIGEO_BASE + "/departamentos.json"),
      fetch(UBIGEO_BASE + "/provincias.json"),
      fetch(UBIGEO_BASE + "/distritos.json"),
    ]);
    const depData = await depRes.json();
    DEPARTAMENTOS = (Array.isArray(depData) ? depData : Object.values(depData))
      .sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo));

    obtenerProvinciasDe = crearLookup(await provRes.json());
    obtenerDistritosDe = crearLookup(await distRes.json());

    csDepartamento.setOptions(
      DEPARTAMENTOS.map((d) => ({ value: d.id_ubigeo, label: d.nombre_ubigeo })),
      "Selecciona..."
    );
  } catch (e) {
    console.error("Error cargando ubigeo:", e);
    const err = $("ubigeoError");
    if (err) err.style.display = "block";
    csDepartamento.disable("No disponible");
  }
}

// Cuando eligen departamento → cargar provincias
csDepartamento.onChange((depId, item) => {
  state.departamentoId = depId || "";
  state.departamentoNombre = item ? item.label : "";
  state.provinciaId = ""; state.provinciaNombre = "";
  state.distritoId = ""; state.distritoNombre = "";
  csDistrito.disable("Elige provincia");
  if (depId) {
    const hijas = obtenerProvinciasDe(depId)
      .slice()
      .sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo))
      .map((p) => ({ value: p.id_ubigeo, label: p.nombre_ubigeo }));
    csProvincia.setOptions(hijas, "Selecciona...");
  } else {
    csProvincia.disable("Elige depto.");
  }
});

// Cuando eligen provincia → cargar distritos
csProvincia.onChange((provId, item) => {
  state.provinciaId = provId || "";
  state.provinciaNombre = item ? item.label : "";
  state.distritoId = ""; state.distritoNombre = "";
  if (provId) {
    const hijos = obtenerDistritosDe(provId)
      .slice()
      .sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo))
      .map((d) => ({ value: d.id_ubigeo, label: d.nombre_ubigeo }));
    csDistrito.setOptions(hijos, "Selecciona...");
  } else {
    csDistrito.disable("Elige provincia");
  }
});

// Cuando eligen distrito
csDistrito.onChange((distId, item) => {
  state.distritoId = distId || "";
  state.distritoNombre = item ? item.label : "";
});

cargarUbigeo();

// ---------------------------------------------------------------------
// 5) Navegación entre pasos
// ---------------------------------------------------------------------
function goToStep(n) {
  const panel = $("panel-" + n);
  if (!panel) return; // el paso no existe → no hacer nada

  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  panel.classList.add("active");

  // Puntos y etiquetas del indicador de pasos
  for (let i = 1; i <= 3; i++) {
    const dot = $("dot-" + i);
    const lbl = $("lbl-" + i);
    if (dot) dot.classList.remove("active", "done");
    if (lbl) lbl.classList.remove("active");
    if (i < n) dot?.classList.add("done");
    else if (i === n) { dot?.classList.add("active"); lbl?.classList.add("active"); }
  }
  $("line-1")?.classList.toggle("filled", n > 1);
  $("line-2")?.classList.toggle("filled", n > 2);

  // En el paso 4 (éxito) se oculta el indicador
  const track = document.querySelector(".step-track");
  if (track) track.style.display = n === 4 ? "none" : "flex";

  state.step = n;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------------
// 6) Logo del negocio
// ---------------------------------------------------------------------
const logoDrop = $("logoDrop");
const logoInput = $("logoInput");
const logoPreview = $("logoPreview");
const logoIcon = $("logoIcon");
const logoHint = $("logoHint");

if (logoDrop && logoInput) {
  logoDrop.addEventListener("click", () => logoInput.click());
  logoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.logoBase64 = ev.target.result;
      if (logoPreview) { logoPreview.src = ev.target.result; logoPreview.style.display = "block"; }
      if (logoIcon) logoIcon.style.display = "none";
      if (logoHint) logoHint.style.display = "none";
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------
// 7) GPS (opcional)
// ---------------------------------------------------------------------
$("btnGeo")?.addEventListener("click", () => {
  const status = $("geoStatus");
  if (!navigator.geolocation) { alert("Tu navegador no soporta geolocalización."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      if (status) status.style.display = "inline";
    },
    () => alert("No se pudo obtener tu ubicación. Puedes continuar sin ella.")
  );
});

// ---------------------------------------------------------------------
// 8) PASO 1 → 2 (validación de datos del negocio)
// ---------------------------------------------------------------------
$("btnNext1")?.addEventListener("click", () => {
  const nombre = ($("nombreNegocio")?.value || "").trim();
  const direccion = ($("direccionNegocio")?.value || "").trim();
  const telefono = ($("telefonoNegocio")?.value || "").trim();

  if (!nombre) { alert("Ingresa el nombre de tu negocio."); return; }
  if (!state.departamentoId || !state.provinciaId || !state.distritoId) {
    alert("Selecciona departamento, provincia y distrito.");
    return;
  }
  if (!direccion) { alert("Ingresa la dirección exacta de tu negocio."); return; }
  if (!/^[0-9]{9}$/.test(telefono)) { alert("Ingresa un teléfono válido de 9 dígitos."); return; }

  state.nombre = nombre;
  state.direccion = direccion;
  state.telefono = telefono;

  goToStep(2);
});

function ubicacionCompleta() {
  return `${state.distritoNombre}, ${state.provinciaNombre}, ${state.departamentoNombre}`;
}

// Rellena el resumen del paso 3
function fillSummary() {
  setText("sumNombre", state.nombre);
  setText("sumPlan", state.planLabel);
  setText("sumUbicacion", ubicacionCompleta());
  setText("sumDireccion", state.direccion);
  setText("sumTelefono", "+51 " + state.telefono);
  setText("sumTipo", state.tipoVenta === "delivery" ? "🛵 Delivery" : "🏬 Presencial");
  setText("sumPeriodo", state.periodo === "anual" ? "Anual" : "Mensual");
}

// ---------------------------------------------------------------------
// 9) PASO 2: planes dinámicos + tipo de venta
// ---------------------------------------------------------------------
const qs = new URLSearchParams(location.search);
const PLAN_PARAM = qs.get("plan"); // plan que viene por la URL (?plan=pro)
state.periodo = qs.get("periodo") === "anual" ? "anual" : "mensual";

// Nombres bonitos de los módulos
const MOD = {
  perfil_negocio: "Perfil de tu negocio", comprobantes: "Comprobantes", mis_trabajadores: "Gestión de trabajadores",
  legal: "Libro de reclamaciones, términos y privacidad", pedidos_en_vivo: "Pedidos en vivo", carrito_compras: "Carrito de compras",
  historial_ventas: "Historial de ventas", clientes: "Clientes y fidelización", cupones_puntos: "Cupones y puntos",
  publicidad_ofertas: "Publicidad y ofertas", "reseñas": "Reseñas", qr_tech: "QR Tech", modo_avanzado_productos: "Productos con variantes",
};

// Orden y textos de los límites
const LIM_ORDER = ["colecciones", "productos_por_coleccion", "trabajadores", "mesas", "repartidores", "cupones", "creditos_ia"];
const LIM = {
  colecciones: [(n) => `${n} colecciones`, "Colecciones ilimitadas"],
  productos_por_coleccion: [(n) => `${n} productos por colección`, "Productos ilimitados por colección"],
  trabajadores: [(n) => `${n} trabajadores`, "Trabajadores ilimitados"],
  mesas: [(n) => `${n} mesas`, "Mesas ilimitadas"],
  repartidores: [(n) => `${n} repartidores`, "Repartidores ilimitados"],
  cupones: [(n) => `${n} cupones activos`, "Cupones ilimitados"],
  creditos_ia: [(n) => `${n} créditos de IA al mes`, "Créditos de IA ilimitados"],
};

const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';

let PLANES = []; // [[id, plan], ...]

// Activa/desactiva "Continuar" del paso 2 (busca el botón en el momento, con guarda)
function actualizarBtn2() {
  const b = $("btnNext2");
  if (b) b.disabled = !(state.plan && state.tipoVenta);
}

// Precio según mensual/anual
function precioPlan(p) {
  const m = Number(p.precio_mensual) || 0;
  return state.periodo === "anual" ? (p.precio_anual ?? r2(m * 12)) : m;
}

// HTML de una tarjeta de plan
function planCardHTML(id, p) {
  const lim = p.limites || {};
  const keys = LIM_ORDER.filter((k) => k in lim)
    .filter((k) => !(k === "mesas" && state.tipoVenta === "delivery"))          // mesas solo si es presencial
    .filter((k) => !(k === "repartidores" && state.tipoVenta === "presencial")); // repartidores solo si es delivery

  const feats = keys.map((k) => {
    const ilim = String(lim[k]).toLowerCase() === "ilimitado";
    return `<div class="plan-feature">${CHECK}${esc(ilim ? LIM[k][1] : LIM[k][0](lim[k]))}</div>`;
  });
  Object.keys(p.modulos || {})
    .filter((k) => p.modulos[k] && MOD[k])
    .forEach((k) => feats.push(`<div class="plan-feature">${CHECK}${esc(MOD[k])}</div>`));

  const anual = state.periodo === "anual";
  return `<div class="plan-card${state.plan === id ? " selected" : ""}" data-plan="${esc(id)}">
    <div class="plan-radio"></div>
    ${p.mostrar_badge && p.etiqueta_badge ? `<span class="plan-badge ${p.es_mas_popular ? "pop" : "basic"}">${esc(p.etiqueta_badge)}</span>` : ""}
    <h4 class="plan-title">${esc(p.nombre)}</h4>
    <p class="plan-desc">${esc(p.descripcion)}</p>
    <p class="plan-price">S/ ${fmt(precioPlan(p))} <small>/ ${anual ? "año" : "mes"}</small></p>
    ${Number(p.prueba_dias) ? `<p class="text-[10px] text-emerald-400 font-semibold mt-1">${esc(p.prueba_dias)} días gratis</p>` : ""}
    <div class="plan-features">${feats.join("")}</div>
  </div>`;
}

// Dibuja todas las tarjetas  ← ANTES AQUÍ FALLABA (planGrid era null)
function renderPlanes() {
  const grid = $("planGrid");
  if (!grid) return; // la página no tiene selector de planes
  grid.innerHTML = PLANES.map(([id, p]) => planCardHTML(id, p)).join("");
  actualizarBtn2();
}

// Lo llama la carga de Firebase cuando llegan los planes
window.__initPlanes = (raw) => {
  const grid = $("planGrid");
  if (!grid) return; // la página no tiene selector de planes

  if (!raw) {
    grid.innerHTML = '<p class="text-xs text-red-400 font-semibold">No se pudieron cargar los planes. Recarga la página.</p>';
    return;
  }

  // Solo planes visibles, activos y que no sean "cotización"; ordenados por orden o precio
  PLANES = Object.entries(raw)
    .filter(([, p]) => p && p.visible !== false && p.activo !== false && !p.es_cotizacion)
    .sort((a, b) => (a[1].orden ?? (Number(a[1].precio_mensual) || 0)) - (b[1].orden ?? (Number(b[1].precio_mensual) || 0)));

  // Enterprise (cotización) → ventas por WhatsApp
  if (PLAN_PARAM && raw[PLAN_PARAM]?.es_cotizacion) {
    location.replace("https://wa.me/51958120920?text=" + encodeURIComponent("Hola GEINZ, necesito el " + raw[PLAN_PARAM].nombre));
    return;
  }

  // Preselecciona el plan que vino por la URL
  const pre = PLANES.find(([id]) => id === PLAN_PARAM);
  if (pre) {
    state.plan = pre[0];
    state.planLabel = pre[1].nombre;
    const hint = $("planHint");
    if (hint) hint.style.display = "none";
  }
  renderPlanes();
};

// Elegir un plan (clic en una tarjeta)
$("planGrid")?.addEventListener("click", (e) => {
  const card = e.target.closest(".plan-card[data-plan]");
  if (!card) return;
  const found = PLANES.find(([id]) => id === card.dataset.plan);
  if (!found) return;
  state.plan = found[0];
  state.planLabel = found[1].nombre;
  renderPlanes();
});

// Elegir tipo de venta (delivery / presencial)
document.querySelectorAll(".tipo-card").forEach((c) =>
  c.addEventListener("click", () => {
    document.querySelectorAll(".tipo-card").forEach((x) => x.classList.remove("selected"));
    c.classList.add("selected");
    state.tipoVenta = c.dataset.tipo;
    if (PLANES.length) renderPlanes(); // re-dibuja para ocultar/mostrar mesas o repartidores
    actualizarBtn2();
  })
);

$("btnBack2")?.addEventListener("click", () => goToStep(1));
$("btnNext2")?.addEventListener("click", () => {
  if (!state.plan || !state.tipoVenta) return;
  fillSummary();
  goToStep(3);
});
$("btnBack3")?.addEventListener("click", () => goToStep(2));

// ---------------------------------------------------------------------
// 10) PASO 3: términos + envío
// ---------------------------------------------------------------------
const chkTerms = $("chkTerms");
const termsRow = $("termsRow");
const btnSubmit = $("btnSubmit");

termsRow?.addEventListener("click", () => {
  state.termsAccepted = !state.termsAccepted;
  chkTerms?.classList.toggle("on", state.termsAccepted);
  if (btnSubmit) btnSubmit.disabled = !state.termsAccepted;
});

btnSubmit?.addEventListener("click", async () => {
  if (!state.termsAccepted || btnSubmit.disabled) return;

  const errBox = $("formError");
  const label = $("submitLabel");
  if (errBox) errBox.style.display = "none";

  // Estado "enviando..."
  btnSubmit.disabled = true;
  if (label) label.innerHTML = `<span class="spinner" style="display:inline-block; vertical-align:-2px; margin-right:6px;"></span> Enviando...`;

  const payload = {
    nombre_negocio: state.nombre,
    plan: state.plan,              // id real: "basico" | "pro" | "avanzado"
    periodo: state.periodo,        // "mensual" | "anual"
    tipo_venta: state.tipoVenta,   // "delivery" | "presencial"
    pais: state.pais,
    departamento: state.departamentoNombre,
    provincia: state.provinciaNombre,
    distrito: state.distritoNombre,
    direccion: state.direccion,
    lat: state.lat,
    lng: state.lng,
    telefono: "+51" + state.telefono,
    logo_base64: state.logoBase64,
    terminos_aceptados: true,
    origen: "landing_geinztech",
  };

  try {
    if (typeof window.__enviarRegistroNegocio !== "function") {
      throw new Error("Cloud Function no configurada todavía.");
    }
    await window.__enviarRegistroNegocio(payload);

    // Éxito → rellena el panel final y lo muestra
    setText("doneNombre", state.nombre);
    setText("donePlan", state.planLabel);
    setText("doneUbicacion", ubicacionCompleta());
    goToStep(4);
  } catch (e) {
    console.error(e);
    if (errBox) {
      errBox.textContent = "❌ No se pudo enviar tu registro. Intenta nuevamente en unos segundos.";
      errBox.style.display = "block";
    }
    btnSubmit.disabled = false;
    if (label) label.textContent = "🚀 Enviar registro";
  }
});

// ---------------------------------------------------------------------
// 11) ARRANQUE: se pide la lista de planes AL FINAL, cuando ya está
//     definido window.__initPlanes y todo lo demás.
// ---------------------------------------------------------------------
cargarPlanes()
  .then((p) => window.__initPlanes(p))
  .catch((e) => {
    console.warn("Planes:", e.message);
    window.__initPlanes(null);
  });
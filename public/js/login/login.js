/* =========================================================
   GEINZ — login.js (solo interfaz; la lógica sensible vive en Cloud Functions)
========================================================= */
console.log("%cDETENTE", "font-size:48px;font-weight:900;color:#ff2d55;");
console.log(
  "%cLa consola es solo para desarrolladores.\nSi alguien te pidió pegar código aquí podría robar tu cuenta Geinz.",
  "font-size:15px;color:white;",
);

import {
  getAuth, GoogleAuthProvider, FacebookAuthProvider, GithubAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, getAdditionalUserInfo,
  onAuthStateChanged, browserLocalPersistence, setPersistence, signOut,
  signInWithEmailAndPassword, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import { app } from "../db/db.js";
import { tiendaDoc, tokenFcmDoc, setUbicacion } from "../rutas/rutas.js";

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, "southamerica-east1");
await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   API (Cloud Functions)
========================================================= */
const call = (name) => async (data) => (await httpsCallable(functions, name)(data || {})).data;
const api = {
  checkEmail: call("checkEmail"),
  registerEmailUser: call("registerEmailUser"),
  completeSocialProfile: call("completeSocialProfile"),
  getSession: call("getSession"),
  updateProfile: call("updateProfile"),
  saveAvatar: call("saveAvatar"),
};

/* =========================================================
   ESTADO Y UTILIDADES
========================================================= */
const $ = (id) => document.getElementById(id);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const LOADING = (t) => `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> ${t}`;

let GOOGLE_USER = null;
let perfilActual = {};
let splashShown = false;
let authProcesado = false;
let modoSocial = false;   // completando perfil tras Google/Facebook/GitHub
let flujoManual = false;  // evita que onAuthStateChanged duplique un login en curso
const seleccionUbicacion = { socio: {}, selector: {}, reg: {}, welcome: {} };

const PAISES = [
  ["ar", "Argentina", "🇦🇷", "+54"], ["bo", "Bolivia", "🇧🇴", "+591"], ["br", "Brasil", "🇧🇷", "+55"],
  ["cl", "Chile", "🇨🇱", "+56"], ["co", "Colombia", "🇨🇴", "+57"], ["cr", "Costa Rica", "🇨🇷", "+506"],
  ["cu", "Cuba", "🇨🇺", "+53"], ["ec", "Ecuador", "🇪🇨", "+593"], ["sv", "El Salvador", "🇸🇻", "+503"],
  ["es", "España", "🇪🇸", "+34"], ["us", "Estados Unidos", "🇺🇸", "+1"], ["gt", "Guatemala", "🇬🇹", "+502"],
  ["hn", "Honduras", "🇭🇳", "+504"], ["mx", "México", "🇲🇽", "+52"], ["ni", "Nicaragua", "🇳🇮", "+505"],
  ["pa", "Panamá", "🇵🇦", "+507"], ["py", "Paraguay", "🇵🇾", "+595"], ["pe", "Perú", "🇵🇪", "+51"],
  ["do", "Rep. Dominicana", "🇩🇴", "+1"], ["uy", "Uruguay", "🇺🇾", "+598"], ["ve", "Venezuela", "🇻🇪", "+58"],
];

const NOMBRE_PROV = { google: "Google", facebook: "Facebook", github: "GitHub" };
const PROVIDERS = {
  google: new GoogleAuthProvider(),
  facebook: new FacebookAuthProvider(),
  github: new GithubAuthProvider(),
};
PROVIDERS.facebook.addScope("email");
PROVIDERS.github.addScope("user:email");

const esWebviewEmbebido = () => /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent || "");
const esMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

/** Pantalla de carga continua: se muestra al instante y se quita solo si algo falla. */
function mostrarCarga(texto = "Verificando tu sesión") {
  if ($("acText")) $("acText").textContent = texto;
  $("authChecking")?.classList.remove("hidden");
  $("mainUI").style.display = "none";
}
function ocultarCarga() {
  $("authChecking")?.classList.add("hidden");
  $("mainUI").style.display = "flex";
}

/** Convierte un error de Cloud Function en mensaje bajo el campo correcto. */
const CAMPO_A_ERROR = {
  nombre: "errNombre", telefono: "errTelefono", genero: "errGenero",
  distrito: "errDistrito", correo: "errCorreo", password: "errPass",
};
function mostrarErrorApi(err, mapa = CAMPO_A_ERROR, fallback = "❌ Ocurrió un error. Intenta de nuevo.") {
  const campo = err?.details?.campo;
  if (err?.code === "functions/invalid-argument" && mapa[campo]) {
    setError(mapa[campo], err.message);
    return;
  }
  showSnackbar(fallback, "error");
}

/* =========================================================
   SNACKBAR
========================================================= */
function showSnackbar(msg, tipo = "default") {
  $("geinzSnackbar")?.remove();
  const estilos = {
    success: ["check_circle", "#22c55e"], error: ["error", "#ef4444"],
    warning: ["warning", "#f59e0b"], default: ["info", "#6366f1"],
  };
  const [icon, color] = estilos[tipo] || estilos.default;
  const sb = document.createElement("div");
  sb.id = "geinzSnackbar";
  sb.innerHTML = `
    <span class="material-symbols-outlined" style="color:${color};font-size:20px;flex-shrink:0;" aria-hidden="true">${icon}</span>
    <span style="flex:1;line-height:1.4;">${msg}</span>
    <button onclick="this.parentElement.remove()" aria-label="Cerrar"
      style="background:none;border:none;cursor:pointer;color:#9ca3af;display:flex;align-items:center;padding:0;flex-shrink:0;">
      <span class="material-symbols-outlined" style="font-size:18px;">close</span>
    </button>`;
  Object.assign(sb.style, {
    position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%) translateY(28px)",
    background: "#fff", color: "#1a1a1a", display: "flex", alignItems: "center", gap: "10px",
    padding: "14px 18px", borderRadius: "16px", fontSize: "14px", fontWeight: "500", fontFamily: "inherit",
    boxShadow: "0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.10)", zIndex: "99999", opacity: "0",
    transition: "opacity .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1)",
    minWidth: "260px", maxWidth: "min(90vw,480px)", userSelect: "none",
  });
  document.body.appendChild(sb);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sb.style.opacity = "1";
    sb.style.transform = "translateX(-50%) translateY(0)";
  }));
  const cerrar = () => {
    sb.style.opacity = "0";
    sb.style.transform = "translateX(-50%) translateY(28px)";
    setTimeout(() => sb.remove(), 320);
  };
  let t = setTimeout(cerrar, 3500);
  sb.addEventListener("mouseenter", () => clearTimeout(t));
  sb.addEventListener("mouseleave", () => (t = setTimeout(cerrar, 1500)));
}

/* =========================================================
   COOL SELECT (select con buscador)
========================================================= */
function setCoolSelectLoading(select, loading) {
  const wrap = select?.nextElementSibling;
  if (!wrap?.classList.contains("cool-select")) return;
  wrap.classList.toggle("is-loading", loading);
  let bar = wrap.querySelector(".cool-select-loadbar");
  if (loading && !bar) {
    bar = document.createElement("div");
    bar.className = "cool-select-loadbar";
    wrap.appendChild(bar);
  } else if (!loading && bar) bar.remove();
}

function upgradeCoolSelect(select) {
  if (!select || select._cool) return;
  select._cool = true;
  select.classList.add("real-select-hidden");

  const wrap = document.createElement("div");
  wrap.className = "cool-select";
  select.parentNode.insertBefore(wrap, select.nextSibling);
  wrap.innerHTML = `
    <button type="button" class="cool-select-trigger">
      <span class="cool-select-value is-placeholder">Selecciona...</span>
      <svg class="cool-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <div class="cool-select-panel">
      <div class="cool-select-search-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" class="cool-select-search" placeholder="Buscar...">
      </div>
      <div class="cool-select-options"></div>
    </div>`;

  const trigger = wrap.querySelector(".cool-select-trigger");
  const valueEl = wrap.querySelector(".cool-select-value");
  const search = wrap.querySelector(".cool-select-search");
  const optionsWrap = wrap.querySelector(".cool-select-options");

  const renderTrigger = () => {
    const has = select.value !== "";
    valueEl.textContent = has ? select.selectedOptions[0].textContent : select.options[0]?.textContent || "Selecciona...";
    valueEl.classList.toggle("is-placeholder", !has);
    trigger.disabled = select.disabled;
    wrap.classList.toggle("is-disabled", select.disabled);
  };

  const renderOptions = (filter = "") => {
    const f = filter.trim().toLowerCase();
    const items = [...select.options]
      .filter((o) => o.value !== "" && (!f || o.textContent.toLowerCase().includes(f)));
    optionsWrap.innerHTML = items.length
      ? items.map((o) => `
        <div class="cool-select-option ${select.value === o.value ? "is-selected" : ""}" data-value="${o.value}">
          <span>${o.textContent}</span>
          <svg class="cool-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>
        </div>`).join("")
      : `<div class="cool-select-empty">Sin resultados</div>`;
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrap.classList.contains("is-loading") || select.disabled) return;
    document.querySelectorAll(".cool-select.open").forEach((el) => el !== wrap && el.classList.remove("open"));
    const abrir = !wrap.classList.contains("open");
    wrap.classList.toggle("open", abrir);
    if (abrir) {
      renderOptions();
      search.value = "";
      setTimeout(() => search.focus(), 60);
    }
  });
  search.addEventListener("input", () => renderOptions(search.value));
  optionsWrap.addEventListener("click", (e) => {
    const opt = e.target.closest(".cool-select-option");
    if (!opt) return;
    select.value = opt.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    wrap.classList.remove("open");
  });
  document.addEventListener("click", (e) => !wrap.contains(e.target) && wrap.classList.remove("open"));
  new MutationObserver(renderTrigger).observe(select, { childList: true, attributes: true });
  select.addEventListener("change", renderTrigger);
  renderTrigger();
}
const upgradeAllCoolSelects = (root = document) => root.querySelectorAll(".custom-select").forEach(upgradeCoolSelect);

/* =========================================================
   UBICACIÓN (departamento → provincia → distrito)
========================================================= */
const UBIGEO_BASE = "https://cdn.jsdelivr.net/gh/joseluisq/ubigeos-peru/json";
let ubigeoPromise = null;
let UBIGEO = null;

function crearLookup(data) {
  const valores = Array.isArray(data) ? data : Object.values(data || {});
  if (!Array.isArray(data) && valores.length && Array.isArray(valores[0]))
    return (id) => data[id] || data[String(id)] || [];
  return (id) => valores.filter((i) => String(i.id_padre_ubigeo) === String(id));
}

function cargarUbigeo() {
  ubigeoPromise ??= Promise.all(
    ["departamentos", "provincias", "distritos"].map((n) => fetch(`${UBIGEO_BASE}/${n}.json`).then((r) => r.json())),
  ).then(([dep, prov, dist]) => {
    const orden = (a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo);
    const norm = (arr) => arr.slice().sort(orden).map((x) => ({ id: x.id_ubigeo, nombre: x.nombre_ubigeo }));
    const provDe = crearLookup(prov), distDe = crearLookup(dist);
    UBIGEO = {
      departamentos: () => norm(Array.isArray(dep) ? dep : Object.values(dep)),
      provincias: (id) => norm(provDe(id)),
      distritos: (id) => norm(distDe(id)),
    };
    return UBIGEO;
  });
  return ubigeoPromise;
}

async function inicializarSelectoresUbicacion(prefix) {
  const selDep = $(`${prefix}Departamento`), selProv = $(`${prefix}Provincia`), selDist = $(`${prefix}Distrito`);
  if (!selDep || !selProv || !selDist || selDep._ubiListo) return;
  selDep._ubiListo = true;
  [selDep, selProv, selDist].forEach(upgradeCoolSelect);

  const opciones = (lista, ph = "Selecciona") =>
    `<option value="" disabled selected hidden>${ph}</option>` +
    lista.map((x) => `<option value="${x.id}">${x.nombre}</option>`).join("");
  const sel = seleccionUbicacion[prefix];

  setCoolSelectLoading(selDep, true);
  try {
    selDep.innerHTML = opciones((await cargarUbigeo()).departamentos());
  } catch (e) {
    console.error("Error cargando departamentos:", e);
    selDep.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    selDep._ubiListo = false;
  } finally {
    setCoolSelectLoading(selDep, false);
  }

  selDep.onchange = () => {
    Object.assign(sel, { depId: selDep.value, dep: slugify(selDep.selectedOptions[0].textContent), provId: "", prov: "", dist: "" });
    selProv.innerHTML = opciones(UBIGEO.provincias(selDep.value));
    selProv.disabled = false;
    selDist.disabled = true;
    selDist.innerHTML = `<option value="" disabled selected hidden>Elige provincia</option>`;
  };
  selProv.onchange = () => {
    Object.assign(sel, { provId: selProv.value, prov: slugify(selProv.selectedOptions[0].textContent), dist: "" });
    selDist.innerHTML = opciones(UBIGEO.distritos(selProv.value));
    selDist.disabled = false;
  };
  selDist.onchange = () => (sel.dist = slugify(selDist.selectedOptions[0].textContent));
}

async function prefillUbicacion(prefix, p) {
  const esperar = (fn) => new Promise((r) => {
    const i = setInterval(() => fn() && (clearInterval(i), r()), 80);
    setTimeout(() => (clearInterval(i), r()), 4000);
  });
  const elegir = async (id, nombre, siguiente) => {
    const s = $(id);
    const o = [...s.options].find((x) => x.value && slugify(x.textContent) === nombre);
    if (!o) return;
    s.value = o.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    if (siguiente) {
      const n = $(siguiente);
      await esperar(() => !n.disabled && n.options.length > 1);
    }
  };
  await elegir(`${prefix}Departamento`, p.departamento, `${prefix}Provincia`);
  await elegir(`${prefix}Provincia`, p.provincia, `${prefix}Distrito`);
  await elegir(`${prefix}Distrito`, p.distrito);
}

/** Busca distrito/provincia/departamento dentro de un texto libre ("Barranca, Lima, Peru"). */
async function detectarUbicacion(texto) {
  const t = ` ${slugify(texto).replace(/-/g, " ")} `;
  if (!t.trim()) return null;
  const U = await cargarUbigeo();
  const tiene = (n) => {
    const s = slugify(n).replace(/-/g, " ");
    return s.length >= 4 && t.includes(` ${s} `);
  };
  let mejor = null;
  const deps = U.departamentos();
  for (const d of deps) {
    for (const p of U.provincias(d.id)) {
      for (const di of U.distritos(p.id)) {
        if (tiene(di.nombre) && (!mejor || di.nombre.length > mejor.len))
          mejor = { departamento: slugify(d.nombre), provincia: slugify(p.nombre), distrito: slugify(di.nombre), len: di.nombre.length };
      }
      if (!mejor && tiene(p.nombre)) mejor = { departamento: slugify(d.nombre), provincia: slugify(p.nombre), len: 0 };
    }
  }
  if (!mejor) {
    const d = deps.find((x) => tiene(x.nombre));
    if (d) mejor = { departamento: slugify(d.nombre), len: 0 };
  }
  return mejor;
}

/* =========================================================
   MODALES / UI GENERAL
========================================================= */
const hayModalActivo = () => document.querySelector(".modal-overlay.active");
const abrirModal = (id) => {
  document.body.classList.add("blur-active");
  $(id).classList.add("active");
};
window.closeModal = (id) => {
  $(id)?.classList.remove("active");
  if (!hayModalActivo()) document.body.classList.remove("blur-active");
};
window.closeIfOutside = (e, id) => e.target.id === id && closeModal(id);
window.togglePassword = (id, btn) => {
  const input = $(id);
  if (!input) return;
  const mostrar = input.type === "password";
  input.type = mostrar ? "text" : "password";
  const ico = btn.querySelector(".material-symbols-outlined");
  if (ico) ico.textContent = mostrar ? "visibility_off" : "visibility";
};
window.openRegisterModal = () => {
  abrirModal("registerModal");
  inicializarSelectoresUbicacion("reg");
  upgradeAllCoolSelects($("registerModal"));
};
window.openSocioModal = () => {
  abrirModal("socioModal");
  inicializarSelectoresUbicacion("socio");
  upgradeAllCoolSelects($("socioModal"));
};
window.switchToUserLogin = () => closeModal("socioModal");
window.validarCorreoGmail = (input) => {
  const val = input.value.trim().toLowerCase();
  const err = $("errCorreo"), hint = $("hintCorreo");
  setError("errCorreo", "");
  hint.style.display = "none";
  if (modoSocial || !val) return;
  if (val.includes("@") && !val.endsWith("@gmail.com")) return setError("errCorreo", "Solo se permiten correos @gmail.com.");
  if (/^[^\s@]+@gmail\.com$/.test(val)) hint.style.display = "flex";
};

/* =========================================================
   FLUJOS DE NAVEGACIÓN (registro de tienda / volver al perfil)
========================================================= */
if (new URLSearchParams(location.search).get("destino") === "registro")
  sessionStorage.setItem("geinz_destino", "registro");

(function guardarVolver() {
  const v = new URLSearchParams(location.search).get("volver");
  if (!v) return;
  try {
    const u = new URL(v, location.origin);
    if (u.origin === location.origin && u.pathname.startsWith("/perfil/"))
      sessionStorage.setItem("geinz_volver", u.toString());
  } catch {}
})();

function urlRegistro() {
  const p = new URLSearchParams(location.search);
  p.delete("destino");
  const s = p.toString();
  return "../registrogeinz.html" + (s ? "?" + s : "");
}

function irAlPerfilOrigen() {
  const destino = sessionStorage.getItem("geinz_volver");
  if (!destino) return false;
  sessionStorage.removeItem("geinz_volver");
  if ($("acText")) $("acText").textContent = "Volviendo a tu negocio...";
  $("authChecking")?.classList.remove("hidden");
  $("mainUI").style.display = "none";
  document.querySelectorAll(".modal-overlay.active").forEach((m) => m.classList.remove("active"));
  document.body.classList.remove("blur-active");
  setTimeout(() => location.replace(destino), 300);
  return true;
}

async function entrar(user, sesion) {
  const destino = sessionStorage.getItem("geinz_destino");
  if (destino !== "registro") {
    if (irAlPerfilOrigen()) return;
    return showSplash(user, sesion);
  }
  sessionStorage.removeItem("geinz_destino");
  if (sesion.tieneNegocioRegistrado) {
    showSnackbar("⚠️ Ya tienes un negocio registrado. Para crear otro contáctanos por WhatsApp.", "warning");
    return showSplash(user, sesion);
  }
  location.replace(urlRegistro());
}

/* =========================================================
   AUTENTICACIÓN
========================================================= */
async function procesarSesion(user, extra = null) {
  if (authProcesado) return;
  authProcesado = true;
  GOOGLE_USER = user;
  try {
    const sesion = await api.getSession();
    if (sesion.existe) return entrar(user, sesion);
  } catch (e) {
    console.error("getSession:", e);
    authProcesado = false;
    $("authChecking")?.classList.add("hidden");
    $("mainUI").style.display = "flex";
    return showSnackbar("❌ No se pudo cargar tu perfil. Intenta de nuevo.", "error");
  }
  $("authChecking")?.classList.add("hidden");
  $("mainUI").style.display = "flex";
  abrirCompletarPerfilSocial(user, extra);
}

async function abrirCompletarPerfilSocial(user, extra) {
  modoSocial = true;
  openRegisterModal();

  const pd = user.providerData?.[0] || {};
  const ghLogin = extra?.login || user.reloadUserInfo?.screenName || "";
  const nombre = (extra?.given_name || extra?.first_name
    ? `${extra.given_name || extra.first_name} ${extra.family_name || extra.last_name || ""}`
    : user.displayName || pd.displayName || extra?.name || ghLogin || "").trim();
  $("regNombre").value = nombre;

  const mail = user.email || pd.email || extra?.email || "";
  const elCorreo = $("regCorreo");
  elCorreo.value = mail;
  elCorreo.readOnly = !!mail;
  if (mail) elCorreo.dispatchEvent(new Event("input"));

  const tel = (user.phoneNumber || pd.phoneNumber || "").replace(/\D/g, "");
  if (tel) $("regTelefono").value = tel.replace(/^51/, "").slice(-9);

  const g = String(extra?.gender || "").toLowerCase();
  const generoVal = g === "male" ? "Masculino" : g === "female" ? "Femenino" : "";
  if (generoVal) {
    const r = document.querySelector(`input[name="regGenero"][value="${generoVal}"]`);
    if (r) r.checked = true;
  }

  const textoUbi = typeof extra?.location === "string" ? extra.location : extra?.location?.name || "";
  if (textoUbi) {
    try {
      const u = await detectarUbicacion(textoUbi);
      if (u) await prefillUbicacion("reg", u);
    } catch (e) {
      console.warn("No se pudo autocompletar la ubicación:", e);
    }
  }
  if ($("passRow")) $("passRow").style.display = "none";
}

/* ---------- Login social (Google / Facebook / GitHub) ---------- */
// Tiempo que se espera el resultado tras cerrarse el popup antes de considerarlo un cierre manual.
const GRACIA_CIERRE_MS = 1000;
let popupRef = null, capturarPopup = false, intentoActual = 0, redirigiendo = false;

// Captura la ventana del popup que abre Firebase para saber al instante si se cierra.
const _windowOpen = window.open.bind(window);
window.open = (...args) => {
  const w = _windowOpen(...args);
  if (capturarPopup) popupRef = w;
  return w;
};

async function loginSocial(tipo) {
  if (tipo === "google" && esWebviewEmbebido())
    return showSnackbar("⚠️ Abre este enlace en Chrome o Safari para continuar con Google.", "warning");

  const prov = PROVIDERS[tipo];
  const intento = ++intentoActual;
  const vigente = () => intento === intentoActual;
  const textoConexion = `Conectando con ${NOMBRE_PROV[tipo]}...`;
  let vigia = null, timerCierre = null;
  flujoManual = true;

  try {
    if (esMobile()) {
      redirigiendo = true;
      mostrarCarga(textoConexion);
      await signInWithRedirect(auth, prov); // se procesa en getRedirectResult al volver
      return;
    }

    // Escritorio: el login sigue visible mientras el popup está abierto.
    popupRef = null;
    capturarPopup = true;
    vigia = setInterval(() => {
      if (!popupRef?.closed) return;
      clearInterval(vigia);
      vigia = null;
      mostrarCarga(textoConexion); // el popup se cerró: carga continua, sin congelarse
      // Si no llega resultado enseguida, fue un cierre manual: vuelve al login.
      timerCierre = setTimeout(() => vigente() && ocultarCarga(), GRACIA_CIERRE_MS);
    }, 100);

    const r = await signInWithPopup(auth, prov);
    clearTimeout(timerCierre);
    mostrarCarga("Cargando tu perfil...");
    await procesarSesion(r.user, getAdditionalUserInfo(r)?.profile);
  } catch (err) {
    console.error(err);
    if (!vigente()) return; // otro intento ya tomó el control
    ocultarCarga();
    const code = err.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/account-exists-with-different-credential")
      return showSnackbar("⚠️ Ese correo ya tiene una cuenta con otro método. Inicia sesión con ese método.", "warning");
    if (code === "auth/popup-blocked")
      return showSnackbar("⚠️ Tu navegador bloqueó la ventana. Permite los popups e intenta de nuevo.", "warning");
    if (code === "auth/network-request-failed")
      return showSnackbar("📡 Sin conexión. Revisa tu internet e intenta de nuevo.", "warning");
    showSnackbar(`❌ Error al iniciar sesión con ${NOMBRE_PROV[tipo]}`, "error");
  } finally {
    clearInterval(vigia);
    clearTimeout(timerCierre);
    capturarPopup = false;
    popupRef = null;
    if (vigente()) flujoManual = false;
  }
}
window.loginGoogle = () => loginSocial("google");
window.loginFacebook = () => loginSocial("facebook");
window.loginGithub = () => loginSocial("github");

/* ---------- Login con correo ---------- */
function abrirCamposLogin() {
  const f = $("loginFields");
  if (!f || f.classList.contains("open")) return false;
  f.classList.add("open");
  f.removeAttribute("inert");
  setTimeout(() => {
    $("loginEmail")?.focus({ preventScroll: true });
    $("btnDoLogin")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 460);
  return true;
}

/** Solo se llama si el login falló: explica por qué (cuenta social, no existe o contraseña mala). */
async function explicarFalloLogin(correo) {
  const emailErr = $("loginEmailError"), passErr = $("loginPassError");
  try {
    const { existe, tipo } = await api.checkEmail({ correo });
    if (!existe) {
      emailErr.innerHTML = `❌ Este correo no está registrado.
        <button type="button" class="link-btn-inline" onclick="openRegisterModal()">Crear cuenta gratis</button>`;
    } else if (tipo !== "email") {
      const fn = { google: "loginGoogle()", facebook: "loginFacebook()", github: "loginGithub()" }[tipo];
      emailErr.innerHTML = `<span>🔒 Esta cuenta fue creada con ${NOMBRE_PROV[tipo]}.</span><br>
        <button type="button" class="link-btn-inline" onclick="${fn}">Continuar con ${NOMBRE_PROV[tipo]}</button>`;
    } else {
      passErr.textContent = "❌ Contraseña incorrecta. Inténtalo de nuevo.";
    }
  } catch {
    passErr.textContent = "❌ Correo o contraseña incorrectos.";
  }
}

window.doInlineLogin = async (event) => {
  event?.preventDefault();
  if (abrirCamposLogin()) return;

  const emailErr = $("loginEmailError"), passErr = $("loginPassError");
  const correo = $("loginEmail").value.trim().toLowerCase();
  const pass = $("loginPassword").value;
  const btn = $("btnDoLogin");
  emailErr.textContent = passErr.textContent = "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return void (emailErr.textContent = "Ingresa un correo válido.");
  if (!pass) return void (passErr.textContent = "Ingresa tu contraseña.");

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = LOADING("Ingresando...");
  flujoManual = true;
  try {
    const { user } = await signInWithEmailAndPassword(auth, correo, pass);
    await procesarSesion(user);
  } catch (err) {
    console.error("Error login email:", err);
    const code = err?.code || "";
    if (["auth/wrong-password", "auth/invalid-credential", "auth/user-not-found"].includes(code)) await explicarFalloLogin(correo);
    else if (code === "auth/too-many-requests") passErr.textContent = "⚠️ Demasiados intentos. Espera unos minutos.";
    else if (code === "auth/user-disabled") passErr.textContent = "🚫 Esta cuenta fue suspendida.";
    else passErr.textContent = "Error inesperado. Intenta de nuevo.";
  } finally {
    flujoManual = false;
    btn.disabled = false;
    btn.innerHTML = orig;
  }
};

window.openForgotPassword = async () => {
  const correo = $("loginEmail").value.trim().toLowerCase();
  setError("loginEmailError", "");
  if (!correo) {
    $("loginEmailError").textContent = "Ingresa tu correo para recuperar la contraseña.";
    return $("loginEmail").focus();
  }
  if (!/^[^\s@]+@gmail\.com$/.test(correo))
    return void ($("loginEmailError").textContent = "Ingresa un correo @gmail.com válido.");
  if (!confirm(`¿Enviar correo de recuperación a:\n${correo}?`)) return;

  try {
    await sendPasswordResetEmail(auth, correo);
    showSnackbar(`📩 Correo enviado a ${correo}. Revisa tu bandeja y también la carpeta de <strong>spam</strong>.`, "success");
  } catch (err) {
    const msg = {
      "auth/user-not-found": ["❌ No existe una cuenta con ese correo.", "error"],
      "auth/too-many-requests": ["⚠️ Demasiados intentos. Espera unos minutos.", "warning"],
      "auth/invalid-email": ["❌ Correo inválido.", "error"],
    }[err?.code] || ["❌ Error al enviar. Intenta de nuevo.", "error"];
    showSnackbar(...msg);
  }
};

/* ---------- Registro ---------- */
window.submitRegister = async (event) => {
  event.preventDefault();

  const nombre = $("regNombre").value.trim().replace(/\s+/g, " ");
  const telefono = $("regTelefono").value.replace(/\D/g, "");
  const genero = document.querySelector('input[name="regGenero"]:checked')?.value || "";
  const { dep, prov, dist } = seleccionUbicacion.reg;
  const correo = $("regCorreo").value.trim().toLowerCase();
  const password = modoSocial ? "" : $("registerPass1").value;

  Object.values(CAMPO_A_ERROR).concat("errTerminos").forEach((id) => setError(id, ""));

  // Validación rápida en el cliente (el servidor valida de nuevo)
  let ok = true;
  const fallo = (id, msg) => (setError(id, msg), (ok = false));
  if (nombre.length < 2) fallo("errNombre", "Ingresa tu nombre.");
  if (!/^\d{7,15}$/.test(telefono)) fallo("errTelefono", "Número inválido.");
  if (!genero) fallo("errGenero", "Selecciona tu género.");
  if (!dep || !prov || !dist) fallo("errDistrito", "Selecciona departamento, provincia y distrito.");
  if (!correo) fallo("errCorreo", "Ingresa tu correo.");
  else if (modoSocial ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) : !/^[^\s@]+@gmail\.com$/.test(correo))
    fallo("errCorreo", modoSocial ? "Correo inválido." : "Solo se permiten correos @gmail.com.");
  if (!modoSocial && password.length < 8) fallo("errPass", "La contraseña debe tener al menos 8 caracteres.");
  if (!$("termsCheck").checked) fallo("errTerminos", "Debes aceptar los términos para continuar.");
  if (!ok) return;

  const btn = document.querySelector(".btn-register-submit");
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = LOADING("Creando cuenta...");
  flujoManual = true;

  try {
    let user, perfil;
    if (modoSocial) {
      if (!GOOGLE_USER) return showSnackbar("❌ No se encontró tu sesión. Vuelve a intentar el login.", "error");
      user = GOOGLE_USER;
      ({ perfil } = await api.completeSocialProfile({ nombre, telefono, genero, dep, prov, dist, correo }));
    } else {
      ({ perfil } = await api.registerEmailUser({ nombre, telefono, genero, dep, prov, dist, correo, password }));
      user = (await signInWithEmailAndPassword(auth, correo, password)).user;
    }

    authProcesado = true;
    GOOGLE_USER = user;
    modoSocial = false;
    closeModal("registerModal");
    showSnackbar("🎉 ¡Cuenta creada! Bienvenido a Geinz", "success");
    entrar(user, { existe: true, perfil, tieneNegocioRegistrado: false });
  } catch (err) {
    console.error("Error al registrar:", err);
    mostrarErrorApi(err, CAMPO_A_ERROR, "❌ Error al crear la cuenta. Intenta de nuevo.");
  } finally {
    flujoManual = false;
    btn.disabled = false;
    btn.innerHTML = orig;
  }
};

window.cerrarSesion = async () => {
  const btn = $("btnCerrarSesion");
  const orig = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = LOADING("Cerrando sesión...");
  }
  try {
    await signOut(auth);
    sessionStorage.clear();
    window.location.href = "../index.html";
  } catch (err) {
    console.error("Error al cerrar sesión:", err);
    showSnackbar("❌ Error al cerrar sesión. Intenta de nuevo.", "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
};

/* =========================================================
   EDITAR PERFIL
========================================================= */
function cargarPaisesEdit() {
  const select = $("editPais");
  if (!select || select.options.length > 1) return;
  select.append(...PAISES.map(([cod, nombre, flag, tel]) => {
    const o = new Option(`${flag}  ${nombre}`, cod);
    Object.assign(o.dataset, { nombre, flag, tel });
    return o;
  }));
}

window.onEditPaisChange = (sel) => {
  const o = sel.options[sel.selectedIndex];
  $("editPrefixFlag").textContent = o.dataset.flag;
  $("editPrefixCode").textContent = o.dataset.tel;
};

window.openEditProfileModal = () => {
  cargarPaisesEdit();
  $("editNombre").value = (perfilActual.nombre || "").trim();
  $("editApellido").value = (perfilActual.apellido || "").trim();
  $("editTelefono").value = perfilActual.contacto?.numero_user || "";

  const paisSelect = $("editPais");
  paisSelect.value = perfilActual.cod_pais || "pe";
  const o = paisSelect.options[paisSelect.selectedIndex];
  if (o) {
    $("editPrefixFlag").textContent = o.dataset.flag || "🇵🇪";
    $("editPrefixCode").textContent = o.dataset.tel || "+51";
  }
  abrirModal("editProfileModal");
  upgradeAllCoolSelects($("editProfileModal"));
};

window.submitEditProfile = async (event) => {
  event.preventDefault();
  const nombre = $("editNombre").value.trim();
  const apellido = $("editApellido").value.trim();
  const telefono = $("editTelefono").value.trim();

  ["errEditNombre", "errEditApellido", "errEditTelefono"].forEach((id) => setError(id, ""));
  let ok = true;
  if (nombre.length < 2) (setError("errEditNombre", "Ingresa un nombre válido (mín. 2 caracteres)."), (ok = false));
  if (apellido.length < 2) (setError("errEditApellido", "Ingresa un apellido válido (mín. 2 caracteres)."), (ok = false));
  if (!/^\d{7,15}$/.test(telefono)) (setError("errEditTelefono", "Número inválido (7–15 dígitos)."), (ok = false));
  if (!ok) return;
  if (!GOOGLE_USER) return showSnackbar("❌ No se encontró tu sesión. Recarga la página.", "error");

  const btn = $("btnSaveProfile");
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = LOADING("Guardando...");
  try {
    const { cambios } = await api.updateProfile({ nombre, apellido, telefono, codPais: $("editPais").value || "pe" });
    Object.assign(perfilActual, cambios);
    $("wName").textContent = `${cambios.nombre} ${cambios.apellido}`;
    if ($("wPhone")) $("wPhone").textContent = `${cambios.contacto.cod_telefonico} ${cambios.contacto.numero_user}`;
    closeModal("editProfileModal");
    showSnackbar("✅ Perfil actualizado correctamente", "success");
  } catch (err) {
    console.error("Error al actualizar perfil:", err);
    mostrarErrorApi(err, { nombre: "errEditNombre", apellido: "errEditApellido", telefono: "errEditTelefono" }, "❌ Error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
};
$("btnEditProfile")?.addEventListener("click", openEditProfileModal);

/* =========================================================
   AVATAR (se optimiza en el cliente; el servidor guarda la URL)
========================================================= */
function aWebpCuadrado(img, maxSize = 512, quality = 0.85) {
  const size = Math.min(img.naturalWidth, img.naturalHeight);
  const out = Math.min(maxSize, size);
  const canvas = Object.assign(document.createElement("canvas"), { width: out, height: out });
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - size) / 2, (img.naturalHeight - size) / 2, size, size, 0, 0, out, out);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/webp", quality));
}

const cargarImagen = (src, cors = false) => new Promise((res, rej) => {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.onload = () => res(img);
  img.onerror = () => rej(new Error("No se pudo cargar la imagen"));
  img.src = src;
});

async function subirAvatar(uid, blob) {
  const r = ref(storage, `avatars/${uid}.webp`);
  await uploadBytes(r, blob, { contentType: "image/webp" });
  const { foto } = await api.saveAvatar({ url: await getDownloadURL(r) });
  return foto;
}

$("wAvatarEdit")?.addEventListener("click", () => $("wAvatarInput")?.click());
$("wAvatarInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !GOOGLE_USER) return;
  const wrap = $("wAvatarWrap");
  wrap?.classList.add("is-uploading");
  try {
    const url = URL.createObjectURL(file);
    const blob = await aWebpCuadrado(await cargarImagen(url));
    URL.revokeObjectURL(url);
    $("wAvatarImg").src = await subirAvatar(GOOGLE_USER.uid, blob);
    showSnackbar("✅ Foto de perfil actualizada", "success");
  } catch (err) {
    console.error("Error subiendo avatar:", err);
    showSnackbar("❌ No se pudo actualizar tu foto", "error");
  } finally {
    wrap?.classList.remove("is-uploading");
    e.target.value = "";
  }
});

/* =========================================================
   NOTIFICACIONES (FCM)
========================================================= */
async function claveDispositivo() {
  let clave = localStorage.getItem("geinz_device_key");
  if (clave) return clave;
  let modelo = "web";
  try {
    const ua = await navigator.userAgentData?.getHighEntropyValues?.(["model", "platform"]);
    if (ua) modelo = (ua.model || ua.platform || "web").replace(/\s+/g, "-");
  } catch {}
  clave = `${modelo}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("geinz_device_key", clave);
  return clave;
}

async function guardarTokenFcm(uid) {
  try {
    if ((await Notification.requestPermission()) !== "granted") return;
    const token = await getToken(getMessaging(app), {
      vapidKey: "BHZ1cDOCNN3vIm8tUtSrvCgn-e4jIgR8wl8XloY-pLClHf3JrJpm2J29MPAQscFIM4SHzQtg_lkfo_P1ALeEuWQ",
    });
    if (!token || token === localStorage.getItem("geinz_fcm_token")) return;
    await setDoc(tokenFcmDoc(uid), { tokens: { [await claveDispositivo()]: token } }, { merge: true });
    localStorage.setItem("geinz_fcm_token", token);
  } catch (err) {
    console.error("Error guardando token FCM:", err);
  }
}

function gestionarPermisoNotificaciones(uid) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return void guardarTokenFcm(uid);
  if (Notification.permission === "denied") return;

  const modal = $("notisModal");
  if (!modal) return void guardarTokenFcm(uid);
  abrirModal("notisModal");
  const cerrar = () => closeModal("notisModal");
  $("btnActivarNotis").onclick = async () => (cerrar(), guardarTokenFcm(uid));
  $("btnOmitirNotis").onclick = cerrar;
}

/* =========================================================
   ACCESO AL PANEL DEL NEGOCIO
========================================================= */
function abrirPanel(id, dep, prov, dist) {
  sessionStorage.setItem("tiendaId", id);
  sessionStorage.setItem("departamento", dep);
  sessionStorage.setItem("provincia", prov);
  sessionStorage.setItem("localidad", dist);
  window.location.href = "./../../dasboard/panel_perfil.html?" +
    new URLSearchParams({ id, departamento: dep, provincia: prov, localidad: dist });
}

async function validarYEntrarAlPanel(id, { dep, prov, dist }, btn) {
  if (!id || id.length < 4) return showSnackbar("⚠️ Ingresa un ID válido", "warning");
  if (!dep || !prov || !dist) return showSnackbar("⚠️ Selecciona departamento, provincia y distrito", "warning");

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = LOADING("Validando...");
  try {
    setUbicacion({ departamento: dep, provincia: prov });
    const snap = await getDoc(tiendaDoc(dist, "tiendas", id));
    if (!snap.exists()) return showSnackbar("❌ Ese ID no existe. Verifica e intenta de nuevo.", "error");
    abrirPanel(id, dep, prov, dist);
  } catch (err) {
    console.error(err);
    showSnackbar("Error al validar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

window.continuarPanel = () =>
  validarYEntrarAlPanel($("selectorInput").value.trim(), seleccionUbicacion.selector, $("btnContinuar"));
window.accederSocio = () =>
  validarYEntrarAlPanel($("socioId").value.trim(), seleccionUbicacion.socio, $("btnAccederSocio"));
$("btnAccederSocio")?.addEventListener("click", accederSocio);

let vincularListo = false;
async function prepararFormularioVincular() {
  if (vincularListo) return;
  vincularListo = true;
  await inicializarSelectoresUbicacion("welcome");
  upgradeAllCoolSelects($("wVincularForm"));
  const btn = $("btnVincularInline");
  if (btn)
    btn.onclick = () => validarYEntrarAlPanel($("welcomeIdNegocio").value.trim(), seleccionUbicacion.welcome, btn);
}

/* =========================================================
   SPLASH / BIENVENIDA
========================================================= */
const mostrar = (id, v = true) => $(id) && ($(id).style.display = v ? "flex" : "none");

async function showSplash(user, sesion) {
  if (splashShown) return;
  splashShown = true;
  gestionarPermisoNotificaciones(user.uid);

  $("authChecking")?.classList.add("hidden");
  $("mainUI").style.display = "none";
  $("splashScreen").classList.add("visible");

  // Los datos ya están (vienen de getSession): la animación es solo estética y corta.
  for (const s of ["step1", "step2", "step3"]) {
    await delay(220);
    $(s)?.classList.add("done");
  }
  await delay(250);

  const data = sesion.perfil || {};
  perfilActual = data;
  const nombre = data.nombre || user.displayName || "Usuario";
  $("wName").textContent = data.apellido ? `${nombre} ${data.apellido}` : nombre;
  $("wUser").textContent = data.nombre_user || "@" + (user.email?.split("@")[0] || "usuario");
  if ($("wPhone"))
    $("wPhone").textContent = data.contacto?.numero_user ? `${data.contacto.cod_telefonico || "+51"} ${data.contacto.numero_user}` : "";

  const avatarImg = $("wAvatarImg");
  if (avatarImg) avatarImg.src = data.foto || user.photoURL || "../img/icons/favicon-96x96.png";

  // Migra la foto del proveedor a nuestro Storage en segundo plano (no frena la pantalla)
  if (!data.foto && user.photoURL) {
    const wrap = $("wAvatarWrap");
    wrap?.classList.add("is-uploading");
    cargarImagen(user.photoURL, true)
      .then((img) => aWebpCuadrado(img))
      .then((blob) => subirAvatar(user.uid, blob))
      .then((url) => avatarImg && (avatarImg.src = url))
      .catch((err) => console.warn("No se pudo guardar la foto del proveedor:", err))
      .finally(() => wrap?.classList.remove("is-uploading"));
  }

  const tienda = data.tienda_propietario;
  const tieneTienda = !!tienda?.id_negocio;
  const hint = $("wHint");
  const btnEnter = $("btnEnter"), btnOtro = $("btnOtroNegocio"), btnCancelar = $("btnCancelarOtro");
  const form = $("wVincularForm"), storeCard = $("wStoreCard"), noStoreCard = $("wNoStoreCard");

  const vistaMiNegocio = () => {
    mostrar("wStoreCard"); mostrar("btnEnter"); mostrar("btnOtroNegocio");
    if (form) form.style.display = "none";
    mostrar("btnCancelarOtro", false);
    if (hint) hint.textContent = "Tu negocio ya está vinculado a tu cuenta.";
  };

  if (tieneTienda) {
    mostrar("wNoStoreCard", false);
    vistaMiNegocio();
    const loc = [tienda.distrito, tienda.provincia, tienda.departamento]
      .filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    if ($("wStoreLoc")) $("wStoreLoc").textContent = loc.join(" · ") || "Ubicación registrada";

    btnEnter.onclick = () => abrirPanel(tienda.id_negocio, tienda.departamento || "", tienda.provincia || "", tienda.distrito || "");
    btnOtro.onclick = async () => {
      mostrar("wStoreCard", false); mostrar("btnEnter", false); mostrar("btnOtroNegocio", false);
      form.style.display = "block";
      mostrar("btnCancelarOtro");
      if (hint) hint.textContent = "Ingresa los datos del otro negocio.";
      await prepararFormularioVincular();
    };
    if (btnCancelar) btnCancelar.onclick = vistaMiNegocio;
  } else {
    mostrar("wStoreCard", false); mostrar("btnEnter", false);
    mostrar("wNoStoreCard");
    form.style.display = "block";
    if (hint) hint.textContent = "Vincula tu negocio o continúa como usuario.";
  }

  $("sValidating").classList.add("fade-out");
  await delay(300);
  $("sValidating").style.display = "none";
  $("sWelcome").classList.add("visible");

  if (!tieneTienda) {
    await prepararFormularioVincular();
    try {
      const p = JSON.parse(localStorage.getItem("geinz_registro_pendiente") || "null");
      if (p?.id) {
        $("welcomeIdNegocio").value = p.id;
        await prefillUbicacion("welcome", p);
        hint.textContent = `Tu negocio "${p.nombre}" fue creado. Pulsa "Acceder al panel".`;
        localStorage.removeItem("geinz_registro_pendiente");
      }
    } catch {}
  }
}

/* =========================================================
   ARRANQUE: sesión existente / redirect móvil
========================================================= */
const redirectPromise = getRedirectResult(auth).catch((err) => {
  console.error("Error en redirect:", err);
  showSnackbar(
    err?.code === "auth/account-exists-with-different-credential"
      ? "⚠️ Ese correo ya tiene una cuenta con otro método. Inicia sesión con ese método."
      : "❌ Error al iniciar sesión",
    err?.code === "auth/account-exists-with-different-credential" ? "warning" : "error",
  );
  return null;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $("mainUI").style.display = "flex";
    $("authChecking")?.classList.add("hidden");
    return;
  }
  if (flujoManual) return; // el login manual ya lo procesa
  if ($("acText")) $("acText").textContent = "Sesión encontrada, cargando perfil...";
  const red = await redirectPromise;
  await procesarSesion(user, red ? getAdditionalUserInfo(red)?.profile : null);
});

window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  if (redirigiendo) { // móvil: volvió atrás desde Google/Facebook/GitHub sin completar
    redirigiendo = false;
    flujoManual = false;
    ocultarCarga();
  } else location.reload();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") ["registerModal", "socioModal"].forEach(closeModal);
});

/* Título rotativo */
const titleEl = $("dynamicTitle");
if (titleEl) {
  const titles = [
    "Encuentra tu próximo destino favorito", "Tu aventura con Geinz comienza hoy",
    "Bienvenido a Geinz, tu espacio ideal", "Descubre los mejores negocios locales",
    "Todo lo que necesitas, cerca de ti", "Explora, conecta y disfruta tu ciudad",
    "Geinz, tu guía de negocios locales",
  ];
  let i = 0;
  titleEl.style.transition = "opacity .4s ease, transform .4s ease";
  titleEl.textContent = titles[0];
  setInterval(() => {
    titleEl.style.opacity = "0";
    titleEl.style.transform = "translateY(8px)";
    setTimeout(() => {
      titleEl.textContent = titles[(i = (i + 1) % titles.length)];
      titleEl.style.opacity = "1";
      titleEl.style.transform = "translateY(0)";
    }, 400);
  }, 4000);
}
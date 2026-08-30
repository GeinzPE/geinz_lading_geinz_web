/* =========================================================
   CONSOLE WARNING
========================================================= */
console.log(`%cDETENTE`, `font-size:48px;font-weight:900;color:#ff2d55;`);
console.log(
  `%cLa consola es solo para desarrolladores.\nSi alguien te pidió pegar código aquí podría robar tu cuenta Geinz.`,
  `font-size:15px;color:white;`,
);

/* =========================================================
   FIREBASE AUTH (solo lo que falta, db/app viene de db.js)
========================================================= */
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Importamos app y db ya inicializados desde db.js (fuente única de verdad)
import { app, db } from "../db/db.js";
import { tiendaDoc } from "../rutas/rutas.js";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   GLOBALS
========================================================= */
let GOOGLE_USER = null;
let splashShown = false;
let authProcesado = false;
const seleccionUbicacion = {
  socio: { dep: "", prov: "", dist: "" },
  selector: { dep: "", prov: "", dist: "" },
  reg: { dep: "", prov: "", dist: "" },
};

/* =========================================================
   PAÍSES
========================================================= */
const PAISES = [
  { cod: "ar", nombre: "Argentina", flag: "🇦🇷", tel: "+54" },
  { cod: "bo", nombre: "Bolivia", flag: "🇧🇴", tel: "+591" },
  { cod: "br", nombre: "Brasil", flag: "🇧🇷", tel: "+55" },
  { cod: "cl", nombre: "Chile", flag: "🇨🇱", tel: "+56" },
  { cod: "co", nombre: "Colombia", flag: "🇨🇴", tel: "+57" },
  { cod: "cr", nombre: "Costa Rica", flag: "🇨🇷", tel: "+506" },
  { cod: "cu", nombre: "Cuba", flag: "🇨🇺", tel: "+53" },
  { cod: "ec", nombre: "Ecuador", flag: "🇪🇨", tel: "+593" },
  { cod: "sv", nombre: "El Salvador", flag: "🇸🇻", tel: "+503" },
  { cod: "es", nombre: "España", flag: "🇪🇸", tel: "+34" },
  { cod: "us", nombre: "Estados Unidos", flag: "🇺🇸", tel: "+1" },
  { cod: "gt", nombre: "Guatemala", flag: "🇬🇹", tel: "+502" },
  { cod: "hn", nombre: "Honduras", flag: "🇭🇳", tel: "+504" },
  { cod: "mx", nombre: "México", flag: "🇲🇽", tel: "+52" },
  { cod: "ni", nombre: "Nicaragua", flag: "🇳🇮", tel: "+505" },
  { cod: "pa", nombre: "Panamá", flag: "🇵🇦", tel: "+507" },
  { cod: "py", nombre: "Paraguay", flag: "🇵🇾", tel: "+595" },
  { cod: "pe", nombre: "Perú", flag: "🇵🇪", tel: "+51" },
  { cod: "do", nombre: "Rep. Dominicana", flag: "🇩🇴", tel: "+1" },
  { cod: "uy", nombre: "Uruguay", flag: "🇺🇾", tel: "+598" },
  { cod: "ve", nombre: "Venezuela", flag: "🇻🇪", tel: "+58" },
];

function cargarPaises() {
  const select = document.getElementById("regNacionalidad");
  if (!select || select.options.length > 1) return; // ya cargado

  PAISES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.cod;
    opt.textContent = `${p.flag}  ${p.nombre}`;
    opt.dataset.nombre = p.nombre;
    select.appendChild(opt);
  });

  select.value = "pe";
  document.getElementById("regCodPais").value = "pe";
  document.getElementById("regNombrePais").value = "Perú";
}

window.onNacionalidadChange = (sel) => {
  const opt = sel.options[sel.selectedIndex];
  document.getElementById("regCodPais").value = sel.value;
  document.getElementById("regNombrePais").value =
    opt.dataset.nombre || opt.textContent.replace(/^\S+\s+/, "").trim();
};

/* =========================================================
   UBICACIÓN (departamento / provincia / distrito) — Firestore
   Ruta: Tiendas/peru/departamento/{dep}/provincia/{prov}/distrito/{dist}
========================================================= */
// ✅ PON esto en su lugar (mismo origen que ya funciona en el registro):
const UBIGEO_BASE = "https://cdn.jsdelivr.net/gh/joseluisq/ubigeos-peru/json";
let UBIGEO_DEPARTAMENTOS = [];
let ubigeoProvinciasDe = () => [];
let ubigeoDistritosDe = () => [];
let ubigeoCargado = false;

function crearLookupUbigeo(data) {
  if (data && !Array.isArray(data) && typeof data === "object") {
    const valores = Object.values(data);
    if (valores.length && Array.isArray(valores[0])) {
      return (parentId) => data[parentId] || data[String(parentId)] || [];
    }
    const plano = valores;
    return (parentId) =>
      plano.filter((item) => String(item.id_padre_ubigeo) === String(parentId));
  }
  if (Array.isArray(data)) {
    return (parentId) =>
      data.filter((item) => String(item.id_padre_ubigeo) === String(parentId));
  }
  return () => [];
}

async function cargarUbigeoGlobal() {
  if (ubigeoCargado) return;
  const [depRes, provRes, distRes] = await Promise.all([
    fetch(UBIGEO_BASE + "/departamentos.json"),
    fetch(UBIGEO_BASE + "/provincias.json"),
    fetch(UBIGEO_BASE + "/distritos.json"),
  ]);
  const depData = await depRes.json();
  UBIGEO_DEPARTAMENTOS = (
    Array.isArray(depData) ? depData : Object.values(depData)
  ).sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo));
  ubigeoProvinciasDe = crearLookupUbigeo(await provRes.json());
  ubigeoDistritosDe = crearLookupUbigeo(await distRes.json());
  ubigeoCargado = true;
}

async function obtenerDepartamentos() {
  await cargarUbigeoGlobal();
  return UBIGEO_DEPARTAMENTOS.map((d) => ({
    id: d.id_ubigeo,
    nombre: d.nombre_ubigeo,
  }));
}

async function obtenerProvincias(depId) {
  await cargarUbigeoGlobal();
  return ubigeoProvinciasDe(depId)
    .slice()
    .sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo))
    .map((p) => ({ id: p.id_ubigeo, nombre: p.nombre_ubigeo }));
}

async function obtenerDistritos(depId, provId) {
  await cargarUbigeoGlobal();
  return ubigeoDistritosDe(provId)
    .slice()
    .sort((a, b) => a.nombre_ubigeo.localeCompare(b.nombre_ubigeo))
    .map((d) => ({ id: d.id_ubigeo, nombre: d.nombre_ubigeo }));
}

/**
 * Inicializa los 3 selects en cascada (Departamento -> Provincia -> Distrito)
 * prefix = "socio"    -> ids: socioDepartamento / socioProvincia / socioDistrito
 * prefix = "selector" -> ids: selectorDepartamento / selectorProvincia / selectorDistrito
 */
async function inicializarSelectoresUbicacion(prefix) {
  const selDep = document.getElementById(`${prefix}Departamento`);
  const selProv = document.getElementById(`${prefix}Provincia`);
  const selDist = document.getElementById(`${prefix}Distrito`);
  if (!selDep || !selProv || !selDist) return;

  // Garantiza que exista el wrapper .cool-select ANTES de tocar el loading,
  // sin importar si upgradeAllCoolSelects ya corrió o no.
  upgradeCoolSelect(selDep);
  upgradeCoolSelect(selProv);
  upgradeCoolSelect(selDist);

  setCoolSelectLoading(selDep, true);
  try {
    const departamentos = await obtenerDepartamentos();
    selDep.innerHTML =
      `<option value="" disabled selected hidden>Selecciona</option>` +
      departamentos
        .map((d) => `<option value="${d.id}">${d.nombre}</option>`)
        .join("");
  } catch (err) {
    console.error("Error cargando departamentos:", err);
    selDep.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    setCoolSelectLoading(selDep, false);
    return;
  } finally {
    setCoolSelectLoading(selDep, false);
  }

  selDep.onchange = async () => {
    seleccionUbicacion[prefix].dep = selDep.value;
    seleccionUbicacion[prefix].prov = "";
    seleccionUbicacion[prefix].dist = "";
    selProv.disabled = true;
    selDist.disabled = true;
    setCoolSelectLoading(selProv, true);

    selDist.innerHTML = `<option value="" disabled selected hidden>Elige provincia</option>`;
    selProv.innerHTML = `<option value="" disabled selected hidden>Cargando...</option>`;
    try {
      const provincias = await obtenerProvincias(selDep.value);
      selProv.innerHTML =
        `<option value="" disabled selected hidden>Selecciona</option>` +
        provincias
          .map((p) => `<option value="${p.id}">${p.nombre}</option>`)
          .join("");
      selProv.disabled = false;
    } catch (err) {
      console.error("Error cargando provincias:", err);
      selProv.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    } finally {
      setCoolSelectLoading(selProv, false);
    }
  };

  selProv.onchange = async () => {
    seleccionUbicacion[prefix].prov = selProv.value;
    seleccionUbicacion[prefix].dist = "";
    selDist.disabled = true;
    selDist.innerHTML = `<option value="" disabled selected hidden>Cargando...</option>`;
    setCoolSelectLoading(selDist, true);
    try {
      const distritos = await obtenerDistritos(
        seleccionUbicacion[prefix].dep,
        selProv.value,
      );
      selDist.innerHTML =
        `<option value="" disabled selected hidden>Selecciona</option>` +
        distritos
          .map((d) => `<option value="${d.id}">${d.nombre}</option>`)
          .join("");
      selDist.disabled = false;
    } catch (err) {
      console.error("Error cargando distritos:", err);
      selDist.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    } finally {
      setCoolSelectLoading(selDist, false);
    }
  };

  function slugify(texto) {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quita tildes
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-"); // espacios -> guiones
  }

  selDist.onchange = () => {
    const opt = selDist.options[selDist.selectedIndex];
    seleccionUbicacion[prefix].dist = slugify(opt.textContent);
  };
}
/* =========================================================
   SNACKBAR MODERNO — blanco, centrado, estilo Android
========================================================= */
function showSnackbar(msg, tipo = "default") {
  document.getElementById("geinzSnackbar")?.remove();

  const estilos = {
    success: { icon: "check_circle", iconColor: "#22c55e" },
    error: { icon: "error", iconColor: "#ef4444" },
    warning: { icon: "warning", iconColor: "#f59e0b" },
    default: { icon: "info", iconColor: "#6366f1" },
  };
  const e = estilos[tipo] || estilos.default;
  const sb = document.createElement("div");
  sb.id = "geinzSnackbar";

  sb.innerHTML = `
    <span class="material-symbols-outlined"
      style="color:${e.iconColor};font-size:20px;flex-shrink:0;"
      aria-hidden="true">${e.icon}</span>
   <span style="flex:1;line-height:1.4;" >${msg}</span>

    <button onclick="this.parentElement.remove()" aria-label="Cerrar"
      style="background:none;border:none;cursor:pointer;color:#9ca3af;
             display:flex;align-items:center;padding:0;flex-shrink:0;">
      <span class="material-symbols-outlined" style="font-size:18px;">close</span>
    </button>
  `;

  Object.assign(sb.style, {
    position: "fixed",
    bottom: "32px",
    left: "50%",
    transform: "translateX(-50%) translateY(28px)",
    background: "#ffffff",
    color: "#1a1a1a",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 18px",
    borderRadius: "16px",
    fontSize: "14px",
    fontWeight: "500",
    fontFamily: "inherit",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.10)",
    zIndex: "99999",
    opacity: "0",
    transition:
      "opacity .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1)",
    minWidth: "260px",
    maxWidth: "min(90vw,480px)",
    pointerEvents: "all",
    userSelect: "none",
  });

  document.body.appendChild(sb);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      sb.style.opacity = "1";
      sb.style.transform = "translateX(-50%) translateY(0)";
    }),
  );

  let autoClose = setTimeout(cerrar, 3500);
  sb.addEventListener("mouseenter", () => clearTimeout(autoClose));
  sb.addEventListener("mouseleave", () => {
    autoClose = setTimeout(cerrar, 1500);
  });

  function cerrar() {
    sb.style.opacity = "0";
    sb.style.transform = "translateX(-50%) translateY(28px)";
    setTimeout(() => sb.remove(), 320);
  }
}

function setCoolSelectLoading(select, loading) {
  const wrap = select?.nextElementSibling; // el .cool-select generado
  if (!wrap || !wrap.classList.contains("cool-select")) return;
  wrap.classList.toggle("is-loading", loading);

  let bar = wrap.querySelector(".cool-select-loadbar");
  if (loading && !bar) {
    bar = document.createElement("div");
    bar.className = "cool-select-loadbar";
    wrap.appendChild(bar);
  } else if (!loading && bar) {
    bar.remove();
  }
}
/* =========================================================
   COOL SELECT (con buscador) — envuelve <select> nativo
========================================================= */
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
    </div>
  `;

  const trigger = wrap.querySelector(".cool-select-trigger");
  const valueEl = wrap.querySelector(".cool-select-value");
  const search = wrap.querySelector(".cool-select-search");
  const optionsWrap = wrap.querySelector(".cool-select-options");

  function getItems() {
    return [...select.options]
      .filter((o) => o.value !== "")
      .map((o) => ({ value: o.value, label: o.textContent }));
  }

  function renderTrigger() {
    const hasValue = select.value !== "";
    const selected = select.selectedOptions[0];
    valueEl.textContent = hasValue
      ? selected.textContent
      : select.options[0]?.textContent || "Selecciona...";
    valueEl.classList.toggle("is-placeholder", !hasValue);
    trigger.disabled = select.disabled;
    wrap.classList.toggle("is-disabled", select.disabled);
  }

  function renderOptions(filter) {
    const f = (filter || "").trim().toLowerCase();
    const items = getItems();
    const filtered = f
      ? items.filter((i) => i.label.toLowerCase().includes(f))
      : items;
    optionsWrap.innerHTML = filtered.length
      ? filtered
          .map(
            (i) => `
        <div class="cool-select-option ${select.value === i.value ? "is-selected" : ""}" data-value="${i.value}">
          <span>${i.label}</span>
          <svg class="cool-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>
        </div>`,
          )
          .join("")
      : `<div class="cool-select-empty">Sin resultados</div>`;
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrap.classList.contains("is-loading")) return;
    if (select.disabled) return;
    document.querySelectorAll(".cool-select.open").forEach((el) => {
      if (el !== wrap) el.classList.remove("open");
    });
    const willOpen = !wrap.classList.contains("open");
    wrap.classList.toggle("open", willOpen);
    if (willOpen) {
      renderOptions("");
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

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });

  // Se actualiza solo cuando tu JS reescribe las <option> (departamento->provincia->distrito)
  new MutationObserver(renderTrigger).observe(select, {
    childList: true,
    attributes: true,
  });
  select.addEventListener("change", renderTrigger);

  renderTrigger();
}

function upgradeAllCoolSelects(root = document) {
  root.querySelectorAll(".custom-select").forEach(upgradeCoolSelect);
}
/* =========================================================
   HELPERS
========================================================= */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const markStep = (id) => document.getElementById(id)?.classList.add("done");

/* =========================================================
   MODALS
========================================================= */
window.openLoginModal = () => {
  document.body.classList.add("blur-active");
  document.getElementById("loginModal").classList.add("active");
};

window.openRegisterModal = () => {
  document.body.classList.add("blur-active");
  document.getElementById("registerModal").classList.add("active");
  cargarPaises();
  inicializarSelectoresUbicacion("reg"); // 👈 agregar esta línea
  upgradeAllCoolSelects(document.getElementById("registerModal"));
  const fechaInput = document.getElementById("regFechaNac");
  if (fechaInput) fechaInput.max = new Date().toISOString().split("T")[0];
};

window.openSocioModal = () => {
  document.body.classList.add("blur-active");
  document.getElementById("socioModal").classList.add("active");
  inicializarSelectoresUbicacion("socio");
  upgradeAllCoolSelects(document.getElementById("socioModal")); // 👈
};
window.chooseAccessType = (tipo) => {
  document.getElementById("selectTypeScreen").style.display = "none";

  if (tipo === "usuario") {
    document.getElementById("welcomeScreen").style.display = "";
  } else {
    openSocioModal();
  }
};


window.closeModal = (id) => {
  document.getElementById(id)?.classList.remove("active");
  if (id === "loginModal") _resetLoginModal();
  if (!document.querySelector(".modal-overlay.active")) {
    document.body.classList.remove("blur-active");
  }
};

window.closeIfOutside = (event, id) => {
  if (event.target.id === id) closeModal(id);
};

/* =========================================================
   PASSWORD TOGGLE
========================================================= */
window.togglePassword = (id, btn) => {
  const input = document.getElementById(id);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  const ico = btn.querySelector(".material-symbols-outlined");
  if (ico) ico.textContent = isPass ? "visibility_off" : "visibility";
};

function esMobileOWebview() {
  const ua = navigator.userAgent || "";
  const esMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const esWebview = /FBAN|FBAV|Instagram|Line\//i.test(ua); // apps embebidas
  return esMobile || esWebview;
}

async function procesarLoginGoogle(user) {
  if (authProcesado) return;
  authProcesado = true;
  GOOGLE_USER = user;
  const userRef = doc(
    db,
    "Trabajadores_Usuarios_Drivers",
    "users",
    "users",
    user.uid,
  );
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    showSplash(user);
  } else {
    openRegisterModal();
  }
}

/* =========================================================
   LOGIN GOOGLE
========================================================= */
window.loginGoogle = async () => {
  try {
    if (esMobileOWebview()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    const result = await signInWithPopup(auth, provider);
    await procesarLoginGoogle(result.user);
  } catch (err) {
    console.error(err);
    showSnackbar("❌ Error al iniciar sesión con Google", "error");
  }
};

window.openForgotPassword = async () => {
  const correo = document
    .getElementById("loginEmail")
    .value.trim()
    .toLowerCase();

  if (!correo) {
    document.getElementById("loginEmailError").textContent =
      "Ingresa tu correo para recuperar la contraseña.";
    document.getElementById("loginStepPassword").style.display = "none";
    document.getElementById("loginStepEmail").style.display = "block";
    return;
  }

  if (!/^[^\s@]+@gmail\.com$/.test(correo)) {
    document.getElementById("loginEmailError").textContent =
      "Ingresa un correo @gmail.com válido.";
    return;
  }

  const confirmar = confirm(`¿Enviar correo de recuperación a:\n${correo}?`);
  if (!confirmar) return;

  try {
    const { sendPasswordResetEmail } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    await sendPasswordResetEmail(auth, correo);

    showSnackbar(
      `📩 Correo enviado a ${correo}. Revisa tu bandeja y también la carpeta de <strong>spam</strong>.`,
      "success",
    );
  } catch (err) {
    console.error("Error recuperando contraseña:", err);
    const code = err?.code || "";

    if (code === "auth/user-not-found") {
      showSnackbar("❌ No existe una cuenta con ese correo.", "error");
    } else if (code === "auth/too-many-requests") {
      showSnackbar("⚠️ Demasiados intentos. Espera unos minutos.", "warning");
    } else if (code === "auth/invalid-email") {
      showSnackbar("❌ Correo inválido.", "error");
    } else {
      showSnackbar("❌ Error al enviar. Intenta de nuevo.", "error");
    }
  }
};

/* =========================================================
   REGISTER — validación completa
========================================================= */
window.submitRegister = async (event) => {
  event.preventDefault();

  // ── Leer campos ──────────────────────────────────────────
  const nombre = document.getElementById("regNombre").value.trim();
  const apellido = document.getElementById("regApellido").value.trim();
  const username = document
    .getElementById("regUsername")
    .value.trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const telefono = document
    .getElementById("regTelefono")
    .value.trim()
    .replace(/\D/g, "");
  const genero = document.getElementById("regGenero").value;
  const { dep: depReg, prov: provReg, dist: distReg } = seleccionUbicacion.reg;
  const fechaNac = document.getElementById("regFechaNac").value;
  const codPais = document.getElementById("regCodPais").value;
  const nombrePais = document.getElementById("regNombrePais").value;
  const correo = document
    .getElementById("regCorreo")
    .value.trim()
    .toLowerCase();
  const pass1 = document.getElementById("registerPass1").value;
  const pass2 = document.getElementById("registerPass2").value;
  const terminos = document.getElementById("termsCheck").checked;

  const setError = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  };

  [
    "errNombre",
    "errApellido",
    "errUsername",
    "errTelefono",
    "errGenero",
    "errLocalidad",
    "errFecha",
    "errPais",
    "errCorreo",
    "errPass",
    "errTerminos",
  ].forEach((id) => setError(id, ""));

  let ok = true;

  if (!nombre || nombre.length < 2) {
    setError("errNombre", "Ingresa un nombre válido (mín. 2 caracteres).");
    ok = false;
  }
  if (!apellido || apellido.length < 2) {
    setError("errApellido", "Ingresa un apellido válido (mín. 2 caracteres).");
    ok = false;
  }
  if (!username || username.length < 3) {
    setError("errUsername", "El usuario debe tener al menos 3 caracteres.");
    ok = false;
  } else if (!/^[a-z0-9_.]+$/.test(username)) {
    setError(
      "errUsername",
      "Solo letras minúsculas, números, puntos y guiones bajos.",
    );
    ok = false;
  }
  if (!telefono || !/^\d{7,15}$/.test(telefono)) {
    setError("errTelefono", "Número inválido (7–15 dígitos).");
    ok = false;
  }
  if (!genero) {
    setError("errGenero", "Selecciona tu género.");
    ok = false;
  }
  if (!depReg || !provReg || !distReg) {
    setError("errDistrito", "Selecciona departamento, provincia y distrito.");
    ok = false;
  }
  if (!fechaNac) {
    setError("errFecha", "Selecciona tu fecha de nacimiento.");
    ok = false;
  } else {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const nacido = new Date(fechaNac + "T00:00:00");
    if (isNaN(nacido.getTime()) || nacido >= hoy) {
      setError("errFecha", "Fecha inválida.");
      ok = false;
    } else {
      const edad =
        hoy.getFullYear() -
        nacido.getFullYear() -
        (hoy < new Date(hoy.getFullYear(), nacido.getMonth(), nacido.getDate())
          ? 1
          : 0);
      if (edad < 13) {
        setError("errFecha", "Debes tener al menos 13 años.");
        ok = false;
      }
      if (edad > 110) {
        setError("errFecha", "Fecha de nacimiento inválida.");
        ok = false;
      }
    }
  }
  if (!codPais || !nombrePais) {
    setError("errPais", "Selecciona tu nacionalidad.");
    ok = false;
  }
  if (!correo) {
    setError("errCorreo", "Ingresa tu correo electrónico.");
    ok = false;
  } else if (!/^[^\s@]+@gmail\.com$/.test(correo)) {
    setError("errCorreo", "Solo se permiten correos @gmail.com.");
    ok = false;
  }
  if (!pass1 || pass1.length < 8) {
    setError("errPass", "La contraseña debe tener al menos 8 caracteres.");
    ok = false;
  } else if (!/(?=.*[A-Z])/.test(pass1) && !/(?=.*[0-9])/.test(pass1)) {
    setError("errPass", "Incluye al menos una mayúscula o un número.");
    ok = false;
  } else if (pass1 !== pass2) {
    setError("errPass", "Las contraseñas no coinciden.");
    ok = false;
  }
  if (!terminos) {
    setError("errTerminos", "Debes aceptar los términos para continuar.");
    ok = false;
  }

  if (!ok) return;

  const btn = document.querySelector(".btn-register-submit");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Creando cuenta...`;

  try {
    const usernameRef = doc(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "nombres_user",
      username,
    );
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
      setError("errUsername", "Este nombre de usuario ya está en uso.");
      return;
    }

    const correosRef = collection(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "correos",
    );
    const correoSnap = await getDocs(
      query(correosRef, where("correo", "==", correo)),
    );
    if (!correoSnap.empty) {
      setError("errCorreo", "Este correo ya tiene una cuenta. Inicia sesión.");
      return;
    }

    const { createUserWithEmailAndPassword } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    let newUser;
    try {
      const result = await createUserWithEmailAndPassword(auth, correo, pass1);
      newUser = result.user;
    } catch (authErr) {
      if (authErr.code === "auth/email-already-in-use") {
        setError("errCorreo", "Este correo ya está registrado. Inicia sesión.");
      } else if (authErr.code === "auth/invalid-email") {
        setError("errCorreo", "Correo inválido.");
      } else if (authErr.code === "auth/weak-password") {
        setError("errPass", "Contraseña muy débil. Usa al menos 8 caracteres.");
      } else {
        showSnackbar("❌ Error al crear cuenta. Intenta de nuevo.", "error");
      }
      return;
    }

    const uid = newUser.uid;
    const usernameFinal = "@" + username.replace(/^@/, "");
    const fechaRegistro = new Date().toLocaleDateString("es-PE");

    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "correos", uid),
      { correo, tipo: "email" },
    );

    await setDoc(
      doc(
        db,
        "Trabajadores_Usuarios_Drivers",
        "users",
        "nombres_user",
        username,
      ),
      { id_registrado: uid, nombres_user: usernameFinal },
    );

    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", uid),
      {
        nombre,
        apellido,
        correo,
        nombre_user: usernameFinal,
        id_user: uid,
        genero,
        departamento: depReg,
        provincia: provReg,
        localidad: distReg,
        fecha_nac: fechaNac,
        fecha_registrada: fechaRegistro,
        puntos: 500,
        cod_pais: codPais,
        nacionalidad_nacimiento: nombrePais,
        tipo_login: "email",
        contacto: {
          cod_telefonico: codPais,
          nombre_pais_numero: nombrePais,
          numero_user: Number(telefono),
        },
        creado_server: serverTimestamp(),
      },
    );

    GOOGLE_USER = newUser;

    closeModal("registerModal");
    showSnackbar("🎉 ¡Cuenta creada! Bienvenido a Geinz", "success");
    await delay(900);
    showSplash(newUser);
  } catch (err) {
    console.error("Error al registrar:", err);
    showSnackbar("❌ Error al crear la cuenta. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   LOGIN EMAIL — paso 1: verificar correo
========================================================= */
window.checkEmailExists = async () => {
  const emailInput = document.getElementById("loginEmail");
  const errorEl = document.getElementById("loginEmailError");
  const correo = emailInput?.value.trim().toLowerCase();
  const btn = document.querySelector("#loginStepEmail .btn-primary");

  errorEl.textContent = "";

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errorEl.textContent = "Ingresa un correo válido.";
    return;
  }

  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Verificando...`;

  try {
    const correosRef = collection(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "correos",
    );
    const snap = await getDocs(
      query(correosRef, where("correo", "==", correo)),
    );

    if (snap.empty) {
      errorEl.innerHTML = `
        ❌ Este correo no está registrado.
        <button class="link-btn-inline"
          onclick="closeModal('loginModal');openRegisterModal()">
          Crear cuenta gratis
        </button>`;
      return;
    }
    const tipoLogin = snap.docs[0].data().tipo;
    if (tipoLogin === "google") {
      errorEl.innerHTML = `
      <span>🔒 Esta cuenta fue creada con Google.</span><br>
      <button class="link-btn-inline" onclick="loginGoogle()">
        Continuar con Google
      </button>`;
      return;
    }

    document.getElementById("loginStepEmail").style.display = "none";
    document.getElementById("loginStepPassword").style.display = "block";
    document.getElementById("loginEmailChipText").textContent = correo;
    document.getElementById("loginPassword").focus();
  } catch (err) {
    console.error("Error verificando correo:", err);
    errorEl.textContent = "Error al verificar. Intenta de nuevo.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   LOGIN EMAIL — paso 2: autenticar
========================================================= */
window.doEmailLogin = async () => {
  const correo = document
    .getElementById("loginEmail")
    .value.trim()
    .toLowerCase();
  const pass = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginPassError");
  const btn = document.getElementById("btnDoLogin");

  errorEl.textContent = "";

  if (!pass) {
    errorEl.textContent = "Ingresa tu contraseña.";
    return;
  }

  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Ingresando...`;

  try {
    const { signInWithEmailAndPassword } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    const result = await signInWithEmailAndPassword(auth, correo, pass);
    GOOGLE_USER = result.user;

    closeModal("loginModal");
    showSplash(result.user);
  } catch (err) {
    console.error("Error login email:", err);
    const code = err?.code || "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      errorEl.textContent = "❌ Contraseña incorrecta. Inténtalo de nuevo.";
    } else if (code === "auth/too-many-requests") {
      errorEl.textContent = "⚠️ Demasiados intentos. Espera unos minutos.";
    } else if (code === "auth/user-disabled") {
      errorEl.textContent = "🚫 Esta cuenta fue suspendida.";
    } else {
      errorEl.textContent = "Error inesperado. Intenta de nuevo.";
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

window.backToEmail = () => {
  document.getElementById("loginStepPassword").style.display = "none";
  document.getElementById("loginStepEmail").style.display = "block";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginPassError").textContent = "";
};

function _resetLoginModal() {
  document.getElementById("loginStepEmail").style.display = "block";
  document.getElementById("loginStepPassword").style.display = "none";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginEmailError").textContent = "";
  document.getElementById("loginPassError").textContent = "";
}

/* =========================================================
   SPLASH SCREEN
========================================================= */
async function showSplash(user) {
  if (splashShown) return;
  splashShown = true;

  document.getElementById("mainUI").style.display = "none";
  document.getElementById("splashScreen").classList.add("visible");

  await delay(600);
  markStep("step1");
  await delay(700);
  markStep("step2");

  const snap = await getDoc(
    doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", user.uid),
  );

  await delay(600);
  markStep("step3");
  await delay(700);

  const data = snap.exists() ? snap.data() : {};
  const nombre = data.nombre || user.displayName || "Usuario";
  const username = data.nombre_user || "@" + user.email.split("@")[0];

  document.getElementById("wName").textContent = nombre;
  document.getElementById("wUser").textContent = username;
  document.getElementById("wPoints").textContent = data.puntos ?? 500;

  document.getElementById("sValidating").classList.add("fade-out");
  await delay(450);
  document.getElementById("sValidating").style.display = "none";
  document.getElementById("sWelcome").classList.add("visible");

  const idTienda = data.id_tienda_propietario?.trim();

  document.getElementById("btnEnter").onclick = async () => {
    if (!idTienda) {
      showSnackbar("⚠️ No tienes un ID de tienda vinculado", "warning");
      setTimeout(() => abrirPantallaSocio(), 1200);
      return;
    }
    try {
      const lugarSnap = await getDoc(doc(db, "lugares", idTienda));
      if (!lugarSnap.exists()) {
        showSnackbar("❌ Tu ID de tienda no existe o fue eliminado", "error");
        setTimeout(() => abrirPantallaSocio(), 1400);
        return;
      }
      const data2 = lugarSnap.data();
      const departamento = data2.departamento || "lima";
      const provincia = data2.provincia || "barranca";
      const localidad = data2.localidad || "barranca";
      sessionStorage.setItem("tiendaId", idTienda);
      sessionStorage.setItem("departamento", departamento);
      sessionStorage.setItem("provincia", provincia);
      sessionStorage.setItem("localidad", localidad);
      window.location.href = `./../../dasboard/panel_perfil.html?id=${encodeURIComponent(idTienda)}&departamento=${encodeURIComponent(departamento)}&provincia=${encodeURIComponent(provincia)}&localidad=${encodeURIComponent(localidad)}`;
    } catch (err) {
      console.error(err);
      showSnackbar("Error al validar tu tienda", "error");
      setTimeout(() => abrirPantallaSocio(), 1400);
    }
  };
}

/* =========================================================
   PANTALLA SELECTOR DE TIENDA (sin ID vinculado)
========================================================= */
async function abrirPantallaSocio() {
  document.getElementById("splashScreen").style.display = "none";
  document.getElementById("selectorSocioScreen").classList.add("active");
  await inicializarSelectoresUbicacion("selector");
  upgradeAllCoolSelects(document.getElementById("selectorSocioScreen")); // 👈
}
/* =========================================================
   CONTINUAR PANEL (desde selectorSocioScreen)
========================================================= */
window.continuarPanel = async () => {
  const valor = document.getElementById("selectorInput").value.trim();

  if (!valor || valor.length < 4) {
    showSnackbar("⚠️ Ingresa un ID válido", "warning");
    return;
  }
  if (
    !seleccionUbicacion.selector.dep ||
    !seleccionUbicacion.selector.prov ||
    !seleccionUbicacion.selector.dist
  ) {
    showSnackbar("⚠️ Selecciona departamento, provincia y distrito", "warning");
    return;
  }

  const btn = document.getElementById("btnContinuar");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Validando...`;

  try {
console.log("[continuarPanel] Valores usados para buscar tienda:", {
  departamento: seleccionUbicacion.selector.dep,
  provincia: seleccionUbicacion.selector.prov,
  distrito: seleccionUbicacion.selector.dist,
  idTienda: valor,
});

const tiendaRef = tiendaDoc(seleccionUbicacion.selector.dist, "tiendas", valor);

    console.log("[continuarPanel] Path de tiendaRef:", tiendaRef.path);

    const snap = await getDoc(tiendaRef);

    console.log("[continuarPanel] ¿Existe el documento?:", snap.exists());
    if (snap.exists()) {
      console.log("[continuarPanel] Data encontrada:", snap.data());
    }

    if (!snap.exists()) {
      showSnackbar(
        "❌ Ese ID no existe. Verifica e intenta de nuevo.",
        "error",
      );
      return;
    }

   sessionStorage.setItem("departamento", seleccionUbicacion.selector.dep);
sessionStorage.setItem("provincia", seleccionUbicacion.selector.prov);
sessionStorage.setItem("localidad", seleccionUbicacion.selector.dist);
sessionStorage.setItem("tiendaId", valor);
window.location.href = `./../../dasboard/panel_perfil.html?id=${encodeURIComponent(valor)}&departamento=${encodeURIComponent(seleccionUbicacion.selector.dep)}&provincia=${encodeURIComponent(seleccionUbicacion.selector.prov)}&localidad=${encodeURIComponent(seleccionUbicacion.selector.dist)}`;
  } catch (err) {
    console.error(err);
    showSnackbar("Error al validar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   ACCEDER SOCIO (modal desde welcome screen)
========================================================= */
window.accederSocio = async () => {
  const idTienda = document.getElementById("socioId").value.trim();
  const dep = document.getElementById("socioDepartamento").value;
  const prov = document.getElementById("socioProvincia").value;
  const dist = document.getElementById("socioDistrito").value;

  if (!idTienda || !dep || !prov || !dist) {
    showSnackbar("⚠️ Completa todos los campos", "warning");
    return;
  }
  if (idTienda.length < 4) {
    showSnackbar("⚠️ ID inválido", "warning");
    return;
  }

  const btn = document.getElementById("btnAccederSocio");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Validando...`;

  try {
    const snap = await getDoc(tiendaDoc(dist, "tiendas", idTienda));
    if (!snap.exists()) {
      showSnackbar(
        "❌ Ese ID no existe. Verifica e intenta de nuevo.",
        "error",
      );
      return;
    }
    sessionStorage.setItem("tiendaId", idTienda);
    sessionStorage.setItem("departamento", dep);
    sessionStorage.setItem("provincia", prov);
    sessionStorage.setItem("localidad", dist);

    const rutaFinal = `./../../dasboard/panel_perfil.html?id=${encodeURIComponent(idTienda)}&departamento=${dep}&provincia=${prov}&localidad=${dist}`;
    console.log("[accederSocio] Redirigiendo a:", rutaFinal); // 👈 log agregado

    window.location.href = rutaFinal;
  } catch (err) {
    console.error(err);
    showSnackbar("Error al validar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

window.switchToUserLogin = () => {
  closeModal("socioModal");
  openLoginModal();
};

window.validarCorreoGmail = (input) => {
  const val = input.value.trim().toLowerCase();
  const errorEl = document.getElementById("errCorreo");
  const hintEl = document.getElementById("hintCorreo");

  errorEl.textContent = "";
  errorEl.style.display = "none";
  hintEl.style.display = "none";

  if (!val) return;

  if (val.includes("@") && !val.endsWith("@gmail.com")) {
    errorEl.textContent = "Solo se permiten correos @gmail.com.";
    errorEl.style.display = "block";
    return;
  }

  if (/^[^\s@]+@gmail\.com$/.test(val)) {
    hintEl.style.display = "flex";
  }
};

/* =========================================================
   AUTH STATE — auto-login si ya hay sesión
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await procesarLoginGoogle(user);
});

/* =========================================================
   RESULTADO DE REDIRECT (login Google en móvil)
========================================================= */
getRedirectResult(auth)
  .then(async (result) => {
    if (result && result.user) {
      await procesarLoginGoogle(result.user);
    }
  })
  .catch((err) => {
    console.error("Error en redirect de Google:", err);
    showSnackbar("❌ Error al iniciar sesión con Google", "error");
  });

/* =========================================================
   BACKGROUND SLIDER + DYNAMIC TITLE
========================================================= */
const slides = document.querySelectorAll(".slide");
const titleElement = document.getElementById("dynamicTitle");
const titles = [
  "Encuentra tu próximo destino favorito",
  "Tu aventura con Geinz comienza hoy",
  "Bienvenido a Geinz, tu espacio ideal",
  "Descubre los mejores negocios locales",
  "Todo lo que necesitas, cerca de ti",
  "Explora, conecta y disfruta tu ciudad",
  "Geinz, tu guía de negocios locales",
];

let currentSlide = 0;
if (titleElement) titleElement.textContent = titles[0];

setInterval(() => {
  slides[currentSlide]?.classList.remove("active");
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide]?.classList.add("active");
  if (titleElement)
    titleElement.textContent = titles[currentSlide % titles.length];
}, 5000);

/* =========================================================
   ESC CLOSE
========================================================= */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeModal("loginModal");
  closeModal("registerModal");
  closeModal("socioModal");
});

/* =========================================================
   BOTÓN ACCEDER SOCIO
========================================================= */
document
  .getElementById("btnAccederSocio")
  ?.addEventListener("click", accederSocio);

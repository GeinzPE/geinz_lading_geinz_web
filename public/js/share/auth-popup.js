import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 👇 mismo db.js que usa login.js: misma base de datos, mismas colecciones
import { auth, db } from "../db/db.js";

const TAG = "[auth-popup]";
const log = (...a) => console.log(TAG, ...a);
const logErr = (...a) => console.error(TAG, ...a);
const $ = (id) => document.getElementById(id);

const functions = getFunctions(auth.app, "us-central1");
const qs = new URLSearchParams(location.search);

// ── Parámetros ──
let origenNegocio = null;
try { origenNegocio = new URL(qs.get("o")).origin; } catch {}

let returnUrl = null;
try {
  const u = new URL(qs.get("r"));
  if (origenNegocio && u.origin === origenNegocio) returnUrl = u;
} catch {}

// ── Branding del negocio (blindado: nunca hardcodeamos un nombre aquí) ──
const nombre = (qs.get("n") || "").trim().slice(0, 80);
const logo = qs.get("l") || "";

const rawColor = qs.get("c") || "";
const [r, g, b] = /^\d{1,3},\d{1,3},\d{1,3}$/.test(rawColor)
  ? rawColor.split(",").map((n) => Math.min(255, +n))
  : [139, 92, 246];
const root = document.documentElement.style;
root.setProperty("--rgb", `${r},${g},${b}`);
// Si el color del negocio es muy claro, el texto del botón principal pasa a oscuro
root.setProperty("--on", (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#0a0a0b" : "#fff");

if (nombre) $("bizName").textContent = nombre;

// Logo con skeleton mientras carga; si falla o tarda, se muestra la letra
const avatar = $("avatar");
function ponerLetra() {
  const d = document.createElement("div");
  d.className = "letter";
  d.textContent = (nombre || "?").charAt(0).toUpperCase();
  avatar.replaceChildren(d);
  avatar.classList.remove("is-loading");
}

if (logo.startsWith("https://")) {
  const img = new Image();
  img.className = "logo";
  img.alt = nombre || "Logo";
  img.decoding = "async";
  img.onload = () => {
    avatar.classList.remove("is-loading");
    img.classList.add("in");
  };
  img.onerror = ponerLetra;
  avatar.appendChild(img);
  img.src = logo;
  setTimeout(() => {
    if (avatar.classList.contains("is-loading")) ponerLetra();
  }, 6000);
} else {
  ponerLetra();
}

if (returnUrl) {
  const back = $("backToBiz");
  back.href = returnUrl.toString();
  back.hidden = false;
}

/* =========================================================
   COLECCIONES — idénticas a login.js, misma base de datos
========================================================= */
const RAIZ = ["Trabajadores_Usuarios_Drivers", "users"];
const correosCol = () => collection(db, ...RAIZ, "correos");
const correoDoc = (uid) => doc(db, ...RAIZ, "correos", uid);
const usernameDoc = (username) => doc(db, ...RAIZ, "nombres_user", username);
const userDoc = (uid) => doc(db, ...RAIZ, "users", uid);

/* =========================================================
   PAÍSES (prefijo telefónico + nacionalidad) — igual a login.js
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

let paisesCargados = false;
function cargarSelectsPais() {
  if (paisesCargados) return;
  paisesCargados = true;

  const selTel = $("regPaisTel");
  const selNac = $("regNacionalidad");

  PAISES.forEach((p) => {
    const optTel = document.createElement("option");
    optTel.value = p.cod;
    optTel.textContent = `${p.flag}  ${p.nombre}  ${p.tel}`;
    optTel.dataset.flag = p.flag;
    optTel.dataset.tel = p.tel;
    selTel.appendChild(optTel);

    const optNac = document.createElement("option");
    optNac.value = p.cod;
    optNac.textContent = `${p.flag}  ${p.nombre}`;
    optNac.dataset.nombre = p.nombre;
    selNac.appendChild(optNac);
  });

  selTel.value = "pe";
  selNac.value = "pe";
  $("regPrefixFlag").textContent = "🇵🇪";
  $("regPrefixCode").textContent = "+51";
  $("regCodPais").value = "pe";
  $("regNombrePais").value = "Perú";

  selTel.addEventListener("change", () => {
    const opt = selTel.options[selTel.selectedIndex];
    $("regPrefixFlag").textContent = opt.dataset.flag;
    $("regPrefixCode").textContent = opt.dataset.tel;
  });

  selNac.addEventListener("change", () => {
    const opt = selNac.options[selNac.selectedIndex];
    $("regCodPais").value = selNac.value;
    $("regNombrePais").value = opt.dataset.nombre;
  });
}

/* =========================================================
   UBIGEO (departamento / provincia / distrito) — igual a login.js
========================================================= */
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
  return UBIGEO_DEPARTAMENTOS.map((d) => ({ id: d.id_ubigeo, nombre: d.nombre_ubigeo }));
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

function slugify(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

// Igual que en login.js: departamento/provincia guardan el id de ubigeo,
// localidad guarda el slug del nombre del distrito.
const ubicacionReg = { dep: "", prov: "", dist: "" };

let ubicacionCargada = false;
async function initUbicacionRegistro() {
  if (ubicacionCargada) return;
  ubicacionCargada = true;

  const selDep = $("regDepartamento");
  const selProv = $("regProvincia");
  const selDist = $("regDistrito");

  selDep.innerHTML = `<option value="" disabled selected hidden>Cargando...</option>`;
  try {
    const deps = await obtenerDepartamentos();
    selDep.innerHTML =
      `<option value="" disabled selected hidden>Selecciona</option>` +
      deps.map((d) => `<option value="${d.id}">${d.nombre}</option>`).join("");
  } catch (err) {
    logErr("Error cargando departamentos:", err);
    selDep.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    return;
  }

  selDep.addEventListener("change", async () => {
    ubicacionReg.dep = selDep.value;
    ubicacionReg.prov = "";
    ubicacionReg.dist = "";
    selProv.disabled = true;
    selDist.disabled = true;
    selDist.innerHTML = `<option value="" disabled selected hidden>Elige provincia</option>`;
    selProv.innerHTML = `<option value="" disabled selected hidden>Cargando...</option>`;
    try {
      const provincias = await obtenerProvincias(selDep.value);
      selProv.innerHTML =
        `<option value="" disabled selected hidden>Selecciona</option>` +
        provincias.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
      selProv.disabled = false;
    } catch (err) {
      logErr("Error cargando provincias:", err);
      selProv.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    }
  });

  selProv.addEventListener("change", async () => {
    ubicacionReg.prov = selProv.value;
    ubicacionReg.dist = "";
    selDist.disabled = true;
    selDist.innerHTML = `<option value="" disabled selected hidden>Cargando...</option>`;
    try {
      const distritos = await obtenerDistritos(ubicacionReg.dep, selProv.value);
      selDist.innerHTML =
        `<option value="" disabled selected hidden>Selecciona</option>` +
        distritos.map((d) => `<option value="${d.id}">${d.nombre}</option>`).join("");
      selDist.disabled = false;
    } catch (err) {
      logErr("Error cargando distritos:", err);
      selDist.innerHTML = `<option value="" disabled selected hidden>Error al cargar</option>`;
    }
  });

  selDist.addEventListener("change", () => {
    const opt = selDist.options[selDist.selectedIndex];
    ubicacionReg.dist = slugify(opt.textContent);
  });
}

/* =========================================================
   Vistas
========================================================= */
const views = {
  main: $("viewMain"),
  login: $("viewLogin"),
  register: $("viewRegister"),
  loading: $("viewLoading"),
};
const titles = {
  main: "Inicia sesión",
  login: "Iniciar sesión",
  register: "Crear cuenta",
  loading: "Un momento",
};
let current = "main";

function show(name) {
  if (name !== "loading") current = name;
  Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
  $("title").textContent = titles[name];
  $("msg").hidden = name !== "main";
  $("error").textContent = "";
  $("box").classList.toggle("is-wide", name === "register");
}
$("btnGoLogin").addEventListener("click", () => show("login"));
$("btnGoRegister").addEventListener("click", () => {
  show("register");
  cargarSelectsPais();
  initUbicacionRegistro();
  const fechaInput = $("regFechaNac");
  if (fechaInput) fechaInput.max = new Date().toISOString().split("T")[0];
});
document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show("main")));

/* =========================================================
   Login de 2 pasos: correo → contraseña (igual a login.js)
========================================================= */
function volverAPasoCorreo() {
  $("loginStepPassword").hidden = true;
  $("loginStepEmail").hidden = false;
  $("loginPass").value = "";
  $("loginPassError").textContent = "";
}
$("btnChangeEmail").addEventListener("click", volverAPasoCorreo);

async function checkEmailExists() {
  const correo = $("loginEmail").value.trim().toLowerCase();
  $("loginEmailError").textContent = "";
  $("loginEmailError").innerHTML = "";

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    $("loginEmailError").textContent = "Ingresa un correo válido.";
    return;
  }

  const btn = $("btnCheckEmail");
  const btnOrig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Verificando...";

  try {
    const snap = await getDocs(query(correosCol(), where("correo", "==", correo)));

    if (snap.empty) {
      $("loginEmailError").innerHTML = `Este correo no está registrado.<button type="button" class="btn-link-inline" id="linkIrRegistro">Crear cuenta</button>`;
      $("linkIrRegistro").addEventListener("click", () => {
        show("register");
        cargarSelectsPais();
        initUbicacionRegistro();
        const fechaInput = $("regFechaNac");
        if (fechaInput) fechaInput.max = new Date().toISOString().split("T")[0];
      });
      return;
    }

    const tipoLogin = snap.docs[0].data().tipo;
    if (tipoLogin === "google") {
      $("loginEmailError").innerHTML = `Esta cuenta fue creada con Google.<button type="button" class="btn-link-inline" id="linkUsarGoogle">Continuar con Google</button>`;
      $("linkUsarGoogle").addEventListener("click", () => $("btnGoogle").click());
      return;
    }

    $("loginStepEmail").hidden = true;
    $("loginStepPassword").hidden = false;
    $("loginEmailChipText").textContent = correo;
    $("loginPass").focus();
  } catch (err) {
    logErr("Error verificando correo:", err);
    $("loginEmailError").textContent = "Error al verificar. Intenta de nuevo.";
  } finally {
    btn.disabled = false;
    btn.textContent = btnOrig;
  }
}
$("btnCheckEmail").addEventListener("click", checkEmailExists);

$("viewLogin").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("loginStepPassword").hidden) {
    checkEmailExists();
    return;
  }
  const correo = $("loginEmail").value.trim().toLowerCase();
  const pass = $("loginPass").value;
  if (!pass) {
    $("loginPassError").textContent = "Ingresa tu contraseña.";
    return;
  }
  ejecutar(() => signInWithEmailAndPassword(auth, correo, pass), "Verificando tu cuenta");
});

/* =========================================================
   Registro completo (mismos campos y misma base que login.js)
========================================================= */
function setErr(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
}

function validarRegistro() {
  [
    "errRegNombre", "errRegUsername", "errRegTelefono", "errRegGenero",
    "errRegUbicacion", "errRegFecha", "errRegNacionalidad", "errRegEmail",
    "errRegPass", "errRegTerms",
  ].forEach((id) => setErr(id, ""));

  const datos = {
    nombre: $("regNombre").value.trim(),
    apellido: $("regApellido").value.trim(),
    username: $("regUsername").value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
    telefono: $("regTelefono").value.trim().replace(/\D/g, ""),
    prefijoTel: $("regPrefixCode").textContent.trim() || "+51",
    genero: $("regGenero").value,
    fechaNac: $("regFechaNac").value,
    codPais: $("regCodPais").value,
    nombrePais: $("regNombrePais").value,
    correo: $("regEmail").value.trim().toLowerCase(),
    pass1: $("regPass").value,
    pass2: $("regPass2").value,
    terminos: $("regTerms").checked,
    ubicacion: { ...ubicacionReg },
  };

  let ok = true;

  if (!datos.nombre || datos.nombre.length < 2 || !datos.apellido || datos.apellido.length < 2) {
    setErr("errRegNombre", "Ingresa un nombre y apellido válidos (mín. 2 caracteres).");
    ok = false;
  }
  if (!datos.username || datos.username.length < 3) {
    setErr("errRegUsername", "El usuario debe tener al menos 3 caracteres.");
    ok = false;
  }
  if (!datos.telefono || !/^\d{7,15}$/.test(datos.telefono)) {
    setErr("errRegTelefono", "Número inválido (7–15 dígitos).");
    ok = false;
  }
  if (!datos.genero) {
    setErr("errRegGenero", "Selecciona tu género.");
    ok = false;
  }
  if (!datos.ubicacion.dep || !datos.ubicacion.prov || !datos.ubicacion.dist) {
    setErr("errRegUbicacion", "Selecciona departamento, provincia y distrito.");
    ok = false;
  }
  if (!datos.fechaNac) {
    setErr("errRegFecha", "Selecciona tu fecha de nacimiento.");
    ok = false;
  } else {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const nacido = new Date(datos.fechaNac + "T00:00:00");
    if (isNaN(nacido.getTime()) || nacido >= hoy) {
      setErr("errRegFecha", "Fecha inválida.");
      ok = false;
    } else {
      const edad =
        hoy.getFullYear() - nacido.getFullYear() -
        (hoy < new Date(hoy.getFullYear(), nacido.getMonth(), nacido.getDate()) ? 1 : 0);
      if (edad < 13) {
        setErr("errRegFecha", "Debes tener al menos 13 años.");
        ok = false;
      } else if (edad > 110) {
        setErr("errRegFecha", "Fecha de nacimiento inválida.");
        ok = false;
      }
    }
  }
  if (!datos.codPais || !datos.nombrePais) {
    setErr("errRegNacionalidad", "Selecciona tu nacionalidad.");
    ok = false;
  }
  if (!datos.correo) {
    setErr("errRegEmail", "Ingresa tu correo electrónico.");
    ok = false;
  } else if (!/^[^\s@]+@gmail\.com$/.test(datos.correo)) {
    setErr("errRegEmail", "Solo se permiten correos @gmail.com.");
    ok = false;
  }
  if (!datos.pass1 || datos.pass1.length < 8) {
    setErr("errRegPass", "La contraseña debe tener al menos 8 caracteres.");
    ok = false;
  } else if (!/(?=.*[A-Z])/.test(datos.pass1) && !/(?=.*[0-9])/.test(datos.pass1)) {
    setErr("errRegPass", "Incluye al menos una mayúscula o un número.");
    ok = false;
  } else if (datos.pass1 !== datos.pass2) {
    setErr("errRegPass", "Las contraseñas no coinciden.");
    ok = false;
  }
  if (!datos.terminos) {
    setErr("errRegTerms", "Debes aceptar los términos para continuar.");
    ok = false;
  }

  return ok ? datos : null;
}

async function crearCuentaConDatos(datos) {
  // Username único
  const usernameSnap = await getDoc(usernameDoc(datos.username));
  if (usernameSnap.exists()) {
    const e = new Error("username en uso");
    e.code = "custom/username-en-uso";
    throw e;
  }
  // Correo único
  const correoSnap = await getDocs(query(correosCol(), where("correo", "==", datos.correo)));
  if (!correoSnap.empty) {
    const e = new Error("correo en uso");
    e.code = "custom/correo-en-uso";
    throw e;
  }

  const cred = await createUserWithEmailAndPassword(auth, datos.correo, datos.pass1);
  const uid = cred.user.uid;
  const usernameFinal = "@" + datos.username.replace(/^@/, "");
  const fechaRegistro = new Date().toLocaleDateString("es-PE");

  await setDoc(correoDoc(uid), { correo: datos.correo, tipo: "email" });
  await setDoc(usernameDoc(datos.username), { id_registrado: uid, nombres_user: usernameFinal });
  await setDoc(userDoc(uid), {
    nombre: datos.nombre,
    apellido: datos.apellido,
    correo: datos.correo,
    nombre_user: usernameFinal,
    id_user: uid,
    genero: datos.genero,
    departamento: datos.ubicacion.dep,
    provincia: datos.ubicacion.prov,
    localidad: datos.ubicacion.dist,
    fecha_nac: datos.fechaNac,
    fecha_registrada: fechaRegistro,
    puntos: 500,
    cod_pais: datos.codPais,
    nacionalidad_nacimiento: datos.nombrePais,
    tipo_login: "email",
    contacto: {
      cod_telefonico: datos.prefijoTel,
      nombre_pais_numero: datos.nombrePais,
      numero_user: Number(datos.telefono),
    },
    creado_server: serverTimestamp(),
  });
}

$("viewRegister").addEventListener("submit", (e) => {
  e.preventDefault();
  const datos = validarRegistro();
  if (!datos) return;
  ejecutar(() => crearCuentaConDatos(datos), "Creando tu cuenta");
});

/* =========================================================
   Utilidades compartidas (loading / errores / entrega de token)
   — sin cambios respecto al original, usadas también por Google
========================================================= */
function setLoadingText(text) {
  $("loadingText").textContent = text;
}
function mensajeError(e) {
  const m = {
    "auth/invalid-credential": "Correo o contraseña incorrectos",
    "auth/wrong-password": "Correo o contraseña incorrectos",
    "auth/user-not-found": "No existe una cuenta con ese correo",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Inicia sesión.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
    "auth/invalid-email": "El correo no es válido",
    "auth/too-many-requests": "Demasiados intentos, espera un momento",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google, inténtalo de nuevo",
    "auth/cancelled-popup-request": "Se canceló el acceso con Google, inténtalo de nuevo",
    "auth/popup-blocked": "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes.",
    "auth/network-request-failed": "Sin conexión, revisa tu internet",
    "custom/username-en-uso": "Ese nombre de usuario ya está en uso.",
    "custom/correo-en-uso": "Este correo ya tiene una cuenta. Inicia sesión.",
  };
  return m[e.code] || "No se pudo completar la solicitud, inténtalo de nuevo";
}

// Pide el token al servidor y lo entrega al dominio del negocio
async function entregarToken() {
  setLoadingText(nombre ? `Entrando a ${nombre}` : "Entrando");
  const emitir = httpsCallable(functions, "emitirTokenDominio");
  const { data } = await emitir({ origin: origenNegocio });
  await signOut(auth);

  setLoadingText(nombre ? `Listo, volviendo a ${nombre}` : "Listo, volviendo al negocio");
  if (window.opener) {
    window.opener.postMessage({ type: "wl-auth", token: data.token }, origenNegocio);
    window.close();
    // Si el navegador no deja cerrar la ventana, avisamos en vez de dejar la carga infinita
    setTimeout(() => setLoadingText("Listo. Ya puedes cerrar esta ventana."), 1500);
  } else {
    returnUrl.hash = "wl_token=" + encodeURIComponent(data.token);
    window.location.replace(returnUrl.toString());
  }
}

// Firebase tarda hasta ~10 s en notar que cerraste el popup de Google sin entrar.
// Lo detectamos antes: si esta ventana recupera el foco y el login no llega en 2 s, se cancela.
function vigilarPopupGoogle(alCancelar) {
  let huboBlur = false;
  let timer = null;
  const onBlur = () => {
    huboBlur = true;
    clearTimeout(timer);
  };
  const onFocus = () => {
    if (!huboBlur) return;
    clearTimeout(timer);
    timer = setTimeout(alCancelar, 2000);
  };
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}

// Envuelve cada método (Google, login por correo, registro) con las mismas
// validaciones, estado de carga y manejo de errores.
let trabajando = false;
let corrida = 0;

async function ejecutar(fn, mensajeCarga, { popup = false } = {}) {
  if (trabajando) return;
  if (!origenNegocio) {
    $("error").textContent = "Falta el parámetro ?o= en la URL.";
    return;
  }
  if (!window.opener && !returnUrl) {
    $("error").textContent = "No hay forma de volver al negocio. Abre el login desde el perfil del negocio.";
    return;
  }

  const id = ++corrida;
  trabajando = true;
  show("loading");
  setLoadingText(mensajeCarga);

  // Si el popup de Google se cierra sin login, volvemos al inicio sin dejar la carga colgada
  const dejarDeVigilar = popup
    ? vigilarPopupGoogle(() => {
        if (id !== corrida || !trabajando) return;
        trabajando = false;
        show(current);
      })
    : () => {};

  try {
    await fn();
    dejarDeVigilar();
    if (id !== corrida) return;
    // Google ya cerró su ventana: la carga se queda visible hasta terminar
    trabajando = true;
    show("loading");
    log("login OK");
    await entregarToken();
  } catch (e) {
    dejarDeVigilar();
    if (id !== corrida) return;
    logErr("FALLÓ:", e.code || "(sin code)", "|", e.message);
    const cancelado =
      e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request";
    trabajando = false;
    show(current);
    if (!cancelado) $("error").textContent = mensajeError(e);
  }
}

// ── Google (sin cambios) ──
$("btnGoogle").addEventListener("click", () =>
  ejecutar(() => signInWithPopup(auth, new GoogleAuthProvider()), "Conectando con Google", { popup: true }),
);
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
import { auth } from "../db/db.js";

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

// ── Branding del negocio ──
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

// ── Vistas ──
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
  $("msg").hidden = name === "loading";
  $("error").textContent = "";
}
$("btnGoLogin").addEventListener("click", () => show("login"));
$("btnGoRegister").addEventListener("click", () => show("register"));
document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show("main")));

// ── Utilidades ──
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
  };
  return m[e.code] || "No se pudo iniciar sesión, inténtalo de nuevo";
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

// Envuelve cada método de login con las mismas validaciones, estado de carga y manejo de errores
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

// ── Google ──
$("btnGoogle").addEventListener("click", () =>
  ejecutar(() => signInWithPopup(auth, new GoogleAuthProvider()), "Conectando con Google", { popup: true }),
);

// ── Correo: iniciar sesión ──
$("viewLogin").addEventListener("submit", (e) => {
  e.preventDefault();
  ejecutar(
    () => signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPass").value),
    "Verificando tu cuenta",
  );
});

// ── Correo: crear cuenta ──
$("viewRegister").addEventListener("submit", (e) => {
  e.preventDefault();
  ejecutar(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      $("regEmail").value.trim(),
      $("regPass").value,
    );
    await updateProfile(cred.user, { displayName: $("regName").value.trim() });
  }, "Creando tu cuenta");
});
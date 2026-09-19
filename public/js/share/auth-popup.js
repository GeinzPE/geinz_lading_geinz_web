import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// Reutiliza tu proyecto ya inicializado (mismo db.js que usa perfil_negocio_v2.js)
import { auth } from "../db/db.js";

const TAG = "[auth-popup]";
const log = (...a) => console.log(TAG, ...a);
const logErr = (...a) => console.error(TAG, ...a);

// Cualquier error que no se capture en ningún lado también queda registrado
window.addEventListener("error", (e) => logErr("error global:", e.message));
window.addEventListener("unhandledrejection", (e) =>
  logErr("promesa sin capturar:", e.reason),
);

const functions = getFunctions(auth.app, "us-central1");

const msg = document.getElementById("msg");
const btn = document.getElementById("btnGoogle");

// Dominio del negocio que abrió este pop-up (viene en ?o=https://tienda-cliente.com)
const oParam = new URLSearchParams(location.search).get("o");
let origenNegocio = null;
try {
  origenNegocio = new URL(oParam).origin;
} catch (e) {
  logErr("El parámetro ?o= no es una URL válida:", oParam, "|", e.message);
}

// ── Diagnóstico al cargar ──
log("script cargado ✅");
log("href:", location.href);
log("parámetro o:", oParam, "→ origen:", origenNegocio);
log("window.name:", window.name, "(debe ser 'wl_login' si lo abrió el botón del perfil)");
log("window.opener:", window.opener ? "existe ✅" : "NULO ❌");
log("referrer:", document.referrer || "(vacío)");
log(
  "firebase → authDomain:",
  auth.app.options.authDomain,
  "| projectId:",
  auth.app.options.projectId,
);
log("hostname de esta página:", location.hostname);

btn.addEventListener("click", async () => {
  log("click en 'Continuar con Google'");

  if (!origenNegocio) {
    logErr("Abortado: falta o es inválido el parámetro ?o=");
    msg.textContent =
      "Falta el parámetro ?o= en la URL. ¿Abriste esta página directamente en vez de desde el perfil del negocio?";
    return;
  }
  if (!window.opener) {
    logErr("Abortado: window.opener es nulo (posible COOP o se abrió directo)");
    msg.textContent =
      "Esta ventana perdió la conexión con el perfil del negocio (opener nulo). Puede ser un encabezado COOP.";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Conectando…";

  try {
    // 1) Login con Google
    log("1) abriendo signInWithPopup…");
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    log("1) login OK → uid:", cred.user.uid, "| email:", cred.user.email);

    // 2) Pide el custom token al servidor
    log("2) llamando a emitirTokenDominio con origin:", origenNegocio);
    const emitir = httpsCallable(functions, "emitirTokenDominio");
    const { data } = await emitir({ origin: origenNegocio });
    log("2) token recibido ✅ (longitud:", data?.token?.length, ")");

    // 3) Entrega el token al origen exacto del negocio
    log("3) enviando postMessage a:", origenNegocio);
    window.opener.postMessage({ type: "wl-auth", token: data.token }, origenNegocio);
    log("3) postMessage enviado ✅");

    await signOut(auth);
    log("4) signOut hecho, cerrando ventana");
    window.close();
  } catch (e) {
    logErr("FALLÓ:", e.code || "(sin code)", "|", e.message, "|", e);
    msg.textContent =
      "Error: " + (e.code || e.message) + " — cierra esta ventana e inténtalo de nuevo.";
    btn.disabled = false;
  }
});
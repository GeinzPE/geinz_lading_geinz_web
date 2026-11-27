import { onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "/js/db/db.js";

const AUTH_ORIGIN = "https://geinztech.com";
export const LOGIN_URL = "/login.html";
export const esPropio = !["geinztech.com", "www.geinztech.com"].includes(location.hostname);

// Al volver del login en dominio propio, la URL trae #wl_token=...
export async function loginPorToken() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = p.get("wl_token");
  if (!t) return;
  history.replaceState(null, "", location.pathname + location.search);
  try { await signInWithCustomToken(auth, t); }
  catch (e) { console.error("[sesion] signInWithCustomToken:", e); }
}

export function esperarAuth() {
  return new Promise((res) => {
    const un = onAuthStateChanged(auth, (u) => { un(); res(u?.uid || null); });
  });
}

export function alCambiarSesion(cb) {
  return onAuthStateChanged(auth, (u) => cb(u?.uid || null));
}

export function abrirLoginPopup({ nombre = "", logo = "" } = {}) {
  const cs = getComputedStyle(document.documentElement);
  const rgb = [1, 2, 3].map((_, i) => cs.getPropertyValue(["--dr", "--dg", "--db"][i]).trim()).join(",") || "139,92,246";
  const u = new URL(`${AUTH_ORIGIN}/auth-popup.html`);
  u.searchParams.set("o", location.origin);
  u.searchParams.set("r", location.href.split("#")[0]);
  u.searchParams.set("n", nombre);
  if (logo) u.searchParams.set("l", logo);
  u.searchParams.set("c", rgb);
  location.href = u.toString();
}

export function htmlGate(nombre, texto) {
  return `
    <div class="glass card-glow rounded-3xl p-10 text-center fade-in">
      <div class="text-4xl mb-3">🔒</div>
      <h3 class="text-lg font-black mb-2">Inicia sesión para continuar</h3>
      <p class="text-gray-400 text-sm mb-6">${texto} con tu cuenta en ${nombre || "este negocio"}.</p>
      <a id="loginBtn" href="${LOGIN_URL}" class="btn-primary inline-block px-8 py-4 rounded-2xl font-bold text-[15px]">Iniciar sesión</a>
    </div>`;
}
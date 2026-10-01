import {
  addDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";
import { iniciarCamara } from "./scan_camara.js";

const q = new URLSearchParams(location.search);
const L = q.get("l"), T = q.get("t"), S = q.get("s");
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let clave = "";
let total = 0;
let pararCamara = null;
let unsubSesion = null;
let sesionTerminada = false;

const enviar = (codigo, tipo = "scan") =>
  addDoc(tiendaSubCol(L, "tiendas", T, "scan_sesiones", S, "codigos"),
    { codigo, tipo, clave, ts: serverTimestamp() });

/* ══════ Pasos: 0 carga · 1 clave · 2 escáner · 3 terminada ══════ */
function mostrar(paso) {
  $("paso1").hidden = paso !== 1;
  $("pasoCarga").hidden = paso !== 0;
  $("paso2").hidden = paso !== 2;
  $("paso3").hidden = paso !== 3;
}
function marcarPaso(id, estado) {
  const el = $(id);
  el.classList.remove("act", "ok");
  if (estado) el.classList.add(estado);
}
const progreso = (pct) => ($("skBar").style.width = pct + "%");

/* ══════ Sesión terminada: apaga todo ══════ */
async function terminarSesion() {
  if (sesionTerminada) return;
  sesionTerminada = true;

  try { unsubSesion?.(); } catch {}
  unsubSesion = null;

  // apaga la linterna y la cámara por completo
  try { if (linternaOn) await track?.applyConstraints({ advanced: [{ torch: false }] }); } catch {}
  try { pararCamara?.(); } catch {}
  pararCamara = null;
  try { $("v").srcObject?.getTracks().forEach((t) => t.stop()); } catch {}
  $("v").srcObject = null;
  $("flash").hidden = true;

  navigator.vibrate?.([80, 60, 80]);
  $("finTotal").textContent = total
    ? `${total} código${total === 1 ? "" : "s"} escaneado${total === 1 ? "" : "s"} en esta sesión`
    : "";
  $("finTotal").hidden = !total;
  mostrar(3);
}

/* Escucha la sesión: si el dashboard la borra, el celular se entera al instante */
function vigilarSesion() {
  let vistaUnaVez = false;
  unsubSesion = onSnapshot(
    tiendaSubDoc(L, "tiendas", T, "scan_sesiones", S),
    (snap) => {
      if (snap.exists()) { vistaUnaVez = true; return; }
      // El doc ya no existe: el dashboard cerró la sesión
      if (vistaUnaVez || !snap.metadata.fromCache) terminarSesion();
    },
    (err) => {
      // Sin permiso de lectura en las reglas: no se puede vigilar, pero
      // el envío fallido de un código igual detectará el cierre.
      console.warn("No se pudo vigilar la sesión:", err?.code || err);
    },
  );
}

/* ══════ Escaneo ══════ */
async function alEscanear(code) {
  if (sesionTerminada) return;
  try {
    await enviar(code);
    navigator.vibrate?.(60);
    total++;
    $("contador").textContent = `${total} escaneado${total === 1 ? "" : "s"}`;
    $("lastCode").textContent = code;
    $("last").classList.add("show");
    $("histN").textContent = total;
    const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("hist").insertAdjacentHTML("afterbegin", `<div>✔ ${code}<span>${hora}</span></div>`);
    const f = $("frame");
    f.classList.add("ok");
    setTimeout(() => f.classList.remove("ok"), 600);
  } catch {
    terminarSesion(); // si no se puede enviar, la sesión ya no existe
  }
}

/* ══════ Cámara confiable ══════ */
async function pedirPermisoCamara() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw { tipo: "cam", msg: "Tu navegador no permite usar la cámara (se necesita HTTPS)." };
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    s.getTracks().forEach((t) => t.stop());
    await sleep(250);
  } catch (e) {
    const denegado = e?.name === "NotAllowedError";
    throw {
      tipo: "cam",
      msg: denegado
        ? "Permiso de cámara denegado. Actívalo en los ajustes del navegador y vuelve a intentar."
        : "No se pudo acceder a la cámara. Cierra otras apps que la usen e intenta de nuevo.",
    };
  }
}

async function esperarVideoListo(timeout = 4000) {
  const v = $("v");
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (v.readyState >= 2 && v.videoWidth > 0) return true;
    v.play?.().catch(() => {});
    await sleep(120);
  }
  return false;
}

async function abrirCamara() {
  try { pararCamara?.(); } catch {}
  pararCamara = null;
  for (let i = 0; i < 3; i++) {
    try {
      pararCamara = await iniciarCamara($("v"), alEscanear);
      if (await esperarVideoListo()) return;
      throw new Error("video sin imagen");
    } catch (e) {
      console.warn(`Intento de cámara ${i + 1} falló`, e);
      try { pararCamara?.(); } catch {}
      pararCamara = null;
      await sleep(400 * (i + 1));
    }
  }
  throw { tipo: "cam", msg: "La cámara no arrancó. Toca Conectar para reintentar." };
}

document.addEventListener("visibilitychange", async () => {
  if (sesionTerminada) return;
  if (document.visibilityState !== "visible" || $("paso2").hidden) return;
  const v = $("v");
  const tk = v.srcObject?.getVideoTracks?.()[0];
  if (v.paused || !tk || tk.readyState === "ended") {
    try { await abrirCamara(); prepararLinterna(); } catch {}
  }
});

// Al cerrar la pestaña del celular, apaga la cámara
window.addEventListener("pagehide", () => {
  try { pararCamara?.(); } catch {}
  try { unsubSesion?.(); } catch {}
});

/* ══════ Linterna ══════ */
let track = null;
let linternaOn = false;

async function esperarTrack() {
  for (let i = 0; i < 20; i++) {
    const t = $("v").srcObject?.getVideoTracks?.()[0];
    if (t) return t;
    await sleep(150);
  }
  return null;
}
async function prepararLinterna() {
  linternaOn = false;
  $("flash").classList.remove("on");
  track = await esperarTrack();
  const caps = track?.getCapabilities?.() || {};
  if (caps.torch) {
    $("flash").hidden = false;
  } else {
    $("flash").hidden = true;
    $("hintFlash").textContent = "Este celular/navegador no permite controlar la linterna desde la web";
  }
}
async function alternarLinterna() {
  if (!track) return;
  try {
    linternaOn = !linternaOn;
    await track.applyConstraints({ advanced: [{ torch: linternaOn }] });
    $("flash").classList.toggle("on", linternaOn);
    $("hintFlash").textContent = linternaOn ? "Linterna encendida" : "Si hay poca luz, toca 🔦 para encender el flash";
  } catch (e) {
    console.warn(e);
    linternaOn = false;
    $("flash").classList.remove("on");
  }
}
$("flash").onclick = alternarLinterna;

/* ══════ Conectar ══════ */
$("conectar").onclick = async () => {
  clave = $("pin").value.trim();
  $("err").textContent = "";
  if (!L || !T || !S) return ($("err").textContent = "QR inválido");
  if (clave.length !== 6) return ($("err").textContent = "La clave tiene 6 dígitos");

  $("conectar").disabled = true;
  sesionTerminada = false;
  mostrar(0);
  progreso(8);
  marcarPaso("stClave", "act");
  marcarPaso("stCam", null);
  $("cargaTxt").textContent = "Verificando clave…";
  const t0 = Date.now();

  try {
    // Permiso de cámara PRIMERO, pegado al toque del usuario
    const permisoP = pedirPermisoCamara();
    permisoP.catch(() => {}); // evita aviso de promesa sin capturar si la clave falla antes

    progreso(30);
    try {
      await enviar("", "hola"); // las reglas rechazan si la clave está mal
    } catch (e) {
      console.warn(e);
      throw { tipo: "clave", msg: "Clave incorrecta o sesión vencida." };
    }
    progreso(55);
    marcarPaso("stClave", "ok");
    marcarPaso("stCam", "act");
    $("cargaTxt").textContent = "Abriendo cámara…";

    await permisoP;
    progreso(75);

    // La carga se ve al menos ~1 segundo para que se note, aunque la red sea rápida
    const falta = 1000 - (Date.now() - t0);
    if (falta > 0) await sleep(falta);

    mostrar(2); // el video debe estar visible para que arranque bien
    await abrirCamara();
    await prepararLinterna();
    vigilarSesion(); // desde aquí el celular se entera si el dashboard cierra la sesión
  } catch (e) {
    console.warn(e);
    mostrar(1);
    $("err").textContent = e?.msg || "No se pudo conectar. Intenta de nuevo.";
  } finally {
    $("conectar").disabled = false;
  }
};

$("pin").addEventListener("keydown", (e) => { if (e.key === "Enter") $("conectar").click(); });

$("enviarManual").onclick = () => {
  const c = $("manual").value.trim();
  if (c) { alEscanear(c); $("manual").value = ""; }
};
$("manual").addEventListener("keydown", (e) => { if (e.key === "Enter") $("enviarManual").click(); });
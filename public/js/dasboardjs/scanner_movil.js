import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol } from "../rutas/rutas.js";
import { iniciarCamara } from "./scan_camara.js";

const q = new URLSearchParams(location.search);
const L = q.get("l"), T = q.get("t"), S = q.get("s");
const $ = (id) => document.getElementById(id);
let clave = "";

const enviar = (codigo, tipo = "scan") =>
  addDoc(tiendaSubCol(L, "tiendas", T, "scan_sesiones", S, "codigos"),
    { codigo, tipo, clave, ts: serverTimestamp() });

async function alEscanear(code) {
  try {
    await enviar(code);
    navigator.vibrate?.(60);
    $("hist").insertAdjacentHTML("afterbegin", `<div>✔ ${code}</div>`);
  } catch {
    $("estado").textContent = "❌ La sesión terminó. Vuelve a escanear el QR.";
    $("estado").style.color = "#f87171";
  }
}

$("conectar").onclick = async () => {
  clave = $("pin").value.trim();
  $("err").textContent = "";
  if (!L || !T || !S) return ($("err").textContent = "QR inválido");
  try {
    await enviar("", "hola"); // si la clave está mal, las reglas lo rechazan
    $("paso1").hidden = true; $("paso2").hidden = false;
    await iniciarCamara($("v"), alEscanear);
  } catch (e) {
    console.warn(e);
    $("err").textContent = "Clave incorrecta, sesión vencida o sin permiso de cámara.";
  }
};
$("enviarManual").onclick = () => {
  const c = $("manual").value.trim();
  if (c) { alEscanear(c); $("manual").value = ""; }
};
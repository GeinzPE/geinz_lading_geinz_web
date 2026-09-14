import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../db/db.js";

// 🔥 refs
const form = document.getElementById("claimForm");
const btnEnviar = document.getElementById("btnEnviar");

// 🔧 helpers
const getValue = (id) => document.getElementById(id)?.value.trim() || "";

function mostrarError(inputId, mensaje) {
  const el = document.getElementById(inputId);
  if (el) {
    el.focus();
    el.style.border = "1px solid #ff4d4f";
  }
  alert("⚠️ " + mensaje);
}

function limpiarErrores() {
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    el.style.border = "";
  });
}

// 🔥 VALIDACIONES COMPLETAS (INDECOPI READY)
function validar(datos) {
  limpiarErrores();

  if (datos.nombre.length < 5) {
    mostrarError("nombre", "Ingresa tu nombre completo.");
    return false;
  }

  if (!/^\d{8,}$/.test(datos.documento)) {
    mostrarError("documento", "DNI/CE inválido.");
    return false;
  }

  if (!datos.direccion || datos.direccion.length < 5) {
    mostrarError("direccion", "Ingresa tu dirección.");
    return false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) {
    mostrarError("correo", "Correo inválido.");
    return false;
  }

  if (!/^\d{9}$/.test(datos.celular)) {
    mostrarError("celular", "Celular inválido.");
    return false;
  }

  if (datos.detalle.length < 10) {
    mostrarError("detalle", "Describe mejor lo ocurrido.");
    return false;
  }

  if (datos.solucion.length < 5) {
    mostrarError("solucion", "Indica la solución esperada.");
    return false;
  }

  return true;
}

// 🎟️ ticket único
function generarTicket() {
  const fecha = new Date().getFullYear();
  const num = Math.floor(100000 + Math.random() * 900000);
  return `RECL-${fecha}-${num}`;
}

// 🚀 SUBMIT
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (btnEnviar.disabled) return;

  const datos = {
    nombre: getValue("nombre"),
    documento: getValue("documento"),
    correo: getValue("correo"),
    celular: getValue("celular"),
    direccion: getValue("direccion"),
    id_usuario: getValue("id_usuario") || null,
    tipo_solicitud: document.getElementById("tipo_solicitud").value,
    servicio: document.getElementById("servicio").value,
    monto: getValue("monto") || null,
    detalle: getValue("detalle"),
    solucion: getValue("solucion"),
    estado: "Pendiente",
    fecha: serverTimestamp(),
  };

  // validar
  if (!validar(datos)) return;

  btnEnviar.disabled = true;
  btnEnviar.innerText = "Enviando...";

  try {
    const ticketID = generarTicket();
    datos.ticket = ticketID;

    await addDoc(collection(db, "Reclamaciones"), datos);

    mostrarToast(ticketID);

    form.reset();
  } catch (error) {
    console.error("🔥 Error Firebase:", error);
    alert("❌ Error al enviar. Intenta nuevamente.");
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.innerText = "ENVIAR RECLAMACIÓN";
  }
});

// 🔔 TOAST PRO
function mostrarToast(ticketID) {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toast-msg");

  msg.innerText = `✅ Reclamo enviado\nTicket: ${ticketID}`;

  // 🔥 limpiar eventos anteriores
  const copyBtn = document.getElementById("copyTicket");
  const downloadBtn = document.getElementById("downloadTicket");

  copyBtn.onclick = null;
  downloadBtn.onclick = null;

  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 8000);

  copyBtn.onclick = async () => {
    await navigator.clipboard.writeText(ticketID);
    alert("📋 Ticket copiado");
  };

  downloadBtn.onclick = () => {
    descargarTicket(ticketID);
  };
}

// 📄 DESCARGA
function descargarTicket(ticketID) {
  const contenido = `
GEINZ - Libro de Reclamaciones

Ticket: ${ticketID}
Fecha: ${new Date().toLocaleString()}

Guarda este código para seguimiento.
`;

  const blob = new Blob([contenido], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${ticketID}.txt`;
  a.click();

  URL.revokeObjectURL(url);
}

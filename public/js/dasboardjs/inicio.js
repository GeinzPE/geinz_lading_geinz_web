import {
  onSnapshot,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import "../db/db.js";
import { tiendaDoc, tiendaSubDoc, tiendaSubCol, tiendaServiciosDoc } from "../rutas/rutas.js";
import { seccionDelPlan, resumenPlan, htmlDetallePlan } from "../../js/structure/structure_min.js";
// ── Detección dinámica de tienda/localidad (vía postMessage del padre) ──
let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
  });
}

let LOCALIDAD, NEGOCIO_ID;

function esperarDatosTienda() {
  return new Promise((resolve) => {
    if (tiendaId && localidad) {
      resolve();
      return;
    }
    window.addEventListener("message", function handler(e) {
      if (e.data?.tipo !== "DATOS_TIENDA") return;
      tiendaId = e.data.tiendaId;
      localidad = e.data.localidad;
      window.removeEventListener("message", handler);
      resolve();
    });
  });
}

window.PanelNegocio = window.PanelNegocio || {};

const CREDITO_A_SOLES = 0.012;
let MAX_ROLES = 5;
let SERVICIOS = null; // último snapshot de tiendas_servicios_geinz_activos

// ══════════════════════════════════════════════════════════════
//  FUENTE ÚNICA DE VERDAD: secciones del panel
//  key   = mismo nombre que los ids del sidebar (sbb-<key> / mmb-<key>)
//  campos = campos de apartados_dasboard que la habilitan (basta 1 en true)
//           null = no depende del plan
// ══════════════════════════════════════════════════════════════
// Por si algún botón de inicio.html usa otro nombre en data-perm
const ALIAS = { resenas: "mispublicaciones", review: "mispublicaciones", miweb: "qr", web: "qr" };
const resolverClave = (k) => ALIAS[k] || k;

const GRUPOS_ROL = [
  { id: "mi_negocio", titulo: "Mi negocio" },
  { id: "operacion", titulo: "Operación y ventas" },
  { id: "clientes", titulo: "Clientes y fidelización" },
];

const SECCIONES = [
  // Mi negocio
  { key: "perfil", label: "Perfil", grupo: "mi_negocio" },
  { key: "comprobantes", label: "Comprobante", grupo: "mi_negocio" },
  { key: "trabajadores", label: "Mis trabajadores", grupo: "mi_negocio" },
  { key: "legal", label: "Legal", grupo: "mi_negocio" },
  // Operación y ventas
  { key: "pedidos", label: "Pedidos en vivo", grupo: "operacion" },
  { key: "productos", label: "Productos", grupo: "operacion" },
  { key: "historial", label: "Historial de ventas", grupo: "operacion" },
  // Clientes y fidelización
  { key: "usuarios", label: "Mis usuarios", grupo: "clientes" },
  { key: "fidelizacion", label: "Cupones y Puntos", grupo: "clientes" },
  { key: "publicidad", label: "Publicidad/Ofertas", grupo: "clientes" },
  { key: "mispublicaciones", label: "Reseñas", grupo: "clientes" },
  { key: "qr", label: "Mi QR", grupo: "clientes" },
  // Internas (no se asignan a roles)
  { key: "historialgasto", label: "Historial de gasto" },
  { key: "recargas", label: "Recargas" },
];
const TODOS_LOS_PERMISOS = SECCIONES.map((s) => s.key);
// ── Reglas ──
// 1) PLAN: solo existe lo que está en true en la DB
function planPermite(key) { return seccionDelPlan(SERVICIOS, key); }
// 2) ROL: admin ve todo lo del plan; los demás solo lo que el admin les marcó
function rolPermite(key, sesion = getSession()) {
  if (!sesion) return false;
  return !!sesion.esAdmin || (sesion.permisos || []).includes(key);
}
// 3) Visible = plan Y rol
function seccionVisible(key, sesion = getSession()) {
  return planPermite(key) && rolPermite(key, sesion);
}
// Lo que el admin puede asignar a un rol = solo lo que el plan tiene activo
function permisosDelPlan() {
  return SECCIONES.filter((s) => s.grupo && planPermite(s.key));
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const oculto = (id) => document.getElementById(id)?.classList.contains("hidden") ?? true;

// Muestra/oculta los botones de "Acciones rápidas"
function aplicarVisibilidad() {
  const sesion = getSession();
  const esAdmin = !!sesion?.esAdmin;

  document.querySelectorAll(".action-btn[data-perm]").forEach((btn) => {
    const p = btn.dataset.perm;
    const ok =
      p === "__admin__" || p === "__ajustes__"
        ? esAdmin
        : seccionVisible(resolverClave(p), sesion);
    btn.style.display = ok ? "" : "none";
  });

  // Solo admin
  ["rechargeBtn", "btnRoles", "btnAjustes"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = esAdmin ? "" : "none";
  });
}

// ── Comunicación con el panel (padre) ──
function serviciosParaPadre() {
  if (!SERVICIOS) return null;
  const secciones = {};
  SECCIONES.forEach((s) => (secciones[s.key] = planPermite(s.key)));
  return {
    plan: resumenPlan(SERVICIOS).plan,
    secciones, // nuevo: lo que el padre debería leer
    apartados_dasboard: { ...(SERVICIOS.apartados_dasboard || {}) }, // se deja para no romper al padre
  };
}
function broadcastServicios() {
  const data = serviciosParaPadre();
  try { sessionStorage.setItem("serviciosActivos", JSON.stringify(data)); } catch (e) { }
  try {
    window.parent.postMessage({ type: "SERVICIOS_UPDATE", servicios: data }, window.location.origin);
  } catch (e) { }
}
function broadcastRolActivo(sesion) {
  try {
    window.parent.postMessage({ type: "ROL_ACTIVO_UPDATE", rol: sesion }, window.location.origin);
  } catch (e) { }
}

let unsubServicios = null;
function listenServicios() {
  if (unsubServicios) unsubServicios();
  const ref = tiendaServiciosDoc(LOCALIDAD, NEGOCIO_ID);
  unsubServicios = onSnapshot(
    ref,
    (snap) => {
      SERVICIOS = snap.exists() ? snap.data() : {};
      MAX_ROLES = resumenPlan(SERVICIOS).rolesMax;
      broadcastServicios();
      aplicarVisibilidad();

      if (!oculto("view-roles")) {
        initPermGrid();
        if (ultimosRoles) renderRoles(ultimosRoles);
      }
      if (!oculto("view-edit-permisos")) initEditPermGrid();
      if (!oculto("view-ajustes")) renderAjustes();
    },
    (err) => console.error("Error escuchando servicios:", err),
  );
}

function rolesRef() {
  return tiendaSubCol(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles");
}
async function hashPassword(plain) {
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ══════════════════════════════════════════
//  Router de vistas
// ══════════════════════════════════════════
const VIEWS = [
  "view-loading",
  "view-bootstrap",
  "view-recovery",
  "view-login",
  "view-forgot",
  "view-panel",
  "view-roles",
  "view-ajustes",
];
let recoveryContext = null; // 'bootstrap' | 'forgot'
let pendingSesion = null;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 18)}`;
}
function showView(id) {
  VIEWS.forEach((v) => document.getElementById(v).classList.toggle("hidden", v !== id));
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}
function setTextPulse(el, newText) {
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove("value-pulse");
  void el.offsetWidth;
  el.classList.add("value-pulse");
}
function setMsg(boxId, text, type) {
  const box = document.getElementById(boxId);
  box.textContent = text;
  box.className = text ? `msg ${type}` : "msg";
}
function saveSession(rolData) {
  sessionStorage.setItem("rolActivo", JSON.stringify(rolData));
}
function getSession() {
  const raw = sessionStorage.getItem("rolActivo");
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function resetAuthForms() {
  const loBtn = document.getElementById("loSubmit");
  if (loBtn) { loBtn.disabled = false; loBtn.textContent = "Ingresar"; }
  document.getElementById("loginForm")?.reset();
  setMsg("loMsg", "", "");

  const bsBtn = document.getElementById("bsSubmit");
  if (bsBtn) { bsBtn.disabled = false; bsBtn.textContent = "Crear cuenta de administrador"; }

  const fgBtn = document.getElementById("fgSubmit");
  if (fgBtn) { fgBtn.disabled = false; fgBtn.textContent = "Restablecer contraseña"; }
}

// ══════════════════════════════════════════
//  Arranque
// ══════════════════════════════════════════
let unsubNegocio = null,
  unsubPedidos = null,
  unsubMiRol = null,
  unsubRoles = null,
  statusTimer = null;
let ultimosRoles = null;

async function boot() {
  showView("view-loading");
  await esperarDatosTienda();

  LOCALIDAD = localidad;
  NEGOCIO_ID = tiendaId;
  window.PanelNegocio.TIENDA_ID = NEGOCIO_ID;
  window.PanelNegocio.LOCALIDAD_TIENDA = LOCALIDAD;

  const sesion = getSession();
  if (sesion) {
    enterPanel(sesion);
    return;
  }
  broadcastRolActivo(null);
  resetAuthForms();
  try {
    const snap = await getDocs(rolesRef());
    const hayAdmin = snap.docs.some((d) => d.data().esAdmin === true);
    showView(hayAdmin ? "view-login" : "view-bootstrap");
  } catch (err) {
    console.error(err);
    showView("view-login");
  }
}

function cerrarRol() {
  sessionStorage.removeItem("rolActivo");
  broadcastRolActivo(null);
  [unsubNegocio, unsubPedidos, unsubServicios, unsubMiRol, unsubRoles].forEach((u) => u && u());
  unsubNegocio = unsubPedidos = unsubServicios = unsubMiRol = unsubRoles = null;
  ultimosRoles = null;
  clearInterval(statusTimer);
  boot();
}

// Si el admin cambia los permisos de un rol (o lo elimina) mientras está conectado,
// se actualiza en vivo
function listenMiRol(sesion) {
  if (unsubMiRol) { unsubMiRol(); unsubMiRol = null; }
  if (sesion.esAdmin) return;
  unsubMiRol = onSnapshot(
    tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", sesion.roleId),
    (snap) => {
      if (!snap.exists() || snap.data().activo === false) {
        cerrarRol();
        return;
      }
      const d = snap.data();
      const nueva = { ...getSession(), nombre: d.nombre, permisos: d.permisos || [] };
      saveSession(nueva);
      broadcastRolActivo(nueva);
      aplicarVisibilidad();
    },
    (err) => console.error("Error escuchando rol:", err),
  );
}

// ══════════════════════════════════════════
//  Crear administrador (primer uso)
// ══════════════════════════════════════════
document.getElementById("bootstrapForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("bsMsg", "", "");
  const btn = document.getElementById("bsSubmit");
  btn.disabled = true;
  btn.textContent = "Creando…";
  try {
    const nombre = document.getElementById("bsNombre").value.trim();
    const usuario = document.getElementById("bsUsuario").value.trim().toLowerCase();
    const password = document.getElementById("bsPassword").value;
    const passwordHash = await hashPassword(password);
    const recoveryCode = randomCode();
    const recoveryCodeHash = await hashPassword(recoveryCode);

    const docRef = await addDoc(rolesRef(), {
      nombre,
      usuario,
      passwordHash,
      esAdmin: true,
      recoveryCodeHash,
      permisos: TODOS_LOS_PERMISOS,
      activo: true,
      creadoEn: serverTimestamp(),
    });

    const sesion = {
      roleId: docRef.id,
      nombre,
      usuario,
      esAdmin: true,
      permisos: TODOS_LOS_PERMISOS,
    };
    saveSession(sesion);
    pendingSesion = sesion;
    recoveryContext = "bootstrap";
    document.getElementById("recoveryCodeText").textContent = recoveryCode;
    showView("view-recovery");
  } catch (err) {
    console.error(err);
    setMsg("bsMsg", "No se pudo crear la cuenta. Intenta de nuevo.", "error");
    btn.disabled = false;
    btn.textContent = "Crear cuenta de administrador";
  }
});

// ══════════════════════════════════════════
//  Login normal
// ══════════════════════════════════════════
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("loMsg", "", "");
  const btn = document.getElementById("loSubmit");
  btn.disabled = true;
  btn.textContent = "Ingresando…";
  try {
    const usuario = document.getElementById("loUsuario").value.trim().toLowerCase();
    const password = document.getElementById("loPassword").value;
    const passwordHash = await hashPassword(password);

    const q = query(rolesRef(), where("usuario", "==", usuario));
    const snap = await getDocs(q);
    const match = snap.docs.find((d) => {
      const data = d.data();
      return data.passwordHash === passwordHash && data.activo !== false;
    });

    if (!match) {
      setMsg("loMsg", "Usuario o contraseña incorrectos.", "error");
      btn.disabled = false;
      btn.textContent = "Ingresar";
      return;
    }
    const data = match.data();
    const sesion = {
      roleId: match.id,
      nombre: data.nombre,
      usuario: data.usuario,
      esAdmin: !!data.esAdmin,
      permisos: data.esAdmin ? TODOS_LOS_PERMISOS : data.permisos || [],
    };
    saveSession(sesion);

    updateDoc(tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", match.id), {
      ultimoAcceso: serverTimestamp(),
    }).catch(() => { });

    setMsg("loMsg", `Bienvenido, ${data.nombre}. Ingresando…`, "info");
    setTimeout(() => enterPanel(sesion), 400);
  } catch (err) {
    console.error(err);
    setMsg("loMsg", "Ocurrió un error al iniciar sesión.", "error");
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
});

document.getElementById("recoveryContinueBtn").addEventListener("click", () => {
  if (recoveryContext === "bootstrap" && pendingSesion) {
    enterPanel(pendingSesion);
  } else {
    showView("view-login");
  }
  recoveryContext = null;
  pendingSesion = null;
});

document.getElementById("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  setMsg("fgMsg", "", "");
  showView("view-forgot");
});
document.getElementById("backToLoginLink").addEventListener("click", (e) => {
  e.preventDefault();
  showView("view-login");
});

document.getElementById("forgotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("fgMsg", "", "");
  const btn = document.getElementById("fgSubmit");
  btn.disabled = true;
  btn.textContent = "Verificando…";
  try {
    const usuario = document.getElementById("fgUsuario").value.trim().toLowerCase();
    const codigo = document.getElementById("fgCodigo").value.trim().toUpperCase();
    const nuevaPassword = document.getElementById("fgPassword").value;
    const codigoHash = await hashPassword(codigo);

    const q = query(rolesRef(), where("usuario", "==", usuario), where("esAdmin", "==", true));
    const snap = await getDocs(q);
    const match = snap.docs.find((d) => d.data().recoveryCodeHash === codigoHash);

    if (!match) {
      setMsg("fgMsg", "Usuario o código de recuperación incorrectos.", "error");
      btn.disabled = false;
      btn.textContent = "Restablecer contraseña";
      return;
    }

    const nuevoHash = await hashPassword(nuevaPassword);
    const nuevoCodigo = randomCode();
    const nuevoCodigoHash = await hashPassword(nuevoCodigo);

    await updateDoc(tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", match.id), {
      passwordHash: nuevoHash,
      recoveryCodeHash: nuevoCodigoHash,
    });

    recoveryContext = "forgot";
    document.getElementById("recoveryCodeText").textContent = nuevoCodigo;
    e.target.reset();
    btn.disabled = false;
    btn.textContent = "Restablecer contraseña";
    showView("view-recovery");
  } catch (err) {
    console.error(err);
    setMsg("fgMsg", "Ocurrió un error. Intenta de nuevo.", "error");
    btn.disabled = false;
    btn.textContent = "Restablecer contraseña";
  }
});

document.getElementById("logoutBtn").addEventListener("click", cerrarRol);

// ══════════════════════════════════════════
//  Entrar al panel según la sesión activa
// ══════════════════════════════════════════
function enterPanel(sesion) {
  broadcastRolActivo(sesion);
  document.getElementById("sessionNombre").textContent = sesion.nombre;
  document.getElementById("sessionRoleBadge").textContent = sesion.esAdmin ? "Admin" : "Rol asignado";

  aplicarVisibilidad();
  showView("view-panel");
  listenNegocio();
  listenServicios();
  listenPedidos();
  listenMiRol(sesion);
}

// ══════════════════════════════════════════
//  HORARIO
// ══════════════════════════════════════════
const DAY_KEYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function normalizeSchedule(h) {
  return DAY_KEYS.map((key) => {
    const diaData = h?.[key];
    if (!diaData || diaData.cerrado === true)
      return { cerrado: true, motivo: diaData?.motivo || null, bloques: [] };
    const bloques = (diaData.bloques || []).filter((b) => b.h_apertura && b.h_cierre);
    return { cerrado: false, motivo: null, bloques };
  });
}
function calcOpenNow(horarioMap) {
  if (!horarioMap) return false;
  const horario = normalizeSchedule(horarioMap);
  const now = new Date();
  const map = [6, 0, 1, 2, 3, 4, 5];
  const today = horario[map[now.getDay()]];
  if (!today || today.cerrado || !today.bloques.length) return false;
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return today.bloques.some((b) => nowMin >= toMin(b.h_apertura) && nowMin < toMin(b.h_cierre));
}

function setStatus(isOpen) {
  const pill = document.getElementById("statusPill");
  const text = document.getElementById("statusText");
  pill.className = "status-pill " + (isOpen ? "open" : "closed");
  text.textContent = isOpen ? "TIENDA ABIERTA" : "TIENDA CERRADA";
}
function setLogo(url) {
  const img = document.getElementById("logoImg");
  const fallback = document.getElementById("logoFallback");
  if (!url) {
    img.classList.remove("loaded");
    fallback.style.opacity = "1";
    return;
  }
  img.onload = () => { img.classList.add("loaded"); fallback.style.opacity = "0"; };
  img.onerror = () => { img.classList.remove("loaded"); fallback.style.opacity = "1"; };
  img.src = url;
}

let bizHorario = null;
function listenNegocio() {
  if (unsubNegocio) unsubNegocio();
  const ref = tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID);
  unsubNegocio = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const biz = snap.data();
      document.getElementById("bizName").textContent = biz.nombre_tienda || biz.nombre || "Mi negocio";
      setLogo(biz.img_tienda?.logo_tienda || null);
      bizHorario = biz.horario_atencion;
      setStatus(calcOpenNow(bizHorario));
      const puntos = Number(biz.puntos_tienda) || 0;
      const soles = puntos * CREDITO_A_SOLES;
      setTextPulse(document.getElementById("balanceValue"), `S/ ${soles.toFixed(2)}`);
      document.getElementById("balanceSub").textContent = `${puntos} créditos`;
    },
    (err) => console.error("Error escuchando negocio:", err),
  );

  // Recalcula abierto/cerrado sin crear listeners nuevos
  clearInterval(statusTimer);
  statusTimer = setInterval(() => setStatus(calcOpenNow(bizHorario)), 30000);
}

function todayStr() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function listenPedidos() {
  if (unsubPedidos) unsubPedidos();
  const ref = tiendaSubCol(LOCALIDAD, "tiendas", NEGOCIO_ID, "pedidos");
  unsubPedidos = onSnapshot(
    ref,
    (snap) => {
      const hoy = todayStr();
      let ventas = 0, atendidos = 0, cocina = 0;
      snap.forEach((docSnap) => {
        const p = docSnap.data();
        if (p.fecha !== hoy) return;
        const estado = (p.estado || "").toLowerCase();
        const rechazado = estado.includes("rechaz") || estado.includes("cancel");
        const enCocina = estado.includes("cocina");
        if (!rechazado) ventas += Number(p.total) || 0;
        if (enCocina) cocina++;
        else if (!rechazado) atendidos++;
      });
      setTextPulse(document.getElementById("ventasValue"), `S/ ${ventas.toFixed(2)}`);
      setTextPulse(document.getElementById("atendidosValue"), String(atendidos));
      setTextPulse(document.getElementById("cocinaValue"), String(cocina));
      document.getElementById("urgentCard").classList.toggle("active", cocina > 0);
    },
    (err) => console.error("Error escuchando pedidos:", err),
  );
}

// ══════════════════════════════════════════
//  Acciones rápidas — navegación
// ══════════════════════════════════════════
function navigateTo(seccionRaw) {
  const seccion = resolverClave(seccionRaw);
  if (seccion === "ajustes") { openAjustes(); return; }
  if (seccion === "roles") { openRoles(); return; }

  if (!seccionVisible(seccion)) {
    showToast("No tienes acceso a esta sección.");
    return;
  }

  try {
    window.parent.postMessage({ tipo: "NAVEGAR", seccion }, window.location.origin);
  } catch (e) {
    console.error("No se pudo navegar:", e);
  }
}
window.navigateTo = navigateTo;   // 👈 AGREGA ESTA LÍNEA AQUÍ

const on = (id, fn) => document.getElementById(id)?.addEventListener("click", fn);

on("rechargeBtn", () => navigateTo("recargas"));
on("btnPerfil", () => navigateTo("perfil"));
on("btnPublicidad", () => navigateTo("publicidad"));
on("btnFidelizacion", () => navigateTo("fidelizacion"));
on("btnResenas", () => navigateTo("mispublicaciones"));
on("btnQR", () => navigateTo("qr"));
on("btnMiWeb", () => navigateTo("qr"));
on("btnGasto", () => navigateTo("historialgasto"));
on("btnProductos", () => navigateTo("productos"));
on("btnHistorial", () => navigateTo("historial"));
on("btnPedidosVivo", () => navigateTo("pedidos"));
on("btnLegal", () => navigateTo("legal"));
on("btnRoles", () => navigateTo("roles"));
on("btnAjustes", () => navigateTo("ajustes"));
on("backToPanel", () => showView("view-panel"));
on("backToPanelAjustes", () => showView("view-panel"));

// ══════════════════════════════════════════
//  Gestión de roles (solo admin)
// ══════════════════════════════════════════

// Reconstruye la grilla con SOLO lo que el plan tiene activo, conservando lo marcado
function buildPermGrid(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const marcados = new Set([...grid.querySelectorAll("input:checked")].map((i) => i.value));
  const disponibles = permisosDelPlan();

  grid.innerHTML = disponibles.length
    ? GRUPOS_ROL.map((g) => {
        const items = disponibles.filter((p) => p.grupo === g.id);
        if (!items.length) return "";
        return `<p class="perm-grupo-t">${esc(g.titulo)}</p>` +
          items.map((p) => `<label class="perm-chip"><input type="checkbox" value="${p.key}"> ${esc(p.label)}</label>`).join("");
      }).join("")
    : `<p class="empty" style="grid-column:1/-1;">Tu plan no tiene secciones para asignar.</p>`;

  grid.querySelectorAll("input").forEach((i) => (i.checked = marcados.has(i.value)));
}
function initPermGrid() { buildPermGrid("permGrid"); }
function initEditPermGrid() { buildPermGrid("editPermGrid"); }

function contarNoAdmin() {
  return (ultimosRoles || []).filter((d) => !d.data().esAdmin).length;
}

function renderRoles(docs) {
  ultimosRoles = docs;
  const list = document.getElementById("rolesList");
  const noAdmin = docs.filter((d) => !d.data().esAdmin);
  document.getElementById("countPill").textContent = `${noAdmin.length} / ${MAX_ROLES}`;
  document.getElementById("formSubmit").disabled = noAdmin.length >= MAX_ROLES;

  if (!docs.length) {
    list.innerHTML = `<p class="empty">Aún no hay roles creados.</p>`;
    return;
  }

  list.innerHTML = docs
    .map((d) => {
      const data = d.data();
      const perms = data.esAdmin
        ? `<span class="admin-tag">Acceso total</span>`
        : (data.permisos || [])
          .map((p) => {
            const found = SECCIONES.find((x) => x.key === p);
            return `<span class="perm-tag">${esc(found ? found.label : p)}</span>`;
          })
          .join("");
      return `
        <div class="role-item">
          <div>
            <p class="role-name">${esc(data.nombre)}</p>
            <p class="role-user">@${esc(data.usuario)}</p>
            <div class="role-perms">${perms}</div>
          </div>
          ${data.esAdmin
          ? ""
          : `<div style="display:flex;flex-direction:column;gap:6px;">
                  <button class="delete-btn" data-id="${d.id}">Eliminar</button>
                  <button class="back-btn" data-edit-id="${d.id}" data-edit-nombre="${esc(data.nombre)}"
                    data-edit-permisos="${esc(JSON.stringify(data.permisos || []))}">Editar permisos</button>
                  <button class="back-btn" data-reset-id="${d.id}" data-reset-nombre="${esc(data.nombre)}">Nueva contraseña</button>
                </div>`
        }
        </div>`;
    })
    .join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este rol? La persona ya no podrá ingresar.")) return;
      await deleteDoc(tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", btn.dataset.id));
    });
  });
  list.querySelectorAll("[data-reset-id]").forEach((btn) => {
    btn.addEventListener("click", () => openResetWorker(btn.dataset.resetId, btn.dataset.resetNombre));
  });
  list.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const permisosActuales = JSON.parse(btn.dataset.editPermisos || "[]");
      openEditPermisos(btn.dataset.editId, btn.dataset.editNombre, permisosActuales);
    });
  });
}

// ── Restablecer contraseña de un trabajador ──
let resetWorkerId = null;

// ── Editar permisos de un trabajador ──
let editPermRoleId = null;
let editPermActuales = [];

function openEditPermisos(roleId, nombre, permisosActuales) {
  editPermRoleId = roleId;
  editPermActuales = permisosActuales;
  document.getElementById("editPermNombre").textContent = nombre;
  setMsg("epMsg", "", "");
  initEditPermGrid();
  document.querySelectorAll("#editPermGrid input").forEach((input) => {
    input.checked = permisosActuales.includes(input.value);
  });
  document.getElementById("view-edit-permisos").classList.remove("hidden");
}

document.getElementById("epCancel").addEventListener("click", () => {
  document.getElementById("view-edit-permisos").classList.add("hidden");
  editPermRoleId = null;
});

document.getElementById("editPermisosForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editPermRoleId) return;

  const marcados = Array.from(document.querySelectorAll("#editPermGrid input:checked")).map((i) => i.value);
  // Conserva permisos que hoy el plan no ofrece (por si el plan se reactiva)
  const fueraDelPlan = editPermActuales.filter((k) => !planPermite(k));
  const nuevosPermisos = [...new Set([...marcados, ...fueraDelPlan])];

  if (!marcados.length) {
    setMsg("epMsg", "Debe tener al menos una sección permitida.", "error");
    return;
  }

  const btn = document.getElementById("epSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    await updateDoc(tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", editPermRoleId), {
      permisos: nuevosPermisos,
    });
    showToast("Permisos actualizados correctamente.");
    document.getElementById("view-edit-permisos").classList.add("hidden");
    editPermRoleId = null;
  } catch (err) {
    console.error(err);
    setMsg("epMsg", "No se pudo guardar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar permisos";
  }
});

function openResetWorker(roleId, nombre) {
  resetWorkerId = roleId;
  document.getElementById("resetWorkerNombre").textContent = nombre;
  document.getElementById("rwPassword").value = "";
  setMsg("rwMsg", "", "");
  document.getElementById("view-reset-worker").classList.remove("hidden");
}
document.getElementById("rwCancel").addEventListener("click", () => {
  document.getElementById("view-reset-worker").classList.add("hidden");
  resetWorkerId = null;
});
document.getElementById("resetWorkerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!resetWorkerId) return;
  const btn = document.getElementById("rwSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const nuevaPassword = document.getElementById("rwPassword").value;
    const nuevoHash = await hashPassword(nuevaPassword);
    await updateDoc(tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", resetWorkerId), {
      passwordHash: nuevoHash,
    });
    showToast("Contraseña actualizada. Compártela con el trabajador.");
    document.getElementById("view-reset-worker").classList.add("hidden");
    resetWorkerId = null;
  } catch (err) {
    console.error(err);
    setMsg("rwMsg", "No se pudo guardar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar nueva contraseña";
  }
});

function openRoles() {
  const sesion = getSession();
  showView("view-roles");
  const denied = document.getElementById("deniedView");
  const content = document.getElementById("rolesContent");

  if (!sesion || !sesion.esAdmin) {
    denied.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  denied.classList.add("hidden");
  content.classList.remove("hidden");
  initPermGrid();
  if (!unsubRoles) {
    unsubRoles = onSnapshot(rolesRef(), (snap) => renderRoles(snap.docs));
  }
}

document.getElementById("roleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("formMsg", "", "");
  const sesion = getSession();
  if (!sesion?.esAdmin) return;

  const nombre = document.getElementById("fNombre").value.trim();
  const usuario = document.getElementById("fUsuario").value.trim().toLowerCase();
  const password = document.getElementById("fPassword").value;
  const permisos = Array.from(document.querySelectorAll("#permGrid input:checked")).map((i) => i.value);

  if (!permisos.length) {
    setMsg("formMsg", "Selecciona al menos una sección.", "error");
    return;
  }
  if (contarNoAdmin() >= MAX_ROLES) {
    setMsg("formMsg", `Tu plan permite máximo ${MAX_ROLES} roles.`, "error");
    return;
  }

  const btn = document.getElementById("formSubmit");
  btn.disabled = true;
  btn.textContent = "Creando…";
  try {
    const dup = await getDocs(query(rolesRef(), where("usuario", "==", usuario)));
    if (!dup.empty) {
      setMsg("formMsg", "Ese nombre de usuario ya existe.", "error");
      return;
    }
    const passwordHash = await hashPassword(password);
    await addDoc(rolesRef(), {
      nombre,
      usuario,
      passwordHash,
      esAdmin: false,
      permisos,
      activo: true,
      creadoPor: sesion?.usuario || null,
      creadoEn: serverTimestamp(),
    });
    setMsg("formMsg", `Rol "${nombre}" creado correctamente.`, "info");
    e.target.reset();
    document.querySelectorAll("#permGrid input").forEach((i) => (i.checked = false));
  } catch (err) {
    console.error(err);
    setMsg("formMsg", "No se pudo crear el rol. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = contarNoAdmin() >= MAX_ROLES;
    btn.textContent = "Crear rol";
  }
});

// ══════════════════════════════════════════
//  Ajustes (solo admin)
// ══════════════════════════════════════════
const SONIDOS_LOCALES = {
  campana: "🔔 Campana",
  timbre: "🔊 Timbre",
  notificacion: "📳 Notificación",
};
const SONIDO_KEYS = ["productos", "pedidos", "legal"];

function cargarSonidoGuardado(key) {
  return localStorage.getItem(`sonidoAlerta_${key}`) || "campana";
}
function guardarSonido(key, valor) {
  localStorage.setItem(`sonidoAlerta_${key}`, valor);
}

function renderAjustes() {
  if (!SERVICIOS) return;

  // ── Plan ──
  const r = resumenPlan(SERVICIOS);
  document.getElementById("ajPlan").textContent = r.plan || "—";
  document.getElementById("ajCreditos").textContent = r.creditos;
  document.getElementById("ajFechaFin").textContent = r.fechaFin || "—";
  document.getElementById("ajRolesMax").textContent = r.rolesMax;

  const dominioRow = document.getElementById("ajDominioRow");
  if (r.dominio && r.dominioPersonalizado) {
    dominioRow.classList.remove("hidden");
    document.getElementById("ajDominio").textContent = r.dominio;
  } else {
    dominioRow.classList.add("hidden");
  }

  // ── Apartados disponibles (detalle, solo lectura) ──
  // ── Apartados disponibles (detalle tal cual de la DB) ──
  document.getElementById("ajApartadosList").innerHTML = htmlDetallePlan(SERVICIOS);

  // ── Sonidos de alertas ──
  const sonidosEl = document.getElementById("ajSonidosGrid");
  sonidosEl.innerHTML = SONIDO_KEYS.map(
    (key) => `
    <div class="field">
      <label>Sonido — ${key}</label>
      <select data-sonido-key="${key}">
        ${Object.entries(SONIDOS_LOCALES)
          .map(([val, label]) => `<option value="${val}" ${cargarSonidoGuardado(key) === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </div>`,
  ).join("");
  sonidosEl.querySelectorAll("select[data-sonido-key]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      guardarSonido(sel.dataset.sonidoKey, e.target.value);
      showToast("Sonido de alerta actualizado.");
    });
  });
}

function openAjustes() {
  const sesion = getSession();
  showView("view-ajustes");
  const denied = document.getElementById("ajDeniedView");
  const content = document.getElementById("ajContent");
  if (!sesion || !sesion.esAdmin) {
    denied.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  denied.classList.add("hidden");
  content.classList.remove("hidden");
  renderAjustes();
}

// ── Init ──
boot();
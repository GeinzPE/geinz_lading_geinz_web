import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db, storage } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc,tiendaSubCol } from "../rutas/rutas.js";

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
window.PanelNegocio.TIENDA_ID = NEGOCIO_ID;
window.PanelNegocio.LOCALIDAD_TIENDA = LOCALIDAD;

const CREDITO_A_SOLES = 0.012;
const MAX_ROLES = 5; // máximo de roles NO admin

const PERMISOS_DISPONIBLES = [
  { key: "perfil", label: "Perfil" },
  { key: "publicidad", label: "Publicidad" },
  { key: "qr", label: "Mi QR" },
  { key: "productos", label: "Productos" },
  { key: "pedidos", label: "Pedidos / Ventas" },
  { key: "historial", label: "Historial de ventas" },
  { key: "recargas", label: "Recargas" },
];
const TODOS_LOS_PERMISOS = PERMISOS_DISPONIBLES.map((p) => p.key);

// DESPUÉS
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
//  Router de vistas — todo vive en un solo archivo
// ══════════════════════════════════════════
const VIEWS = [
  "view-loading",
  "view-bootstrap",
  "view-recovery",
  "view-login",
  "view-forgot",
  "view-panel",
  "view-roles",
];
let recoveryContext = null; // 'bootstrap' | 'forgot'

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 18)}`;
}
function showView(id) {
  VIEWS.forEach((v) =>
    document.getElementById(v).classList.toggle("hidden", v !== id),
  );
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// Actualiza el texto de un elemento y, solo si cambió, hace un pequeño
// "pulso" (transform, no layout) — barato incluso en equipos muy limitados.
function setTextPulse(el, newText) {
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove("value-pulse");
  void el.offsetWidth; // fuerza reflow para poder re-disparar la animación
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

function resetAuthForms() {
  const loBtn = document.getElementById("loSubmit");
  if (loBtn) {
    loBtn.disabled = false;
    loBtn.textContent = "Ingresar";
  }
  document.getElementById("loginForm")?.reset();
  setMsg("loMsg", "", "");

  const bsBtn = document.getElementById("bsSubmit");
  if (bsBtn) {
    bsBtn.disabled = false;
    bsBtn.textContent = "Crear cuenta de administrador";
  }

  const fgBtn = document.getElementById("fgSubmit");
  if (fgBtn) {
    fgBtn.disabled = false;
    fgBtn.textContent = "Restablecer contraseña";
  }
}
function broadcastRolActivo(sesion) {
  try {
    window.parent.postMessage(
      { type: "ROL_ACTIVO_UPDATE", rol: sesion },
      window.location.origin,
    );
  } catch (e) {}
}
function getSession() {
  const raw = sessionStorage.getItem("rolActivo");
  return raw ? JSON.parse(raw) : null;
}

// ══════════════════════════════════════════
//  Arranque: decide qué vista mostrar
// ══════════════════════════════════════════
let unsubNegocio = null,
  unsubPedidos = null;

async function boot() {
  showView("view-loading");
  await esperarDatosTienda(); // 👈 espera a que lleguen tiendaId y localidad

  LOCALIDAD = localidad;
  NEGOCIO_ID = tiendaId;
  window.PanelNegocio.TIENDA_ID = NEGOCIO_ID;
  window.PanelNegocio.LOCALIDAD_TIENDA = LOCALIDAD;

  const sesion = getSession();
  if (sesion) {
    enterPanel(sesion);
    return;
  }
  resetAuthForms(); // 👈 agregar acá
  try {
    const snap = await getDocs(rolesRef());
    const hayAdmin = snap.docs.some((d) => d.data().esAdmin === true);
    showView(hayAdmin ? "view-login" : "view-bootstrap");
  } catch (err) {
    console.error(err);
    showView("view-login");
  }
}

// ══════════════════════════════════════════
//  Crear administrador (primer uso)
// ══════════════════════════════════════════
document
  .getElementById("bootstrapForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("bsMsg", "", "");
    const btn = document.getElementById("bsSubmit");
    btn.disabled = true;
    btn.textContent = "Creando…";
    try {
      const nombre = document.getElementById("bsNombre").value.trim();
      const usuario = document
        .getElementById("bsUsuario")
        .value.trim()
        .toLowerCase();
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
    const usuario = document
      .getElementById("loUsuario")
      .value.trim()
      .toLowerCase();
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
      btn.textContent = "Ingresar"; // ✅ se resetea en error
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

    updateDoc(
      tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", match.id),

      {
        ultimoAcceso: serverTimestamp(),
      },
    ).catch(() => {});

    setMsg("loMsg", `Bienvenido, ${data.nombre}. Ingresando…`, "info");
    setTimeout(() => enterPanel(sesion), 400);
  } catch (err) {
    console.error(err);
    setMsg("loMsg", "Ocurrió un error al iniciar sesión.", "error");
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
});

let pendingSesion = null;
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
    const usuario = document
      .getElementById("fgUsuario")
      .value.trim()
      .toLowerCase();
    const codigo = document
      .getElementById("fgCodigo")
      .value.trim()
      .toUpperCase();
    const nuevaPassword = document.getElementById("fgPassword").value;
    const codigoHash = await hashPassword(codigo);

    const q = query(
      rolesRef(),
      where("usuario", "==", usuario),
      where("esAdmin", "==", true),
    );
    const snap = await getDocs(q);
    const match = snap.docs.find(
      (d) => d.data().recoveryCodeHash === codigoHash,
    );

    if (!match) {
      setMsg("fgMsg", "Usuario o código de recuperación incorrectos.", "error");
      btn.disabled = false;
      btn.textContent = "Restablecer contraseña";
      return;
    }

    const nuevoHash = await hashPassword(nuevaPassword);
    const nuevoCodigo = randomCode();
    const nuevoCodigoHash = await hashPassword(nuevoCodigo);

    await updateDoc(
      tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", match.id),
      {
        passwordHash: nuevoHash,
        recoveryCodeHash: nuevoCodigoHash,
      },
    );

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

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("rolActivo");
  broadcastRolActivo(null); // 👈 agregar esta línea
  if (unsubNegocio) unsubNegocio();
  if (unsubPedidos) unsubPedidos();
  boot();
});
// ══════════════════════════════════════════
//  Entrar al panel según la sesión activa
// ══════════════════════════════════════════
function enterPanel(sesion) {
  broadcastRolActivo(sesion);
  document.getElementById("sessionNombre").textContent = sesion.nombre;
  document.getElementById("sessionRoleBadge").textContent = sesion.esAdmin
    ? "Admin"
    : "Rol asignado";

  const permisos = sesion.esAdmin ? null : sesion.permisos || [];
  document.querySelectorAll(".action-btn[data-perm]").forEach((btn) => {
    const perm = btn.dataset.perm;
    if (perm === "__admin__") {
      btn.classList.toggle("hidden-perm", !sesion.esAdmin);
    } else {
      btn.classList.toggle(
        "hidden-perm",
        !!(permisos && !permisos.includes(perm)),
      );
    }
  });
  document.getElementById("rechargeBtn").style.display = sesion.esAdmin
    ? ""
    : "none";

  showView("view-panel");
  listenNegocio();
  listenPedidos();
}

// ══════════════════════════════════════════
//  HORARIO
// ══════════════════════════════════════════
const DAY_KEYS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];
function normalizeSchedule(h) {
  return DAY_KEYS.map((key) => {
    const diaData = h?.[key];
    if (!diaData || diaData.cerrado === true)
      return { cerrado: true, motivo: diaData?.motivo || null, bloques: [] };
    const bloques = (diaData.bloques || []).filter(
      (b) => b.h_apertura && b.h_cierre,
    );
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
  return today.bloques.some((b) => {
    const a = toMin(b.h_apertura),
      c = toMin(b.h_cierre);
    return nowMin >= a && nowMin < c;
  });
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
  img.onload = () => {
    img.classList.add("loaded");
    fallback.style.opacity = "0";
  };
  img.onerror = () => {
    img.classList.remove("loaded");
    fallback.style.opacity = "1";
  };
  img.src = url;
}

function listenNegocio() {
  const ref = tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID);
  unsubNegocio = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const biz = snap.data();
      document.getElementById("bizName").textContent =
        biz.nombre_tienda || biz.nombre || "Mi negocio";
      setLogo(biz.img_tienda?.logo_tienda || null);
      setStatus(calcOpenNow(biz.horario_atencion));
      const puntos = Number(biz.puntos_tienda) || 0;
      const soles = puntos * CREDITO_A_SOLES;
      setTextPulse(
        document.getElementById("balanceValue"),
        `S/ ${soles.toFixed(2)}`,
      );
      document.getElementById("balanceSub").textContent = `${puntos} créditos`;
    },
    (err) => console.error("Error escuchando negocio:", err),
  );

  setInterval(() => {
    onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) setStatus(calcOpenNow(snap.data().horario_atencion));
      },
      () => {},
    );
  }, 30000);
}

function todayStr() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function listenPedidos() {
  const ref = tiendaSubCol(LOCALIDAD, "tiendas", NEGOCIO_ID, "pedidos");
  unsubPedidos = onSnapshot(
    ref,
    (snap) => {
      const hoy = todayStr();
      let ventas = 0,
        atendidos = 0,
        cocina = 0;
      snap.forEach((docSnap) => {
        const p = docSnap.data();
        if (p.fecha !== hoy) return;
        const estado = (p.estado || "").toLowerCase();
        const rechazado =
          estado.includes("rechaz") || estado.includes("cancel");
        const enCocina = estado.includes("cocina");
        if (!rechazado) ventas += Number(p.total) || 0;
        if (enCocina) cocina++;
        else if (!rechazado) atendidos++;
      });
      setTextPulse(
        document.getElementById("ventasValue"),
        `S/ ${ventas.toFixed(2)}`,
      );
      setTextPulse(
        document.getElementById("atendidosValue"),
        String(atendidos),
      );
      setTextPulse(document.getElementById("cocinaValue"), String(cocina));
      document
        .getElementById("urgentCard")
        .classList.toggle("active", cocina > 0);
    },
    (err) => console.error("Error escuchando pedidos:", err),
  );
}

// ══════════════════════════════════════════
//  Acciones rápidas — navegación (ajusta las rutas reales si las tienes)
// ══════════════════════════════════════════
function navigateTo(seccion) {
  if (seccion === "roles") {
    openRoles();
    return;
  }

  const sesion = getSession();
  const permisos = sesion
    ? sesion.esAdmin
      ? null
      : sesion.permisos || []
    : [];
  const tienePermiso = permisos === null || permisos.includes(seccion);

  if (!tienePermiso) {
    showToast("No tienes permiso para acceder a esta sección.");
    return; // 👈 no se carga absolutamente nada
  }

  try {
    window.parent.postMessage(
      { tipo: "NAVEGAR", seccion },
      window.location.origin,
    );
  } catch (e) {
    console.error("No se pudo navegar:", e);
  }
}
document
  .getElementById("rechargeBtn")
  .addEventListener("click", () => navigateTo("recargas"));
document
  .getElementById("btnPerfil")
  .addEventListener("click", () => navigateTo("perfil"));
document
  .getElementById("btnPublicidad")
  .addEventListener("click", () => navigateTo("publicidad"));
document
  .getElementById("btnPedidosVivo")
  .addEventListener("click", () => navigateTo("pedidos"));
document
  .getElementById("btnProductos")
  .addEventListener("click", () => navigateTo("productos"));
document
  .getElementById("btnHistorial")
  .addEventListener("click", () => navigateTo("historial"));
document
  .getElementById("btnQR")
  .addEventListener("click", () => navigateTo("qr"));
document
  .getElementById("btnRecargas")
  .addEventListener("click", () => navigateTo("recargas"));
document
  .getElementById("btnRoles")
  .addEventListener("click", () => navigateTo("roles"));
document
  .getElementById("backToPanel")
  .addEventListener("click", () => showView("view-panel"));

// ══════════════════════════════════════════
//  Gestión de roles (vista interna, solo admin)
// ══════════════════════════════════════════
let unsubRoles = null;
function initPermGrid() {
  const grid = document.getElementById("permGrid");
  if (grid.dataset.built) return;
  grid.innerHTML = PERMISOS_DISPONIBLES.map(
    (p) => `
                <label class="perm-chip"><input type="checkbox" value="${p.key}"> ${p.label}</label>
            `,
  ).join("");
  grid.dataset.built = "1";
}

function renderRoles(docs) {
  const list = document.getElementById("rolesList");
  const noAdmin = docs.filter((d) => !d.data().esAdmin);
  document.getElementById("countPill").textContent =
    `${noAdmin.length} / ${MAX_ROLES}`;
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
              const found = PERMISOS_DISPONIBLES.find((x) => x.key === p);
              return `<span class="perm-tag">${found ? found.label : p}</span>`;
            })
            .join("");
      return `
                    <div class="role-item">
                        <div>
                            <p class="role-name">${data.nombre}</p>
                            <p class="role-user">@${data.usuario}</p>
                            <div class="role-perms">${perms}</div>
                        </div>
                   ${
                     data.esAdmin
                       ? ""
                       : `
    <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="delete-btn" data-id="${d.id}">Eliminar</button>
        <button class="back-btn" data-edit-id="${d.id}" data-edit-nombre="${data.nombre}"
            data-edit-permisos='${JSON.stringify(data.permisos || [])}'>Editar permisos</button>
        <button class="back-btn" data-reset-id="${d.id}" data-reset-nombre="${data.nombre}">Nueva contraseña</button>
    </div>`
                   }
                    </div>`;
    })
    .join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este rol? La persona ya no podrá ingresar."))
        return;
      await deleteDoc(
        tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", btn.dataset.id),
      );
    });
  });

  list.querySelectorAll("[data-reset-id]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openResetWorker(btn.dataset.resetId, btn.dataset.resetNombre),
    );
  });
  list.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const permisosActuales = JSON.parse(btn.dataset.editPermisos || "[]");
      openEditPermisos(
        btn.dataset.editId,
        btn.dataset.editNombre,
        permisosActuales,
      );
    });
  });
}

// ══════════════════════════════════════════
//  Restablecer contraseña de un trabajador (el admin decide la nueva)
// ══════════════════════════════════════════
let resetWorkerId = null;
// ══════════════════════════════════════════
//  Editar permisos de un trabajador
// ══════════════════════════════════════════
let editPermRoleId = null;

function initEditPermGrid() {
  const grid = document.getElementById("editPermGrid");
  if (grid.dataset.built) return;
  grid.innerHTML = PERMISOS_DISPONIBLES.map(
    (p) => `
        <label class="perm-chip"><input type="checkbox" value="${p.key}"> ${p.label}</label>
    `,
  ).join("");
  grid.dataset.built = "1";
}

function openEditPermisos(roleId, nombre, permisosActuales) {
  editPermRoleId = roleId;
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

document
  .getElementById("editPermisosForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editPermRoleId) return;

    const nuevosPermisos = Array.from(
      document.querySelectorAll("#editPermGrid input:checked"),
    ).map((i) => i.value);

    if (!nuevosPermisos.length) {
      setMsg("epMsg", "Debe tener al menos una sección permitida.", "error");
      return;
    }

    const btn = document.getElementById("epSubmit");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      await updateDoc(
        tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", editPermRoleId),
        { permisos: nuevosPermisos },
      );
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
document
  .getElementById("resetWorkerForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!resetWorkerId) return;
    const btn = document.getElementById("rwSubmit");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      const nuevaPassword = document.getElementById("rwPassword").value;
      const nuevoHash = await hashPassword(nuevaPassword);
      await updateDoc(
        tiendaSubDoc(LOCALIDAD, "tiendas", NEGOCIO_ID, "roles", resetWorkerId),
        {
          passwordHash: nuevoHash,
        },
      );
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
  const nombre = document.getElementById("fNombre").value.trim();
  const usuario = document
    .getElementById("fUsuario")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("fPassword").value;
  const permisos = Array.from(
    document.querySelectorAll("#permGrid input:checked"),
  ).map((i) => i.value);

  if (!permisos.length) {
    setMsg("formMsg", "Selecciona al menos una sección.", "error");
    return;
  }

  const btn = document.getElementById("formSubmit");
  btn.disabled = true;
  btn.textContent = "Creando…";
  try {
    const dup = await getDocs(
      query(rolesRef(), where("usuario", "==", usuario)),
    );
    if (!dup.empty) {
      setMsg("formMsg", "Ese nombre de usuario ya existe.", "error");
      btn.disabled = false;
      btn.textContent = "Crear rol";
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
    document
      .querySelectorAll("#permGrid input")
      .forEach((i) => (i.checked = false));
  } catch (err) {
    console.error(err);
    setMsg("formMsg", "No se pudo crear el rol. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Crear rol";
  }
});

// ── Init ──
boot();

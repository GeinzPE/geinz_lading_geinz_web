import {
  getDoc, setDoc, getDocs, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// Ajusta la ruta según dónde esté paths.js en tu proyecto
import { registroCamposDoc, registradosCol } from "../rutas/rutas.js";

const $ = (id) => document.getElementById(id);

// ⚠️ Saca estos 2 valores EXACTAMENTE igual que lo hacen resena.html / productos.html
//    negocioId = id de la tienda (ej. fW7W8RsgkkQ3IYfxKHGR)
//    localidad = distrito (ej. "barranca")
const negocioId = "fW7W8RsgkkQ3IYfxKHGR";
const localidad = "barranca";
const CAMPOS = [
  { k: "dni",          t: "DNI",                 d: "Autocompleta nombre, apellido, fecha y género (peruapi.com)" },
  { k: "nombres",      t: "Nombre y apellido",   d: "" },
  { k: "username",     t: "Nombre de usuario",   d: "Si lo apagas se genera uno automático" },
  { k: "telefono",     t: "Teléfono",            d: "" },
  { k: "genero",       t: "Género",              d: "" },
  { k: "ubicacion",    t: "Ubicación",           d: "Departamento, provincia y distrito" },
  { k: "fecha_nac",    t: "Fecha de nacimiento", d: "" },
  { k: "nacionalidad", t: "Nacionalidad",        d: "" },
];

const DEFAULT = {
  dni: false, nombres: true, username: true, telefono: true,
  genero: true, ubicacion: true, fecha_nac: true, nacionalidad: true,
};
let estado = { ...DEFAULT };

// uid -> referencia del documento (para poder bloquear / desbloquear)
const refsUsuarios = new Map();

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function contextoValido() {
  if (negocioId && localidad) return true;
  $("lista").innerHTML =
    `<p style="padding:16px;color:#ff9a9a">Falta <b>negocioId</b> o <b>localidad</b> en usuarios.js. Revisa los dos TODO de arriba.</p>`;
  $("registrados").innerHTML = "";
  return false;
}

function pintar() {
  const fijos = ["Correo electrónico", "Contraseña"]
    .map(
      (t) => `<label class="row"><div><b>${t}</b><small>Siempre obligatorio</small></div>
        <span class="sw"><input type="checkbox" checked disabled><i></i></span></label>`,
    )
    .join("");

  $("lista").innerHTML =
    CAMPOS.map(
      (c) => `<label class="row"><div><b>${c.t}</b>${c.d ? `<small>${c.d}</small>` : ""}</div>
        <span class="sw"><input type="checkbox" data-k="${c.k}" ${estado[c.k] ? "checked" : ""}><i></i></span></label>`,
    ).join("") + fijos;
}

async function cargar() {
  if (!contextoValido()) return;
  const ref = registroCamposDoc(localidad, negocioId);
  try {
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // Primera vez: se crea el doc con TODOS los campos (activos y apagados)
      await setDoc(ref, { ...DEFAULT, creado: serverTimestamp(), actualizado: serverTimestamp() });
    } else {
      const d = snap.data();
      Object.keys(DEFAULT).forEach((k) => {
        if (typeof d[k] === "boolean") estado[k] = d[k];
      });
      // Si le falta alguna clave (por ejemplo "dni"), se completa
      const faltan = Object.keys(DEFAULT).some((k) => typeof d[k] !== "boolean");
      if (faltan) await setDoc(ref, { ...estado, actualizado: serverTimestamp() }, { merge: true });
    }
  } catch (e) {
    console.error("[usuarios] cargar campos:", e);
    toast("Error: " + (e.code || e.message));
  }
  pintar();
}

$("lista").addEventListener("change", async (e) => {
  const k = e.target.dataset.k;
  if (!k || !contextoValido()) return;
  const previo = estado[k];
  estado[k] = e.target.checked;
  try {
    await setDoc(
      registroCamposDoc(localidad, negocioId),
      { ...estado, actualizado: serverTimestamp() },
      { merge: true },
    );
    toast("Guardado ✓");
  } catch (err) {
    console.error("[usuarios] guardar:", err);
    estado[k] = previo;
    e.target.checked = previo;
    toast("No se pudo guardar: " + (err.code || err.message));
  }
});

// Teléfono completo: acepta {contacto:{cod_telefonico, numero_user}} o campos sueltos
function telefonoDe(u) {
  const c = u.contacto && typeof u.contacto === "object" ? u.contacto : u;
  const cod = c.cod_telefonico ?? u.cod_telefonico ?? "";
  const num = c.numero_user ?? u.numero_user ?? "";
  return num === "" ? "" : `${cod}${num}`;
}

async function cargarRegistrados() {
  const tb = $("registrados");
  try {
    const snap = await getDocs(registradosCol(localidad, negocioId));
    refsUsuarios.clear();
    if (snap.empty) {
      tb.innerHTML = `<tr><td colspan="9">Aún no hay usuarios registrados.</td></tr>`;
      return;
    }
    tb.innerHTML = snap.docs
      .map((d) => {
        const u = d.data();
        const uid = u.id_user || d.id;
        refsUsuarios.set(uid, d.ref);
        const nombre = [u.nombre, u.apellido].filter(Boolean).join(" ") || u.nombre_user;
        return `<tr
            data-uid="${esc(uid)}"
            data-bloqueado="${u.bloqueado === true ? "1" : ""}"
            data-genero="${esc(u.genero || "")}"
            data-nacionalidad="${esc(u.nacionalidad_nacimiento || u.nacionalidad || "")}"
            data-nacimiento="${esc(u.fecha_nac || "")}"
            data-telefono="${esc(telefonoDe(u))}">
          <td>${esc(nombre)}</td><td>${esc(u.correo)}</td><td>${esc(u.fecha_registrada)}</td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    console.error("[usuarios] registrados:", e);
    tb.innerHTML = `<tr><td colspan="9">No se pudo cargar la lista (${esc(e.code || e.message)}).</td></tr>`;
  }
}

// La página (usuarios.html) llama a esta función al confirmar Bloquear / Desbloquear.
// Si lanza error, la página deja la fila como estaba y muestra el aviso.
window.UsuariosUI = window.UsuariosUI || {};
window.UsuariosUI.setBloqueo = async (uid, bloquear) => {
  const ref = refsUsuarios.get(uid);
  if (!ref) throw new Error("Usuario no encontrado");
  await updateDoc(ref, {
    bloqueado: !!bloquear,
    bloqueado_en: bloquear ? serverTimestamp() : null,
  });
};

if (contextoValido()) {
  cargar();
  cargarRegistrados();
}
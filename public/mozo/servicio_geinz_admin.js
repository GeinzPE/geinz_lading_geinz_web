// SOLO PARA EL ADMIN (tu editor). No lo importes en el dashboard del usuario final.
// No modifica structure_min.js ni servicios_dashboard.js.
// Usa TU rutas.js (setUbicacion + tiendaServiciosDoc), así la ruta del documento es la real:
// Tiendas/<pais>/departamento/<dep>/provincia/<prov>/distrito/<localidad>/tiendas_servicios_geinz_activos/<negocioId>

import { getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Ruta de tu rutas.js relativa a ESTE archivo (la primera que ya te cargó bien va de primera).
const RUTAS_JS = ["../js/rutas/rutas.js", "../rutas/rutas.js"];

// Apartados del documento que el editor puede ver y guardar (campos de primer nivel).
const APARTADOS = ["cliente_y_fidelizacion", "mi_negocio", "operacion_ventas", "panel_admin"];

let rutasCache = null;
async function cargarRutas() {
  if (rutasCache) return rutasCache;
  const log = [];
  for (const r of RUTAS_JS) {
    try {
      const m = await import(r);
      if (typeof m.tiendaServiciosDoc === "function" && typeof m.setUbicacion === "function") {
        rutasCache = m;
        return m;
      }
      log.push(`${r} → carga, pero falta tiendaServiciosDoc o setUbicacion`);
    } catch (e) {
      log.push(`${r} → no se pudo cargar`);
    }
  }
  throw new Error("No encuentro tu rutas.js. Edita RUTAS_JS en servicios_geinz_admin.js.\n" + log.join("\n"));
}

function validar(p) {
  const campos = ["pais", "departamento", "provincia", "localidad", "negocioId"];
  const faltan = campos.filter((k) => !String(p?.[k] ?? "").trim());
  if (faltan.length) throw new Error("Faltan datos: " + faltan.join(", "));
  if (campos.some((k) => String(p[k]).includes("/"))) throw new Error("Ningún dato puede llevar '/'");
  return Object.fromEntries(campos.map((k) => [k, String(p[k]).trim()]));
}

// Arma la referencia con tus funciones reales de rutas.js
async function refServicios(p) {
  const d = validar(p);
  const R = await cargarRutas();
  R.setUbicacion({ pais: d.pais, departamento: d.departamento, provincia: d.provincia });
  return R.tiendaServiciosDoc(d.localidad, d.negocioId);
}

export async function obtenerServiciosGeinz(p) {
  const ref = await refServicios(p);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { existe: false, ruta: ref.path };

  const todo = snap.data();
  const datos = {};
  const faltantes = [];
  APARTADOS.forEach((k) => (k in todo ? (datos[k] = todo[k]) : faltantes.push(k)));
  const ignorados = Object.keys(todo).filter((k) => !APARTADOS.includes(k));
  return { existe: true, ruta: ref.path, datos, faltantes, ignorados };
}

// cambios = { apartado: valorCompleto }. Reemplaza SOLO esos apartados; el resto del doc no se toca.
// Usa updateDoc: si el documento no existe falla, nunca crea documentos por error.
export async function guardarServiciosGeinz({ cambios, ...p }) {
  const claves = Object.keys(cambios || {});
  if (!claves.length) throw new Error("No hay cambios para guardar");
  const invalidas = claves.filter((k) => !APARTADOS.includes(k));
  if (invalidas.length) throw new Error("Apartados no permitidos: " + invalidas.join(", "));

  const ref = await refServicios(p);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`No existe el documento, no se guardó nada: ${ref.path}`);

  await updateDoc(ref, cambios);
  return { guardados: claves, ruta: ref.path };
}
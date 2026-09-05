// src/firebase/paths.js
import { doc, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../db/db.js";

const PAIS = "peru";
const DEPARTAMENTO = "lima";    // hardcodeado por ahora, dinámico más adelante
const PROVINCIA = "barranca";   // hardcodeado por ahora, dinámico más adelante

function buildPath(localidad, ...resto) {
  // localidad aquí = distrito (barranca, supe, paramonga, pativilca, puerto-supe)
  return [
    "Tiendas", PAIS,
    "departamento", DEPARTAMENTO,
    "provincia", PROVINCIA,
    "distrito", localidad,
    ...resto,
  ].filter(Boolean);
}

export function tiendaDoc(localidad, subcoleccion, id) {
  return doc(db, ...buildPath(localidad, subcoleccion, id));
}

export function tiendaCol(localidad, subcoleccion) {
  return collection(db, ...buildPath(localidad, subcoleccion));
}

export function tiendaSubDoc(localidad, ...resto) {
  return doc(db, ...buildPath(localidad, ...resto));
}

export function tiendaSubCol(localidad, ...resto) {
  return collection(db, ...buildPath(localidad, ...resto));
}

export function tiendaPathStr(localidad, ...resto) {
  return buildPath(localidad, ...resto).join("/");
}

export function data_user_logeado(uid) {
  return doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", uid);
}

export function card_follow(uid, localidad, resto) {
  return doc(db, ...buildPath(localidad, ...resto, ...uid));
}

// ── Tiendas del distrito ──
export function tiendasDelDistritoCol(localidad) {
  return tiendaSubCol(localidad, "tiendas");
}

// ── Catálogo de productos (por categoría) ──
// .../tiendas/<negocioId>/productos                       -> 1 doc por categoría
// .../tiendas/<negocioId>/productos/<categoria>/<categoria> -> productos de esa categoría
export function categoriasCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "productos");
}

export function productosDeCategoriaCol(localidad, negocioId, categoria) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "productos", categoria, categoria);
}

// ── Descuentos / recompensas de fidelización ──
export function tiendaDescuentosCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "descuentos");
}

export function tiendaDescuentoDoc(localidad, negocioId, productoId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "descuentos", productoId);
}

// ── Reviews de la tienda ──
export function tiendaReviewsCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "review");
}

export function tiendaReviewDoc(localidad, negocioId, reviewId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "review", reviewId);
}

// ── Clientes de fidelización (dentro de cada tienda) ──
export function clientesCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "clientes");
}

export function clienteDoc(localidad, negocioId, clienteId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "clientes", clienteId);
}

// ── Canjes de fidelización (dentro de cada tienda) ──
export function canjesCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "canjes");
}

export function canjeDoc(localidad, negocioId, canjeId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "canjes", canjeId);
}

export function tokenFcmDoc(uid) {
  return doc(db, "Trabajadores_Usuarios_Drivers", "users", "tokens", uid);
}

export function clienteHistorialCol(localidad, negocioId, clienteId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "clientes", clienteId, "historial");
}
 
export function clienteHistorialDoc(localidad, negocioId, clienteId, pedidoId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "clientes", clienteId, "historial", pedidoId);
}
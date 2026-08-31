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

export function data_user_logeado(uid){
  return doc(db,"Trabajadores_Usuarios_Drivers","users","users",uid)
}
export function card_follow(uid,localidad,resto){
  return doc(db,...buildPath(localidad, ...resto,...uid) )
}
export function tiendaDescuentosCol(localidad, negocioId) {
  return tiendaSubCol(localidad, "tiendas", negocioId, "descuentos");
}

export function tiendaDescuentoDoc(localidad, negocioId, productoId) {
  return tiendaSubDoc(localidad, "tiendas", negocioId, "descuentos", productoId);
}